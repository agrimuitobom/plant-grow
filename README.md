# 🌱 植物生育管理アプリ (MVP)

学校の授業で、タブレットから複数の株の草丈・葉枚数を記録するための Web アプリ。
React (Vite) + Tailwind CSS + Firebase Firestore + Recharts。

## セットアップ

```bash
npm install
cp .env.example .env   # Firebase プロジェクトの値を入れる
npm run dev
```

## Firestore スキーマ

```
classes/{classId}/records/{YYYY-MM-DD}
  date:       "2026-04-20"
  strains:    [{ id, name, height, leafCount }]
  averages:   { height, leafCount }
  createdAt:  Timestamp
  updatedAt:  Timestamp
```

- `doc id = 日付` にすることで「1日1レコード」を保証し、upsert / 後日修正が容易。
- 平均値は書き込み時に確定 → 読み出しが軽く、グラフ描画もそのまま使える。
- クラス単位 (`classes/{classId}`) に分けることで、複数クラス・複数年に拡張可能。

## 画面構成

1. **日付選択** — `react-calendar` + `<input type="date">`。過去に記録がある日は ● で強調。
2. **記録フォーム** — A株/B株… を動的追加。未入力欄は平均から除外。
3. **成長グラフ** — Recharts の `LineChart` で草丈/葉枚数の平均を時系列表示。

## スタイリング指針 (Tailwind)

- タッチ前提: ボタン `min-h: 56px` / フォント `text-tap (1.25rem)` / `rounded-2xl` で指当たりを柔らかく。
- カラー: `leaf`(緑) をアクセント、`soil`(茶) を補助色に `tailwind.config.js` で定義。
- カード UI: `.card` クラスにまとめ、余白と影を統一。
- フォーム: `input` を `@layer base` で大きめに一括スタイル。小さな個別上書きを減らす。
