# 🌱 植物生育管理アプリ (MVP)

学校の授業で、タブレットから複数の株の草丈・葉枚数・写真を記録するための Web アプリ。
React (Vite) + Tailwind CSS + Firebase (Firestore + Storage + Google Auth) + Recharts。

## セットアップ & デプロイ手順

### 1. Firebase コンソールでプロジェクトを作る

1. [Firebase Console](https://console.firebase.google.com/) で新規プロジェクトを作成
2. 「Build → Firestore Database」で DB を作成（本番モード推奨）
3. 「Build → Authentication → Sign-in method」で **「Google」を有効化**
   （プロジェクトのサポートメールを設定する必要あり）
4. 「Authentication → Settings → 承認済みドメイン」に Hosting のドメイン
   （`<project-id>.web.app` / `<project-id>.firebaseapp.com` / 独自ドメイン）と
   ローカル開発用の `localhost` が含まれていることを確認
5. 「プロジェクトの設定 → マイアプリ → ウェブアプリを追加」して、表示される `firebaseConfig` をコピー
6. **Blaze プランにアップグレード**（写真機能には Cloud Storage が必要）
   - 「Settings → 使用量と請求 → プランの詳細」から Blaze に変更
   - **必ず Cloud Console で予算アラートを設定**（推奨: 月 $1 で通知）
   - [Cloud Console → 請求 → 予算とアラート](https://console.cloud.google.com/billing/budgets)
7. 「Build → Storage」で Cloud Storage を有効化（既定のロケーションで OK）

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

`main` ブランチに push すると `.github/workflows/deploy.yml` が走り、
Hosting + Firestore ルール + Storage ルールを自動デプロイします。

事前に GitHub リポジトリの **Settings → Secrets and variables → Actions** に以下を登録:

| Secret 名 | 中身 |
|-----------|------|
| `VITE_FIREBASE_API_KEY` | firebaseConfig.apiKey |
| `VITE_FIREBASE_AUTH_DOMAIN` | firebaseConfig.authDomain |
| `VITE_FIREBASE_PROJECT_ID` | firebaseConfig.projectId |
| `VITE_FIREBASE_STORAGE_BUCKET` | firebaseConfig.storageBucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | firebaseConfig.messagingSenderId |
| `VITE_FIREBASE_APP_ID` | firebaseConfig.appId |
| `FIREBASE_SERVICE_ACCOUNT_PLANT_GROWTH_TRACKER_C4E0C` | サービスアカウント JSON 全文 |

**サービスアカウント JSON の作り方:**

1. [Firebase Console → プロジェクトの設定 → サービス アカウント](https://console.firebase.google.com/project/plant-growth-tracker-c4e0c/settings/serviceaccounts/adminsdk)
2. 「新しい秘密鍵の生成」→ JSON ダウンロード
3. ファイルの中身をまるごとコピー → GitHub Secret `FIREBASE_SERVICE_ACCOUNT_PLANT_GROWTH_TRACKER_C4E0C` に貼り付け

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
| Firebase Auth | **Google ログイン** したユーザー | 一意の uid と displayName / email を取得 |
| Firestore Rules | Google ログイン済み (匿名は拒否) | `classes/{classId}/records/{YYYY-MM-DD}` の read / create / update |
| Storage Rules | Google ログイン済み | `classes/{classId}/photos/{dateId}/*` の read / write / delete<br>1ファイル 5MB 以下 / `image/*` のみ |
| Firestore | 誰も | delete はできない（誤操作防止） |

`firestore.rules` / `storage.rules` の双方で
`request.auth.token.firebase.sign_in_provider != 'anonymous'`
を要求し、匿名認証を明示的に拒否しています。
校内利用に限定したい場合は、Rules でメールドメインを判定する条件
（例: `request.auth.token.email.matches('.*@example-school\\.ac\\.jp$')`）を
追加してください。

## Firestore スキーマ

```
classes/{classId}/records/{YYYY-MM-DD}
  date:       "2026-04-20"
  strains:    [{ id, name, height, leafCount, photoPath?, photoUrl? }]
  averages:   { height, leafCount }
  createdAt:  Timestamp
  updatedAt:  Timestamp
```

- `doc id = 日付` で「1日1レコード」を保証し、後日修正も 1 回の upsert で完結。
- 平均値は書き込み時に確定 → 読み出しが軽い。
- `classes/{classId}` 配下にまとめ、複数クラス・年度に拡張可能。
- `createdAt` は新規作成時のみセット（更新時は `updatedAt` のみ書き換え）。

## Storage スキーマ

```
classes/{classId}/photos/{YYYY-MM-DD}/{strainId}-{timestamp}.jpg
```

- iPad で撮影した写真はクライアントで **幅 1080px / JPEG quality 0.8** に圧縮してから upload。
- ファイル名にタイムスタンプを入れて衝突回避。
- レコード保存時に「直前の写真パス」と比較し、参照されなくなった画像は自動削除して
  Storage の使用量を肥大化させないようにしています。

## スタイリング指針 (Tailwind)

- タッチ前提: ボタン `min-h: 56px` / `text-tap (1.25rem)` / `rounded-2xl`
- カラー: `leaf`(緑) をアクセント、`soil`(茶) を補助色に `tailwind.config.js` で定義
- カード UI を `.card` に集約、余白と影を統一
- `@layer base` で `input` を大きめに一括スタイル
