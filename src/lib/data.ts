import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  ActivityEvent,
  AggregatesRecord,
  CalendarRecord,
  MetaRecord,
  ProfileRecord,
  RepoRecord,
} from '../../scripts/lib/types.ts';

function load<T>(name: string): T {
  const file = fileURLToPath(new URL(`../../data/${name}`, import.meta.url));
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export const meta = load<MetaRecord>('meta.json');
export const profile = load<ProfileRecord>('profile.json');
export const reposData = load<RepoRecord[]>('repos.json');
export const events = load<ActivityEvent[]>('events.json');
export const calendar = load<CalendarRecord>('calendar.json');
export const aggregates = load<AggregatesRecord>('aggregates.json');

export const REPO_COLORS = new Map<string, string | null>(
  reposData.map((repo) => [repo.nameWithOwner, repo.primaryLanguage?.color ?? null]),
);
