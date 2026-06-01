import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Service Worker のライフサイクル状態を画面に出す。
 *
 * - 初回インストール完了 (オフライン対応が利く状態になった) → 「オフライン対応 ✓」を 6 秒表示
 * - 新しいバージョンがバックグラウンドで降ってきた → 「更新があります [再読み込み]」を恒久表示
 *
 * これがないと運用上「いつまで online で待てば SW が cache 完了するのか」が見えず、
 * 中途半端なタイミングでオフラインに切り替えてしまい "ホーム画面アイコンが開かない" 事象になる。
 */
export default function PwaStatus() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(reg) {
      // 通常 1 時間毎の自動更新チェックは vite-plugin-pwa が面倒を見てくれる。
      // ここではログだけ吐いて様子を確認しやすくしておく。
      if (reg) console.info('[plant-grow] SW registered, scope:', reg.scope);
    },
    onRegisterError(error) {
      console.warn('[plant-grow] SW register failed:', error);
    },
  });

  // 「オフライン対応 ✓」は数秒で自動的に消す。教室で見落とさない程度に。
  const [showReady, setShowReady] = useState(false);
  useEffect(() => {
    if (!offlineReady) return;
    setShowReady(true);
    const t = setTimeout(() => {
      setShowReady(false);
      setOfflineReady(false);
    }, 6000);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  if (!showReady && !needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 print:hidden">
      {needRefresh ? (
        <div className="flex max-w-md items-center gap-3 rounded-2xl bg-leaf-700 px-4 py-3 text-white shadow-lg">
          <span className="text-sm">新しいバージョンが届いています。</span>
          <button
            type="button"
            onClick={() => updateServiceWorker(true)}
            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-leaf-700"
          >
            再読み込み
          </button>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            aria-label="閉じる"
            className="text-white/80 hover:text-white"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="rounded-full bg-leaf-500 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          ✓ オフライン対応の準備ができました
        </div>
      )}
    </div>
  );
}
