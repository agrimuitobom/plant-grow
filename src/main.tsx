import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import ErrorFallback from './components/ErrorFallback.tsx';
import PwaStatus from './components/PwaStatus.tsx';
import { SentryErrorBoundary, initMonitoring } from './lib/monitoring.ts';
import 'react-calendar/dist/Calendar.css';
import './index.css';

// Sentry は React レンダー前に初期化する。これより前に起きるエラーは捕捉できないが、
// 起動初期の極小窓なので実用上問題なし。
initMonitoring();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root が見つかりません');

// 軽量ルーティング: /share/{token} は保護者向け公開ビューへ。それ以外は本体アプリ。
// react-router を入れるほどの URL 構造ではないので、pathname だけで分岐する。
const shareMatch = /^\/share\/([a-zA-Z0-9]+)\/?$/.exec(
  typeof window !== 'undefined' ? window.location.pathname : ''
);
const ShareView = lazy(() => import('./components/ShareView.tsx'));

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <SentryErrorBoundary
      fallback={({ error, resetError }) => (
        <ErrorFallback error={error} resetError={resetError} />
      )}
    >
      {shareMatch ? (
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center text-slate-500">
              読み込み中…
            </div>
          }
        >
          <ShareView token={shareMatch[1]!} />
        </Suspense>
      ) : (
        <>
          <App />
          {/* PWA の SW ライフサイクルを画面に出す。fixed positioned なのでどの画面でも邪魔しない。 */}
          <PwaStatus />
        </>
      )}
    </SentryErrorBoundary>
  </React.StrictMode>
);
