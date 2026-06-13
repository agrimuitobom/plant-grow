import { describe, expect, it } from 'vitest';
import { formatAuditCaption, formatAuditTimestamp } from './audit';

// Firestore Timestamp の最小モック: toDate() さえ返せれば良い。
function ts(date: Date) {
  return { toDate: () => date } as unknown as Parameters<typeof formatAuditTimestamp>[0];
}

describe('formatAuditTimestamp', () => {
  it('formats a Date as M/D HH:MM with zero-padded clock', () => {
    expect(formatAuditTimestamp(ts(new Date(2026, 4, 10, 14, 30)))).toBe('5/10 14:30');
    expect(formatAuditTimestamp(ts(new Date(2026, 0, 1, 9, 5)))).toBe('1/1 09:05');
  });

  it('returns empty string for nullish / non-Timestamp values', () => {
    expect(formatAuditTimestamp(null)).toBe('');
    expect(formatAuditTimestamp(undefined)).toBe('');
    // toDate を持たない FieldValue 相当
    expect(formatAuditTimestamp({} as never)).toBe('');
  });
});

describe('formatAuditCaption', () => {
  const t = ts(new Date(2026, 4, 10, 14, 30));

  it('combines name and time as "name (M/D HH:MM)"', () => {
    expect(formatAuditCaption({ name: '田中先生', timestamp: t })).toBe(
      '田中先生 (5/10 14:30)'
    );
  });

  it('returns name only when timestamp missing', () => {
    expect(formatAuditCaption({ name: '田中先生', timestamp: null })).toBe('田中先生');
  });

  it('returns time only when name missing', () => {
    expect(formatAuditCaption({ name: '', timestamp: t })).toBe('5/10 14:30');
  });

  it('returns fallback when both missing', () => {
    expect(
      formatAuditCaption({ name: null, timestamp: null, fallback: '記録なし' })
    ).toBe('記録なし');
    expect(formatAuditCaption({ name: null, timestamp: null })).toBe('');
  });

  it('treats whitespace-only name as missing', () => {
    expect(formatAuditCaption({ name: '   ', timestamp: t })).toBe('5/10 14:30');
  });
});
