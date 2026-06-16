import { useCallback, useEffect, useState } from 'react';
import {
  fetchStorageUsage,
  formatBytes,
  translateUsageError,
  type StorageUsage,
} from '../lib/storageUsage';

type Status = 'idle' | 'loading' | 'ready' | 'error';

// Firebase Storage の Spark プラン (Free tier) は 5 GB。Blaze に上がっていても基準値として表示する。
const FREE_TIER_BYTES = 5 * 1024 * 1024 * 1024;
const WARN_RATIO = 0.7; // 70% 超で琥珀色に切替

/**
 * クラス全体の写真容量を表示する小ウィジェット。教員ダッシュボードの生徒一覧上部に置く想定。
 * 初回マウント時に自動 fetch、手動 ↻ 更新ボタンあり。
 * 失敗時はエラーメッセージのみ出して致命化しない (生徒一覧自体は普通に表示できる)。
 */
export default function StorageUsageCard() {
  const [status, setStatus] = useState<Status>('idle');
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const u = await fetchStorageUsage();
      setUsage(u);
      setStatus('ready');
    } catch (e) {
      setError(translateUsageError(e));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ratio = usage ? usage.totalBytes / FREE_TIER_BYTES : 0;
  const isWarn = ratio >= WARN_RATIO;

  return (
    <section
      className={`card ${
        isWarn ? 'border-2 border-amber-300 bg-amber-50' : ''
      }`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-leaf-700">
          📷 写真容量 (クラス全体)
        </h3>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={status === 'loading'}
          className="text-xs text-leaf-700 underline disabled:opacity-40"
          title="再計算する"
        >
          {status === 'loading' ? '集計中…' : '↻ 更新'}
        </button>
      </header>

      {status === 'loading' && !usage && (
        <p className="mt-2 text-sm text-slate-500">集計中…</p>
      )}

      {status === 'error' && (
        <p className="mt-2 text-sm text-red-600">取得できませんでした: {error}</p>
      )}

      {usage && (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-4">
            <span className="text-2xl font-bold text-slate-800">
              {formatBytes(usage.totalBytes)}
            </span>
            <span className="text-sm text-slate-500">
              {usage.photoCount.toLocaleString()} 枚
            </span>
            <span className="text-xs text-slate-500">
              / 無料枠 {formatBytes(FREE_TIER_BYTES)} ({(ratio * 100).toFixed(1)}%)
            </span>
          </div>
          {/* 簡易プログレスバー */}
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full ${
                isWarn ? 'bg-amber-500' : 'bg-leaf-500'
              }`}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
              aria-label={`使用率 ${(ratio * 100).toFixed(1)}%`}
            />
          </div>
          {isWarn && (
            <p className="mt-2 text-xs text-amber-800">
              ⚠️ 無料枠 (5 GB) の {Math.floor(ratio * 100)}% を使用中。
              週次のオーファン写真クリーンアップで自動整理されますが、
              プラン状況も確認してください。
            </p>
          )}
        </>
      )}
    </section>
  );
}
