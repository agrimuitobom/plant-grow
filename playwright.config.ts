import { defineConfig } from '@playwright/test';

/**
 * E2E テスト設定。
 *
 * 実行方法: `npm run test:e2e`
 *   → firebase emulators:exec が Auth/Firestore/Storage エミュレータを起動し、
 *     その中で playwright test が走る。playwright は webServer 設定に従って
 *     Vite dev サーバを VITE_USE_EMULATORS=true で起動する。
 *
 * Firebase の設定値はエミュレータ相手なのでダミーで良い (実プロジェクトに一切触れない)。
 * projectId だけは emulators:exec --project と一致させる必要がある。
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // エミュレータの状態はテスト間で共有される。ID を毎回ユニークにしているので
  // 並列でも原理上は衝突しないが、少人数運用の CI では直列が安定。
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    // 環境によっては Playwright 既定のブラウザ解決が使えないことがある
    // (プリインストールされた Chromium を直接指すためのエスケープハッチ)。
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_USE_EMULATORS: 'true',
      VITE_FIREBASE_API_KEY: 'demo-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'localhost',
      VITE_FIREBASE_PROJECT_ID: 'plant-grow-test',
      VITE_FIREBASE_STORAGE_BUCKET: 'plant-grow-test.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
      VITE_FIREBASE_APP_ID: 'demo-app-id',
      VITE_CLASS_ID: 'class-e2e',
    },
  },
});
