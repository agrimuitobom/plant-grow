type Props = {
  /** ヘッダの戻るリンクの表示有無。/privacy 直アクセス時は不要、サインイン画面から開いた時に true。 */
  showBackLink?: boolean;
};

/**
 * 学校向けプライバシーポリシー (テンプレート)。
 *
 * 【学校で運用開始する前に必ず編集してください】の箇所は校内の実情に合わせて
 * 書き換える前提です。法務確認・保護者周知が必要な箇所がある場合は学校事務局と相談を。
 */
export default function PrivacyPolicy({ showBackLink = false }: Props) {
  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <article className="mx-auto max-w-3xl">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-leaf-700">プライバシーポリシー</h1>
          <p className="mt-2 text-sm text-slate-500">
            最終更新日: 【学校で運用開始する前に必ず編集してください】
          </p>
        </header>

        <section className="card prose prose-slate max-w-none">
          <h2 className="text-xl font-bold text-leaf-700">1. このアプリで集める情報</h2>
          <p>
            「植物生育管理」アプリは、児童・生徒が植物の観察を続けるための学習補助ツールです。
            次の情報を取得・保存します。
          </p>
          <ul>
            <li>
              <strong>アカウント情報</strong>: 学校で配布する ID、本人が登録した表示名、
              暗号化されたパスワード
            </li>
            <li>
              <strong>観察データ</strong>: 株の草丈・葉の枚数・観察メモ・撮影写真
            </li>
            <li>
              <strong>イベント記録</strong>: 水やり・肥料・天気の記録
            </li>
            <li>
              <strong>操作ログ</strong>: 誰がいつ記録を作成・更新したか
              （誤操作の追跡用）
            </li>
          </ul>
          <p>
            メールアドレスは取得しません。アプリ内部の ID は擬似メール形式
            <code>(ID)@(クラス).invalid</code> に変換されますが、
            実在のメールアドレスではありません。
          </p>

          <h2 className="mt-6 text-xl font-bold text-leaf-700">2. 情報の見え方</h2>
          <ul>
            <li>
              <strong>本人</strong>: 自分が記録したすべてのデータを見られます。
            </li>
            <li>
              <strong>担任の先生</strong>: 同じクラスの全員の観察記録を読めます。
              先生でも他の児童・生徒のデータを書き換えることはできません。
            </li>
            <li>
              <strong>保護者</strong>: 本人または担任の先生が発行した
              「共有リンク」を保護者に渡したときに限り、
              発行時点のスナップショットを <strong>72 時間</strong> まで閲覧できます。
              共有リンクはいつでも取り消せます。コメントは含まれません。
            </li>
            <li>
              <strong>他のクラスの児童・生徒・先生</strong>: 一切見られません。
            </li>
          </ul>

          <h2 className="mt-6 text-xl font-bold text-leaf-700">
            3. 情報を保管する場所
          </h2>
          <p>
            データは Google 社の運営する Firebase
            （日本リージョン、東京）に保存されます。日本国外のサーバには複製されません。
            通信はすべて TLS で暗号化されます。
          </p>

          <h2 className="mt-6 text-xl font-bold text-leaf-700">4. 保存期間</h2>
          <ul>
            <li>観察データ・写真: 在籍中は保存。卒業・転校後の取り扱いは学校の方針に従います。</li>
            <li>
              アプリの動作ログ (Firestore バックアップ):
              直近 30 日分のみ自動で保持し、それ以降は自動削除されます。
            </li>
            <li>
              共有リンクのスナップショット: 72 時間で自動失効します。
            </li>
          </ul>

          <h2 className="mt-6 text-xl font-bold text-leaf-700">5. 写真の取り扱い</h2>
          <p>
            アップロードされた写真は最大幅 1080px に圧縮され、
            上記サーバに本人のフォルダ内で保管されます。
            他者の写真は同じクラスの先生のみ閲覧できます。
            参照されなくなった写真は週次でサーバから自動削除されます。
          </p>

          <h2 className="mt-6 text-xl font-bold text-leaf-700">6. 情報を消したいとき</h2>
          <p>
            自分のアカウントや観察記録の削除を希望する場合は、
            担任の先生または以下の連絡先までご連絡ください。
          </p>
          <p>
            <strong>運用責任者: 【学校で運用開始する前に必ず編集してください】</strong>
            <br />
            連絡先: 【学校で運用開始する前に必ず編集してください (例: メール・電話)】
          </p>

          <h2 className="mt-6 text-xl font-bold text-leaf-700">7. このポリシーの変更</h2>
          <p>
            内容を変更する場合は、本ページの「最終更新日」を更新し、
            必要に応じて校内通知で周知します。
          </p>

          <hr className="my-6" />
          <p className="text-xs text-slate-500">
            このポリシーは学校用テンプレートです。校内の実情・法務確認に合わせて
            運用開始前に【学校で運用開始する前に必ず編集してください】の箇所を書き換えてください。
          </p>
        </section>

        <footer className="mt-6 text-center print:hidden">
          {showBackLink ? (
            <a href="/" className="text-sm text-leaf-700 underline">
              ← ログイン画面に戻る
            </a>
          ) : (
            <a href="/" className="text-sm text-leaf-700 underline">
              ← トップに戻る
            </a>
          )}
        </footer>
      </article>
    </div>
  );
}
