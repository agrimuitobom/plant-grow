import { describe, expect, it } from 'vitest';
import {
  buildAxisScale,
  niceStep,
  pickLabelIndices,
  shortDateLabel,
} from './chartScale';

describe('niceStep', () => {
  it('snaps to the 1 / 2 / 2.5 / 5 series', () => {
    expect(niceStep(0.8)).toBe(1);
    expect(niceStep(1.3)).toBe(2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(12)).toBe(20);
    expect(niceStep(60)).toBe(100);
  });

  it('falls back to 1 for zero / negative / non-finite input', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-5)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });
});

describe('buildAxisScale', () => {
  it('always starts at 0 with 5 ticks and covers the data max', () => {
    const s = buildAxisScale(23.5);
    expect(s.ticks[0]).toBe(0);
    expect(s.ticks).toHaveLength(5);
    expect(s.max).toBeGreaterThanOrEqual(23.5);
    expect(s.ticks[4]).toBe(s.max);
  });

  it('produces clean tick values for a typical 草丈 range', () => {
    // max 23.5cm → step niceStep(5.875)=10 … max 40? そこまで大きいと余白が過剰。
    // 実測: niceStep(23.5/4=5.875) → 10 → max 40。データは収まるのでこれで OK。
    const s = buildAxisScale(23.5);
    expect(s.ticks).toEqual([0, 10, 20, 30, 40]);
  });

  it('handles small leaf-count ranges without fractional ugliness', () => {
    const s = buildAxisScale(7);
    expect(s.ticks).toEqual([0, 2, 4, 6, 8]);
    expect(s.max).toBe(8);
  });

  it('returns the 0-10 dummy scale for empty data', () => {
    expect(buildAxisScale(0)).toEqual({ max: 10, ticks: [0, 2.5, 5, 7.5, 10] });
    expect(buildAxisScale(Number.NaN)).toEqual({
      max: 10,
      ticks: [0, 2.5, 5, 7.5, 10],
    });
  });
});

describe('pickLabelIndices', () => {
  it('includes everything when n is small', () => {
    expect([...pickLabelIndices(5)]).toEqual([0, 1, 2, 3, 4]);
  });

  it('thins to ~maxLabels and always keeps first and last', () => {
    const picked = pickLabelIndices(60, 8);
    expect(picked.has(0)).toBe(true);
    expect(picked.has(59)).toBe(true);
    expect(picked.size).toBeLessThanOrEqual(10);
  });

  it('returns empty for n=0', () => {
    expect(pickLabelIndices(0).size).toBe(0);
  });
});

describe('shortDateLabel', () => {
  it('shortens YYYY-MM-DD to M/D without zero padding', () => {
    expect(shortDateLabel('2026-04-05')).toBe('4/5');
    expect(shortDateLabel('2026-12-31')).toBe('12/31');
  });

  it('passes through unparsable strings', () => {
    expect(shortDateLabel('n/a')).toBe('n/a');
  });
});
