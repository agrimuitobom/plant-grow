import { useEffect, useState } from 'react';

type Props = {
  onClose: () => void;
};

type Step = {
  emoji: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    emoji: '🌱',
    title: 'ようこそ!',
    body: '毎日の観察 (草丈・葉の数・写真・メモ) をこのアプリに記録します。フォームに入力して「保存する」を押すだけ。株ごとに写真は何枚でも OK。',
  },
  {
    emoji: '💧',
    title: '水やりや天気もワンタップ',
    body: '「観察イベント」のボタンで水やり・肥料・天気を記録できます。あとでグラフに水やりの日が線で出るので、成長との関係が見えてきます。',
  },
  {
    emoji: '📈',
    title: '成長をふりかえろう',
    body: 'グラフと記録一覧で今までの成長が見えます。「クラス平均を重ねる」で自分とみんなの比較も。先生からコメントが届いたら画面下にお知らせが出ます。',
  },
  {
    emoji: '📴',
    title: 'オフラインでも使える',
    body: '一度オンラインで開いておけば、電波のない場所でも記録できます。書いた内容は次にオンラインになったとき自動で保存されます。',
  },
];

/**
 * 初回ログイン後に 1 度だけ表示する使い方ツアー。
 * 表示済みフラグは App 側 (localStorage) が管理し、フッターの「使い方」からいつでも再表示できる。
 * 新しい生徒・新しい先生が毎年 4 月に入ってくるため、口頭説明のコストを恒久的に減らすのが狙い。
 */
export default function OnboardingTour({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step]!;

  // Escape でスキップできるように (キーボード利用者向け)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="アプリの使い方"
    >
      <div className="card w-full max-w-md text-center">
        <div className="text-5xl" aria-hidden>
          {current.emoji}
        </div>
        <h2 className="mt-3 text-xl font-bold text-leaf-700">{current.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{current.body}</p>

        {/* 進捗ドット */}
        <div className="mt-4 flex justify-center gap-2" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full ${
                i === step ? 'bg-leaf-500' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
        <p className="sr-only">
          ステップ {step + 1} / {STEPS.length}
        </p>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-500 underline"
          >
            スキップ
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="btn-ghost !min-h-0 !px-4 !py-2 text-sm"
              >
                戻る
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={() => (isLast ? onClose() : setStep((s) => s + 1))}
              className="btn-primary !min-h-0 !px-5 !py-2 text-sm"
            >
              {isLast ? 'はじめる 🌱' : '次へ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
