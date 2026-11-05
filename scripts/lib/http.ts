const API = 'https://api.github.com';

let callCount = 0;
let token = '';

export class GhError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GhError';
    this.status = status;
  }
}

export function setToken(value: string): void {
  token = value;
}

export function getCallCount(): number {
  return callCount;
}

export function resetCallCount(): void {
  callCount = 0;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GhOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  accept?: string;
  allow404?: boolean;
};

const RETRY_DELAYS_MS = [30_000, 120_000, 300_000];

function parseNext(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

async function request(
  path: string,
  opts: GhOptions = {},
): Promise<{ data: unknown; headers: Headers; status: number }> {
  const url = path.startsWith('http') ? path : API + path;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: opts.accept ?? 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'jimmy-xuzimo-activity-site',
    ...opts.headers,
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let retries = 0;
  while (true) {
    callCount += 1;
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(45_000),
      });
    } catch (err) {
      if (retries >= RETRY_DELAYS_MS.length) throw err;
      await sleep(RETRY_DELAYS_MS[retries++]);
      continue;
    }

    if (res.status === 404 && opts.allow404) {
      return { data: null, headers: res.headers, status: 404 };
    }

    if (res.ok) {
      const text = await res.text();
      return { data: text ? JSON.parse(text) : null, headers: res.headers, status: res.status };
    }

    const remaining = res.headers.get('x-ratelimit-remaining');
    const retryable = res.status === 429 || res.status >= 500 || (res.status === 403 && remaining === '0');
    if (!retryable || retries >= RETRY_DELAYS_MS.length) {
      let detail = '';
      try {
        const body = await res.json();
        if (body && body.message) detail = `: ${body.message}`;
      } catch {
        /* body was not JSON */
      }
      throw new GhError(res.status, `${path} -> ${res.status} ${res.statusText}${detail}`);
    }
    await sleep(RETRY_DELAYS_MS[retries++]);
  }
}

export async function rest<T>(path: string, opts: GhOptions = {}): Promise<T> {
  const { data } = await request(path, opts);
  return data as T;
}

export async function restPaged<T>(path: string, opts: GhOptions = {}): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  while (next) {
    const { data, headers } = await request(next, opts);
    if (Array.isArray(data)) out.push(...data);
    next = parseNext(headers.get('link'));
  }
  return out;
}

export async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const { data } = await request('/graphql', { body: { query, variables } });
  const payload = data as { data?: T; errors?: { message: string }[] };
  if (payload.errors && payload.errors.length > 0) {
    throw new GhError(200, `GraphQL error: ${payload.errors.map((e) => e.message).join('; ')}`);
  }
  return payload.data as T;
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
