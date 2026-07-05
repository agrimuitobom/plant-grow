/**
 * チャートの軸目盛り計算。GrowthLineChart (自前 SVG チャート) が使う純粋関数群。
 * Recharts を置き換えるにあたり、視覚品質を左右する目盛りの「キリの良さ」だけは
 * ちゃんとテストで固定しておく。
 */

/**
 * v 以上で最も近い「キリの良い」ステップ幅を返す。
 * 1, 2, 2.5, 5 × 10^n の系列から選ぶ (2.5 は cm の目盛りとして自然なので含める)。
 */
export function niceStep(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const frac = v / pow;
  const step = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  return step * pow;
}

export type AxisScale = {
  /** 軸の最大値 (= ticks の最終値)。最小値は常に 0。 */
  max: number;
  /** 0 を含む昇順の目盛り値。 */
  ticks: number[];
};

/**
 * データ最大値から軸スケールを作る。
 * 常に 0 起点・目盛り 5 本 (0 を含む)・データが必ず収まる max を返す。
 * データが空 / 全て 0 以下の場合は 0-10 のダミースケール。
 */
export function buildAxisScale(dataMax: number): AxisScale {
  if (!Number.isFinite(dataMax) || dataMax <= 0) {
    return { max: 10, ticks: [0, 2.5, 5, 7.5, 10] };
  }
  const step = niceStep(dataMax / 4);
  const max = step * 4 >= dataMax ? step * 4 : niceStep(dataMax / 4 + step) * 4;
  const ticks = [0, 1, 2, 3, 4].map((i) => {
    // 2.5 系のステップで浮動小数ゴミが出ないよう丸める
    const v = step * i;
    return Number(v.toFixed(4));
  });
  // max が step*4 と一致しないケース (再計算パス) では ticks を作り直す
  if (max !== step * 4) {
    const step2 = max / 4;
    return {
      max,
      ticks: [0, 1, 2, 3, 4].map((i) => Number((step2 * i).toFixed(4))),
    };
  }
  return { max, ticks };
}

/**
 * X 軸ラベルの間引き。n 点を最大 maxLabels 個までに絞ったインデックス集合を返す。
 * 最初と最後の点は必ず含める (期間の端が分かるように)。
 */
export function pickLabelIndices(n: number, maxLabels = 8): Set<number> {
  const out = new Set<number>();
  if (n <= 0) return out;
  if (n <= maxLabels) {
    for (let i = 0; i < n; i++) out.add(i);
    return out;
  }
  const stride = Math.ceil(n / maxLabels);
  for (let i = 0; i < n; i += stride) out.add(i);
  out.add(n - 1);
  return out;
}

/** "YYYY-MM-DD" → "M/D" の短縮表示。パースできない文字列はそのまま返す。 */
export function shortDateLabel(dateId: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(dateId);
  if (!m) return dateId;
  return `${Number(m[1])}/${Number(m[2])}`;
}
