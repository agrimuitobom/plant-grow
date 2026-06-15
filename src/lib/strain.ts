import type { PhotoRef, Strain, StrainFormValue } from '../types';

/**
 * Strain から写真配列を取り出す。
 * 新形式 (photos: PhotoRef[]) が優先。空配列でも明示。
 * 旧形式 (photoPath + photoUrl の単数) も互換的に拾うので、
 * 移行スクリプトを書かなくても 3 週間ぶんの既存データがそのまま使える。
 */
export function getStrainPhotos(s: Pick<Strain, 'photos' | 'photoPath' | 'photoUrl'>): PhotoRef[] {
  if (Array.isArray(s.photos)) return s.photos;
  if (s.photoPath && s.photoUrl) return [{ path: s.photoPath, url: s.photoUrl }];
  return [];
}

/** StrainFormValue (フォーム状態) からも同じインターフェースで写真を取れるようにする。 */
export function getFormStrainPhotos(s: Pick<StrainFormValue, 'photos'>): PhotoRef[] {
  return Array.isArray(s.photos) ? s.photos : [];
}
