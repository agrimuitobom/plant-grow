import { describe, expect, it } from 'vitest';
import { calcAverages, normalizeMeasure, toDateId } from './records';

describe('normalizeMeasure', () => {
  it('treats the empty string as null — NOT as 0 (Number("") === 0 の罠)', () => {
    // これが 0 になると未入力の株が平均を引き下げる。E2E で発覚した実バグの回帰テスト。
    expect(normalizeMeasure('')).toBeNull();
  });

  it('passes through finite numbers including a legitimate 0', () => {
    expect(normalizeMeasure(0)).toBe(0); // 発芽直後 0cm は正当な値
    expect(normalizeMeasure(12.5)).toBe(12.5);
  });

  it('rejects null / undefined / non-finite', () => {
    expect(normalizeMeasure(null)).toBeNull();
    expect(normalizeMeasure(undefined)).toBeNull();
    expect(normalizeMeasure(Number.NaN)).toBeNull();
    expect(normalizeMeasure(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('calcAverages', () => {
  it('returns null/null for an empty array', () => {
    expect(calcAverages([])).toEqual({ height: null, leafCount: null });
  });

  it('ignores null entries when averaging', () => {
    expect(
      calcAverages([
        { height: 10, leafCount: 5 },
        { height: 20, leafCount: 7 },
        { height: null, leafCount: null },
      ])
    ).toEqual({ height: 15, leafCount: 6 });
  });

  it('returns null when every entry is null for that key', () => {
    expect(
      calcAverages([
        { height: null, leafCount: 4 },
        { height: null, leafCount: 6 },
      ])
    ).toEqual({ height: null, leafCount: 5 });
  });

  it('rounds to two decimal places', () => {
    // (10 + 11 + 12) / 3 = 11
    // (1 + 2 + 2) / 3 = 1.6666...
    expect(
      calcAverages([
        { height: 10, leafCount: 1 },
        { height: 11, leafCount: 2 },
        { height: 12, leafCount: 2 },
      ])
    ).toEqual({ height: 11, leafCount: 1.67 });
  });
});

describe('toDateId', () => {
  it('formats a Date as YYYY-MM-DD with zero-padded month/day', () => {
    expect(toDateId(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateId(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('accepts a date-like string and forwards to the Date constructor', () => {
    expect(toDateId('2026-04-20T12:00:00Z')).toMatch(/^2026-04-(20|21)$/);
  });
});
