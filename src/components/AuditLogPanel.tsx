import { useCallback, useEffect, useState } from 'react';
import { formatAuditCaption } from '../lib/audit';
import {
  listRecentPasswordResets,
  type PasswordResetLog,
} from '../lib/teacher';

type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * 教員管理タブ末尾に置く監査ログパネル。
 * いまは passwordResets のみ対象。将来、教員追加 / 削除や他の特権操作も足す予定。
 *
 * Cloud Function 経由でしか書き込めない (Rules で write 禁止) ので、UI に
 * 出ているログは「Admin SDK が確かに記録した監査エビデンス」になる。
 */
export default function AuditLogPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [logs, setLogs] = useState<PasswordResetLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const list = await listRecentPasswordResets();
      setLogs(list);
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
        パスワード再発行の履歴 (直近 {logs.length > 0 ? logs.length : 50} 件まで)。
        Cloud Function 経由でしか書き込めないため、改ざんできない監査エビデンスとして残ります。
      </p>

      {status === 'error' && (
        <p className="mt-3 text-sm text-red-600">取得できませんでした: {error}</p>
      )}

      {status === 'ready' && logs.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">
          記録されたパスワードリセットはまだありません。
        </p>
      )}

      {logs.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-slate-100">
          {logs.map((log) => {
            const when = formatAuditCaption({ name: null, timestamp: log.at });
            const actor = log.resetByName ?? log.resetBy;
            const target = log.studentDisplayName ?? log.studentUid;
            return (
              <li key={log.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="font-semibold text-leaf-700">{actor}</span>
                    {' が '}
                    <span className="font-semibold text-slate-700">{target}</span>
                    {' のパスワードを再発行'}
                  </span>
                  {when && <span className="text-xs text-slate-400">{when}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
