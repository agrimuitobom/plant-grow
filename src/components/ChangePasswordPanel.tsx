import { useEffect, useState } from 'react';
import { changeOwnPassword, translatePasswordChangeError } from '../lib/firebase';

type Props = {
  onClose: () => void;
  /** 変更に成功したとき (トースト表示などに使う)。 */
  onChanged: () => void;
};

const MIN_PASSWORD = 6;

/**
 * 本人によるパスワード変更。
 * 先生が再発行した仮パスワードは紙で渡されるので、受け取った生徒が
 * 自分だけが知るものに変えられるようにする。
 */
export default function ChangePasswordPanel({ onClose, onChanged }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, busy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_PASSWORD) {
      setError(`新しいパスワードは ${MIN_PASSWORD} 文字以上にしてください。`);
      return;
    }
    if (next !== confirm) {
      setError('新しいパスワードが確認用と一致しません。');
      return;
    }
    if (next === current) {
      setError('今と違うパスワードにしてください。');
      return;
    }
    setBusy(true);
    try {
      await changeOwnPassword(current, next);
      onChanged();
      onClose();
    } catch (err) {
      setError(translatePasswordChangeError(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
    >
      <form onSubmit={handleSubmit} className="card flex w-full max-w-md flex-col gap-4">
        <div>
          <h2 id="change-password-title" className="text-xl font-bold text-leaf-700">
            パスワードを変える
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            先生から仮のパスワードをもらったら、自分だけが知っているものに変えておきましょう。
          </p>
        </div>

        <div>
          <label htmlFor="cp-current" className="block text-sm font-medium text-slate-600">
            今のパスワード
          </label>
          <input
            id="cp-current"
            type="password"
            className="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-tap focus:border-leaf-500 focus:outline-none"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </div>

        <div>
          <label htmlFor="cp-next" className="block text-sm font-medium text-slate-600">
            新しいパスワード ({MIN_PASSWORD} 文字以上)
          </label>
          <input
            id="cp-next"
            type="password"
            className="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-tap focus:border-leaf-500 focus:outline-none"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
          />
        </div>

        <div>
          <label htmlFor="cp-confirm" className="block text-sm font-medium text-slate-600">
            新しいパスワード (もう一度)
          </label>
          <input
            id="cp-confirm"
            type="password"
            className="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-tap focus:border-leaf-500 focus:outline-none"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-ghost !min-h-0 !px-4 !py-2 text-sm disabled:opacity-40"
          >
            やめる
          </button>
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="btn-primary !min-h-0 !px-5 !py-2 text-sm disabled:opacity-60"
          >
            {busy ? '変更中…' : '変更する'}
          </button>
        </div>
      </form>
    </div>
  );
}
