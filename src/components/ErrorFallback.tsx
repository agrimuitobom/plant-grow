type Props = {
  error: unknown;
  resetError: () => void;
};

/**
 * React コンポーネントツリーで未捕捉エラーが発生した時の最後の砦。
 * 白画面のままにせず、リロード導線とエラー概要を出す。
 */
export default function ErrorFallback({ error, resetError }: Props) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="card w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-red-600">⚠️ エラーが発生しました</h1>
        <p className="mt-3 text-sm text-slate-500">
          画面の表示中に問題が起きました。下のボタンで再読み込みすると直る場合があります。
          繰り返し起きるときは先生に伝えてください。
        </p>
        <pre className="mt-4 max-h-32 overflow-y-auto rounded-xl bg-slate-50 px-3 py-2 text-left text-xs text-slate-600">
          {message}
        </pre>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={resetError} className="btn-secondary">
            もう一度試す
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            ページを再読み込み
          </button>
        </div>
      </div>
    </div>
  );
}
