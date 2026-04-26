import { describe, expect, it } from 'vitest';
import {
  UNCATEGORIZED,
  calcAveragesByCategory,
  categoryOf,
  categorySuggestions,
  dailyAveragesFor,
  normalizeCategory,
  sanitizeCategories,
  uniqueCategories,
} from './categories';
import type { RecordDoc } from '../types';

function rec(date: string, strains: RecordDoc['strains']): RecordDoc {
  return {
    date,
    strains,
    averages: { height: null, leafCount: null },
    createdBy: 'u',
    updatedBy: 'u',
    updatedByName: '',
  };
}

describe('normalizeCategory', () => {
  it('returns UNCATEGORIZED for null/undefined/empty/whitespace', () => {
    expect(normalizeCategory(null)).toBe(UNCATEGORIZED);
    expect(normalizeCategory(undefined)).toBe(UNCATEGORIZED);
    expect(normalizeCategory('')).toBe(UNCATEGORIZED);
    expect(normalizeCategory('   ')).toBe(UNCATEGORIZED);
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeCategory('  トマト  ')).toBe('トマト');
  });
});

describe('categoryOf', () => {
  it('reads the strain category through normalize', () => {
    expect(categoryOf({ category: '  ナス ' })).toBe('ナス');
    expect(categoryOf({ category: undefined })).toBe(UNCATEGORIZED);
  });
});

describe('uniqueCategories / categorySuggestions', () => {
  const records = [
    rec('2026-04-20', [
      strain({ category: 'トマト' }),
      strain({ category: 'ナス' }),
    ]),
    rec('2026-04-21', [
      strain({ category: 'トマト' }),
      strain({ category: undefined }),
    ]),
  ];

  it('uniqueCategories returns a sorted unique list including UNCATEGORIZED', () => {
    expect(uniqueCategories(records)).toEqual(['トマト', 'ナス', UNCATEGORIZED]);
  });

  it('categorySuggestions excludes UNCATEGORIZED', () => {
    expect(categorySuggestions(records)).toEqual(['トマト', 'ナス']);
  });
});

describe('calcAveragesByCategory', () => {
  it('groups by normalized category and averages each group', () => {
    const result = calcAveragesByCategory([
      { category: 'トマト', height: 10, leafCount: 4 },
      { category: 'トマト', height: 14, leafCount: 6 },
      { category: 'ナス', height: 20, leafCount: 9 },
      { category: '', height: 5, leafCount: 2 },
    ]);
    expect(result).toEqual({
      'トマト': { height: 12, leafCount: 5 },
      'ナス': { height: 20, leafCount: 9 },
      [UNCATEGORIZED]: { height: 5, leafCount: 2 },
    });
  });
});

describe('dailyAveragesFor', () => {
  const records = [
    rec('2026-04-20', [
      strain({ category: 'トマト', height: 10, leafCount: 5 }),
      strain({ category: 'ナス', height: 20, leafCount: 9 }),
    ]),
    rec('2026-04-21', [
      strain({ category: 'トマト', height: 12, leafCount: 6 }),
      strain({ category: undefined, height: 5, leafCount: 2 }),
    ]),
  ];

  it('returns one point per record date for the target category', () => {
    expect(dailyAveragesFor(records, 'トマト')).toEqual([
      { date: '2026-04-20', height: 10, leafCount: 5 },
      { date: '2026-04-21', height: 12, leafCount: 6 },
    ]);
  });

  it('returns null/null on dates where the target category is absent', () => {
    expect(dailyAveragesFor(records, 'ナス')).toEqual([
      { date: '2026-04-20', height: 20, leafCount: 9 },
      { date: '2026-04-21', height: null, leafCount: null },
    ]);
  });

  it('null category aggregates across all strains (overall)', () => {
    expect(dailyAveragesFor(records, null)).toEqual([
      { date: '2026-04-20', height: 15, leafCount: 7 },
      { date: '2026-04-21', height: 8.5, leafCount: 4 },
    ]);
  });
});

describe('sanitizeCategories', () => {
  it('trims, dedupes, drops empty entries', () => {
    expect(sanitizeCategories(['  トマト ', 'ナス', 'トマト', '', '   '])).toEqual([
      'トマト',
      'ナス',
    ]);
  });

  it('truncates entries longer than 40 chars', () => {
    const long = 'x'.repeat(60);
    expect(sanitizeCategories([long])[0]).toHaveLength(40);
  });

  it('caps the list at 50 entries', () => {
    const many = Array.from({ length: 80 }, (_, i) => `c${i}`);
    expect(sanitizeCategories(many)).toHaveLength(50);
  });
});

// テスト用の strain ファクトリ。RecordDoc.strains の Strain 型を満たす最小値を作る。
function strain(over: Partial<{
  id: string;
  category: string | undefined;
  name: string;
  height: number | null;
  leafCount: number | null;
  memo: string;
  photoPath: string | null;
  photoUrl: string | null;
}>): RecordDoc['strains'][number] {
  return {
    id: over.id ?? 'A',
    category: over.category,
    name: over.name ?? 'A',
    height: over.height ?? null,
    leafCount: over.leafCount ?? null,
    memo: over.memo ?? '',
    photoPath: over.photoPath ?? null,
    photoUrl: over.photoUrl ?? null,
  };
}
