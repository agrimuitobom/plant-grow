import { describe, expect, it } from 'vitest';
import {
  defaultFormStrains,
  getStrainPhotos,
  nextStrainId,
  sameFormStrains,
  templateStrainsFor,
} from './strain';
import type { RecordDoc } from '../types';

describe('getStrainPhotos', () => {
  it('returns the new photos array when present (even if empty)', () => {
    expect(getStrainPhotos({ photos: [] })).toEqual([]);
    expect(getStrainPhotos({ photos: [{ path: 'p/a.jpg', url: 'https://x/a.jpg' }] })).toEqual([
      { path: 'p/a.jpg', url: 'https://x/a.jpg' },
    ]);
  });

  it('falls back to legacy single photoPath + photoUrl', () => {
    expect(
      getStrainPhotos({ photoPath: 'p/legacy.jpg', photoUrl: 'https://x/legacy.jpg' })
    ).toEqual([{ path: 'p/legacy.jpg', url: 'https://x/legacy.jpg' }]);
  });

  it('returns [] when the legacy pair is incomplete', () => {
    expect(getStrainPhotos({ photoPath: 'p/x.jpg' })).toEqual([]);
    expect(getStrainPhotos({ photoUrl: 'https://x/x.jpg' })).toEqual([]);
    expect(getStrainPhotos({})).toEqual([]);
  });

  it('prefers the new array even when legacy fields are also present (write-only-new contract)', () => {
    expect(
      getStrainPhotos({
        photos: [{ path: 'new/a.jpg', url: 'https://x/new-a.jpg' }],
        photoPath: 'legacy/a.jpg',
        photoUrl: 'https://x/legacy-a.jpg',
      })
    ).toEqual([{ path: 'new/a.jpg', url: 'https://x/new-a.jpg' }]);
  });

  it('returns the new array even when empty, NOT falling through to legacy', () => {
    // ある日「全部削除した」状態を表現するため、空配列は legacy を上書きする扱い
    expect(
      getStrainPhotos({
        photos: [],
        photoPath: 'legacy/a.jpg',
        photoUrl: 'https://x/legacy-a.jpg',
      })
    ).toEqual([]);
  });
});

describe('nextStrainId', () => {
  it('空きのうち最初のアルファベットを返す', () => {
    expect(nextStrainId([])).toBe('A');
    expect(nextStrainId(['A', 'B', 'C'])).toBe('D');
  });

  it('途中の株を消した後でも既存 id と衝突しない', () => {
    // 旧実装は株数から決めていたので ['A','C'] に対して 'C' を返していた
    expect(nextStrainId(['A', 'C'])).toBe('B');
    expect(nextStrainId(['B', 'C'])).toBe('A');
  });

  it('26 株を超えたら A2 から続ける', () => {
    const all = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    expect(nextStrainId(all)).toBe('A2');
  });
});

describe('templateStrainsFor', () => {
  const rec = (date: string, names: string[]): RecordDoc => ({
    date,
    strains: names.map((n, i) => ({
      id: String.fromCharCode(65 + i),
      category: 'トマト',
      name: n,
      height: 10,
      leafCount: 4,
      memo: 'メモ',
      photos: [{ path: 'p', url: 'u' }],
    })),
    averages: { height: 10, leafCount: 4 },
    createdBy: 'u',
    updatedBy: 'u',
    updatedByName: 'n',
  });

  it('記録が無ければ A/B/C 株', () => {
    expect(templateStrainsFor([], '2026-05-01').map((s) => s.id)).toEqual(['A', 'B', 'C']);
  });

  it('直前の記録から株名と品目だけ引き継ぎ、測定値・メモ・写真は空にする', () => {
    const out = templateStrainsFor(
      [rec('2026-04-01', ['古い']), rec('2026-04-20', ['窓際', '廊下'])],
      '2026-05-01'
    );
    expect(out).toEqual([
      { id: 'A', category: 'トマト', name: '窓際', height: '', leafCount: '', memo: '', photos: [] },
      { id: 'B', category: 'トマト', name: '廊下', height: '', leafCount: '', memo: '', photos: [] },
    ]);
  });

  it('過去に記録が無ければ直後の記録を使う', () => {
    const out = templateStrainsFor([rec('2026-05-10', ['後'])], '2026-05-01');
    expect(out.map((s) => s.name)).toEqual(['後']);
  });
});

describe('sameFormStrains', () => {
  it('内容が同じなら true、値や写真が違えば false', () => {
    const a = defaultFormStrains();
    expect(sameFormStrains(a, defaultFormStrains())).toBe(true);
    expect(sameFormStrains(a, a.slice(0, 2))).toBe(false);
    expect(sameFormStrains(a, [{ ...a[0]!, height: 3 }, a[1]!, a[2]!])).toBe(false);
    expect(
      sameFormStrains(a, [{ ...a[0]!, photos: [{ path: 'x', url: 'y' }] }, a[1]!, a[2]!])
    ).toBe(false);
  });
});
