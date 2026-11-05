import { graphql, rest, restPaged } from './http.ts';

export const OWNER = 'Jimmy-xuzimo';
export const LOGIN = 'Jimmy-xuzimo';

export type GhLanguage = { name: string; color: string | null; bytes: number };

export type GhRepo = {
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
  isPrivate: boolean;
  visibility: string;
  diskUsage: number | null;
  stars: number;
  forks: number;
  primaryLanguage: { name: string; color: string | null } | null;
  topics: string[];
  defaultBranch: string | null;
  languages: GhLanguage[];
};

export type GhProfile = {
  login: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string;
  createdAt: string;
  followers: number;
  publicRepos: number;
};

const REPOS_QUERY = `
query Repos($login: String!, $cursor: String) {
  user(login: $login) {
    login
    name
    bio
    avatarUrl
    createdAt
    followers { totalCount }
    repositories(
      first: 100
      after: $cursor
      ownerAffiliations: [OWNER]
      orderBy: { field: CREATED_AT, direction: ASC }
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        databaseId
        name
        nameWithOwner
        description
        url
        homepageUrl
        createdAt
        pushedAt
        isFork
        isArchived
        isPrivate
        visibility
        diskUsage
        stargazerCount
        forkCount
        primaryLanguage { name color }
        repositoryTopics(first: 10) { nodes { topic { name } } }
        defaultBranchRef { name }
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          totalSize
          edges { size node { name color } }
        }
      }
    }
  }
}
`;

type ReposResponse = {
  user: {
    login: string;
    name: string | null;
    bio: string | null;
    avatarUrl: string;
    createdAt: string;
    followers: { totalCount: number };
    repositories: {
      totalCount: number;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: {
        id: string;
        databaseId: number;
        name: string;
        nameWithOwner: string;
        description: string | null;
        url: string;
        homepageUrl: string | null;
        createdAt: string;
        pushedAt: string | null;
        isFork: boolean;
        isArchived: boolean;
        isPrivate: boolean;
        visibility: string;
        diskUsage: number | null;
        stargazerCount: number;
        forkCount: number;
        primaryLanguage: { name: string; color: string | null } | null;
        repositoryTopics: { nodes: { topic: { name: string } }[] };
        defaultBranchRef: { name: string } | null;
        languages: {
          totalSize: number;
          edges: { size: number; node: { name: string; color: string | null } }[];
        };
      }[];
    };
  };
};

export async function fetchProfileAndRepos(): Promise<{ profile: GhProfile; repos: GhRepo[] }> {
  const repos: GhRepo[] = [];
  let cursor: string | null = null;
  let profile: GhProfile | null = null;

  while (true) {
    const data: ReposResponse = await graphql<ReposResponse>(REPOS_QUERY, { login: LOGIN, cursor });
    const user = data.user;
    if (!profile) {
      profile = {
        login: user.login,
        name: user.name,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        followers: user.followers.totalCount,
        publicRepos: 0,
      };
    }
    for (const node of user.repositories.nodes) {
      repos.push({
        id: node.id,
        name: node.name,
        nameWithOwner: node.nameWithOwner,
        description: node.description,
        url: node.url,
        homepageUrl: node.homepageUrl,
        createdAt: node.createdAt,
        pushedAt: node.pushedAt,
        isFork: node.isFork,
        isArchived: node.isArchived,
        isPrivate: node.isPrivate,
        visibility: node.visibility,
        diskUsage: node.diskUsage,
        stars: node.stargazerCount,
        forks: node.forkCount,
        primaryLanguage: node.primaryLanguage,
        topics: node.repositoryTopics.nodes.map((n) => n.topic.name),
        defaultBranch: node.defaultBranchRef?.name ?? null,
        languages: node.languages.edges.map((e) => ({
          name: e.node.name,
          color: e.node.color,
          bytes: e.size,
        })),
      });
    }
    if (!user.repositories.pageInfo.hasNextPage) break;
    cursor = user.repositories.pageInfo.endCursor;
  }

  if (!profile) throw new Error('No profile returned from GraphQL');
  profile.publicRepos = repos.filter((r) => !r.isPrivate).length;
  return { profile, repos };
}

const CONTRIBUTIONS_QUERY = `
query Contributions($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalRepositoryContributions
      totalRepositoriesWithContributedCommits
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays { date contributionCount }
        }
      }
    }
  }
}
`;

type ContributionsResponse = {
  user: {
    contributionsCollection: {
      contributionCalendar: {
        totalContributions: number;
        weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
      };
    };
  };
};

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000 - 1000;

/**
 * contributionsCollection refuses windows longer than one year, so the whole
 * history is sliced. Today the account is < 1 year old (one call); after
 * 2026-11-21 this loop keeps working without changes.
 */
export async function fetchContributionCalendar(
  firstActivityAt: string,
  now: Date,
): Promise<{ date: string; count: number }[]> {
  const dayCounts = new Map<string, number>();
  let from = new Date(firstActivityAt).getTime();
  const end = now.getTime();

  while (from < end) {
    const to = Math.min(from + ONE_YEAR_MS, end);
    const data = await graphql<ContributionsResponse>(CONTRIBUTIONS_QUERY, {
      login: LOGIN,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    });
    for (const week of data.user.contributionsCollection.contributionCalendar.weeks) {
      for (const day of week.contributionDays) {
        dayCounts.set(day.date, (dayCounts.get(day.date) ?? 0) + day.contributionCount);
      }
    }
    from = to + 1000;
  }

  return [...dayCounts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type GhCommitListItem = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { date: string; name: string } | null;
    committer: { date: string } | null;
  };
  author: { login: string } | null;
  parents: { sha: string }[];
};

export async function fetchCommitList(repo: GhRepo, since?: string): Promise<GhCommitListItem[]> {
  const base = `/repos/${repo.nameWithOwner}/commits?author=${encodeURIComponent(LOGIN)}&per_page=100`;
  try {
    return await restPaged<GhCommitListItem>(since ? `${base}&since=${encodeURIComponent(since)}` : base);
  } catch (error) {
    // An empty repository answers 409 instead of an empty list.
    if (error instanceof Error && error.message.includes('-> 409')) return [];
    throw error;
  }
}

export type GhCommitDetail = {
  sha: string;
  stats?: { additions: number; deletions: number; total: number };
  files?: { filename: string; additions: number; deletions: number }[];
  parents: { sha: string }[];
};

export async function fetchCommitDetail(repo: GhRepo, sha: string): Promise<GhCommitDetail | null> {
  return rest<GhCommitDetail>(`/repos/${repo.nameWithOwner}/commits/${sha}`, { allow404: true });
}

export type GhRelease = {
  id: number;
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string | null;
  html_url: string;
};

export async function fetchReleases(repo: GhRepo): Promise<GhRelease[]> {
  return restPaged<GhRelease>(`/repos/${repo.nameWithOwner}/releases?per_page=100`);
}

export type GhPull = {
  number: number;
  title: string;
  state: 'open' | 'closed';
  draft: boolean;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  html_url: string;
  user: { login: string } | null;
};

export type GhUserPull = GhPull & {
  repo: { name: string; nameWithOwner: string; isPrivate: boolean };
};

const USER_PULLS_QUERY = `
query Pulls($login: String!, $cursor: String) {
  user(login: $login) {
    pullRequests(
      first: 100
      after: $cursor
      states: [OPEN, CLOSED, MERGED]
      orderBy: { field: CREATED_AT, direction: ASC }
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        title
        url
        createdAt
        closedAt
        mergedAt
        state
        isDraft
        repository { name nameWithOwner isPrivate }
      }
    }
  }
}
`;

type UserPullsResponse = {
  user: {
    pullRequests: {
      totalCount: number;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: {
        number: number;
        title: string;
        url: string;
        createdAt: string;
        closedAt: string | null;
        mergedAt: string | null;
        state: 'OPEN' | 'CLOSED' | 'MERGED';
        isDraft: boolean;
        repository: { name: string; nameWithOwner: string; isPrivate: boolean };
      }[];
    };
  };
};

/** Pull requests across *all* repositories, including third-party contributions. */
export async function fetchUserPullRequests(): Promise<GhUserPull[]> {
  const out: GhUserPull[] = [];
  let cursor: string | null = null;
  while (true) {
    const data = await graphql<UserPullsResponse>(USER_PULLS_QUERY, { login: LOGIN, cursor });
    for (const node of data.user.pullRequests.nodes) {
      out.push({
        number: node.number,
        title: node.title,
        state: node.state === 'OPEN' ? 'open' : 'closed',
        draft: node.isDraft,
        created_at: node.createdAt,
        updated_at: node.closedAt ?? node.createdAt,
        closed_at: node.closedAt,
        merged_at: node.mergedAt,
        html_url: node.url,
        user: { login: LOGIN },
        repo: {
          name: node.repository.name,
          nameWithOwner: node.repository.nameWithOwner,
          isPrivate: node.repository.isPrivate,
        },
      });
    }
    if (!data.user.pullRequests.pageInfo.hasNextPage) break;
    cursor = data.user.pullRequests.pageInfo.endCursor;
  }
  return out;
}

const USER_ISSUES_QUERY = `
query Issues($login: String!, $cursor: String) {
  user(login: $login) {
    issues(
      first: 100
      after: $cursor
      states: [OPEN, CLOSED]
      orderBy: { field: CREATED_AT, direction: ASC }
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        title
        url
        createdAt
        closedAt
        state
        repository { name nameWithOwner isPrivate }
      }
    }
  }
}
`;

type UserIssuesResponse = {
  user: {
    issues: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: {
        number: number;
        title: string;
        url: string;
        createdAt: string;
        closedAt: string | null;
        state: 'OPEN' | 'CLOSED';
        repository: { name: string; nameWithOwner: string; isPrivate: boolean };
      }[];
    };
  };
};

export type GhUserIssue = {
  number: number;
  title: string;
  url: string;
  created_at: string;
  closed_at: string | null;
  state: 'open' | 'closed';
  repo: { name: string; nameWithOwner: string; isPrivate: boolean };
};

/** Issues opened by the account in any repository. */
export async function fetchUserIssues(): Promise<GhUserIssue[]> {
  const out: GhUserIssue[] = [];
  let cursor: string | null = null;
  while (true) {
    const data = await graphql<UserIssuesResponse>(USER_ISSUES_QUERY, { login: LOGIN, cursor });
    for (const node of data.user.issues.nodes) {
      out.push({
        number: node.number,
        title: node.title,
        url: node.url,
        created_at: node.createdAt,
        closed_at: node.closedAt,
        state: node.state === 'OPEN' ? 'open' : 'closed',
        repo: {
          name: node.repository.name,
          nameWithOwner: node.repository.nameWithOwner,
          isPrivate: node.repository.isPrivate,
        },
      });
    }
    if (!data.user.issues.pageInfo.hasNextPage) break;
    cursor = data.user.issues.pageInfo.endCursor;
  }
  return out;
}

export type GhCommentedIssue = {
  repo: string;
  repoName: string;
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
};

type SearchResponse = {
  total_count: number;
  items: {
    number: number;
    title: string;
    html_url: string;
    updated_at: string;
    repository_url: string;
  }[];
};

/** Issues (and PRs) the account has commented on, newest activity first. */
export async function searchCommentedIssues(): Promise<GhCommentedIssue[]> {
  const out: GhCommentedIssue[] = [];
  for (const kind of ['issue', 'pull-request']) {
    const q = `commenter:${LOGIN} is:${kind}`;
  for (let page = 1; page <= 3; page += 1) {
    const data = await rest<SearchResponse>(
      `/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=100&page=${page}`,
    );
    for (const item of data.items) {
      const slug = item.repository_url.replace('https://api.github.com/repos/', '');
      out.push({
        repo: slug,
        repoName: slug.split('/')[1] ?? slug,
        number: item.number,
        title: item.title,
        html_url: item.html_url,
        updated_at: item.updated_at,
      });
    }
    if (data.items.length < 100) break;
  }
  }
  return out;
}

export async function fetchIssueCommentsOf(
  repoSlug: string,
  issueNumber: number,
  since: string,
): Promise<GhIssueComment[]> {
  return restPaged<GhIssueComment>(
    `/repos/${repoSlug}/issues/${issueNumber}/comments?since=${encodeURIComponent(since)}&per_page=100`,
  );
}


export type GhIssueComment = {
  id: number;
  body: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  issue_url: string;
  user: { login: string } | null;
};

export type GhStargazer = {
  starred_at: string;
  user: { login: string } | null;
};

export async function fetchStargazers(repo: GhRepo): Promise<GhStargazer[]> {
  return restPaged<GhStargazer>(`/repos/${repo.nameWithOwner}/stargazers?per_page=100`, {
    accept: 'application/vnd.github.star+json',
  });
}

export type GhFork = {
  id: number;
  created_at: string;
  owner: { login: string } | null;
};

export async function fetchForks(repo: GhRepo): Promise<GhFork[]> {
  return restPaged<GhFork>(`/repos/${repo.nameWithOwner}/forks?per_page=100&sort=newest`);
}
