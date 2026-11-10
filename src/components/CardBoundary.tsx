import { Component, type ReactNode } from 'react';
import { captureSilent } from '../lib/monitoring';

type Props = {
  /** カードの名前 (「グラフ」「コメント」など)。エラー表示に使う。 */
  label: string;
  children: ReactNode;
};

type State = { failed: boolean };

/**
 * カード単位のエラー境界。
 *
 * グラフ・写真アルバム・コメントなどは遅延読み込みなので、電波の悪い教室や
 * デプロイ直後 (古いチャンクが消えた直後) には読み込みに失敗することがある。
 * 境界が無いとその 1 枚の失敗でアプリ全体がエラー画面になり、入力中の観察記録まで
 * 巻き込まれる。ここで受け止めて、失敗したカードだけを案内表示に置き換える。
 */
export default class CardBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    captureSilent(error, { card: this.props.label });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="card text-sm text-slate-600 print:hidden">
        <p className="font-semibold text-slate-700">
          {this.props.label}を表示できませんでした
        </p>
        <p className="mt-1">
          通信が不安定な可能性があります。記録の入力と保存はそのまま続けられます。
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-ghost mt-3 !min-h-0 !px-4 !py-2 text-sm"
        >
          ページを再読み込み
        </button>
      </div>
    );
  }
}
