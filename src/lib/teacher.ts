import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { CLASS_ID, db } from './firebase';
import type { RosterEntry, TeacherProfile } from '../types';

/**
 * 自分が教員かどうかを判定する。
 * 教員ドキュメントは Firebase Console から手動で追加する運用 (Rules で書き込み禁止)。
 * 戻り値が null = 生徒、object = 教員。
 */
export async function fetchTeacherProfile(uid: string): Promise<TeacherProfile | null> {
  const ref = doc(db, 'classes', CLASS_ID, 'teachers', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as TeacherProfile) : null;
}

/**
 * クラス名簿 (生徒一覧)。教員のみ実行可。
 * 生徒は Rules で list 不可なので失敗する。
 */
export async function listClassRoster(): Promise<RosterEntry[]> {
  const ref = collection(db, 'classes', CLASS_ID, 'students');
  const snap = await getDocs(ref);
  return snap.docs
    .map((d) => d.data() as RosterEntry)
    // 表示用にソート: 直近に記録した生徒を先頭。lastRecordedAt 未設定は末尾。
    .sort((a, b) => {
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
  const ref = collection(db, 'classes', CLASS_ID, 'teachers');
  const snap = await getDocs(ref);
  return snap.docs
    .map((d) => d.data() as TeacherProfile)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));
}

/** ユーザを教員に昇格させる。Rules で「既存教員のみ実行可」が強制される。 */
export async function promoteToTeacher(profile: TeacherProfile): Promise<void> {
  const ref = doc(db, 'classes', CLASS_ID, 'teachers', profile.uid);
  await setDoc(ref, {
    uid: profile.uid,
    displayName: profile.displayName,
    email: profile.email ?? '',
  });
}

/** 教員ロールを解除する。Rules 側で自分自身は外せない。 */
export async function demoteTeacher(uid: string): Promise<void> {
  const ref = doc(db, 'classes', CLASS_ID, 'teachers', uid);
  await deleteDoc(ref);
}
