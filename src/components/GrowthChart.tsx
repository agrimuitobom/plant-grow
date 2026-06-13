import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  UNCATEGORIZED,
  dailyAveragesFor,
  uniqueCategories,
} from '../lib/categories';
import type { EventDoc, RecordDoc } from '../types';

type GrowthChartProps = {
  records: RecordDoc[];
  /**
   * 水やり / 肥料イベント。指定すると該当日にカラーリング縦線を引く。
   * 教育目的: 「水やり後 N 日で草丈が伸びた」のような因果を視覚的に提示する。
   * 天気イベントはチャートが汚くなるので意図的に含めない。
   */
  events?: EventDoc[];
};

const ALL_KEY = '__ALL__';

export default function GrowthChart({ records, events = [] }: GrowthChartProps) {
  const [selected, setSelected] = useState<string>(ALL_KEY);

  const categories = useMemo(() => uniqueCategories(records), [records]);

  // 「未分類」しかない (= 品目機能を使っていない) 場合は従来通りのシンプル表示。
  const showCategoryTabs =
    categories.length > 1 || (categories.length === 1 && categories[0] !== UNCATEGORIZED);

  // チャート X 軸に存在する日付だけマーカーを出す (グラフの外側に縦線を引いても意味がないため)。
  const eventMarkers = useMemo(() => {
    const datesOnAxis = new Set(records.map((r) => r.date));
    const water = new Set<string>();
    const fertilizer = new Set<string>();
    for (const e of events) {
      if (!datesOnAxis.has(e.date)) continue;
      if (e.type === 'water') water.add(e.date);
      else if (e.type === 'fertilizer') fertilizer.add(e.date);
    }
    return { water: [...water], fertilizer: [...fertilizer] };
  }, [events, records]);

  const data = useMemo(() => {
    const filterCategory = selected === ALL_KEY ? null : selected;
    return dailyAveragesFor(records, filterCategory).filter(
      (d) => d.height != null || d.leafCount != null
    );
  }, [records, selected]);

  if (records.length === 0) {
    return (
      <div className="card text-center text-slate-500">
        まだ記録がありません。最初の観察を入力してみましょう 🌱
      </div>
    );
  }

  return (
    <div className="card">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-leaf-700">平均値の推移</h2>
        {showCategoryTabs && (
          <span className="text-xs text-slate-500">品目で絞り込み</span>
        )}
      </header>

      {showCategoryTabs && (
        <div className="mt-3 flex flex-wrap gap-2 print:hidden">
          {[ALL_KEY, ...categories].map((key) => {
            const active = key === selected;
            const label = key === ALL_KEY ? '全体' : key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  active
                    ? 'bg-leaf-500 text-white shadow'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                aria-pressed={active}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 h-80 w-full">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-500">
            この品目のデータはまだありません。
          </div>
        ) : (
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 12 }}
                label={{ value: '草丈(cm)', angle: -90, position: 'insideLeft', fontSize: 12 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12 }}
                label={{ value: '葉(枚)', angle: 90, position: 'insideRight', fontSize: 12 }}
              />
              <Tooltip />
              <Legend />
              {/* イベントの縦線オーバーレイ。Line より前に置くと線の下に来て見やすい。 */}
              {eventMarkers.water.map((date) => (
                <ReferenceLine
                  key={`water-${date}`}
                  yAxisId="left"
                  x={date}
                  stroke="#0ea5e9"
                  strokeDasharray="3 3"
                  ifOverflow="visible"
                />
              ))}
              {eventMarkers.fertilizer.map((date) => (
                <ReferenceLine
                  key={`fert-${date}`}
                  yAxisId="left"
                  x={date}
                  stroke="#16a34a"
                  strokeDasharray="3 3"
                  ifOverflow="visible"
                />
              ))}
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="height"
                name="平均草丈 (cm)"
                stroke="#3b8f3f"
                strokeWidth={3}
                dot={{ r: 5 }}
                connectNulls
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="leafCount"
                name="平均葉枚数 (枚)"
                stroke="#8d6e63"
                strokeWidth={3}
                dot={{ r: 5 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {(eventMarkers.water.length > 0 || eventMarkers.fertilizer.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
          {eventMarkers.water.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block h-3 w-3 border-y-2 border-dashed"
                style={{ borderColor: '#0ea5e9' }}
              />
              💧 水やり ({eventMarkers.water.length} 日)
            </span>
          )}
          {eventMarkers.fertilizer.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block h-3 w-3 border-y-2 border-dashed"
                style={{ borderColor: '#16a34a' }}
              />
              🌱 肥料 ({eventMarkers.fertilizer.length} 日)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
