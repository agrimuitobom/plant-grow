import type { FieldValue, Timestamp } from 'firebase/firestore';

/**
 * Firestore Timestamp を「M/D HH:MM」形式に短縮整形する。
 * 読み出し時は常に Timestamp 型 (FieldValue は書き込み時専用) なので、
 * toDate を期待してダックタイピングで判定する。
 */
export function formatAuditTimestamp(
  ts: Timestamp | FieldValue | undefined | null
): string {
  if (!ts) return '';
  const maybe = ts as { toDate?: () => Date };
  if (typeof maybe.toDate !== 'function') return '';
  const d = maybe.toDate();
  const mo = d.getMonth() + 1;
  const da = d.getDate();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${mo}/${da} ${h}:${m}`;
}

/** 「最終更新: 田中先生 (M/D HH:MM)」形式の 1 行サマリー。空ならフォールバック表示。 */
export function formatAuditCaption(args: {
  name?: string | null;
  timestamp?: Timestamp | FieldValue | null;
  fallback?: string;
}): string {
  const time = formatAuditTimestamp(args.timestamp ?? null);
  const name = args.name?.trim() || '';
  if (!name && !time) return args.fallback ?? '';
  if (!time) return name;
  if (!name) return time;
  return `${name} (${time})`;
}
