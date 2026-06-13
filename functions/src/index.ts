import { v1 as firestoreV1 } from '@google-cloud/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger, setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

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

// Firestore Admin API クライアント。export/import 操作はこれ経由でしか呼べない。
const firestoreAdmin = new firestoreV1.FirestoreAdminClient();

interface ClaimData {
  classId: string;
}

/**
 * クラスに教員が 1 人もいない時に限り、呼出元を「最初の教員」として登録する。
 *
 * Rules では teachers/{teacherId} の create を「既存教員のみ」に絞っているため、
 * 初代の教員を Console を触らずに登録する手段がこれまで無かった。これがそのギャップを埋める。
 *
 * 競合は Firestore Transaction で防ぐ:
 *   - 「教員 0 人」をトランザクション内で確認 → 自分を書き込む、を不可分に実行
 *   - 同時に 2 人が押した場合、片方がトランザクション再試行で failed-precondition に倒れる
 *
 * 既に教員が登録されているクラスに対して呼ばれた場合は failed-precondition を返す。
 * 想定誤操作 (例: 別端末で先に他の人が登録) を明示するメッセージで伝える。
 */
export const claimFirstTeacher = onCall<ClaimData>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'ログインが必要です。');
  }
  const callerUid = req.auth.uid;
  const { classId } = req.data ?? ({} as ClaimData);

  if (!classId) {
    throw new HttpsError('invalid-argument', 'classId は必須です。');
  }

  const db = getFirestore();
  const classRef = db.collection('classes').doc(classId);
  const teachersRef = classRef.collection('teachers');

  // Auth から displayName を引いておく (Transaction の外で OK、書き込み内容に使うだけ)
  const userRecord = await getAuth().getUser(callerUid);
  const displayName = userRecord.displayName || userRecord.email || 'Teacher';
  const email = userRecord.email ?? '';

  await db.runTransaction(async (tx) => {
    // teachers コレクションが空かを Transaction 内で確認 → 自分を書き込む、を不可分に。
    const existing = await tx.get(teachersRef.limit(1));
    if (!existing.empty) {
      throw new HttpsError(
        'failed-precondition',
        'このクラスには既に教員が登録されています。既存の教員に依頼してください。'
      );
    }
    tx.set(classRef.collection('teachers').doc(callerUid), {
      uid: callerUid,
      displayName,
      email,
    });
  });

  logger.info(`First teacher claimed: classId=${classId}, uid=${callerUid}`);
  return { ok: true };
});

/**
 * 毎日 JST 03:00 に Firestore 全コレクションを GCS にエクスポートする日次バックアップ。
 *
 * 出力先: gs://${BACKUP_BUCKET}/firestore/YYYY-MM-DD/
 *   - BACKUP_BUCKET 環境変数 (functions config) で上書き可能。
 *   - 既定値: ${PROJECT_ID}-backups バケット (事前作成必要)。
 *
 * exportDocuments は非同期オペレーションを開始するだけ。実エクスポートは Google 側で
 * バックグラウンド進行 (大規模 DB で 30 分以上かかることもある) なので、ここでは
 * オペレーション ID をログに残して関数自体は速やかに戻る。
 *
 * 古いバックアップは GCS Lifecycle ルール (lifecycle.json 参照) で自動削除する。
 * 復元手順は README の 「バックアップ / 復元」 セクションを参照。
 */
export const dailyFirestoreBackup = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'Asia/Tokyo',
    region: 'asia-northeast1',
    timeoutSeconds: 540,
  },
  async () => {
    const projectId =
      process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      throw new Error(
        'GCLOUD_PROJECT / GOOGLE_CLOUD_PROJECT が見つかりません (Cloud Functions ランタイムでは自動設定されるはず)'
      );
    }
    const bucket = process.env.BACKUP_BUCKET ?? `${projectId}-backups`;
    const date = new Date().toISOString().slice(0, 10);
    const outputUriPrefix = `gs://${bucket}/firestore/${date}`;
    const databaseName = firestoreAdmin.databasePath(projectId, '(default)');

    logger.info(`Firestore export を開始します → ${outputUriPrefix}`);
    const [operation] = await firestoreAdmin.exportDocuments({
      name: databaseName,
      outputUriPrefix,
      // 空配列 = 全コレクション。特定だけ取りたい時は ['records', 'students'] のように指定。
      collectionIds: [],
    });
    logger.info(`オペレーション開始: ${operation.name ?? '(no name)'}`);
  }
);
