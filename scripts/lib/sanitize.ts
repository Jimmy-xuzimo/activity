const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PRIVATE_IP = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g;
const TOKEN_LIKE = /\b(?:gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,})\b/g;
const SECRET_WORDS = /\b(?:password|passwd|secret[_-]?key|api[_-]?key|access[_-]?token)\b[=:]\s*\S+/gi;
const REMOTE_URL = /(?:https?|ssh|git):\/\/[^\s]+|[^\s@]+@[^\s]+:[\w./-]+/g;

/**
 * Commit messages are public on GitHub already, but this site is a permanent
 * public snapshot: strip contact details, private addresses and anything that
 * looks like a credential before the text is committed into data/.
 */
export function sanitizeText(input: string, maxLength = 120): string {
  let text = input
    .replace(/\r/g, '')
    .split('\n')[0]
    .replace(TOKEN_LIKE, '[redacted]')
    .replace(EMAIL, '[email]')
    .replace(PRIVATE_IP, '[ip]')
    .replace(SECRET_WORDS, '[redacted]')
    .replace(REMOTE_URL, '[url]')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength - 1).trimEnd()}…`;
  }
  return text;
}

export function truncate(input: string, maxLength: number): string {
  const text = input.replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}
