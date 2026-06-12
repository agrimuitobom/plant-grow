import React from 'react';
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

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <SentryErrorBoundary
      fallback={({ error, resetError }) => (
        <ErrorFallback error={error} resetError={resetError} />
      )}
    >
      <App />
      {/* PWA の SW ライフサイクルを画面に出す。fixed positioned なのでどの画面でも邪魔しない。 */}
      <PwaStatus />
    </SentryErrorBoundary>
  </React.StrictMode>
);
