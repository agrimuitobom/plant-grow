import { v1 as firestoreV1 } from '@google-cloud/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger, setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();
// 学校アプリは Tokyo リージョン固定。コールドスタートが東京から見て最短になる。
setGlobalOptions({ region: 'asia-northeast1', maxInstances: 10 });

/**
 * onCall 関数で許可する CORS オリジン。
 *
 * Firebase Functions v2 の onCall は本来 Firebase 系ドメインから自動許可される
 * はずだが、firebase-functions ^6 + Cloud Run v2 の組合せで preflight に
 * Access-Control-Allow-Origin が付かないケースが報告されており、本番で実害が
 * 出ているため明示する。auth と App Check は関数本体側で検証しているので、
 * cors: true (= 全許可) でもセキュリティは劣化しない。
 */
const CALLABLE_OPTS = { cors: true } as const;

/**
 * 統合監査ログを書き込むヘルパ。
 * 全 Cloud Function はここを通って同じスキーマで auditLog コレクションに追記する。
 * クライアントには Rules で書き込み禁止しているので、ここを通ったものだけが
 * 「改ざんできない監査エビデンス」になる。
 */
type AuditEntry = {
  type:
    | 'password-reset'
    | 'share-created'
    | 'share-revoked'
    | 'first-teacher-claimed'
    | 'teacher-promoted'
    | 'teacher-demoted';
  by: string;
  byName: string | null;
  targetUid?: string;
  targetName?: string | null;
  shareTokenPrefix?: string;
};
async function writeAuditLog(
  db: FirebaseFirestore.Firestore,
  classId: string,
  entry: AuditEntry
): Promise<void> {
  try {
    await db
      .collection('classes')
      .doc(classId)
      .collection('auditLog')
      .add({
        ...entry,
        at: FieldValue.serverTimestamp(),
      });
  } catch (e) {
    // 監査ログ書き込み失敗は致命的にしない (主処理は完了している)。Cloud Logging には残す。
    logger.warn(`auditLog write failed: ${(e as Error).message}`);
  }
}

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
export const resetStudentPassword = onCall<ResetData>(CALLABLE_OPTS, async (req) => {
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

  // 後方互換: 既存の passwordResets コレクションにも残す (UI 側で旧データもまだ参照する間)。
  // 生のパスワードは絶対に保存しない (resetBy / 日時のみ)。
  await classRef.collection('passwordResets').add({
    studentUid,
    studentDisplayName: studentSnap.data()?.displayName ?? null,
    resetBy: callerUid,
    resetByName: teacherSnap.data()?.displayName ?? null,
    at: FieldValue.serverTimestamp(),
  });

  // 統合監査ログ (今後はこちらが主)
  await writeAuditLog(db, classId, {
    type: 'password-reset',
    by: callerUid,
    byName: teacherSnap.data()?.displayName ?? null,
    targetUid: studentUid,
    targetName: studentSnap.data()?.displayName ?? null,
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
export const claimFirstTeacher = onCall<ClaimData>(CALLABLE_OPTS, async (req) => {
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
  await writeAuditLog(db, classId, {
    type: 'first-teacher-claimed',
    by: callerUid,
    byName: displayName,
  });
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

interface CreateShareData {
  classId: string;
  studentUid: string;
  /** 有効期間 (時間)。未指定なら既定 72h。最大 168h (1 週間)。 */
  hours?: number;
}

const SHARE_DEFAULT_HOURS = 72;
const SHARE_MAX_HOURS = 168;
// 衝突しにくく、URL に貼っても問題ない文字種で 32 桁。
const SHARE_TOKEN_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateShareToken(length = 32): string {
  // Node の crypto.getRandomValues は Node 19+ で利用可。Functions の Node 20 ランタイムで OK。
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SHARE_TOKEN_ALPHABET[buf[i]! % SHARE_TOKEN_ALPHABET.length];
  }
  return out;
}

/**
 * 保護者向け共有リンクを発行する。
 *
 * 仕組み:
 *  - 呼出元は対象生徒本人 or 同クラスの教員。
 *  - 発行時点の records / events / 生徒名をスナップショットして shares/{token} に書き出す。
 *  - 72h (上書き可、最大 1 週間) で自動失効。Rules 側で expiresAt > request.time のみ read 許可。
 *  - 写真は photoUrl (Firebase Storage の token 付き URL) がそのまま使えるので追加処理不要。
 *  - コメントは含めない (教員フィードバックは私的なため)。
 *
 * 同じ studentUid に対する既存の有効なリンクは破棄され (1 生徒 1 リンクの制約)、
 * 新しい token に置き換えられる。これにより家庭で配ったリンクを後から差し替えやすい。
 */
export const createParentShare = onCall<CreateShareData>(CALLABLE_OPTS, async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'ログインが必要です。');
  }
  const callerUid = req.auth.uid;
  const { classId, studentUid, hours } = req.data ?? ({} as CreateShareData);

  if (!classId || !studentUid) {
    throw new HttpsError('invalid-argument', 'classId / studentUid は必須です。');
  }

  const validHours = Math.min(
    Math.max(typeof hours === 'number' && Number.isFinite(hours) ? hours : SHARE_DEFAULT_HOURS, 1),
    SHARE_MAX_HOURS
  );

  const db = getFirestore();
  const classRef = db.collection('classes').doc(classId);

  // 権限チェック: 呼出元は対象生徒本人、または同クラスの教員のみ。
  const teacherSnap = await classRef.collection('teachers').doc(callerUid).get();
  const isTeacher = teacherSnap.exists;
  if (callerUid !== studentUid && !isTeacher) {
    throw new HttpsError(
      'permission-denied',
      '本人または同クラスの教員のみ共有リンクを発行できます。'
    );
  }

  // 生徒名簿から displayName を取得
  const studentSnap = await classRef.collection('students').doc(studentUid).get();
  const studentDisplayName = studentSnap.exists
    ? (studentSnap.data()?.displayName as string | undefined) ?? 'Student'
    : 'Student';

  // 既存の有効な共有を破棄 (1 生徒 1 リンク制約)
  const existing = await db
    .collection('shares')
    .where('studentUid', '==', studentUid)
    .where('classId', '==', classId)
    .get();
  const batch = db.batch();
  existing.docs.forEach((d) => batch.delete(d.ref));

  // 発行時点のスナップショット
  const [recordsSnap, eventsSnap] = await Promise.all([
    classRef.collection('students').doc(studentUid).collection('records').get(),
    classRef.collection('students').doc(studentUid).collection('events').get(),
  ]);
  const records = recordsSnap.docs.map((d) => d.data());
  const events = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const token = generateShareToken();
  const expiresAt = new Date(Date.now() + validHours * 60 * 60 * 1000);

  batch.set(db.collection('shares').doc(token), {
    classId,
    studentUid,
    studentDisplayName,
    records,
    events,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: callerUid,
    expiresAt,
  });

  await batch.commit();

  logger.info(
    `Share issued: token=${token.slice(0, 6)}... studentUid=${studentUid} hours=${validHours}`
  );
  await writeAuditLog(db, classId, {
    type: 'share-created',
    by: callerUid,
    byName: teacherSnap.exists
      ? (teacherSnap.data()?.displayName as string | undefined) ?? null
      : null,
    targetUid: studentUid,
    targetName: studentDisplayName,
    shareTokenPrefix: token.slice(0, 6),
  });
  return { token, expiresAt: expiresAt.toISOString() };
});

interface RevokeShareData {
  token: string;
}

export const revokeParentShare = onCall<RevokeShareData>(CALLABLE_OPTS, async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'ログインが必要です。');
  }
  const callerUid = req.auth.uid;
  const { token } = req.data ?? ({} as RevokeShareData);
  if (!token) {
    throw new HttpsError('invalid-argument', 'token は必須です。');
  }

  const db = getFirestore();
  const ref = db.collection('shares').doc(token);
  const snap = await ref.get();
  if (!snap.exists) {
    // 既に失効済みは成功扱い (idempotent)
    return { ok: true };
  }
  const data = snap.data() as {
    classId?: string;
    studentUid?: string;
    createdBy?: string;
  };

  // 発行者本人、対象生徒本人、または同クラスの教員のみ削除可
  const isCreator = data.createdBy === callerUid;
  const isStudent = data.studentUid === callerUid;
  let isTeacherForClass = false;
  if (!isCreator && !isStudent && data.classId) {
    const teacherSnap = await db
      .collection('classes')
      .doc(data.classId)
      .collection('teachers')
      .doc(callerUid)
      .get();
    isTeacherForClass = teacherSnap.exists;
  }
  if (!isCreator && !isStudent && !isTeacherForClass) {
    throw new HttpsError(
      'permission-denied',
      'このリンクを取り消す権限がありません。'
    );
  }

  await ref.delete();
  logger.info(`Share revoked: token=${token.slice(0, 6)}... by=${callerUid}`);
  if (data.classId) {
    // 削除されたシェアの作成元情報を取りに行く (caller の displayName は teachers コレクションから)
    let byName: string | null = null;
    try {
      const teacherSnap = await db
        .collection('classes')
        .doc(data.classId)
        .collection('teachers')
        .doc(callerUid)
        .get();
      byName = teacherSnap.exists
        ? (teacherSnap.data()?.displayName as string | undefined) ?? null
        : null;
    } catch {
      /* best effort */
    }
    let targetName: string | null = null;
    if (data.studentUid) {
      try {
        const studentSnap = await db
          .collection('classes')
          .doc(data.classId)
          .collection('students')
          .doc(data.studentUid)
          .get();
        targetName = studentSnap.exists
          ? (studentSnap.data()?.displayName as string | undefined) ?? null
          : null;
      } catch {
        /* best effort */
      }
    }
    await writeAuditLog(db, data.classId, {
      type: 'share-revoked',
      by: callerUid,
      byName,
      targetUid: data.studentUid,
      targetName,
      shareTokenPrefix: token.slice(0, 6),
    });
  }
  return { ok: true };
});

/**
 * Storage に残った参照ゼロの写真を週次でクリーンアップする。
 *
 * 仕組み:
 *  1. 全クラスの records と history を走査して、保存中の photoPath 集合 (referenced) を作る
 *  2. Storage の `classes/{classId}/students/{uid}/photos/...` を全列挙
 *  3. referenced に含まれず、かつ 24h 以上前にアップロードされたファイルを削除
 *
 * 24h バッファ: 写真を upload した直後 record save がまだ走っていないと photoPath が
 * Firestore 上に出ない瞬間がある。その「保存中」状態を誤削除しないための余裕。
 *
 * 削除前にバックアップ取得はしない (削除されるのは「もう参照されていない」ファイルなので)。
 * 万一誤削除が起きたとしても日次の Firestore バックアップから復元したレコード自体は無傷で、
 * 参照する photoUrl が 404 を返すだけになる (UI 側は graceful に "写真なし" 扱い)。
 *
 * 環境変数 ORPHAN_CLEANUP_DRY_RUN=true で「ログだけ吐いて削除しない」モードに切替可。
 * 初回デプロイ後は dry-run で 1 週間様子を見て、想定通りなら false (または未設定) で本番運用へ。
 */
export const cleanupOrphanPhotos = onSchedule(
  {
    schedule: 'every sunday 03:00',
    timeZone: 'Asia/Tokyo',
    region: 'asia-northeast1',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const dryRun = process.env.ORPHAN_CLEANUP_DRY_RUN === 'true';
    const db = getFirestore();
    const bucket = getStorage().bucket();

    // (1) 参照中の photoPath 集合を構築
    const referenced = new Set<string>();
    const classesSnap = await db.collection('classes').get();
    for (const classDoc of classesSnap.docs) {
      const studentsSnap = await classDoc.ref.collection('students').get();
      for (const studentDoc of studentsSnap.docs) {
        const recordsSnap = await studentDoc.ref.collection('records').get();
        for (const recordDoc of recordsSnap.docs) {
          collectPhotoPaths(recordDoc.data(), referenced);
          // 編集履歴も走査 (history のスナップショットが参照する写真も保持対象)
          const historySnap = await recordDoc.ref.collection('history').get();
          for (const h of historySnap.docs) {
            collectPhotoPaths(h.data(), referenced);
          }
        }
      }
    }
    logger.info(`Photo cleanup: ${referenced.size} 件の photoPath が参照中`);

    // (2) Storage を列挙して候補抽出
    const [files] = await bucket.getFiles({ prefix: 'classes/' });
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const orphans: typeof files = [];
    for (const file of files) {
      // photos 以下のファイルのみ対象 (将来 Storage 内に別ディレクトリができても影響しないよう絞る)
      if (!file.name.includes('/photos/')) continue;
      if (referenced.has(file.name)) continue;

      // メタデータの timeCreated を読んで 24h バッファを適用
      const [metadata] = await file.getMetadata();
      const createdMs = metadata.timeCreated
        ? new Date(metadata.timeCreated).getTime()
        : 0;
      if (createdMs > cutoff) continue;

      orphans.push(file);
    }
    logger.info(
      `Photo cleanup: ${orphans.length} 件のオーファン候補を検出 (dryRun=${dryRun})`
    );

    // (3) 削除実行 (or dry-run でログのみ)
    if (dryRun) {
      for (const f of orphans.slice(0, 50)) {
        logger.info(`Would delete: ${f.name}`);
      }
      if (orphans.length > 50) {
        logger.info(`...and ${orphans.length - 50} more`);
      }
      return;
    }
    let deleted = 0;
    for (const f of orphans) {
      try {
        await f.delete();
        deleted++;
      } catch (e) {
        logger.warn(`Failed to delete ${f.name}: ${(e as Error).message}`);
      }
    }
    logger.info(`Photo cleanup: ${deleted}/${orphans.length} 件を削除しました`);
  }
);

/**
 * records / history ドキュメントから参照中の写真パスを集める。
 * 新形式 (photos: { path }[]) と旧形式 (photoPath: string) の両方に対応。
 */
function collectPhotoPaths(
  data: FirebaseFirestore.DocumentData | undefined,
  out: Set<string>
): void {
  const strains = data?.strains as
    | { photoPath?: string; photos?: { path?: string }[] }[]
    | undefined;
  if (!Array.isArray(strains)) return;
  for (const s of strains) {
    if (Array.isArray(s?.photos)) {
      for (const p of s.photos) {
        if (p?.path && typeof p.path === 'string') out.add(p.path);
      }
    } else if (s?.photoPath && typeof s.photoPath === 'string') {
      out.add(s.photoPath);
    }
  }
}

interface UsageData {
  classId: string;
}

/**
 * 指定クラスの写真容量を集計して返す。教員のみ呼び出し可能。
 *
 * 用途:
 *   - 教員ダッシュボードに「クラス全体: 350MB ({N}枚)」を表示
 *   - Blaze プランの月次請求が膨らむ前に「もうすぐ無料枠超えそう」と気付ける
 *
 * 集計範囲: `classes/{classId}/students/* /photos/...` の全ファイル。
 * Storage 容量はリストAPI でメタデータと一緒に返るので、個別 getMetadata は不要。
 * クラス規模 (数千枚オーダー) なら 1〜3 秒で完了する。
 */
export const getStorageUsage = onCall<UsageData>(CALLABLE_OPTS, async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'ログインが必要です。');
  }
  const callerUid = req.auth.uid;
  const { classId } = req.data ?? ({} as UsageData);
  if (!classId) {
    throw new HttpsError('invalid-argument', 'classId は必須です。');
  }

  // 教員のみ
  const db = getFirestore();
  const teacherSnap = await db
    .collection('classes')
    .doc(classId)
    .collection('teachers')
    .doc(callerUid)
    .get();
  if (!teacherSnap.exists) {
    throw new HttpsError(
      'permission-denied',
      'このクラスの教員のみ集計を取得できます。'
    );
  }

  const bucket = getStorage().bucket();
  const [files] = await bucket.getFiles({ prefix: `classes/${classId}/` });

  let totalBytes = 0;
  let photoCount = 0;
  for (const file of files) {
    if (!file.name.includes('/photos/')) continue;
    // bucket.getFiles の戻り値 (File オブジェクト) は metadata.size を保持しているはず。
    // 念のためフォールバックで getMetadata する。
    const sizeFromMeta = file.metadata?.size;
    let size = 0;
    if (typeof sizeFromMeta === 'string') size = Number(sizeFromMeta);
    else if (typeof sizeFromMeta === 'number') size = sizeFromMeta;
    else {
      try {
        const [m] = await file.getMetadata();
        size = Number(m.size) || 0;
      } catch {
        size = 0;
      }
    }
    totalBytes += size;
    photoCount++;
  }

  logger.info(
    `Storage usage queried: classId=${classId} totalBytes=${totalBytes} photoCount=${photoCount} by=${callerUid}`
  );
  return { totalBytes, photoCount, computedAt: Date.now() };
});

interface ClassAveragesData {
  classId: string;
}

/**
 * クラス全員のレコードを Admin SDK で読んで、日付別の平均 (草丈・葉枚数) を返す。
 *
 * プライバシー:
 *   - 戻り値は集計値のみ。個別生徒の値や名前は含まない。
 *   - 「あの子は平均より上 / 下」の特定にも繋がらないよう、N=1 (ある日のクラス全体で
 *     計測値が 1 件しかない) の場合も平均として返す。これは「クラス全体での個人の位置」
 *     を学習目的で示す機能であり、計測者匿名化は集計値だけ返す時点で達成されているため。
 *
 * 権限:
 *   - 同クラスのメンバー (生徒の名簿 or 教員) のみ呼べる。
 *   - 別クラス所属者には permission-denied を返す。
 *
 * 集計範囲: 全カテゴリ・全株 (Phase 2 で品目別に拡張する余地あり)。
 *
 * パフォーマンス: 30 人 × 60 日 = 1800 doc read 程度。1〜3 秒で完了。
 * クライアント側で 5 分キャッシュするので毎回呼ばれることはない。
 */
export const getClassAverages = onCall<ClassAveragesData>(CALLABLE_OPTS, async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'ログインが必要です。');
  }
  const callerUid = req.auth.uid;
  const { classId } = req.data ?? ({} as ClassAveragesData);
  if (!classId) {
    throw new HttpsError('invalid-argument', 'classId は必須です。');
  }

  const db = getFirestore();
  const classRef = db.collection('classes').doc(classId);

  // 呼出元がクラスのメンバー (生徒 or 教員) か検証
  const [studentSnap, teacherSnap] = await Promise.all([
    classRef.collection('students').doc(callerUid).get(),
    classRef.collection('teachers').doc(callerUid).get(),
  ]);
  if (!studentSnap.exists && !teacherSnap.exists) {
    throw new HttpsError(
      'permission-denied',
      'このクラスのメンバーのみ平均値を取得できます。'
    );
  }

  // 全生徒の全 records を走査して、日付別に値を蓄積
  const studentsSnap = await classRef.collection('students').get();
  const accumulator = new Map<string, { heights: number[]; leafCounts: number[] }>();

  for (const studentDoc of studentsSnap.docs) {
    const recordsSnap = await studentDoc.ref.collection('records').get();
    for (const recordDoc of recordsSnap.docs) {
      const data = recordDoc.data();
      const date = typeof data.date === 'string' ? data.date : recordDoc.id;
      const strains =
        (data.strains as { height?: number | null; leafCount?: number | null }[]) ?? [];

      let bucket = accumulator.get(date);
      if (!bucket) {
        bucket = { heights: [], leafCounts: [] };
        accumulator.set(date, bucket);
      }

      for (const s of strains) {
        if (typeof s.height === 'number' && Number.isFinite(s.height)) {
          bucket.heights.push(s.height);
        }
        if (typeof s.leafCount === 'number' && Number.isFinite(s.leafCount)) {
          bucket.leafCounts.push(s.leafCount);
        }
      }
    }
  }

  // 日付昇順、平均は小数 2 桁
  const averages = [...accumulator.entries()]
    .map(([date, { heights, leafCounts }]) => ({
      date,
      height:
        heights.length > 0
          ? Number((heights.reduce((a, b) => a + b, 0) / heights.length).toFixed(2))
          : null,
      leafCount:
        leafCounts.length > 0
          ? Number(
              (leafCounts.reduce((a, b) => a + b, 0) / leafCounts.length).toFixed(2)
            )
          : null,
      sampleSize: Math.max(heights.length, leafCounts.length),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  logger.info(
    `Class averages computed: classId=${classId} days=${averages.length} by=${callerUid}`
  );
  return { averages, computedAt: Date.now() };
});

interface TeacherRoleData {
  classId: string;
  targetUid: string;
}

/**
 * 別ユーザを教員に昇格させる。
 *
 * 検証 (Rules で client write を全面禁止しているのでここで全部やる):
 *   - 呼出元はサインイン済み
 *   - 呼出元はそのクラスの教員
 *   - 対象は同クラスの名簿に存在
 *   - 自分自身を昇格させようとしていない
 *
 * 既に教員の場合は冪等に成功扱い (alreadyTeacher: true)。
 * 監査ログ (auditLog/{auto}) に type=teacher-promoted エントリを追記する。
 */
export const promoteTeacher = onCall<TeacherRoleData>(CALLABLE_OPTS, async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'ログインが必要です。');
  }
  const callerUid = req.auth.uid;
  const { classId, targetUid } = req.data ?? ({} as TeacherRoleData);

  if (!classId || !targetUid) {
    throw new HttpsError('invalid-argument', 'classId / targetUid は必須です。');
  }
  if (callerUid === targetUid) {
    throw new HttpsError(
      'invalid-argument',
      '自分自身を昇格させることはできません。'
    );
  }

  const db = getFirestore();
  const classRef = db.collection('classes').doc(classId);

  const [callerSnap, studentSnap, existingTeacherSnap] = await Promise.all([
    classRef.collection('teachers').doc(callerUid).get(),
    classRef.collection('students').doc(targetUid).get(),
    classRef.collection('teachers').doc(targetUid).get(),
  ]);

  if (!callerSnap.exists) {
    throw new HttpsError(
      'permission-denied',
      'このクラスの教員のみ他者を昇格できます。'
    );
  }
  if (!studentSnap.exists) {
    throw new HttpsError(
      'not-found',
      '対象者がクラスの名簿に見つかりません。'
    );
  }
  if (existingTeacherSnap.exists) {
    // 既に教員 → 冪等
    return { ok: true, alreadyTeacher: true };
  }

  const displayName = (studentSnap.data()?.displayName as string | undefined) ?? 'Teacher';
  const email = (studentSnap.data()?.email as string | undefined) ?? '';

  await classRef.collection('teachers').doc(targetUid).set({
    uid: targetUid,
    displayName,
    email,
  });

  await writeAuditLog(db, classId, {
    type: 'teacher-promoted',
    by: callerUid,
    byName: (callerSnap.data()?.displayName as string | undefined) ?? null,
    targetUid,
    targetName: displayName,
  });

  logger.info(
    `Teacher promoted: classId=${classId} target=${targetUid} by=${callerUid}`
  );
  return { ok: true };
});

/**
 * 教員ロールを解除する。
 *
 * 検証:
 *   - 呼出元はサインイン済み
 *   - 呼出元はそのクラスの教員
 *   - 自分自身ではない (誤操作で教員 0 人になるのを防ぐ)
 *
 * 既に教員でない場合は冪等に成功扱い。
 * 監査ログ (auditLog/{auto}) に type=teacher-demoted エントリを追記する。
 */
export const demoteTeacher = onCall<TeacherRoleData>(CALLABLE_OPTS, async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'ログインが必要です。');
  }
  const callerUid = req.auth.uid;
  const { classId, targetUid } = req.data ?? ({} as TeacherRoleData);

  if (!classId || !targetUid) {
    throw new HttpsError('invalid-argument', 'classId / targetUid は必須です。');
  }
  if (callerUid === targetUid) {
    throw new HttpsError(
      'invalid-argument',
      '自分自身を教員から外すことはできません。'
    );
  }

  const db = getFirestore();
  const classRef = db.collection('classes').doc(classId);

  const [callerSnap, targetSnap] = await Promise.all([
    classRef.collection('teachers').doc(callerUid).get(),
    classRef.collection('teachers').doc(targetUid).get(),
  ]);

  if (!callerSnap.exists) {
    throw new HttpsError(
      'permission-denied',
      'このクラスの教員のみ実行できます。'
    );
  }
  if (!targetSnap.exists) {
    // 既に教員ではない → 冪等
    return { ok: true, alreadyNotTeacher: true };
  }

  const targetName = (targetSnap.data()?.displayName as string | undefined) ?? null;

  await classRef.collection('teachers').doc(targetUid).delete();

  await writeAuditLog(db, classId, {
    type: 'teacher-demoted',
    by: callerUid,
    byName: (callerSnap.data()?.displayName as string | undefined) ?? null,
    targetUid,
    targetName,
  });

  logger.info(
    `Teacher demoted: classId=${classId} target=${targetUid} by=${callerUid}`
  );
  return { ok: true };
});
