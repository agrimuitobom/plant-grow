# 🌱 植物生育管理アプリ (MVP)

学校の授業で、タブレットから複数の株の草丈・葉枚数を記録するための Web アプリ。
React (Vite) + Tailwind CSS + Firebase (Firestore + Anonymous Auth) + Recharts。

## セットアップ & デプロイ手順

### 1. Firebase コンソールでプロジェクトを作る

1. [Firebase Console](https://console.firebase.google.com/) で新規プロジェクトを作成
2. 「Build → Firestore Database」で DB を作成（本番モード推奨）
3. 「Build → Authentication → Sign-in method」で **「匿名」を有効化**
4. 「プロジェクトの設定 → マイアプリ → ウェブアプリを追加」して、表示される `firebaseConfig` をコピー

### 2. 設定値を用意する

- `.firebaserc` の `"default"` にプロジェクト ID を入れる
- ローカル開発用: `.env.example` を `.env.local` にコピーし、Firebase コンソールの `firebaseConfig` の値を貼る

> これらの値は **公開しても安全** な識別子です。実際のアクセス制御は `firestore.rules` 側で行います。
> `.env.local` は `.gitignore` 済みなので commit されません。

### 3. ローカル動作確認

```bash
npm install
npm run dev
```

### 4. デプロイ (GitHub Actions 経由・推奨)

`main` ブランチに push すると `.github/workflows/deploy.yml` が走り、Hosting + Firestore ルールを自動デプロイします。

事前に GitHub リポジトリの **Settings → Secrets and variables → Actions** に以下を登録:

| Secret 名 | 中身 |
|-----------|------|
| `VITE_FIREBASE_API_KEY` | firebaseConfig.apiKey |
| `VITE_FIREBASE_AUTH_DOMAIN` | firebaseConfig.authDomain |
| `VITE_FIREBASE_PROJECT_ID` | firebaseConfig.projectId |
| `VITE_FIREBASE_STORAGE_BUCKET` | firebaseConfig.storageBucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | firebaseConfig.messagingSenderId |
| `VITE_FIREBASE_APP_ID` | firebaseConfig.appId |
| `FIREBASE_SERVICE_ACCOUNT_PLANT_RESEARCH_B106B` | サービスアカウント JSON 全文 |

**サービスアカウント JSON の作り方:**

1. [Firebase Console → プロジェクトの設定 → サービス アカウント](https://console.firebase.google.com/project/plant-research-b106b/settings/serviceaccounts/adminsdk)
2. 「新しい秘密鍵の生成」→ JSON ダウンロード
3. ファイルの中身をまるごとコピー → GitHub Secret `FIREBASE_SERVICE_ACCOUNT_PLANT_RESEARCH_B106B` に貼り付け

### 4-B. 手動デプロイ (フォールバック)

```bash
npm install -g firebase-tools
firebase login
npm run build
firebase deploy
```

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
