import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, getCurrentClassId } from './firebase';
import type { RosterEntry, TeacherProfile } from '../types';

/**
 * 自分が教員かどうかを判定する。
 * 教員ドキュメントは Firebase Console から手動で追加する運用 (Rules で書き込み禁止)。
 * 戻り値が null = 生徒、object = 教員。
 */
export async function fetchTeacherProfile(uid: string): Promise<TeacherProfile | null> {
  const ref = doc(db, 'classes', getCurrentClassId(), 'teachers', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as TeacherProfile) : null;
}

/**
 * クラス名簿 (生徒一覧)。教員のみ実行可。
 * 生徒は Rules で list 不可なので失敗する。
 */
export async function listClassRoster(): Promise<RosterEntry[]> {
  const ref = collection(db, 'classes', getCurrentClassId(), 'students');
  const snap = await getDocs(ref);
  return sortRoster(snap.docs.map((d) => d.data() as RosterEntry));
}

/**
 * クラス名簿の購読版。
 * 新しい生徒がサインアップして名簿に upsert された瞬間に教員ダッシュボードに現れる。
 */
export function subscribeToClassRoster(
  onChange: (roster: RosterEntry[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const ref = collection(db, 'classes', getCurrentClassId(), 'students');
  return onSnapshot(
    ref,
    (snap) => onChange(sortRoster(snap.docs.map((d) => d.data() as RosterEntry))),
    onError
  );
}

function sortRoster(roster: RosterEntry[]): RosterEntry[] {
  return [...roster].sort((a, b) => {
    const ta = toMillis(a.lastRecordedAt);
    const tb = toMillis(b.lastRecordedAt);
    return tb - ta;
  });
}

function toMillis(v: RosterEntry['lastRecordedAt']): number {
  if (!v) return 0;
  // Timestamp | FieldValue のうち、読み出し時は Timestamp が来る前提。
  const maybe = v as { toMillis?: () => number };
  return typeof maybe.toMillis === 'function' ? maybe.toMillis() : 0;
}

/** 同じクラスの教員一覧。 */
export async function listTeachers(): Promise<TeacherProfile[]> {
  const ref = collection(db, 'classes', getCurrentClassId(), 'teachers');
  const snap = await getDocs(ref);
  return snap.docs
    .map((d) => d.data() as TeacherProfile)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));
}

/** ユーザを教員に昇格させる。Rules で「既存教員のみ実行可」が強制される。 */
export async function promoteToTeacher(profile: TeacherProfile): Promise<void> {
  const ref = doc(db, 'classes', getCurrentClassId(), 'teachers', profile.uid);
  await setDoc(ref, {
    uid: profile.uid,
    displayName: profile.displayName,
    email: profile.email ?? '',
  });
}

/** 教員ロールを解除する。Rules 側で自分自身は外せない。 */
export async function demoteTeacher(uid: string): Promise<void> {
  const ref = doc(db, 'classes', getCurrentClassId(), 'teachers', uid);
  await deleteDoc(ref);
}

/**
 * パスワードリセットの監査ログ 1 エントリ。Cloud Function (resetStudentPassword) が
 * 成功した時に Admin SDK で書き込んでいる。Rules で「同クラスの教員」が read 可。
 */
export type PasswordResetLog = {
  id: string;
  studentUid: string;
  studentDisplayName: string | null;
  resetBy: string;
  resetByName: string | null;
  at?: Timestamp;
};

/**
 * 直近のパスワードリセットを新しい順で返す。教員管理タブの操作ログ表示に使う。
 * 既定 50 件まで取得 (運用上、必要十分な遡及期間で UI を重くしない)。
 */
export async function listRecentPasswordResets(
  max = 50
): Promise<PasswordResetLog[]> {
  const ref = collection(db, 'classes', getCurrentClassId(), 'passwordResets');
  const q = query(ref, orderBy('at', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<PasswordResetLog, 'id'>),
  }));
}
