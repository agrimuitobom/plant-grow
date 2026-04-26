import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
import type { RecordDoc } from '../types';

type GrowthChartProps = {
  records: RecordDoc[];
};

const ALL_KEY = '__ALL__';

export default function GrowthChart({ records }: GrowthChartProps) {
  const [selected, setSelected] = useState<string>(ALL_KEY);

  const categories = useMemo(() => uniqueCategories(records), [records]);

  // 「未分類」しかない (= 品目機能を使っていない) 場合は従来通りのシンプル表示。
  const showCategoryTabs =
    categories.length > 1 || (categories.length === 1 && categories[0] !== UNCATEGORIZED);

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
        <div className="mt-3 flex flex-wrap gap-2">
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
    </div>
  );
}
