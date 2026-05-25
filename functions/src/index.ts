import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();
// 学校アプリは Tokyo リージョン固定。コールドスタートが東京から見て最短になる。
setGlobalOptions({ region: 'asia-northeast1', maxInstances: 10 });

interface ResetData {
  classId: string;
  studentUid: string;
  newPassword: string;
}

/**
 * 教員が生徒のパスワードを再発行するための Callable。
 *
 * Rules ではなく Admin SDK 側で全権限の検証をする (Auth.updateUser は Admin 専用)。
 *
 * 検証順:
 *   1. 認証済みであること
 *   2. 呼び出し元が指定された classId の教員であること
 *      (classes/{classId}/teachers/{callerUid} が存在)
 *   3. 対象 uid が同じ classId の名簿に存在すること (cross-class 操作の防止)
 *   4. 対象 uid が同じ classId の教員「ではない」こと (教員同士のリセットは禁止)
 *   5. newPassword が 6 文字以上 (Firebase Auth の最低要件)
 *
 * 成功時は監査ログ (classes/{classId}/passwordResets) に 1 エントリ書き込む。
 */
export const resetStudentPassword = onCall<ResetData>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'ログインが必要です。');
  }
  const callerUid = req.auth.uid;
  const { classId, studentUid, newPassword } = req.data ?? ({} as ResetData);

  if (!classId || !studentUid || !newPassword) {
    throw new HttpsError(
      'invalid-argument',
      'classId / studentUid / newPassword は必須です。'
    );
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new HttpsError('invalid-argument', 'パスワードは 6 文字以上にしてください。');
  }
  if (callerUid === studentUid) {
    throw new HttpsError(
      'invalid-argument',
      '自分自身のパスワード変更にはこの関数を使わず、サインイン後にプロフィール更新を使ってください。'
    );
  }

  const db = getFirestore();
  const classRef = db.collection('classes').doc(classId);

  const [teacherSnap, studentSnap, targetTeacherSnap] = await Promise.all([
    classRef.collection('teachers').doc(callerUid).get(),
    classRef.collection('students').doc(studentUid).get(),
    classRef.collection('teachers').doc(studentUid).get(),
  ]);

  if (!teacherSnap.exists) {
    throw new HttpsError(
      'permission-denied',
      'このクラスの教員でないため操作できません。'
    );
  }
  if (!studentSnap.exists) {
    throw new HttpsError(
      'not-found',
      '対象の生徒がこのクラスの名簿に見つかりません。'
    );
  }
  if (targetTeacherSnap.exists) {
    throw new HttpsError(
      'permission-denied',
      '他の教員のパスワードはここからリセットできません。'
    );
  }

  // Admin SDK でパスワード差し替え。失敗時は Firebase の internal error がそのまま流れる。
  await getAuth().updateUser(studentUid, { password: newPassword });

  // 監査ログ。生のパスワードは絶対に保存しない (resetBy / 日時のみ)。
  await classRef.collection('passwordResets').add({
    studentUid,
    studentDisplayName: studentSnap.data()?.displayName ?? null,
    resetBy: callerUid,
    resetByName: teacherSnap.data()?.displayName ?? null,
    at: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});
