import { useState } from 'react';
import { setClassArchived, translateArchiveError } from '../lib/classArchive';
import { getCurrentClassId } from '../lib/firebase';

type Props = {
  /** 現在のアーカイブ状態 (App が classes/{classId} から取得済み)。 */
  archived: boolean;
};

/**
 * 教員管理タブの「年度アーカイブ」カード。
 * 年度末にクラス全体を読み取り専用に凍結する / 誤操作時に解除する。
 * 切替後はページをリロードして、Rules の新しい評価結果を全画面に反映させる。
 */
export default function ClassArchiveCard({ archived }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const classId = getCurrentClassId();
    const message = archived
      ? `クラス「${classId}」のアーカイブを解除します。生徒が再び記録を書き込めるようになります。よろしいですか?`
      : `クラス「${classId}」をアーカイブします。\n\n・生徒・教員とも新しい記録、コメント、イベントを追加できなくなります\n・閲覧、印刷、CSV エクスポートは引き続き可能です\n・いつでも解除できます\n\n年度末の凍結操作です。よろしいですか?`;
    if (!confirm(message)) return;
    setBusy(true);
    setError(null);
    try {
      await setClassArchived(!archived);
      // Rules 評価とすべての購読を新状態でやり直すため、リロードが最も確実。
      window.location.reload();
    } catch (e) {
      setError(translateArchiveError(e));
      setBusy(false);
    }
  };

  return (
    <section
      className={`card ${archived ? 'border-2 border-slate-300 bg-slate-50' : ''}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-leaf-700">年度アーカイブ</h2>
        {archived && (
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
            📦 アーカイブ済み (読み取り専用)
          </span>
        )}
      </header>

      <p className="mt-2 text-sm text-slate-600">
        {archived
          ? 'この年度は凍結されています。記録・コメント・イベントの追加はできませんが、閲覧・印刷・CSV エクスポートは可能です。'
          : '年度が終わったらアーカイブすると、クラス全体が読み取り専用になり「後から書き換わる」事故を防げます。新年度はログイン画面のクラス変更から新しいクラス ID で始めてください。'}
      </p>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className={`!min-h-0 !px-4 !py-2 text-sm disabled:opacity-40 ${
            archived ? 'btn-secondary' : 'btn-ghost'
          }`}
        >
          {busy
            ? '処理中…'
            : archived
              ? 'アーカイブを解除する'
              : '📦 この年度をアーカイブする'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
