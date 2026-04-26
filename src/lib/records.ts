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
import type { User } from 'firebase/auth';
import { db, CLASS_ID } from './firebase';
import { deleteStrainPhoto } from './storage';
import type { Averages, RecordDoc, Strain, StrainFormValue } from '../types';

/**
 * Firestore schema (per-student)
 * --------------------------------------------------------------
 * classes/{classId}/students/{uid}/records/{YYYY-MM-DD}
 *   date:           "2026-04-20"           // doc id と同値。クエリ用に重複保持
 *   strains:        Strain[]               // 個別株。型は src/types.ts を参照
 *   averages:       { height, leafCount }  // 入力時に算出
 *   createdAt:      Timestamp              // 新規作成時のみ
 *   updatedAt:      Timestamp
 *   createdBy:      uid                    // 監査: 作成した人 (= path の uid)
 *   createdByName:  displayName            // 表示用にキャッシュ
 *   updatedBy:      uid
 *   updatedByName:  displayName
 *
 * ポイント
 *   - レコードは「クラス × 生徒 × 日付」の 3 軸で一意。
 *   - パスの uid と request.auth.uid を一致させることで、生徒は自分のデータしか触れない。
 *   - createdBy / updatedBy はパスから自明だが、後でクラス横断ビューを作る時に役立つので保存。
 */

export const recordsCol = (uid: string) =>
  collection(db, 'classes', CLASS_ID, 'students', uid, 'records');
export const recordDoc = (uid: string, dateId: string) =>
  doc(db, 'classes', CLASS_ID, 'students', uid, 'records', dateId);

export function calcAverages(strains: Pick<Strain, 'height' | 'leafCount'>[]): Averages {
  const avg = (key: 'height' | 'leafCount'): number | null => {
    const nums = strains
      .map((s) => s[key])
      .filter((v): v is number => Number.isFinite(v as number));
    if (!nums.length) return null;
    return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2));
  };
  return { height: avg('height'), leafCount: avg('leafCount') };
}

export function toDateId(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function fetchRecord(uid: string, dateId: string): Promise<RecordDoc | null> {
  const snap = await getDoc(recordDoc(uid, dateId));
  return snap.exists() ? (snap.data() as RecordDoc) : null;
}

export async function fetchAllRecords(uid: string): Promise<RecordDoc[]> {
  const q = query(recordsCol(uid), orderBy('date', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as RecordDoc);
}

const photoPathsOf = (strains: Strain[] | undefined): string[] =>
  (strains ?? []).map((s) => s?.photoPath).filter((p): p is string => Boolean(p));

export type SaveRecordArgs = {
  user: Pick<User, 'uid' | 'displayName' | 'email'>;
  dateId: string;
  strains: StrainFormValue[];
};

export type SaveRecordResult = {
  date: string;
  strains: Strain[];
  averages: Averages;
};

export async function saveRecord({
  user,
  dateId,
  strains,
}: SaveRecordArgs): Promise<SaveRecordResult> {
  const cleanStrains: Strain[] = strains.map((s) => ({
    id: s.id,
    // 品目は表示・絞り込みのキー。トリムして 40 字まで。空文字も許容 (= 未分類)。
    category: typeof s.category === 'string' ? s.category.trim().slice(0, 40) : '',
    name: s.name?.trim() || s.id,
    height: Number.isFinite(Number(s.height)) ? Number(s.height) : null,
    leafCount: Number.isFinite(Number(s.leafCount)) ? Number(s.leafCount) : null,
    // 観察メモ。長文は Firestore の 1MB ドキュメント制限を圧迫するので 1000 字に丸める。
    memo: typeof s.memo === 'string' ? s.memo.slice(0, 1000) : '',
    photoPath: s.photoPath ?? null,
    photoUrl: s.photoUrl ?? null,
  }));
  const averages = calcAverages(cleanStrains);
  const ref = recordDoc(user.uid, dateId);
  const displayName = user.displayName || user.email || user.uid;

  // runTransaction はオフライン時に失敗するため使えない。
  // 永続キャッシュ越しの getDoc + setDoc(merge) で代替する。
  // - getDoc: オフライン時はローカルキャッシュにフォールバック
  // - setDoc: オフライン時は writePendingQueue に積まれ、復帰後に同期される
  // - createdAt / createdBy は新規作成判定の時だけ含める
  const snap = await getDoc(ref);
  const previousPaths = snap.exists()
    ? photoPathsOf((snap.data() as RecordDoc).strains)
    : [];

  const payload: Record<string, unknown> = {
    date: dateId,
    strains: cleanStrains,
    averages,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
    updatedByName: displayName,
    createdBy: user.uid, // 既存値が違うと Rules で弾かれるので、新規/更新どちらでも一致を強制
  };
  if (!snap.exists()) {
    payload.createdAt = serverTimestamp();
    payload.createdByName = displayName;
  }
  await setDoc(ref, payload, { merge: true });

  // 参照されなくなった写真は削除して Storage を肥大化させない。
  // Storage はオフラインキューを持たないので、ここはネットがある時しか動かない。失敗は許容。
  const keptPaths = new Set(photoPathsOf(cleanStrains));
  const orphans = previousPaths.filter((p) => !keptPaths.has(p));
  await Promise.all(orphans.map((p) => deleteStrainPhoto(p).catch(() => {})));

  return { date: dateId, strains: cleanStrains, averages };
}
