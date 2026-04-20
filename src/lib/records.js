import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, CLASS_ID } from './firebase';

/**
 * Firestore schema
 * --------------------------------------------------------------
 * classes/{classId}/records/{YYYY-MM-DD}
 *   date:       "2026-04-20"           // doc id と同値。クエリ用に重複保持
 *   strains:    [{ id, name, height, leafCount }]
 *   averages:   { height, leafCount }  // 入力時に算出
 *   createdAt:  Timestamp
 *   updatedAt:  Timestamp
 *
 * ポイント
 *   - doc id を日付にすることで 1 日 1 レコードを保証し、upsert が容易。
 *   - 平均値は書き込み時に確定させることで、読み出しコストとクライアント計算を削減。
 *   - 個別株は配列ではなく strains: {[id]: {...}} のマップでも良いが、
 *     表示順・タブレット上での操作性を考え配列に固定。
 */

export const recordsCol = () => collection(db, 'classes', CLASS_ID, 'records');
export const recordDoc = (dateId) => doc(db, 'classes', CLASS_ID, 'records', dateId);

export function calcAverages(strains) {
  const valid = strains.filter(
    (s) => Number.isFinite(s.height) || Number.isFinite(s.leafCount)
  );
  const avg = (key) => {
    const nums = valid.map((s) => s[key]).filter((v) => Number.isFinite(v));
    if (!nums.length) return null;
    return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2));
  };
  return { height: avg('height'), leafCount: avg('leafCount') };
}

export function toDateId(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function fetchRecord(dateId) {
  const snap = await getDoc(recordDoc(dateId));
  return snap.exists() ? snap.data() : null;
}

export async function fetchAllRecords() {
  const q = query(recordsCol(), orderBy('date', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function saveRecord({ dateId, strains }) {
  const cleanStrains = strains.map((s) => ({
    id: s.id,
    name: s.name?.trim() || s.id,
    height: Number.isFinite(Number(s.height)) ? Number(s.height) : null,
    leafCount: Number.isFinite(Number(s.leafCount)) ? Number(s.leafCount) : null,
  }));
  const averages = calcAverages(cleanStrains);
  await setDoc(
    recordDoc(dateId),
    {
      date: dateId,
      strains: cleanStrains,
      averages,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  return { date: dateId, strains: cleanStrains, averages };
}
