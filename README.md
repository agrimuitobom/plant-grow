# 🌱 植物生育管理アプリ (MVP)

学校の授業で、タブレットから複数の株の草丈・葉枚数を記録するための Web アプリ。
React (Vite) + Tailwind CSS + Firebase (Firestore + Anonymous Auth) + Recharts。

## セットアップ & デプロイ手順

### 1. Firebase コンソールでプロジェクトを作る

1. [Firebase Console](https://console.firebase.google.com/) で新規プロジェクトを作成
2. 「Build → Firestore Database」で DB を作成（本番モード推奨）
3. 「Build → Authentication → Sign-in method」で **「匿名」を有効化**
4. 「プロジェクトの設定 → マイアプリ → ウェブアプリを追加」して、表示される `firebaseConfig` をコピー

### 2. 設定値をコードに貼る

`src/lib/firebase.js` の `firebaseConfig` と `CLASS_ID` を書き換えます。
`.firebaserc` の `"default"` をプロジェクト ID に書き換えます。

> これらの値は **公開しても安全** な識別子です。実際のアクセス制御は `firestore.rules` 側で行います。

### 3. ローカル動作確認

```bash
npm install
npm run dev
```

### 4. デプロイ

```bash
npm install -g firebase-tools
firebase login
firebase deploy           # hosting + firestore ルールを両方反映
# or
npm run deploy            # vite build してから hosting のみデプロイ
```

初回のみ Hosting を有効化する必要があるので、コンソール画面の指示に従って一度「次へ」を進めておけば OK です。

## セキュリティモデル

| 層 | 誰が | 何ができる |
|----|------|-----------|
| Firebase Auth | 起動時に **匿名サインイン** | 一意の uid を取得 |
| Firestore Rules | 認証済みのみ | `classes/{classId}/records/{YYYY-MM-DD}` の read / create / update |
| Rules | 誰も | delete はできない（誤操作防止） |

匿名でも一応 uid は振られるため、ルールで「未認証は 100% 拒否」にできます。
校内利用に限定したい場合は、後からドメイン制限や Google ログイン必須に差し替え可能です。

## Firestore スキーマ

```
classes/{classId}/records/{YYYY-MM-DD}
  date:       "2026-04-20"
  strains:    [{ id, name, height, leafCount }]
  averages:   { height, leafCount }
  createdAt:  Timestamp
  updatedAt:  Timestamp
```

- `doc id = 日付` で「1日1レコード」を保証し、後日修正も 1 回の upsert で完結。
- 平均値は書き込み時に確定 → 読み出しが軽い。
- `classes/{classId}` 配下にまとめ、複数クラス・年度に拡張可能。

## スタイリング指針 (Tailwind)

- タッチ前提: ボタン `min-h: 56px` / `text-tap (1.25rem)` / `rounded-2xl`
- カラー: `leaf`(緑) をアクセント、`soil`(茶) を補助色に `tailwind.config.js` で定義
- カード UI を `.card` に集約、余白と影を統一
- `@layer base` で `input` を大きめに一括スタイル
