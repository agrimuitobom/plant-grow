import { useEffect, useState } from 'react';
import { fetchRecordHistory, type HistorySnapshot } from '../lib/records';
import type { Strain } from '../types';

type Props = {
  uid: string;
  dateId: string;
  /** 履歴一覧の表示開閉トリガを外から強制したい時用 (キャンセル → 同じ日付で再表示など)。 */
  refreshKey?: number;
  /** 「この内容を復元」を押したときに、フォーム側で株データを差し替える。 */
  onRestore: (strains: Strain[]) => void;
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

function formatTimestamp(snap: HistorySnapshot): string {
  const v = snap.snapshotAt;
  if (!v?.toDate) return snap.id;
  const d = v.toDate();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da} ${h}:${m}`;
}

export default function HistoryPanel({ uid, dateId, refreshKey, onRestore }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HistorySnapshot[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus('loading');
    setError(null);
    fetchRecordHistory(uid, dateId)
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open, uid, dateId, refreshKey]);

  return (
    <section className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">編集履歴</h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-leaf-700 underline"
          aria-expanded={open}
        >
          {open ? '閉じる' : '開く'}
        </button>
      </header>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {status === 'loading' && <p className="text-sm text-slate-500">読み込み中…</p>}
          {status === 'error' && (
            <p className="text-sm text-red-600">取得できませんでした: {error}</p>
          )}
          {status === 'ready' && items.length === 0 && (
            <p className="text-sm text-slate-500">
              この日の編集履歴はまだありません。上書き保存すると直前の状態がここに残ります。
            </p>
          )}
          {status === 'ready' &&
            items.map((it) => (
              <div
                key={it.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100"
              >
                <div className="text-sm">
                  <span className="font-semibold text-slate-700">{formatTimestamp(it)}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    草丈 {it.averages?.height ?? '—'} cm / 葉 {it.averages?.leafCount ?? '—'} 枚 / 株 {it.strains?.length ?? 0}
                  </span>
                  {it.updatedByName && (
                    <span className="ml-2 text-xs text-slate-400">by {it.updatedByName}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRestore(it.strains ?? [])}
                  className="text-xs font-semibold text-leaf-700 underline"
                  title="この時点の株データをフォームに読み込みます。保存ボタンを押すまで Firestore は更新されません。"
                >
                  この内容を復元
                </button>
              </div>
            ))}
          {items.length > 0 && (
            <p className="text-xs text-slate-400">
              ※ 「復元」を押すとフォームに値が読み込まれます。実際に上書きされるのは「保存する」を押した時です。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
