import React, { useState } from 'react';
import { signInWithGoogle } from '../lib/firebase';

export default function SignInScreen() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const handleSignIn = async () => {
    setStatus('loading');
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') {
        setStatus('idle');
        return;
      }
      setError(e.message);
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
        <button
          type="button"
          onClick={handleSignIn}
          disabled={status === 'loading'}
          className="btn-primary mt-6 w-full"
        >
          {status === 'loading' ? 'ログイン中…' : 'Google でログイン'}
        </button>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            ログインに失敗しました: {error}
          </p>
        )}
      </div>
    </div>
  );
}
