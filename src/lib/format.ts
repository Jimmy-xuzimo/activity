const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

export function fmtInt(value: number): string {
  return value.toLocaleString('en-US');
}

export function local(iso: string): Date {
  return new Date(new Date(iso).getTime() + TZ_OFFSET_MS);
}

export function localDateISO(iso: string): string {
  return local(iso).toISOString().slice(0, 10);
}

export function fmtMonthDay(iso: string): string {
  const d = local(iso);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function fmtTime(iso: string): string {
  const d = local(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function fmtYearMonth(iso: string): { year: string; month: string } {
  const d = local(iso);
  return { year: String(d.getUTCFullYear()), month: String(d.getUTCMonth() + 1).padStart(2, '0') };
}

export function fmtMonthKey(key: string): string {
  const [year, month] = key.split('-');
  return `${year}.${month}`;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function weekdayCN(iso: string): string {
  return WEEKDAYS[local(iso).getUTCDay()];
}

export function fmtDateLong(iso: string): string {
  const d = local(iso);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const ms = Date.parse(toISO) - Date.parse(fromISO);
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function fmtRelativeHours(iso: string, nowISO: string): string {
  const hours = Math.max(0, (Date.parse(nowISO) - Date.parse(iso)) / (60 * 60 * 1000));
  if (hours < 1) return `${Math.round(hours * 60)} 分钟前`;
  if (hours < 24) return `${Math.round(hours)} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

export const EVENT_LABELS: Record<string, string> = {
  repo_created: '仓库',
  commit: '提交',
  release: '版本',
  issue_opened: 'Issue',
  issue_commented: '评论',
  pr_opened: 'PR',
  pr_merged: '合并',
  pr_closed: 'PR',
  star_received: 'Star',
  fork_received: 'Fork',
};

const EVENT_VERBS: Record<string, string> = {
  repo_created: '创建仓库',
  commit: '提交',
  release: '发布',
  issue_opened: '创建 Issue',
  issue_commented: '评论',
  pr_opened: '提交 PR',
  pr_merged: '合并 PR',
  pr_closed: '关闭 PR',
  star_received: '收到 star',
  fork_received: '被 fork',
};

export function eventVerb(type: string): string {
  return EVENT_VERBS[type] ?? type;
}
