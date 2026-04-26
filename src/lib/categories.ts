import type { Averages, RecordDoc, Strain } from '../types';
import { calcAverages } from './records';

/** 品目が空または空白の株をまとめて表示するときのラベル。 */
export const UNCATEGORIZED = '未分類';

/** 集計や表示に使う安定キー。空白除去のうえ、空文字なら UNCATEGORIZED に寄せる。 */
export function normalizeCategory(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  return t === '' ? UNCATEGORIZED : t;
}

export function categoryOf(strain: Pick<Strain, 'category'>): string {
  return normalizeCategory(strain.category);
}

/** 全レコードに登場した品目の一覧 (重複なし、五十音/英字順)。 */
export function uniqueCategories(records: RecordDoc[]): string[] {
  const set = new Set<string>();
  for (const r of records) {
    for (const s of r.strains ?? []) set.add(categoryOf(s));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ja'));
}

/** 入力フォームの品目欄サジェスト用に、直近で使われている候補を返す。 */
export function categorySuggestions(records: RecordDoc[]): string[] {
  return uniqueCategories(records).filter((c) => c !== UNCATEGORIZED);
}

/** 株の配列を品目キーでグループ化する。 */
function groupByCategory<T extends Pick<Strain, 'category'>>(
  strains: T[]
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const s of strains) {
    const key = categoryOf(s);
    const arr = out.get(key) ?? [];
    arr.push(s);
    out.set(key, arr);
  }
  return out;
}

/** その日の平均値を品目別に算出する。 */
export function calcAveragesByCategory(
  strains: Pick<Strain, 'category' | 'height' | 'leafCount'>[]
): Record<string, Averages> {
  const out: Record<string, Averages> = {};
  for (const [key, arr] of groupByCategory(strains)) {
    out[key] = calcAverages(arr);
  }
  return out;
}

/** 指定品目の日別平均推移。GrowthChart 用。 */
export type CategoryDailyPoint = {
  date: string;
  height: number | null;
  leafCount: number | null;
};

export function dailyAveragesFor(
  records: RecordDoc[],
  category: string | null
): CategoryDailyPoint[] {
  return records.map((r) => {
    const filtered = (r.strains ?? []).filter((s) =>
      category == null ? true : categoryOf(s) === category
    );
    if (filtered.length === 0) {
      return { date: r.date, height: null, leafCount: null };
    }
    const avg = calcAverages(filtered);
    return { date: r.date, height: avg.height, leafCount: avg.leafCount };
  });
}
