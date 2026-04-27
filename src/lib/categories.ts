import { getDoc, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { rosterDoc } from './records';
import { calcAverages } from './records';
import type { Averages, RecordDoc, RosterEntry, Strain } from '../types';

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

const MAX_CATEGORIES = 50;
const MAX_CATEGORY_LENGTH = 40;

/** 配列を「重複なし・空白なし・長さ制限・件数制限」に整える。 */
export function sanitizeCategories(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = (raw ?? '').trim().slice(0, MAX_CATEGORY_LENGTH);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_CATEGORIES) break;
  }
  return out;
}

/** 登録済み品目リストを Firestore から取得。未保存なら空配列。 */
export async function fetchRegisteredCategories(uid: string): Promise<string[]> {
  const snap = await getDoc(rosterDoc(uid));
  if (!snap.exists()) return [];
  const data = snap.data() as RosterEntry;
  return Array.isArray(data.categories) ? sanitizeCategories(data.categories) : [];
}

/**
 * 登録済み品目リストを保存。
 * 名簿ドキュメントは Rules で uid と displayName が必須なので、両方とも一緒に書き込む。
 * (まだ保存履歴のない生徒でも品目登録できるようにするため。)
 */
export async function saveRegisteredCategories(
  user: Pick<User, 'uid' | 'displayName' | 'email'>,
  items: readonly string[]
): Promise<string[]> {
  const cleaned = sanitizeCategories(items);
  await setDoc(
    rosterDoc(user.uid),
    {
      uid: user.uid,
      displayName: user.displayName || user.email || user.uid,
      email: user.email ?? '',
      categories: cleaned,
    },
    { merge: true }
  );
  return cleaned;
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
