import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 新しいバージョンが出たら自動でバックグラウンド更新する。
      // 教室で生徒にバージョンの違いを意識させたくないので autoUpdate を採用。
      registerType: 'autoUpdate',
      // index.html に登録スクリプトを自動挿入。main.jsx 側での import が不要になる。
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: '植物生育管理',
        short_name: '植物観察',
        description: '株ごとの草丈・葉枚数・写真・観察メモを記録するアプリ',
        lang: 'ja',
        theme_color: '#3b8f3f',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // SPA: ネット未接続時もアプリ shell を返してオフライン起動できるように。
        navigateFallback: '/index.html',
        // Firebase 系ドメインは自前のキャッシュ層 (IndexedDB persistence) を持っているので
        // SW でキャッシュさせない。重複と一貫性問題を避ける。
        navigateFallbackDenylist: [/^\/__\//, /firestore\.googleapis\.com/, /firebasestorage/],
      },
    }),
  ],
  server: { host: true, port: 5173 },
  // Vitest 設定。vite.config から読まれるので別ファイルにしない。
  // 純粋関数のテストだけなので jsdom は不要 (node 環境で十分)。
  test: {
    environment: 'node',
    // 既定では純粋関数の単体テストだけを対象にする (高速)。
    // Rules テスト (tests/rules.test.ts) は Firestore Emulator 起動が要るので
    // `npm run test:rules` から個別に呼び出す。
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
});
