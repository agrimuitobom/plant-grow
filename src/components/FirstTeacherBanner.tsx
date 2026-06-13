import { useState } from 'react';
import { claimFirstTeacher, translateClaimError } from '../lib/firstTeacher';

type Props = {
  /** 登録完了後、親側で teacherProfile を再フェッチして UI を切り替える。 */
  onClaimed: () => void | Promise<void>;
};

type Status = 'idle' | 'submitting' | 'error';

/**
 * クラスに教員が 0 人の時だけ表示される初期セットアップ用バナー。
 * 教員になりたい人 (= 開発者 / 担任) がログイン後にここを押すと、Cloud Function 経由で
 * teachers/{自分のuid} が作られて教員モードが解放される。
 */
export default function FirstTeacherBanner({ onClaimed }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleClaim = async () => {
    if (!confirm('このアカウントを「最初の教員」として登録します。よろしいですか?')) {
      return;
    }
    setStatus('submitting');
    setError(null);
    try {
      await claimFirstTeacher();
      await onClaimed();
      // 成功時は親側で UI が切り替わるのでローカル状態は idle に戻すだけで OK
      setStatus('idle');
    } catch (e) {
      setError(translateClaimError(e));
      setStatus('error');
    }
  };

  return (
    <section className="card border-2 border-amber-400 bg-amber-50">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-amber-900">🔧 初期セットアップ</h2>
        <span className="text-xs text-amber-800">教員未登録のクラスです</span>
      </header>

      <p className="mt-3 text-sm text-amber-900">
        このクラスにはまだ「教員」アカウントが登録されていません。
        <strong>あなたが先生のアカウント</strong> でログインしているなら、下のボタンで自分を最初の教員として登録できます。
        生徒のアカウントで登録しないよう注意してください
        （登録後にクラスの全生徒の記録が見られるようになります）。
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-amber-800">
          ※ 1 回限り。2 人目以降は教員ダッシュボードの「教員管理」から追加できます。
        </p>
        <button
          type="button"
          onClick={() => void handleClaim()}
          disabled={status === 'submitting'}
          className="btn-primary !min-h-0 !px-4 !py-2 text-sm disabled:opacity-40"
        >
          {status === 'submitting' ? '登録中…' : '最初の教員として登録する'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
