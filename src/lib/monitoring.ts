import * as Sentry from '@sentry/react';

/**
 * Sentry 初期化。DSN 未設定なら何もしないので、テスト・ローカル開発で副作用なし。
 *
 * 設計方針:
 * - 児童データを扱うアプリなので PII を意図的に送らない (sendDefaultPii: false)
 * - セッション replay は無効 (画面録画が学校承諾範囲外)
 * - パフォーマンストレースも無効 (Free tier ぎりぎり運用するため)
 * - 残るのは「例外と未捕捉エラー」のみ → 「動かなくなっているのに本人は気付かない」事象だけを可視化
 */
export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    // DSN 未設定 = 監視オフ。ログ無しで黙って終了 (開発体験を阻害しない)。
    return;
  }
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Sentry のデフォルト機能 (window.onerror / unhandledrejection / fetch breadcrumb) は有効。
    // Replay と Tracing は明示的にゼロ。
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    // 念のため: もし breadcrumb に email / displayName が混ざったら型のレベルで弾く。
    // (Sentry は基本送らないが、サードパーティライブラリが乗せるケースを警戒)
    beforeBreadcrumb(breadcrumb) {
      const data = breadcrumb.data ?? {};
      if ('email' in data) delete data.email;
      if ('displayName' in data) delete data.displayName;
      return breadcrumb;
    },
  });
}

/** Service Worker 登録失敗など、catch しても投げ直さないエラーの手動報告に使う。 */
export function captureSilent(err: unknown, context?: Record<string, unknown>): void {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  Sentry.captureException(err, { extra: context });
}

/** Sentry の ErrorBoundary を本ファイル経由でエクスポート (再利用と DSN 無効時の no-op 化のため)。 */
export const SentryErrorBoundary = Sentry.ErrorBoundary;
