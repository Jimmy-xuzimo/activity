import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ActivityEvent, DataBundle } from './lib/types.ts';

const EVENT_TYPES = new Set([
  'repo_created',
  'commit',
  'release',
  'issue_opened',
  'issue_commented',
  'pr_opened',
  'pr_merged',
  'pr_closed',
  'star_received',
  'fork_received',
]);

export type ValidationResult = { ok: boolean; errors: string[]; warnings: string[] };

export function validateBundle(bundle: DataBundle, privateRepoNames: string[] = []): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { meta, profile, repos, events, calendar, aggregates } = bundle;

  if (!meta || !profile || !calendar || !aggregates) errors.push('missing top-level section');
  if (!Array.isArray(events) || events.length === 0) errors.push('events is empty');

  const ids = new Set<string>();
  let previousTs = '';
  for (const event of events) {
    if (!event.id) errors.push('event without id');
    if (ids.has(event.id)) errors.push(`duplicate id: ${event.id}`);
    ids.add(event.id);
    if (!EVENT_TYPES.has(event.type)) errors.push(`unknown type ${event.type} in ${event.id}`);
    if (!Number.isFinite(Date.parse(event.ts))) errors.push(`invalid ts ${event.ts} in ${event.id}`);
    if (event.ts < previousTs) errors.push(`events not sorted at ${event.id}`);
    previousTs = event.ts;
    if (!event.title || event.title.length > 200) errors.push(`bad title in ${event.id}`);
    if (event.weight < 1 || event.weight > 3) errors.push(`bad weight in ${event.id}`);
    if (event.repo !== null && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(event.repo)) {
      errors.push(`bad repo slug in ${event.id}: ${event.repo}`);
    }
  }

  if (calendar.days.length === 0) errors.push('calendar has no days');
  if (calendar.total !== calendar.days.reduce((sum, d) => sum + d.count, 0)) {
    errors.push('calendar total does not match days');
  }
  if (aggregates.totals.commits !== events.filter((e) => e.type === 'commit').length) {
    errors.push('aggregates.totals.commits mismatch');
  }
  if (repos.length === 0) errors.push('repos is empty');

  // state.json is committed to the public repository, so every cursor key must belong to a published repository.
  const publicNames = new Set(repos.map((repo) => repo.name));
  for (const key of Object.keys(bundle.state?.repos ?? {})) {
    if (!publicNames.has(key)) errors.push(`state cursor for unpublished repository: ${key}`);
  }

  // Privacy guard: a private repository name must never reach the published JSON.
  const serialized = JSON.stringify({ repos, events, aggregates, calendar, profile, state: bundle.state });
  for (const name of privateRepoNames) {
    if (!name || name.length < 3) continue;
    const pattern = new RegExp(`(^|[^A-Za-z0-9_.-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_.-]|$)`);
    if (pattern.test(serialized)) errors.push(`private repository name leaked: ${name}`);
  }

  // Contact details and credential-looking strings are stripped before writing.
  if (/[\w.+-]+@[\w-]+\.[\w-]+/.test(serialized)) warnings.push('email-like string present in output');
  if (/(gh[pousr]_[A-Za-z0-9]{10,}|github_pat_)/.test(serialized)) errors.push('token-like string present in output');

  return { ok: errors.length === 0, errors, warnings };
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const text = await readFile(file, 'utf8');
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '..', 'data');

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const events = await readJson<ActivityEvent[]>(path.join(dataDir, 'events.json'), []);
  const bundle = {
    meta: await readJson(path.join(dataDir, 'meta.json'), null as never),
    profile: await readJson(path.join(dataDir, 'profile.json'), null as never),
    repos: await readJson(path.join(dataDir, 'repos.json'), [] as never),
    events,
    calendar: await readJson(path.join(dataDir, 'calendar.json'), null as never),
    aggregates: await readJson(path.join(dataDir, 'aggregates.json'), null as never),
    state: await readJson(path.join(dataDir, 'state.json'), null as never),
  } as DataBundle;

  if (!bundle.meta) {
    console.error('data/*.json not found. Run `npm run backfill` first.');
    process.exit(1);
  }
  const result = validateBundle(bundle);
  if (!result.ok) {
    console.error('INVALID\n' + result.errors.join('\n'));
    process.exit(1);
  }
  console.log(`OK · ${events.length} events · ${bundle.repos.length} repos · ${bundle.calendar.days.length} days`);
  for (const warning of result.warnings) console.log(`warn: ${warning}`);
}
