import { useState } from 'react';
import {
  getCurrentClassId,
  setCurrentClassId,
  signInWithIdPassword,
  signUpWithIdPassword,
} from '../lib/firebase';

type Mode = 'signin' | 'signup';
type Status = 'idle' | 'loading' | 'error';

const MIN_PASSWORD = 6;

// Firebase Auth の error.code を生徒に分かる日本語に翻訳する。
function translateError(code: string | undefined): string | null {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'ID またはパスワードが違います。';
    case 'auth/email-already-in-use':
      return 'この ID はすでに使われています。別の ID にするか、サインインしてください。';
    case 'auth/weak-password':
      return `パスワードは ${MIN_PASSWORD} 文字以上にしてください。`;
    case 'auth/network-request-failed':
      return 'ネットワークに繋がりません。Wi-Fi を確認してから再度お試しください。';
    case 'auth/too-many-requests':
      return '失敗が続いたため一時的にロックされています。しばらく待ってから再度お試しください。';
    default:
      return null;
  }
}

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [id, setId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // 初回登録時のプライバシーポリシー同意。サインインモードでは不要。
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  // クラス ID。サインイン/サインアップ前に切り替える必要がある (auth email に classId が含まれるため)。
  // 初期値は localStorage から読んだ既定値。
  const [classIdInput, setClassIdInput] = useState(getCurrentClassId());
  const [showClassField, setShowClassField] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!id.trim()) {
      setError('ID を入力してください。');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`パスワードは ${MIN_PASSWORD} 文字以上にしてください。`);
      return;
    }
    if (mode === 'signup') {
      if (!displayName.trim()) {
        setError('表示名 (先生に出席を取るときに見える名前) を入力してください。');
        return;
      }
      if (password !== confirmPassword) {
        setError('パスワードが一致しません。');
        return;
      }
      if (!agreedToPolicy) {
        setError('プライバシーポリシーに同意してから登録してください。');
        return;
      }
    }

    // submit より前にクラス ID を確定させる。auth email の domain に組み込まれるため。
    setCurrentClassId(classIdInput);

    setStatus('loading');
    try {
      if (mode === 'signin') {
        await signInWithIdPassword(id, password);
      } else {
        await signUpWithIdPassword({ id, password, displayName });
      }
    } catch (e) {
      const code = (e as { code?: string })?.code;
      const msg =
        translateError(code) ?? (e instanceof Error ? e.message : String(e));
      setError(msg);
      setStatus('error');
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setStatus('idle');
    setConfirmPassword('');
    setDisplayName('');
    setAgreedToPolicy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="card w-full max-w-md">
        <h1 className="text-3xl font-bold text-leaf-700 text-center">🌱 植物生育管理</h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          {mode === 'signin' ? 'ID とパスワードでログイン' : '初回登録'}
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === 'signin'
                ? 'bg-leaf-500 text-white shadow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            aria-pressed={mode === 'signin'}
          >
            ログイン
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === 'signup'
                ? 'bg-leaf-500 text-white shadow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            aria-pressed={mode === 'signup'}
          >
            初回登録
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-500">
              ID (例: 3a-15)
            </label>
            <input
              type="text"
              inputMode="text"
              autoComplete="username"
              autoCapitalize="off"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="先生から指示された ID"
              required
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-slate-500">
                表示名 (名前)
              </label>
              <input
                type="text"
                inputMode="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例: 田中"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-500">
              パスワード
            </label>
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`${MIN_PASSWORD} 文字以上`}
              minLength={MIN_PASSWORD}
              required
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-slate-500">
                パスワード (確認)
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="もう一度入力"
                minLength={MIN_PASSWORD}
                required
              />
            </div>
          )}

          {mode === 'signup' && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={agreedToPolicy}
                onChange={(e) => setAgreedToPolicy(e.target.checked)}
                className="mt-1 h-5 w-5 flex-shrink-0"
              />
              <span>
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-leaf-700 underline"
                >
                  プライバシーポリシー
                </a>
                を読み、同意します。
              </span>
            </label>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={status === 'loading'}
          >
            {status === 'loading'
              ? '処理中…'
              : mode === 'signin'
                ? 'ログイン'
                : '登録してログイン'}
          </button>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          {mode === 'signin'
            ? 'まだ ID を作っていない場合は「初回登録」を選択。'
            : 'すでに ID を持っている場合は「ログイン」を選択。'}
        </p>

        {/* クラス切替: 通常は隠してあるが、新クラスに移るときや別クラスにログインするときに使う。
            現在の classId は同時に下に小さく表示しておく。 */}
        <div className="mt-3 text-center text-xs text-slate-400">
          <span>クラス: {classIdInput}</span>
          <button
            type="button"
            onClick={() => setShowClassField((v) => !v)}
            className="ml-2 text-leaf-700 underline"
          >
            {showClassField ? '閉じる' : '変更'}
          </button>
        </div>
        {showClassField && (
          <div className="mt-2">
            <label className="block text-xs text-slate-500">クラス ID</label>
            <input
              type="text"
              value={classIdInput}
              onChange={(e) => setClassIdInput(e.target.value)}
              placeholder="例: class-demo, 2027-grade3a"
              autoCapitalize="off"
            />
            <p className="mt-1 text-xs text-slate-400">
              ※ 同じ ID + パスワードでも、クラスが違うと別アカウントになります。先生に確認してください。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
