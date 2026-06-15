import { useCallback, useEffect, useState } from 'react';
import { formatAuditCaption } from '../lib/audit';
import {
  listRecentAuditLogs,
  listRecentPasswordResets,
  type AuditLogEntry,
  type PasswordResetLog,
} from '../lib/teacher';

type Status = 'idle' | 'loading' | 'ready' | 'error';

// UI が扱う共通形 (旧 PasswordResetLog 経由のものと新 AuditLogEntry を一本化)
type UnifiedEntry = {
  id: string;
  type:
    | 'password-reset'
    | 'share-created'
    | 'share-revoked'
    | 'first-teacher-claimed'
    | 'teacher-promoted'
    | 'teacher-demoted';
  byName: string | null;
  by: string;
  targetName?: string | null;
  targetUid?: string;
  shareTokenPrefix?: string;
  /** ソート用のミリ秒。toMillis を持つ Timestamp を期待。 */
  atMs: number;
  /** 表示用キャプション。formatAuditCaption が空文字を返す可能性あり。 */
  atCaption: string;
};

function tsToMs(v: unknown): number {
  const maybe = v as { toMillis?: () => number } | undefined;
  return typeof maybe?.toMillis === 'function' ? maybe.toMillis() : 0;
}

function unifyAuditLog(e: AuditLogEntry): UnifiedEntry {
  return {
    id: `a:${e.id}`,
    type: e.type,
    by: e.by,
    byName: e.byName ?? null,
    targetName: e.targetName,
    targetUid: e.targetUid,
    shareTokenPrefix: e.shareTokenPrefix,
    atMs: tsToMs(e.at),
    atCaption: formatAuditCaption({ name: null, timestamp: e.at ?? null }),
  };
}

function unifyLegacyPasswordReset(e: PasswordResetLog): UnifiedEntry {
  return {
    // 旧 ID と新 ID が衝突しないよう prefix を変える
    id: `p:${e.id}`,
    type: 'password-reset',
    by: e.resetBy,
    byName: e.resetByName ?? null,
    targetUid: e.studentUid,
    targetName: e.studentDisplayName ?? null,
    atMs: tsToMs(e.at),
    atCaption: formatAuditCaption({ name: null, timestamp: e.at ?? null }),
  };
}

function describe(entry: UnifiedEntry): React.ReactNode {
  const actor = entry.byName ?? entry.by;
  const target = entry.targetName ?? entry.targetUid ?? '';
  switch (entry.type) {
    case 'password-reset':
      return (
        <>
          <span className="font-semibold text-leaf-700">{actor}</span>
          {' が '}
          <span className="font-semibold text-slate-700">{target}</span>
          {' のパスワードを再発行'}
        </>
      );
    case 'share-created':
      return (
        <>
          <span className="font-semibold text-leaf-700">{actor}</span>
          {' が '}
          <span className="font-semibold text-slate-700">{target}</span>
          {' の保護者リンクを発行'}
          {entry.shareTokenPrefix && (
            <span className="ml-1 text-xs text-slate-500">
              (token {entry.shareTokenPrefix}…)
            </span>
          )}
        </>
      );
    case 'share-revoked':
      return (
        <>
          <span className="font-semibold text-leaf-700">{actor}</span>
          {' が '}
          {target ? (
            <>
              <span className="font-semibold text-slate-700">{target}</span>
              {' の '}
            </>
          ) : null}
          {'保護者リンクを取り消し'}
          {entry.shareTokenPrefix && (
            <span className="ml-1 text-xs text-slate-500">
              (token {entry.shareTokenPrefix}…)
            </span>
          )}
        </>
      );
    case 'first-teacher-claimed':
      return (
        <>
          <span className="font-semibold text-leaf-700">{actor}</span>
          {' が最初の教員として登録'}
        </>
      );
    case 'teacher-promoted':
      return (
        <>
          <span className="font-semibold text-leaf-700">{actor}</span>
          {' が '}
          <span className="font-semibold text-slate-700">{target}</span>
          {' を教員に昇格'}
        </>
      );
    case 'teacher-demoted':
      return (
        <>
          <span className="font-semibold text-leaf-700">{actor}</span>
          {' が '}
          <span className="font-semibold text-slate-700">{target}</span>
          {' の教員ロールを解除'}
        </>
      );
  }
}

/**
 * 教員管理タブ末尾に置く監査ログパネル。
 * 統合 auditLog コレクション + 旧 passwordResets コレクションの両方を読み、
 * 同じ id 軸でなく atMs 軸で時系列マージ → 新しい順に並べる。
 *
 * Cloud Function 経由でしか書き込めない (Rules で write 禁止) ので、UI に
 * 出ているログは「Admin SDK が確かに記録した監査エビデンス」になる。
 */
export default function AuditLogPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [entries, setEntries] = useState<UnifiedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      // 並行取得。片方が失敗しても他方は表示できるよう個別ハンドリング。
      const [newLogs, oldLogs] = await Promise.all([
        listRecentAuditLogs().catch(() => [] as AuditLogEntry[]),
        listRecentPasswordResets().catch(() => [] as PasswordResetLog[]),
      ]);
      const merged: UnifiedEntry[] = [
        ...newLogs.map(unifyAuditLog),
        ...oldLogs.map(unifyLegacyPasswordReset),
      ];
      // 重複排除: 移行期に新 auditLog と旧 passwordResets の両方に同じ操作が書かれるので、
      // 同じ (type=password-reset, by, target, atMs) を 1 つに集約。
      const seen = new Set<string>();
      const deduped = merged.filter((e) => {
        if (e.type !== 'password-reset') return true;
        const key = `${e.by}|${e.targetUid ?? ''}|${e.atMs}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      deduped.sort((a, b) => b.atMs - a.atMs);
      setEntries(deduped);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section className="card">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-leaf-700">操作ログ</h2>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={status === 'loading'}
          className="text-xs text-leaf-700 underline disabled:opacity-40"
        >
          {status === 'loading' ? '読み込み中…' : '↻ 更新'}
        </button>
      </header>

      <p className="mt-2 text-xs text-slate-500">
        Cloud Function 経由でしか書き込めないため、改ざんできない監査エビデンスとして残ります。
        パスワード再発行 / 保護者共有リンクの発行・取消 / 初代教員登録 /
        教員昇格・解除の履歴を含みます。
      </p>

      {status === 'error' && (
        <p className="mt-3 text-sm text-red-600">取得できませんでした: {error}</p>
      )}

      {status === 'ready' && entries.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">記録された操作はまだありません。</p>
      )}

      {entries.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-slate-100">
          {entries.map((entry) => (
            <li key={entry.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>{describe(entry)}</span>
                {entry.atCaption && (
                  <span className="text-xs text-slate-500">{entry.atCaption}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
