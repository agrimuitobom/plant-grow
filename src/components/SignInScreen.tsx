import { useState } from 'react';
import { ALLOWED_EMAIL_DOMAINS, signInWithGoogle } from '../lib/firebase';

type Status = 'idle' | 'loading' | 'error';

type SignInScreenProps = {
  /** 直前のサインイン試行で拒否された場合の理由 (例: ドメイン不一致)。 */
  notice?: string | null;
};

export default function SignInScreen({ notice }: SignInScreenProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setStatus('loading');
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setStatus('idle');
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-leaf-700">🌱 植物生育管理</h1>
        <p className="mt-3 text-slate-500">
          観察記録を始めるには、Google アカウントでログインしてください。
        </p>
        {ALLOWED_EMAIL_DOMAINS.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            利用可能ドメイン: {ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(' / ')}
          </p>
        )}
        <button
          type="button"
          onClick={handleSignIn}
          disabled={status === 'loading'}
          className="btn-primary mt-6 w-full"
        >
          {status === 'loading' ? 'ログイン中…' : 'Google でログイン'}
        </button>
        {notice && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            ログインに失敗しました: {error}
          </p>
        )}
      </div>
    </div>
  );
}
