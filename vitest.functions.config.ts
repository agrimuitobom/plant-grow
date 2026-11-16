import { defineConfig } from 'vitest/config';

// Cloud Functions の結合テスト。Functions / Auth / Firestore エミュレータが必要なので
// `npm run test:functions` (emulators:exec) から呼ぶ。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/functions.test.ts'],
    // 関数のコールドスタート (初回呼び出し) が数秒かかる。
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
