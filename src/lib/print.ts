/**
 * ポートフォリオを印刷 (または PDF として保存) するヘルパ。
 * App.tsx で lazy 化したコンポーネントを先にプリロード → React の再描画を 1〜2 フレーム待って
 * → window.print() を呼ぶことで、Suspense のフォールバックが紙面に出るのを避ける。
 */
export async function printPortfolio(): Promise<void> {
  await Promise.all([
    import('../components/GrowthChart'),
    import('../components/PhotoTimeline'),
    import('../components/CommentBoard'),
  ]);
  // React に Suspense 解除後の再描画を完了させる時間を渡す。
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  window.print();
}
