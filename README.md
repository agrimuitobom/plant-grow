# 🌱 植物生育管理アプリ (MVP)

学校の授業で、タブレットから複数の株の草丈・葉枚数・写真・観察メモを記録するための Web アプリ。
PWA としてホーム画面に追加でき、オフラインでも観察記録を続けられます。
React (Vite + vite-plugin-pwa) + Tailwind CSS + Firebase (Firestore + Storage + Google Auth) + Recharts。

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
| Firebase Auth | **Google ログイン** したユーザー | 一意の uid と displayName / email を取得 |
| Firestore Rules | ログイン済み生徒 (匿名拒否) | **自分の** `classes/{classId}/students/{uid}/records/{YYYY-MM-DD}` の read / create / update |
| Firestore Rules | 教員 (`classes/{classId}/teachers/{uid}` に登録) | **同じクラスの全生徒** のレコード・名簿を read（書き込みは不可） |
| Storage Rules | ログイン済み生徒 | **自分の** `classes/{classId}/students/{uid}/photos/{dateId}/*` の read / write / delete<br>1ファイル 5MB 以下 / `image/*` のみ |
| Firestore | 誰も | delete はできない（誤操作防止） |

- 各生徒のデータはパスに `uid` を含めることで物理的に分離されており、Rules で
  `request.auth.uid == userId` を要求しているので、他人のレコードや写真には触れません。
- レコードに `createdBy` / `updatedBy` を保存して、後からのクラス横断ビューや監査に備えています。
- `firestore.rules` / `storage.rules` の双方で匿名認証を明示的に拒否しています。
- 校内利用に限定したい場合は環境変数 `VITE_ALLOWED_EMAIL_DOMAINS` を設定すると、
  許可ドメイン以外のメールでログインしたユーザは即サインアウトされます
  （例: `VITE_ALLOWED_EMAIL_DOMAINS=example-school.ac.jp,example-school.jp`）。
  さらに厳格にしたい場合は Rules 側でも `request.auth.token.email.matches('.*@example-school\\.ac\\.jp$')` を追加してください
  （クライアント側の制限はバイパスされ得るため、機微なクラスではサーバ側でも要重ね掛け）。

## Firestore スキーマ

```
classes/{classId}/students/{uid}/records/{YYYY-MM-DD}
  date:           "2026-04-20"
  strains:        [{ id, name, height, leafCount, memo, photoPath?, photoUrl? }]
  averages:       { height, leafCount }
  createdAt:      Timestamp           // 新規作成時のみ
  updatedAt:      Timestamp
  createdBy:      uid                 // 監査: パスの uid と必ず一致
  createdByName:  displayName         // 表示用キャッシュ (新規作成時)
  updatedBy:      uid
  updatedByName:  displayName
```

- 「クラス × 生徒 × 日付」の 3 軸で 1 レコードに正規化。
- doc id = 日付 で 1 日 1 レコードを保証し、upsert が容易。
- 平均値は書き込み時に確定 → 読み出しが軽い。
- `createdAt` / `createdByName` は新規作成時のみセット。
- 生徒は **自分のサブツリーしか read / write できない**（Rules でパスの uid と request.auth.uid の一致を要求）。
- 旧スキーマ `classes/{classId}/records/{date}` (per-day shared) のデータは破壊的変更で
  使われなくなります。学校導入前なら問題なし、運用中だった場合は手動移行が必要。

### 教員ロール / クラス共有

```
classes/{classId}/teachers/{uid}             // 教員ロール (Console から手動で seed)
  uid:           uid
  displayName:   表示名
  email:         (任意)

classes/{classId}/students/{uid}             // 生徒名簿 (記録保存時に自動 upsert)
  uid:           uid
  displayName:   表示名
  email:         email
  lastRecordedAt: Timestamp
```

- 生徒が記録を保存すると `students/{uid}` が自動 upsert され、教員ダッシュボードの一覧に出ます。
- **教員アカウントの追加手順** (Firebase Console):
  1. Firestore Database → `classes` → 該当 classId → `teachers` サブコレクションを開く
  2. 「ドキュメントを追加」でドキュメント ID にその先生の **Firebase Auth uid** を指定
     （uid は Authentication タブで Google ログイン後のユーザーから確認できる）
  3. フィールド `displayName` (string) に表示名を入れて保存
- アプリ側では教員ログイン時に「クラスを見る／自分の記録」のタブが表示され、
  クラスの生徒一覧から児童を選んで成長グラフ・記録一覧・写真アルバム・CSV を
  read-only で閲覧できます。教員でも他生徒の記録を編集することはできません (Rules で禁止)。

## Storage スキーマ

```
classes/{classId}/students/{uid}/photos/{YYYY-MM-DD}/{strainId}-{timestamp}.jpg
```

- iPad で撮影した写真はクライアントで **幅 1080px / JPEG quality 0.8** に圧縮してから upload。
- ファイル名にタイムスタンプを入れて衝突回避。
- 写真も生徒ごとのフォルダに分離。Rules で他人のフォルダへのアクセスを拒否。
- レコード保存時に「直前の写真パス」と比較し、参照されなくなった画像は自動削除して
  Storage の使用量を肥大化させないようにしています。

## PWA / ホーム画面追加

`vite-plugin-pwa` で manifest と Service Worker を自動生成しています。

- iPad Safari: 共有ボタン → 「ホーム画面に追加」で「植物観察」アプリとして追加可能。
  起動時は Safari のアドレスバーが消え、`display: standalone` でアプリっぽく表示。
- Android Chrome: 「ホーム画面に追加」のプロンプトが自動表示される。
- Service Worker は静的アセットだけをキャッシュ。Firestore / Storage の API 通信は
  Firebase 側の永続キャッシュ (IndexedDB) に任せ、SW 側ではバイパスしている。
- `registerType: 'autoUpdate'` なので新版デプロイ時はバックグラウンドで更新される。

### アイコンを差し替えたい場合

1. `public/icon.svg` を編集（512x512 viewBox 想定）
2. `npx pwa-assets-generator` を実行
   - `public/pwa-{64,192,512}x{...}.png`, `apple-touch-icon-180x180.png`,
     `maskable-icon-512x512.png`, `favicon.ico` が再生成される
3. 生成されたファイルをコミットしてデプロイ

## スタイリング指針 (Tailwind)

- タッチ前提: ボタン `min-h: 56px` / `text-tap (1.25rem)` / `rounded-2xl`
- カラー: `leaf`(緑) をアクセント、`soil`(茶) を補助色に `tailwind.config.js` で定義
- カード UI を `.card` に集約、余白と影を統一
- `@layer base` で `input` を大きめに一括スタイル
