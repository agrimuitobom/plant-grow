import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable, type FunctionsError } from 'firebase/functions';
import { app, db, getCurrentClassId } from './firebase';
import type { EventDoc, RecordDoc } from '../types';

const functions = getFunctions(app, 'asia-northeast1');

export type ParentShareDoc = {
  classId: string;
  studentUid: string;
  studentDisplayName: string;
  records: RecordDoc[];
  events: EventDoc[];
  createdBy: string;
  expiresAt: { toDate?: () => Date; toMillis?: () => number };
};

export async function createParentShare(args: {
  studentUid: string;
  hours?: number;
}): Promise<{ token: string; expiresAt: string }> {
  const callable = httpsCallable<
    { classId: string; studentUid: string; hours?: number },
    { token: string; expiresAt: string }
  >(functions, 'createParentShare');
  const res = await callable({
    classId: getCurrentClassId(),
    studentUid: args.studentUid,
    hours: args.hours,
  });
  return res.data;
}

export async function revokeParentShare(token: string): Promise<void> {
  const callable = httpsCallable<{ token: string }, { ok: boolean }>(
    functions,
    'revokeParentShare'
  );
  await callable({ token });
}

/** 公開ビュー側で token を直接 Firestore から読む。Rules で TTL チェック済み。 */
export async function fetchShareByToken(
  token: string
): Promise<ParentShareDoc | null> {
  const snap = await getDoc(doc(db, 'shares', token));
  if (!snap.exists()) return null;
  return snap.data() as ParentShareDoc;
}

export function translateShareError(err: unknown): string {
  const code = (err as FunctionsError | undefined)?.code;
  const msg = (err as FunctionsError | undefined)?.message;
  switch (code) {
    case 'functions/permission-denied':
      return msg ?? 'この操作は許可されていません。';
    case 'functions/unauthenticated':
      return 'ログインが切れています。';
    default:
      return msg ?? (err instanceof Error ? err.message : String(err));
  }
}

export function buildShareUrl(token: string): string {
  // 同一オリジン上の /share/{token} に解決する。Hosting の rewrites で / に流れて
  // クライアントルーティングで ShareView がレンダリングされる。
  if (typeof window === 'undefined') return `/share/${token}`;
  return `${window.location.origin}/share/${token}`;
}
