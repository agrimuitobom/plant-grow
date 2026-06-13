import { describe, expect, it } from 'vitest';
import {
  HEIGHT_MAX_CM,
  LEAF_COUNT_MAX,
  validateHeight,
  validateLeafCount,
} from './validation';

describe('validateHeight', () => {
  it('returns null for the empty input (未入力)', () => {
    expect(validateHeight('')).toBeNull();
  });

  it('returns null for plausible values including the upper bound', () => {
    expect(validateHeight(0)).toBeNull();
    expect(validateHeight(12.5)).toBeNull();
    expect(validateHeight(HEIGHT_MAX_CM)).toBeNull();
  });

  it('warns on negative values', () => {
    expect(validateHeight(-1)).toMatch(/マイナス/);
  });

  it('warns above the upper bound', () => {
    const msg = validateHeight(HEIGHT_MAX_CM + 1);
    expect(msg).toMatch(/大きすぎる/);
    expect(msg).toContain(String(HEIGHT_MAX_CM + 1));
  });

  it('returns null for non-finite numbers (treat as missing rather than warning)', () => {
    expect(validateHeight(Number.NaN as never)).toBeNull();
    expect(validateHeight(Number.POSITIVE_INFINITY as never)).toBeNull();
  });
});

describe('validateLeafCount', () => {
  it('returns null for the empty input', () => {
    expect(validateLeafCount('')).toBeNull();
  });

  it('returns null for plausible integer values', () => {
    expect(validateLeafCount(0)).toBeNull();
    expect(validateLeafCount(7)).toBeNull();
    expect(validateLeafCount(LEAF_COUNT_MAX)).toBeNull();
  });

  it('warns on negative values', () => {
    expect(validateLeafCount(-1)).toMatch(/マイナス/);
  });

  it('warns when not an integer', () => {
    expect(validateLeafCount(3.5)).toMatch(/整数/);
  });

  it('warns above the upper bound', () => {
    const msg = validateLeafCount(LEAF_COUNT_MAX + 1);
    expect(msg).toMatch(/多すぎる/);
    expect(msg).toContain(String(LEAF_COUNT_MAX + 1));
  });
});
