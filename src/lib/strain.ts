import type { PhotoRef, RecordDoc, Strain, StrainFormValue } from '../types';

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

/**
 * 既存の株 id と衝突しない次の id を返す (A, B, … Z, A2, B2, …)。
 *
 * 以前は「現在の株数」から決めていたため、B 株を消してから追加すると
 * 既にある "C" がもう 1 つできていた (前回値の取り込みや写真のファイル名が混線する)。
 */
export function nextStrainId(existingIds: readonly string[]): string {
  const used = new Set(existingIds);
  for (let round = 1; ; round += 1) {
    for (let i = 0; i < 26; i += 1) {
      const id = String.fromCharCode(65 + i) + (round === 1 ? '' : String(round));
      if (!used.has(id)) return id;
    }
  }
}

export function emptyFormStrain(id: string): StrainFormValue {
  return { id, category: '', name: `${id}株`, height: '', leafCount: '', memo: '', photos: [] };
}

/** 記録が 1 件もない生徒の初期フォーム (A / B / C 株)。 */
export function defaultFormStrains(): StrainFormValue[] {
  return ['A', 'B', 'C'].map(emptyFormStrain);
}

/** 保存済みの株データをフォーム状態に変換する。 */
export function toFormStrains(strains: readonly Strain[]): StrainFormValue[] {
  return strains.map((s) => ({
    id: s.id,
    category: s.category ?? '',
    name: s.name ?? s.id,
    height: s.height ?? '',
    leafCount: s.leafCount ?? '',
    memo: s.memo ?? '',
    photos: getStrainPhotos(s),
  }));
}

/**
 * まだ記録のない日のフォーム初期値。
 * 直近 (その日より前、無ければ後) の記録から「株の並び・名前・品目」だけを引き継ぎ、
 * 草丈・葉枚数・メモ・写真は空にする。毎日同じ株を測るので、
 * 株名や品目を毎回入れ直させない。
 */
export function templateStrainsFor(
  records: readonly RecordDoc[],
  dateId: string
): StrainFormValue[] {
  let before: RecordDoc | null = null;
  let after: RecordDoc | null = null;
  for (const r of records) {
    if (!r.strains?.length || r.date === dateId) continue;
    if (r.date < dateId) {
      if (!before || r.date > before.date) before = r;
    } else if (!after || r.date < after.date) {
      after = r;
    }
  }
  const source = before ?? after;
  if (!source) return defaultFormStrains();
  return source.strains.map((s) => ({
    ...emptyFormStrain(s.id),
    category: s.category ?? '',
    name: s.name ?? s.id,
  }));
}

/** フォーム内容が同じかどうか (未保存の変更があるかの判定に使う)。 */
export function sameFormStrains(
  a: readonly StrainFormValue[],
  b: readonly StrainFormValue[]
): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i]!;
    return (
      x.id === y.id &&
      x.category === y.category &&
      x.name === y.name &&
      x.height === y.height &&
      x.leafCount === y.leafCount &&
      (x.memo ?? '') === (y.memo ?? '') &&
      x.photos.length === y.photos.length &&
      x.photos.every((p, j) => p.path === y.photos[j]!.path)
    );
  });
}
