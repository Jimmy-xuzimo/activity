export type EventType =
  | 'repo_created'
  | 'commit'
  | 'release'
  | 'issue_opened'
  | 'issue_commented'
  | 'pr_opened'
  | 'pr_merged'
  | 'pr_closed'
  | 'star_received'
  | 'fork_received';

export type EventMeta = {
  sha?: string;
  additions?: number;
  deletions?: number;
  files?: number;
  language?: string | null;
  isMerge?: boolean;
  number?: number;
  login?: string;
  tag?: string;
  private?: boolean;
  external?: boolean;
};

export type ActivityEvent = {
  id: string;
  type: EventType;
  ts: string;
  repo: string | null;
  repoName: string | null;
  title: string;
  url: string | null;
  weight: number;
  meta?: EventMeta;
};

export type RepoLanguage = { name: string; bytes: number; pct: number; color: string | null };

export type RepoRecord = {
  id: string;
  name: string;
  nameWithOwner: string;
  description: string | null;
  url: string;
  homepageUrl: string | null;
  createdAt: string;
  pushedAt: string | null;
  isFork: boolean;
  isArchived: boolean;
  primaryLanguage: { name: string; color: string | null } | null;
  topics: string[];
  stars: number;
  forks: number;
  diskUsage: number | null;
  defaultBranch: string | null;
  totals: {
    commits: number;
    additions: number;
    deletions: number;
    releases: number;
    issues: number;
    pullRequests: number;
    stars: number;
    forks: number;
  };
  languages: RepoLanguage[];
  firstCommitAt: string | null;
  lastCommitAt: string | null;
};

export type CalendarDay = { date: string; count: number; level: number };

export type CalendarRecord = {
  start: string;
  end: string;
  total: number;
  maxPerDay: number;
  days: CalendarDay[];
};

export type MetaRecord = {
  schemaVersion: number;
  generatedAt: string;
  sourceUpdatedAt: string;
  firstActivityAt: string;
  lastActivityAt: string;
  syncIntervalMinutes: number;
  coverage: {
    reposTotal: number;
    reposPublic: number;
    reposPrivate: number;
    privateActivity: 'anonymized' | 'excluded';
    nonDefaultBranch: false;
  };
  caliber: {
    commits: string;
    lines: string;
    excludes: string;
  };
  counts: {
    events: number;
    commits: number;
    daysActive: number;
  };
};

export type ProfileRecord = {
  login: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string;
  createdAt: string;
  followers: number;
  publicRepos: number;
};

export type AggregatesRecord = {
  totals: {
    commits: number;
    repos: number;
    releases: number;
    prsOpened: number;
    prsMerged: number;
    issuesOpened: number;
    issueComments: number;
    starsReceived: number;
    forksReceived: number;
    additions: number;
    deletions: number;
    net: number;
  };
  byMonth: { month: string; commits: number; additions: number; deletions: number; events: number }[];
  byWeekdayHour: number[][];
  byLanguage: RepoLanguage[];
  byRepo: {
    repo: string;
    name: string;
    commits: number;
    additions: number;
    deletions: number;
    stars: number;
    releases: number;
    lastActivityAt: string | null;
  }[];
  streaks: { longest: number; longestStart: string | null; longestEnd: string | null; current: number };
  peakDay: { date: string; events: number; commits: number };
  busiestMonth: { month: string; commits: number; additions: number };
  eventTypes: { type: EventType; count: number }[];
};

export type StateRecord = {
  version: number;
  repos: Record<
    string,
    {
      lastPushedAt: string | null;
      lastCommitAt: string | null;
      lastCommitSha: string | null;
    }
  >;
  issuesSince: string;
  commentsSince: string;
  pullsUpdatedAt: string;
  starsMaxStarredAt: string | null;
  lastFullSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
};

export type DataBundle = {
  meta: MetaRecord;
  profile: ProfileRecord;
  repos: RepoRecord[];
  events: ActivityEvent[];
  calendar: CalendarRecord;
  aggregates: AggregatesRecord;
  state: StateRecord;
};
