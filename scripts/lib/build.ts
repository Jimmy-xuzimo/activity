import { createHash } from 'node:crypto';
import { sanitizeText, truncate } from './sanitize.ts';
import type {
  ActivityEvent,
  AggregatesRecord,
  CalendarRecord,
  EventType,
  RepoLanguage,
  RepoRecord,
} from './types.ts';
import type {
  GhCommitDetail,
  GhCommitListItem,
  GhFork,
  GhIssueComment,
  GhRelease,
  GhRepo,
  GhStargazer,
  GhUserIssue,
  GhUserPull,
} from './github.ts';
import { LOGIN } from './github.ts';

const ALIAS_SALT = 'xuzimo-activity-2026';

export function privateAlias(repoName: string): string {
  return createHash('sha256').update(`${ALIAS_SALT}:${repoName}`).digest('hex').slice(0, 8);
}

export type RepoActivityRaw = {
  repo: GhRepo;
  commits: { item: GhCommitListItem; detail: GhCommitDetail | null }[];
  releases: GhRelease[];
  stargazers: GhStargazer[];
  forks: GhFork[];
};

const WEIGHT: Record<EventType, number> = {
  repo_created: 3,
  commit: 1,
  release: 3,
  issue_opened: 2,
  issue_commented: 1,
  pr_opened: 2,
  pr_merged: 3,
  pr_closed: 1,
  star_received: 2,
  fork_received: 2,
};

const TYPE_LABEL: Record<EventType, string> = {
  repo_created: '创建仓库',
  commit: '提交代码',
  release: '发布版本',
  issue_opened: '创建 Issue',
  issue_commented: '评论 Issue',
  pr_opened: '提交 PR',
  pr_merged: '合并 PR',
  pr_closed: '关闭 PR',
  star_received: '收到 star',
  fork_received: '被 fork',
};

function commitDate(item: GhCommitListItem): string {
  return item.commit.author?.date ?? item.commit.committer?.date ?? '';
}

export type RepoIdentity = { repo: string | null; repoName: string; key: string; isPrivate: boolean };

/** Private repositories are never named on the published site — only their activity shows. */
export function repoIdentity(nameWithOwner: string, name: string, isPrivate: boolean): RepoIdentity {
  if (isPrivate) {
    return { repo: null, repoName: '私有项目', key: `private-${privateAlias(nameWithOwner)}`, isPrivate: true };
  }
  return { repo: nameWithOwner, repoName: name, key: nameWithOwner, isPrivate: false };
}

export function eventsFromActivity(activity: RepoActivityRaw): ActivityEvent[] {
  const { repo } = activity;
  const events: ActivityEvent[] = [];
  const isPrivate = repo.isPrivate;
  const identity = repoIdentity(repo.nameWithOwner, repo.name, isPrivate);
  const repoKey = identity.key;
  const base = {
    repo: identity.repo,
    repoName: identity.repoName,
    ...(isPrivate ? { privateFlag: true } : {}),
  };

  const push = (event: ActivityEvent) => {
    if (event.ts) events.push(event);
  };

  // Repo creation
  push({
    id: `repo_created:${repoKey}`,
    type: 'repo_created',
    ts: repo.createdAt,
    title: isPrivate ? '创建一个私有项目' : repo.name,
    url: isPrivate ? null : repo.url,
    weight: WEIGHT.repo_created,
    ...base,
    ...(isPrivate ? { meta: { private: true } } : {}),
  });

  // Commits (default branch only — see README for the caliber statement)
  for (const entry of activity.commits) {
    const item = entry.item;
    const detail = entry.detail;
    if (item.author?.login && item.author.login !== LOGIN) continue;
    const isMerge = item.parents.length > 1;
    const message = sanitizeText(item.commit.message);
    const additions = detail?.stats?.additions ?? 0;
    const deletions = detail?.stats?.deletions ?? 0;
    const churn = additions + deletions;
    const title = isPrivate ? '提交代码' : message || '(空提交信息)';
    push({
      id: `commit:${repoKey}:${item.sha}`,
      type: 'commit',
      ts: commitDate(item),
      title,
      url: isPrivate ? null : item.html_url,
      weight: churn > 2000 ? 2 : WEIGHT.commit,
      ...base,
      meta: {
        sha: item.sha,
        additions,
        deletions,
        files: detail?.files?.length ?? 0,
        language: repo.primaryLanguage?.name ?? null,
        isMerge,
        ...(isPrivate ? { private: true } : {}),
      },
    });
  }

  // Releases
  for (const release of activity.releases) {
    if (release.draft) continue;
    const ts = release.published_at ?? release.created_at;
    const label = release.name?.trim() || release.tag_name;
    push({
      id: `release:${repoKey}:${release.tag_name}`,
      type: 'release',
      ts,
      title: isPrivate ? (release.prerelease ? '发布预发布版本' : '发布版本') : truncate(sanitizeText(label, 100), 100),
      url: isPrivate ? null : release.html_url,
      weight: WEIGHT.release,
      ...base,
      meta: {
        tag: isPrivate ? undefined : release.tag_name,
        ...(isPrivate ? { private: true } : {}),
      },
    });
  }

  // Stars and forks received (never for private repos — nothing to reveal there)
  if (!isPrivate) {
    for (const star of activity.stargazers) {
      if (!star.starred_at) continue;
      push({
        id: `star_received:${repoKey}:${star.user?.login ?? 'unknown'}:${star.starred_at}`,
        type: 'star_received',
        ts: star.starred_at,
        title: `${star.user?.login ?? 'someone'} starred ${repo.name}`,
        url: repo.url,
        weight: WEIGHT.star_received,
        repo: repo.nameWithOwner,
        repoName: repo.name,
        meta: { login: star.user?.login ?? undefined },
      });
    }
    for (const fork of activity.forks) {
      push({
        id: `fork_received:${repoKey}:${fork.owner?.login ?? fork.id}`,
        type: 'fork_received',
        ts: fork.created_at,
        title: `${fork.owner?.login ?? 'someone'} forked ${repo.name}`,
        url: repo.url,
        weight: WEIGHT.fork_received,
        repo: repo.nameWithOwner,
        repoName: repo.name,
      });
    }
  }

  void TYPE_LABEL;
  return events;
}

export type GlobalActivity = {
  pulls: GhUserPull[];
  issues: GhUserIssue[];
  comments: { slug: string; name: string; isPrivate: boolean; comment: GhIssueComment }[];
};

/**
 * Activity that happens outside the account's own repositories (PRs and issues
 * in third-party projects, plus comments anywhere). Same dedupe keys as the
 * per-repo collectors so the two sources never double count.
 */
export function eventsFromGlobal(input: GlobalActivity): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const push = (event: ActivityEvent) => {
    if (event.ts) events.push(event);
  };

  for (const pull of input.pulls) {
    const identity = repoIdentity(pull.repo.nameWithOwner, pull.repo.name, pull.repo.isPrivate);
    const title = identity.isPrivate ? '提交一个 PR' : truncate(sanitizeText(pull.title, 100), 100);
    const meta = {
      number: pull.number,
      external: !pull.repo.nameWithOwner.startsWith(`${LOGIN}/`),
      ...(identity.isPrivate ? { private: true } : {}),
    };
    push({
      id: `pr_opened:${identity.key}:${pull.number}`,
      type: 'pr_opened',
      ts: pull.created_at,
      title,
      url: identity.isPrivate ? null : pull.html_url,
      weight: WEIGHT.pr_opened,
      repo: identity.repo,
      repoName: identity.repoName,
      meta,
    });
    if (pull.merged_at) {
      push({
        id: `pr_merged:${identity.key}:${pull.number}`,
        type: 'pr_merged',
        ts: pull.merged_at,
        title: identity.isPrivate ? '合并了一个 PR' : title,
        url: identity.isPrivate ? null : pull.html_url,
        weight: WEIGHT.pr_merged,
        repo: identity.repo,
        repoName: identity.repoName,
        meta,
      });
    } else if (pull.closed_at) {
      push({
        id: `pr_closed:${identity.key}:${pull.number}`,
        type: 'pr_closed',
        ts: pull.closed_at,
        title: identity.isPrivate ? '关闭了一个 PR' : title,
        url: identity.isPrivate ? null : pull.html_url,
        weight: WEIGHT.pr_closed,
        repo: identity.repo,
        repoName: identity.repoName,
        meta,
      });
    }
  }

  for (const issue of input.issues) {
    const identity = repoIdentity(issue.repo.nameWithOwner, issue.repo.name, issue.repo.isPrivate);
    push({
      id: `issue_opened:${identity.key}:${issue.number}`,
      type: 'issue_opened',
      ts: issue.created_at,
      title: identity.isPrivate ? '创建了一个 Issue' : truncate(sanitizeText(issue.title, 100), 100),
      url: identity.isPrivate ? null : issue.url,
      weight: WEIGHT.issue_opened,
      repo: identity.repo,
      repoName: identity.repoName,
      meta: {
        number: issue.number,
        external: !issue.repo.nameWithOwner.startsWith(`${LOGIN}/`),
        ...(identity.isPrivate ? { private: true } : {}),
      },
    });
  }

  for (const entry of input.comments) {
    const comment = entry.comment;
    if (comment.user?.login !== LOGIN) continue;
    const identity = repoIdentity(entry.slug, entry.name, entry.isPrivate);
    const body = truncate(sanitizeText(comment.body ?? '', 80), 80);
    const numberMatch = comment.html_url.match(/(?:pull|issues)\/(\d+)/);
    push({
      id: `issue_commented:${identity.key}:${comment.id}`,
      type: 'issue_commented',
      ts: comment.created_at,
      title: identity.isPrivate ? '评论了一个 Issue' : body || '评论了一个 Issue',
      url: identity.isPrivate ? null : comment.html_url,
      weight: WEIGHT.issue_commented,
      repo: identity.repo,
      repoName: identity.repoName,
      meta: {
        number: numberMatch ? Number(numberMatch[1]) : undefined,
        external: !entry.slug.startsWith(`${LOGIN}/`),
        ...(identity.isPrivate ? { private: true } : {}),
      },
    });
  }

  return events;
}

function compareEvents(a: ActivityEvent, b: ActivityEvent): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  if (a.weight !== b.weight) return b.weight - a.weight;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Append-only merge: ids already present keep the version that was stored first. */
export function mergeEvents(existing: ActivityEvent[], incoming: ActivityEvent[]): ActivityEvent[] {
  const map = new Map<string, ActivityEvent>();
  for (const event of existing) map.set(event.id, event);
  for (const event of incoming) if (!map.has(event.id)) map.set(event.id, event);
  return [...map.values()].sort(compareEvents);
}

export function buildRepos(repos: GhRepo[], events: ActivityEvent[], today: string): RepoRecord[] {
  const byName = new Map<string, ActivityEvent[]>();
  for (const event of events) {
    if (!event.repo) continue;
    const list = byName.get(event.repo) ?? [];
    list.push(event);
    byName.set(event.repo, list);
  }

  void today;
  return repos
    .filter((repo) => !repo.isPrivate)
    .map((repo) => {
      const own = byName.get(repo.nameWithOwner) ?? [];
      const commits = own.filter((e) => e.type === 'commit');
      const additions = commits.reduce((sum, e) => sum + (e.meta?.additions ?? 0), 0);
      const deletions = commits.reduce((sum, e) => sum + (e.meta?.deletions ?? 0), 0);
      const totalBytes = repo.languages.reduce((sum, l) => sum + l.bytes, 0);
      const languages: RepoLanguage[] = repo.languages.map((l) => ({
        name: l.name,
        bytes: l.bytes,
        pct: totalBytes > 0 ? l.bytes / totalBytes : 0,
        color: l.color,
      }));
      const commitTimes = commits.map((e) => e.ts).sort();
      return {
        id: repo.id,
        name: repo.name,
        nameWithOwner: repo.nameWithOwner,
        description: repo.description,
        url: repo.url,
        homepageUrl: repo.homepageUrl,
        createdAt: repo.createdAt,
        pushedAt: repo.pushedAt,
        isFork: repo.isFork,
        isArchived: repo.isArchived,
        primaryLanguage: repo.primaryLanguage,
        topics: repo.topics,
        stars: repo.stars,
        forks: repo.forks,
        diskUsage: repo.diskUsage,
        defaultBranch: repo.defaultBranch,
        totals: {
          commits: commits.length,
          additions,
          deletions,
          releases: own.filter((e) => e.type === 'release').length,
          issues: own.filter((e) => e.type === 'issue_opened').length,
          pullRequests: own.filter((e) => e.type === 'pr_opened').length,
          stars: own.filter((e) => e.type === 'star_received').length,
          forks: own.filter((e) => e.type === 'fork_received').length,
        },
        languages,
        firstCommitAt: commitTimes[0] ?? null,
        lastCommitAt: commitTimes.length > 0 ? commitTimes[commitTimes.length - 1] : null,
      } satisfies RepoRecord;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

export function localDate(iso: string): string {
  return new Date(new Date(iso).getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

function localMonth(iso: string): string {
  return localDate(iso).slice(0, 7);
}

function localWeekday(iso: string): number {
  return new Date(new Date(iso).getTime() + TZ_OFFSET_MS).getUTCDay();
}

function localHour(iso: string): number {
  return new Date(new Date(iso).getTime() + TZ_OFFSET_MS).getUTCHours();
}

function monthRange(startMonth: string, endMonth: string): string[] {
  const out: string[] = [];
  const [sy, sm] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function buildCalendar(
  days: { date: string; count: number }[],
  today: string,
): CalendarRecord {
  const first = days.length > 0 ? days[0].date : today;
  const map = new Map(days.map((d) => [d.date, d.count]));
  const out: CalendarRecord['days'] = [];
  const cursor = new Date(`${first}T00:00:00Z`);
  const end = new Date(`${today}T00:00:00Z`);
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    out.push({ date, count: map.get(date) ?? 0, level: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const max = out.reduce((m, d) => Math.max(m, d.count), 0);
  for (const day of out) {
    day.level = day.count === 0 ? 0 : Math.min(4, Math.ceil((day.count / Math.max(max, 1)) * 4));
  }
  const total = out.reduce((sum, d) => sum + d.count, 0);
  return { start: out[0]?.date ?? today, end: today, total, maxPerDay: max, days: out };
}

export function buildAggregates(
  events: ActivityEvent[],
  repos: RepoRecord[],
  calendar: CalendarRecord,
  now: string,
): AggregatesRecord {
  const commits = events.filter((e) => e.type === 'commit');
  const additions = commits.reduce((sum, e) => sum + (e.meta?.additions ?? 0), 0);
  const deletions = commits.reduce((sum, e) => sum + (e.meta?.deletions ?? 0), 0);
  const count = (type: EventType) => events.filter((e) => e.type === type).length;

  const months = monthRange(localMonth(events[0]?.ts ?? now), localMonth(now));
  const monthMap = new Map<string, { commits: number; additions: number; deletions: number; events: number }>();
  for (const month of months) monthMap.set(month, { commits: 0, additions: 0, deletions: 0, events: 0 });
  for (const event of events) {
    const key = localMonth(event.ts);
    const bucket = monthMap.get(key) ?? { commits: 0, additions: 0, deletions: 0, events: 0 };
    bucket.events += 1;
    if (event.type === 'commit') {
      bucket.commits += 1;
      bucket.additions += event.meta?.additions ?? 0;
      bucket.deletions += event.meta?.deletions ?? 0;
    }
    monthMap.set(key, bucket);
  }

  const weekdayHour: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const event of commits) {
    weekdayHour[localWeekday(event.ts)][localHour(event.ts)] += 1;
  }

  const languageTotals = new Map<string, { bytes: number; color: string | null }>();
  for (const repo of repos) {
    for (const lang of repo.languages) {
      const entry = languageTotals.get(lang.name) ?? { bytes: 0, color: lang.color };
      entry.bytes += lang.bytes;
      languageTotals.set(lang.name, entry);
    }
  }
  const langBytes = [...languageTotals.values()].reduce((sum, l) => sum + l.bytes, 0);
  const byLanguage: RepoLanguage[] = [...languageTotals.entries()]
    .map(([name, value]) => ({
      name,
      bytes: value.bytes,
      pct: langBytes > 0 ? value.bytes / langBytes : 0,
      color: value.color,
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10);

  const byRepo = repos
    .map((repo) => ({
      repo: repo.nameWithOwner,
      name: repo.name,
      commits: repo.totals.commits,
      additions: repo.totals.additions,
      deletions: repo.totals.deletions,
      stars: repo.totals.stars,
      releases: repo.totals.releases,
      lastActivityAt: repo.lastCommitAt,
    }))
    .sort((a, b) => b.commits - a.commits);

  // Streaks are derived from the official contribution calendar.
  let longest = 0;
  let longestStart: string | null = null;
  let longestEnd: string | null = null;
  let run = 0;
  let runStart: string | null = null;
  for (const day of calendar.days) {
    if (day.count > 0) {
      if (run === 0) runStart = day.date;
      run += 1;
      if (run > longest) {
        longest = run;
        longestStart = runStart;
        longestEnd = day.date;
      }
    } else {
      run = 0;
      runStart = null;
    }
  }
  let current = 0;
  for (let i = calendar.days.length - 1; i >= 0; i -= 1) {
    if (calendar.days[i].count > 0) current += 1;
    else break;
  }

  const peakMap = new Map<string, { events: number; commits: number }>();
  for (const event of events) {
    const key = localDate(event.ts);
    const entry = peakMap.get(key) ?? { events: 0, commits: 0 };
    entry.events += 1;
    if (event.type === 'commit') entry.commits += 1;
    peakMap.set(key, entry);
  }
  let peakDay = { date: '', events: 0, commits: 0 };
  for (const [date, value] of peakMap) {
    if (value.events > peakDay.events) peakDay = { date, ...value };
  }

  const byMonth = months.map((month) => ({ month, ...(monthMap.get(month) ?? { commits: 0, additions: 0, deletions: 0, events: 0 }) }));
  const busiest = byMonth.reduce(
    (best, cur) => (cur.commits > best.commits ? cur : best),
    byMonth[0] ?? { month: '', commits: 0, additions: 0, deletions: 0, events: 0 },
  );

  const eventTypes = (Object.keys(WEIGHT) as EventType[])
    .map((type) => ({ type, count: count(type) }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    totals: {
      commits: commits.length,
      repos: repos.length,
      releases: count('release'),
      prsOpened: count('pr_opened'),
      prsMerged: count('pr_merged'),
      issuesOpened: count('issue_opened'),
      issueComments: count('issue_commented'),
      starsReceived: count('star_received'),
      forksReceived: count('fork_received'),
      additions,
      deletions,
      net: additions - deletions,
    },
    byMonth,
    byWeekdayHour: weekdayHour,
    byLanguage,
    byRepo,
    streaks: { longest, longestStart, longestEnd, current },
    peakDay,
    busiestMonth: { month: busiest.month, commits: busiest.commits, additions: busiest.additions },
    eventTypes,
  };
}

export function activeDayCount(calendar: CalendarRecord): number {
  return calendar.days.filter((d) => d.count > 0).length;
}
