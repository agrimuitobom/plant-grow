import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import PwaStatus from './components/PwaStatus.tsx';
import 'react-calendar/dist/Calendar.css';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root が見つかりません');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
    {/* PWA の SW ライフサイクルを画面に出す。fixed positioned なのでどの画面でも邪魔しない。 */}
    <PwaStatus />
  </React.StrictMode>
);
