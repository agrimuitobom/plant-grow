import { useState } from 'react';
import {
  generateTempPassword,
  resetStudentPassword,
  translatePasswordResetError,
} from '../lib/passwordReset';

type Props = {
  studentUid: string;
  studentDisplayName: string;
  /** 完了 / キャンセルどちらでも閉じる。親側で開閉を管理。 */
  onClose: () => void;
};

type Stage =
  | { kind: 'review'; password: string }
  | { kind: 'submitting'; password: string }
  | { kind: 'done'; password: string }
  | { kind: 'error'; password: string; message: string };

export default function PasswordResetPanel({
  studentUid,
  studentDisplayName,
  onClose,
}: Props) {
  const [stage, setStage] = useState<Stage>(() => ({
    kind: 'review',
    password: generateTempPassword(),
  }));

  const regenerate = () => {
    if (stage.kind === 'submitting') return;
    setStage({ kind: 'review', password: generateTempPassword() });
  };

  const submit = async () => {
    if (stage.kind !== 'review') return;
    setStage({ kind: 'submitting', password: stage.password });
    try {
      await resetStudentPassword({ studentUid, newPassword: stage.password });
      setStage({ kind: 'done', password: stage.password });
    } catch (err) {
      setStage({
        kind: 'error',
        password: stage.password,
        message: translatePasswordResetError(err),
      });
    }
  };

  return (
    <section className="card border-2 border-amber-300 bg-amber-50 print:hidden">
      <header className="flex items-baseline justify-between">
        <h3 className="text-lg font-bold text-amber-900">🔑 パスワードを再発行</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-amber-900 underline"
        >
          閉じる
        </button>
      </header>

      <p className="mt-2 text-sm text-amber-900">
        生徒: <span className="font-semibold">{studentDisplayName}</span>
      </p>

      <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-amber-200">
        <p className="text-xs text-slate-500">新しい仮パスワード</p>
        <p className="mt-1 font-mono text-3xl tracking-widest text-slate-900">
          {stage.password}
        </p>
        {stage.kind === 'review' && (
          <button
            type="button"
            onClick={regenerate}
            className="mt-2 text-xs text-leaf-700 underline"
          >
            別のパスワードを生成
          </button>
        )}
      </div>

      {stage.kind === 'review' && (
        <>
          <p className="mt-3 text-xs text-amber-900">
            このパスワードを **紙にメモして生徒に手渡してください**。確定後はサーバ側にも
            生のパスワードは残らないため、ここを閉じると再取得できません。
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost !min-h-0 !px-4 !py-2 text-sm"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              className="btn-primary !min-h-0 !px-4 !py-2 text-sm"
            >
              このパスワードでリセット
            </button>
          </div>
        </>
      )}

      {stage.kind === 'submitting' && (
        <p className="mt-3 text-sm text-amber-900">送信中…</p>
      )}

      {stage.kind === 'done' && (
        <div className="mt-3 rounded-xl bg-leaf-100 px-3 py-2 text-sm text-leaf-700">
          ✓ パスワードを再発行しました。上に表示されているパスワードを生徒に伝えてください。
          生徒は次回ログイン時にこのパスワードを使って入れます。
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary !min-h-0 !px-3 !py-1.5 text-xs"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {stage.kind === 'error' && (
        <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <p className="font-semibold">リセットに失敗しました</p>
          <p className="mt-1">{stage.message}</p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-600 underline"
            >
              閉じる
            </button>
            <button
              type="button"
              onClick={() =>
                setStage({ kind: 'review', password: generateTempPassword() })
              }
              className="btn-secondary !min-h-0 !px-3 !py-1.5 text-xs"
            >
              再試行
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
