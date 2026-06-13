import { getFunctions, httpsCallable, type FunctionsError } from 'firebase/functions';
import { app, getCurrentClassId } from './firebase';

// Cloud Function のデプロイ先と一致させる。Function 側で asia-northeast1 に固定済み。
const functions = getFunctions(app, 'asia-northeast1');

type ResetResponse = { ok: boolean };

/**
 * 教員が生徒のパスワードを再発行する。
 * サーバ側 (functions/src/index.ts) で「呼出元が教員 / 対象が同クラスの生徒 / 対象が教員でない」を検証。
 * 失敗時は FunctionsError が throw され、code で原因が分かる:
 *   - functions/permission-denied → 教員でない / 教員を再発行しようとした
 *   - functions/not-found → 対象生徒がクラスにいない
 *   - functions/invalid-argument → パスワード不足など
 *   - functions/unauthenticated → サインインが切れている
 */
export async function resetStudentPassword(args: {
  studentUid: string;
  newPassword: string;
}): Promise<void> {
  const callable = httpsCallable<typeof args & { classId: string }, ResetResponse>(
    functions,
    'resetStudentPassword'
  );
  const result = await callable({
    classId: getCurrentClassId(),
    studentUid: args.studentUid,
    newPassword: args.newPassword,
  });
  if (!result.data.ok) {
    throw new Error('Cloud Function が ok=false を返しました');
  }
}

/** FunctionsError の code を教員に分かる日本語に翻訳する。 */
export function translatePasswordResetError(err: unknown): string {
  const code = (err as FunctionsError | undefined)?.code;
  const msg = (err as FunctionsError | undefined)?.message;
  switch (code) {
    case 'functions/permission-denied':
      return msg ?? 'この操作は許可されていません。';
    case 'functions/not-found':
      return '対象の生徒がこのクラスの名簿に見つかりません。';
    case 'functions/invalid-argument':
      return msg ?? '入力内容に誤りがあります。';
    case 'functions/unauthenticated':
      return 'ログインが切れています。一度サインアウトしてから再度お試しください。';
    default:
      return msg ?? (err instanceof Error ? err.message : String(err));
  }
}

/**
 * 子どもにも読みやすい仮パスワードを 1 つ生成する。
 * - 大文字なし (打ち間違い防止)
 * - 紛らわしい文字を除外: 0 / o (オーとゼロ) / 1 / l / i
 * - 記号なし
 * - 8 文字 → Firebase Auth の最低 6 文字を満たし、安全な強度
 */
const READABLE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
export function generateTempPassword(length = 8): string {
  // crypto.getRandomValues は modern なすべてのブラウザ + iPad Safari で利用可。
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += READABLE_CHARS[buf[i] % READABLE_CHARS.length];
  }
  return out;
}
