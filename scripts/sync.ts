import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchCommitDetail,
  fetchCommitList,
  fetchContributionCalendar,
  fetchForks,
  fetchIssueCommentsOf,
  fetchProfileAndRepos,
  fetchReleases,

  fetchUserIssues,
  fetchUserPullRequests,
  searchCommentedIssues,
  LOGIN,
} from './lib/github.ts';
import { getCallCount, mapLimit, setToken } from './lib/http.ts';
import {
  activeDayCount,
  buildAggregates,
  buildCalendar,
  buildRepos,
  eventsFromActivity,
  eventsFromGlobal,
  localDate,
  mergeEvents,
} from './lib/build.ts';
import type { GlobalActivity, RepoActivityRaw } from './lib/build.ts';
import type {
  ActivityEvent,
  AggregatesRecord,
  CalendarRecord,
  MetaRecord,
  ProfileRecord,
  RepoRecord,
  StateRecord,
} from './lib/types.ts';
import { validateBundle, readJson } from './validate.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataDir = path.join(root, 'data');

type Mode = 'backfill' | 'incremental';
const modeArg = process.argv.find((arg) => arg.startsWith('--mode='))?.split('=')[1];
const mode: Mode = modeArg === 'backfill' ? 'backfill' : 'incremental';

function fail(message: string): never {
  console.error(`\n[sync] ${message}\n`);
  process.exit(2);
}

function oneHourBefore(date: Date): string {
  return new Date(date.getTime() - 60 * 60 * 1000).toISOString();
}

function subtractOneHour(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms - 60 * 60 * 1000).toISOString();
}

async function writeJson(file: string, value: unknown, pretty = true): Promise<void> {
  const text = pretty ? `${JSON.stringify(value, null, 2)}\n` : `${JSON.stringify(value)}\n`;
  await writeFile(file, text, 'utf8');
}

async function main(): Promise<void> {
  const token = process.env.SYNC_TOKEN?.trim();
  if (!token) {
    fail(
      [
        'SYNC_TOKEN is not set.',
        'The workflow needs a fine-grained read-only PAT stored as the repository secret SYNC_TOKEN',
        '(Contents / Metadata / Issues / Pull requests = Read-only, scoped to the account\'s repositories).',
        'GITHUB_TOKEN cannot read repositories outside this workflow\'s own repository, so it is not a substitute.',
        'Nothing was written: data/ keeps the last good snapshot.',
      ].join('\n'),
    );
  }
  setToken(token);

  const startedAt = Date.now();
  const runAt = new Date();
  const nowIso = runAt.toISOString();

  const previousEvents = await readJson<ActivityEvent[]>(path.join(dataDir, 'events.json'), []);
  const previousState = await readJson<StateRecord>(path.join(dataDir, 'state.json'), {
    version: 1,
    repos: {},
    issuesSince: '',
    commentsSince: '',
    pullsUpdatedAt: '',
    starsMaxStarredAt: null,
    lastFullSyncAt: null,
    lastSuccessfulSyncAt: null,
  });
  const previousMeta = await readJson<MetaRecord | null>(path.join(dataDir, 'meta.json'), null);

  console.log(`[sync] mode=${mode} · previous events=${previousEvents.length}`);

  const { profile, repos } = await fetchProfileAndRepos();
  console.log(`[sync] repositories: ${repos.length} (private ${repos.filter((r) => r.isPrivate).length})`);

  const firstRepo = repos.reduce<typeof repos[number] | null>(
    (earliest, repo) => (!earliest || repo.createdAt < earliest.createdAt ? repo : earliest),
    null,
  );
  const firstActivityAt = firstRepo?.createdAt ?? '2025-11-21T00:00:00Z';
  const commentsSince =
    mode === 'backfill' || !previousState.commentsSince
      ? new Date(Date.parse(firstActivityAt) - 24 * 60 * 60 * 1000).toISOString()
      : previousState.commentsSince;

  let detailCalls = 0;

  const activities = await mapLimit(repos, 4, async (repo): Promise<RepoActivityRaw> => {
    const state = previousState.repos[repo.name];
    const skipCommits =
      mode === 'incremental' &&
      state !== undefined &&
      state.lastPushedAt === repo.pushedAt &&
      Boolean(state.lastCommitAt);

    const commitSince = skipCommits ? undefined : subtractOneHour(state?.lastCommitAt);
    let commitList: Awaited<ReturnType<typeof fetchCommitList>> = [];
    if (!skipCommits) {
      commitList = await fetchCommitList(repo, commitSince);
    }

    const detailTargets = commitList.filter(
      (item) => !previousEvents.some((event) => event.type === 'commit' && event.meta?.sha === item.sha),
    );

    const details = await mapLimit(detailTargets, 6, async (item) => {
      detailCalls += 1;
      return fetchCommitDetail(repo, item.sha);
    });
    const detailBySha = new Map(details.filter((d) => d !== null).map((d) => [d!.sha, d!]));

    const [releases, stargazers, forks] = await Promise.all([
      fetchReleases(repo),
      Promise.resolve([]),
      repo.isPrivate ? Promise.resolve([]) : fetchForks(repo),
    ]);

    return {
      repo,
      commits: commitList.map((item) => ({ item, detail: detailBySha.get(item.sha) ?? null })),
      releases,
      stargazers,
      forks,
    };
  });

  const [globalPulls, globalIssues, commentedIssues] = await Promise.all([
    fetchUserPullRequests(),
    fetchUserIssues(),
    searchCommentedIssues(),
  ]);

  const privateSlugs = new Set(repos.filter((repo) => repo.isPrivate).map((repo) => repo.nameWithOwner));
  const comments: GlobalActivity['comments'] = [];
  const commentIds = new Set<number>();
  const issuesToScan = commentedIssues.filter((issue) => issue.updated_at >= commentsSince);

  await mapLimit(issuesToScan, 4, async (issue) => {
    try {
      const list = await fetchIssueCommentsOf(issue.repo, issue.number, commentsSince);
      for (const comment of list) {
        if (comment.user?.login !== LOGIN) continue;
        if (commentIds.has(comment.id)) continue;
        commentIds.add(comment.id);
        comments.push({
          slug: issue.repo,
          name: issue.repoName,
          isPrivate: privateSlugs.has(issue.repo),
          comment,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[sync] skipped comments for ${issue.repo}#${issue.number}: ${message}`);
    }
  });

  console.log(
    `[sync] global: ${globalPulls.length} PRs · ${globalIssues.length} issues · ${comments.length} comments`,
  );

  const incoming = [
    ...activities.flatMap((activity) => eventsFromActivity(activity)),
    ...eventsFromGlobal({ pulls: globalPulls, issues: globalIssues, comments }),
  ];
  const events = mergeEvents(previousEvents, incoming);
  console.log(`[sync] events: ${previousEvents.length} + new = ${events.length} (details fetched ${detailCalls})`);

  const calendarCounts = await fetchContributionCalendar(firstActivityAt, runAt);
  const today = localDate(nowIso);
  const calendar = buildCalendar(calendarCounts, today);

  const reposPublic = buildRepos(repos, events, today);
  const aggregates = buildAggregates(events, reposPublic, calendar, nowIso);
  aggregates.totals.repos = repos.length;

  // Cursors for the next incremental run.
  const nextRepos: StateRecord['repos'] = {};
  let maxStarred = previousState.starsMaxStarredAt;
  for (const activity of activities) {
    const repo = activity.repo;
    // state.json is published with the site, so private repository names must not appear in it.
    if (repo.isPrivate) continue;
    const commitTimes = activity.commits
      .map((entry) => ({ sha: entry.item.sha, ts: entry.item.commit.author?.date ?? entry.item.commit.committer?.date ?? '' }))
      .filter((entry) => entry.ts)
      .sort((a, b) => (a.ts < b.ts ? 1 : -1));
    nextRepos[repo.name] = {
      lastPushedAt: repo.pushedAt,
      lastCommitAt: commitTimes[0]?.ts ?? previousState.repos[repo.name]?.lastCommitAt ?? null,
      lastCommitSha: commitTimes[0]?.sha ?? previousState.repos[repo.name]?.lastCommitSha ?? null,
    };
    for (const star of activity.stargazers) {
      if (!maxStarred || star.starred_at > maxStarred) maxStarred = star.starred_at;
    }
  }

  const state: StateRecord = {
    version: 1,
    repos: nextRepos,
    issuesSince: oneHourBefore(runAt),
    commentsSince: oneHourBefore(runAt),
    pullsUpdatedAt: oneHourBefore(runAt),
    starsMaxStarredAt: maxStarred,
    lastFullSyncAt: mode === 'backfill' ? nowIso : previousState.lastFullSyncAt,
    lastSuccessfulSyncAt: nowIso,
  };

  const meta: MetaRecord = {
    schemaVersion: 1,
    generatedAt: nowIso,
    sourceUpdatedAt: nowIso,
    firstActivityAt,
    lastActivityAt: events.length > 0 ? events[events.length - 1].ts : nowIso,
    syncIntervalMinutes: 720,
    coverage: {
      reposTotal: repos.length,
      reposPublic: reposPublic.length,
      reposPrivate: repos.filter((r) => r.isPrivate).length,
      privateActivity: 'anonymized',
      nonDefaultBranch: false,
    },
    caliber: {
      commits: 'default-branch-only',
      lines: 'additions-minus-deletions',
      excludes: 'github-actions[bot] commits, chore(data): sync commits',
    },
    counts: {
      events: events.length,
      commits: events.filter((e) => e.type === 'commit').length,
      daysActive: activeDayCount(calendar),
    },
  };

  const profileRecord: ProfileRecord = {
    login: profile.login,
    name: profile.name,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    createdAt: profile.createdAt,
    followers: profile.followers,
    publicRepos: profile.publicRepos,
  };

  const bundle = { meta, profile: profileRecord, repos: reposPublic, events, calendar, aggregates, state };

  const privateNames = repos.filter((repo) => repo.isPrivate).map((repo) => repo.name);
  const validation = validateBundle(bundle, privateNames);
  if (!validation.ok) {
    console.error('[sync] validation failed, nothing written:\n' + validation.errors.join('\n'));
    process.exit(1);
  }
  for (const warning of validation.warnings) console.warn(`[sync] warn: ${warning}`);

  if (events.length < previousEvents.length) {
    console.error('[sync] refusing to shrink the event log; nothing written.');
    process.exit(1);
  }

  // Only commit when the actual content changed, so an idle account does not
  // produce a commit every twelve hours.
  const hash = createHash('sha256')
    .update(JSON.stringify({ events, repos: reposPublic, calendar, aggregates }))
    .digest('hex');
  const contentChanged = hash !== (previousState as StateRecord & { contentHash?: string }).contentHash;
  const filesMissing = previousMeta === null;

  if (contentChanged || filesMissing) {
    await mkdir(dataDir, { recursive: true });
    await writeJson(path.join(dataDir, 'events.json'), events, false);
    await writeJson(path.join(dataDir, 'repos.json'), reposPublic);
    await writeJson(path.join(dataDir, 'calendar.json'), calendar);
    await writeJson(path.join(dataDir, 'aggregates.json'), aggregates);
    await writeJson(path.join(dataDir, 'meta.json'), meta);
    await writeJson(path.join(dataDir, 'profile.json'), profileRecord);
    await writeJson(path.join(dataDir, 'state.json'), { ...state, contentHash: hash } as StateRecord);
    console.log('[sync] data written');
  } else {
    console.log('[sync] no content change — data files left untouched');
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[sync] done in ${elapsed}s · API calls ${getCallCount()} · events ${events.length} · commits ${meta.counts.commits} · repos ${repos.length} · days ${calendar.days.length}`,
  );
  console.log(`[sync] changed=${contentChanged}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sync] FAILED: ${message}`);
  console.error('[sync] data/ was not modified; the previous snapshot stays live.');
  process.exit(1);
});
