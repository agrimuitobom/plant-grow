import { describe, expect, it } from 'vitest';
import { getStrainPhotos } from './strain';

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
