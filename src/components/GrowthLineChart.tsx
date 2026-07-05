import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildAxisScale,
  pickLabelIndices,
  shortDateLabel,
} from '../lib/chartScale';

export type ChartRow = {
  date: string;
  height: number | null;
  leafCount: number | null;
  classHeight: number | null;
  classLeafCount: number | null;
};

type Props = {
  rows: ChartRow[];
  waterDates: string[];
  fertilizerDates: string[];
  showClassAvg: boolean;
};

const HEIGHT_COLOR = '#3b8f3f'; // leaf-600 相当 (自分の草丈)
const LEAF_COLOR = '#8d6e63'; // soil (自分の葉枚数)
const WATER_COLOR = '#0ea5e9';
const FERT_COLOR = '#16a34a';
const GRID_COLOR = '#e2e8f0';
const TEXT_COLOR = '#64748b';

const H = 320;
const M = { top: 24, right: 48, bottom: 30, left: 48 };

/**
 * Recharts を置き換える自前の 2 軸折れ線チャート。
 *
 * この用途 (2 系列 + クラス平均 2 本 + イベント縦線 + ツールチップ) に必要な機能だけを
 * ~300 行の SVG で実装することで、バンドルから Recharts の ~385KB を丸ごと落とす。
 * 旧 iPad での初期ロードがその分軽くなる。
 *
 * 挙動は旧実装 (Recharts) を踏襲:
 * - 左軸 = 草丈 (cm) 緑、右軸 = 葉枚数 (枚) 茶
 * - null はスキップして線を繋ぐ (connectNulls)
 * - クラス平均は破線 55% 不透明・ドットなし
 * - 水やり / 肥料の日に縦破線
 */
export default function GrowthLineChart({
  rows,
  waterDates,
  fertilizerDates,
  showClassAvg,
}: Props) {
  // コンテナ幅の実測。ResizeObserver で回転・リサイズに追従する。
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const n = rows.length;
  const innerW = Math.max(10, width - M.left - M.right);
  const innerH = H - M.top - M.bottom;

  const xPos = (i: number) =>
    n <= 1 ? M.left + innerW / 2 : M.left + (i * innerW) / (n - 1);

  const { leftScale, rightScale } = useMemo(() => {
    let hMax = 0;
    let lMax = 0;
    for (const r of rows) {
      if (r.height != null) hMax = Math.max(hMax, r.height);
      if (r.leafCount != null) lMax = Math.max(lMax, r.leafCount);
      if (showClassAvg) {
        if (r.classHeight != null) hMax = Math.max(hMax, r.classHeight);
        if (r.classLeafCount != null) lMax = Math.max(lMax, r.classLeafCount);
      }
    }
    return { leftScale: buildAxisScale(hMax), rightScale: buildAxisScale(lMax) };
  }, [rows, showClassAvg]);

  const yLeft = (v: number) => M.top + innerH * (1 - v / leftScale.max);
  const yRight = (v: number) => M.top + innerH * (1 - v / rightScale.max);

  // null をスキップして残りを繋ぐ polyline 座標 (connectNulls 相当)
  const linePoints = (
    pick: (r: ChartRow) => number | null,
    y: (v: number) => number
  ): string =>
    rows
      .map((r, i) => {
        const v = pick(r);
        return v == null ? null : `${xPos(i).toFixed(1)},${y(v).toFixed(1)}`;
      })
      .filter((p): p is string => p !== null)
      .join(' ');

  const labelIndices = useMemo(() => pickLabelIndices(n), [n]);

  const dateIndex = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.date, i));
    return m;
  }, [rows]);

  // ポインタ位置から最も近いデータ点のインデックスを求める (ツールチップ用)
  const handlePointer = (e: React.PointerEvent<SVGRectElement>) => {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i =
      n <= 1 ? 0 : Math.round((x / Math.max(1, rect.width)) * (n - 1));
    setActiveIdx(Math.min(n - 1, Math.max(0, i)));
  };

  const active = activeIdx != null ? rows[activeIdx] : null;
  // ツールチップが右端で見切れないよう、後半では左に出す
  const tooltipOnLeft = activeIdx != null && n > 1 && activeIdx > n / 2;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg width={width} height={H} role="img" aria-label="草丈と葉枚数の推移グラフ">
        {/* 横グリッド + 左右の目盛りラベル (目盛り位置は左右で共通の 5 分割) */}
        {leftScale.ticks.map((tick, i) => {
          const y = yLeft(tick);
          const rightValue = rightScale.ticks[i];
          return (
            <g key={tick}>
              <line
                x1={M.left}
                x2={M.left + innerW}
                y1={y}
                y2={y}
                stroke={GRID_COLOR}
                strokeDasharray="3 3"
              />
              <text
                x={M.left - 6}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill={TEXT_COLOR}
              >
                {tick}
              </text>
              <text
                x={M.left + innerW + 6}
                y={y + 4}
                textAnchor="start"
                fontSize={11}
                fill={TEXT_COLOR}
              >
                {rightValue}
              </text>
            </g>
          );
        })}

        {/* 軸の単位 (回転ラベルより読みやすい水平配置) */}
        <text x={M.left - 6} y={14} textAnchor="end" fontSize={11} fill={HEIGHT_COLOR}>
          cm
        </text>
        <text
          x={M.left + innerW + 6}
          y={14}
          textAnchor="start"
          fontSize={11}
          fill={LEAF_COLOR}
        >
          枚
        </text>

        {/* X 軸ラベル (間引き + M/D 短縮) */}
        {rows.map((r, i) =>
          labelIndices.has(i) ? (
            <text
              key={r.date}
              x={xPos(i)}
              y={H - 10}
              textAnchor="middle"
              fontSize={10}
              fill={TEXT_COLOR}
            >
              {shortDateLabel(r.date)}
            </text>
          ) : null
        )}

        {/* イベント縦線 (水やり / 肥料) */}
        {waterDates.map((d) => {
          const i = dateIndex.get(d);
          if (i == null) return null;
          return (
            <line
              key={`w-${d}`}
              x1={xPos(i)}
              x2={xPos(i)}
              y1={M.top}
              y2={M.top + innerH}
              stroke={WATER_COLOR}
              strokeDasharray="3 3"
            />
          );
        })}
        {fertilizerDates.map((d) => {
          const i = dateIndex.get(d);
          if (i == null) return null;
          return (
            <line
              key={`f-${d}`}
              x1={xPos(i)}
              x2={xPos(i)}
              y1={M.top}
              y2={M.top + innerH}
              stroke={FERT_COLOR}
              strokeDasharray="3 3"
            />
          );
        })}

        {/* クラス平均 (破線・半透明・ドットなし)。自分の線より下に描く */}
        {showClassAvg && (
          <>
            <polyline
              points={linePoints((r) => r.classHeight, yLeft)}
              fill="none"
              stroke={HEIGHT_COLOR}
              strokeOpacity={0.55}
              strokeWidth={2}
              strokeDasharray="6 4"
            />
            <polyline
              points={linePoints((r) => r.classLeafCount, yRight)}
              fill="none"
              stroke={LEAF_COLOR}
              strokeOpacity={0.55}
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          </>
        )}

        {/* 自分の系列 (実線 + ドット) */}
        <polyline
          points={linePoints((r) => r.height, yLeft)}
          fill="none"
          stroke={HEIGHT_COLOR}
          strokeWidth={3}
        />
        <polyline
          points={linePoints((r) => r.leafCount, yRight)}
          fill="none"
          stroke={LEAF_COLOR}
          strokeWidth={3}
        />
        {rows.map((r, i) =>
          r.height != null ? (
            <circle
              key={`h-${r.date}`}
              cx={xPos(i)}
              cy={yLeft(r.height)}
              r={4}
              fill={HEIGHT_COLOR}
            />
          ) : null
        )}
        {rows.map((r, i) =>
          r.leafCount != null ? (
            <circle
              key={`l-${r.date}`}
              cx={xPos(i)}
              cy={yRight(r.leafCount)}
              r={4}
              fill={LEAF_COLOR}
            />
          ) : null
        )}

        {/* アクティブ列のハイライト */}
        {activeIdx != null && (
          <line
            x1={xPos(activeIdx)}
            x2={xPos(activeIdx)}
            y1={M.top}
            y2={M.top + innerH}
            stroke="#94a3b8"
            strokeWidth={1}
          />
        )}

        {/* ポインタ捕捉用の透明レイヤ (タップ / ホバーでツールチップ) */}
        <rect
          x={M.left}
          y={M.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={() => setActiveIdx(null)}
        />
      </svg>

      {/* ツールチップ (HTML オーバーレイ) */}
      {active && activeIdx != null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-xl bg-white/95 px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200"
          style={
            tooltipOnLeft
              ? { right: width - xPos(activeIdx) + 8 }
              : { left: xPos(activeIdx) + 8 }
          }
        >
          <div className="font-semibold text-slate-700">{active.date}</div>
          <div style={{ color: HEIGHT_COLOR }}>
            草丈: {active.height ?? '—'} cm
          </div>
          <div style={{ color: LEAF_COLOR }}>葉: {active.leafCount ?? '—'} 枚</div>
          {showClassAvg && (
            <>
              <div className="mt-1 text-slate-500">
                クラス平均 草丈: {active.classHeight ?? '—'} cm
              </div>
              <div className="text-slate-500">
                クラス平均 葉: {active.classLeafCount ?? '—'} 枚
              </div>
            </>
          )}
        </div>
      )}

      {/* 凡例 (Recharts の Legend 相当) */}
      <div className="mt-1 flex flex-wrap justify-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-0.5 w-5"
            style={{ backgroundColor: HEIGHT_COLOR }}
          />
          平均草丈 (cm)
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-0.5 w-5"
            style={{ backgroundColor: LEAF_COLOR }}
          />
          平均葉枚数 (枚)
        </span>
        {showClassAvg && (
          <>
            <span className="inline-flex items-center gap-1 opacity-70">
              <span
                aria-hidden
                className="inline-block h-0 w-5 border-t-2 border-dashed"
                style={{ borderColor: HEIGHT_COLOR }}
              />
              クラス平均 草丈
            </span>
            <span className="inline-flex items-center gap-1 opacity-70">
              <span
                aria-hidden
                className="inline-block h-0 w-5 border-t-2 border-dashed"
                style={{ borderColor: LEAF_COLOR }}
              />
              クラス平均 葉枚数
            </span>
          </>
        )}
      </div>
    </div>
  );
}
