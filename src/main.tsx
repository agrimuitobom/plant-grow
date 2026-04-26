import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import 'react-calendar/dist/Calendar.css';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root が見つかりません');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
