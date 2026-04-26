import {
  defineConfig,
  minimal2023Preset as preset,
} from '@vite-pwa/assets-generator/config';

// `npx pwa-assets-generator` で public/icon.svg から PWA / iOS 用アイコンを生成する。
// 生成物はリポジトリにコミットしておくので、毎回のビルド時には走らない。
export default defineConfig({
  preset,
  images: ['public/icon.svg'],
});
