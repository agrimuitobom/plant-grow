import { defineConfig } from 'vitest/config';

// Rules テストは Firebase SDK の実体を使うので、
// 通常の Vitest 設定 (Firestore SDK をモックする setup.ts) と分離する。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules.test.ts'],
    // Emulator 起動 + 全テストの完了に時間がかかるので長めに。
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
