import { collection, getDocs, limit, query } from 'firebase/firestore';
import { getFunctions, httpsCallable, type FunctionsError } from 'firebase/functions';
import { CLASS_ID, app, db } from './firebase';

const functions = getFunctions(app, 'asia-northeast1');

/**
 * このクラスに教員が 1 人もいないか調べる。
 * Rules で teachers の read は全ログイン者に許可されているので生徒・教員問わず呼べる。
 */
export async function classHasNoTeachers(): Promise<boolean> {
  const ref = collection(db, 'classes', CLASS_ID, 'teachers');
  const snap = await getDocs(query(ref, limit(1)));
  return snap.empty;
}

/**
 * 呼出元を「最初の教員」として登録する。
 * 既に教員が居る場合は functions/failed-precondition で失敗する。
 */
export async function claimFirstTeacher(): Promise<void> {
  const callable = httpsCallable<{ classId: string }, { ok: boolean }>(
    functions,
    'claimFirstTeacher'
  );
  await callable({ classId: CLASS_ID });
}

export function translateClaimError(err: unknown): string {
  const code = (err as FunctionsError | undefined)?.code;
  const msg = (err as FunctionsError | undefined)?.message;
  switch (code) {
    case 'functions/failed-precondition':
      return msg ?? '既に他の人が教員として登録されました。画面をリロードしてください。';
    case 'functions/unauthenticated':
      return 'ログインが切れています。サインインし直してから再度お試しください。';
    default:
      return msg ?? (err instanceof Error ? err.message : String(err));
  }
}
