import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable, type FunctionsError } from 'firebase/functions';
import { app, db, getCurrentClassId } from './firebase';

const functions = getFunctions(app, 'asia-northeast1');

export type ClassMeta = {
  archived?: boolean;
  archivedAt?: { toDate?: () => Date };
  archivedBy?: string;
};

/**
 * 現在のクラスのメタドキュメント (アーカイブ状態) を取得。
 * メタドキュメントが存在しない = 運用中クラス (archived: false 相当)。
 */
export async function fetchClassMeta(): Promise<ClassMeta | null> {
  const snap = await getDoc(doc(db, 'classes', getCurrentClassId()));
  return snap.exists() ? (snap.data() as ClassMeta) : null;
}

/**
 * 年度アーカイブの ON/OFF。教員のみ。Cloud Function 経由なので auditLog に必ず残る。
 * 成功後は呼び出し側でリロードして全 subscription / Rules 評価を新状態でやり直すこと。
 */
export async function setClassArchived(archived: boolean): Promise<void> {
  const callable = httpsCallable<
    { classId: string; archived: boolean },
    { ok: boolean }
  >(functions, 'setClassArchived');
  await callable({ classId: getCurrentClassId(), archived });
}

export function translateArchiveError(err: unknown): string {
  const code = (err as FunctionsError | undefined)?.code;
  const msg = (err as FunctionsError | undefined)?.message;
  switch (code) {
    case 'functions/permission-denied':
      return msg ?? 'このクラスの教員のみアーカイブ状態を変更できます。';
    case 'functions/unauthenticated':
      return 'ログインが切れています。';
    default:
      return msg ?? (err instanceof Error ? err.message : String(err));
  }
}
