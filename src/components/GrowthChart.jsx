import React from 'react';
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

export default function GrowthChart({ records }) {
  const data = records
    .filter((r) => r.averages)
    .map((r) => ({
      date: r.date,
      height: r.averages.height,
      leafCount: r.averages.leafCount,
    }));

  if (!data.length) {
    return (
      <div className="card text-center text-slate-500">
        まだ記録がありません。最初の観察を入力してみましょう 🌱
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-xl font-bold text-leaf-700">平均値の推移</h2>
      <div className="mt-4 h-80 w-full">
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
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="leafCount"
              name="平均葉枚数 (枚)"
              stroke="#8d6e63"
              strokeWidth={3}
              dot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
