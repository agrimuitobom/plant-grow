import React, { useCallback, useEffect, useState } from 'react';
import DatePickerCard from './components/DatePickerCard';
import GrowthChart from './components/GrowthChart';
import RecordForm from './components/RecordForm';
import { authReady } from './lib/firebase';
import { fetchAllRecords, toDateId } from './lib/records';

export default function App() {
  const [selectedDate, setSelectedDate] = useState(() => toDateId(new Date()));
  const [records, setRecords] = useState([]);
  const [loadError, setLoadError] = useState(null);

  const reload = useCallback(async () => {
    try {
      await authReady;
      const all = await fetchAllRecords();
      setRecords(all);
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSaved = (saved) => {
    setRecords((prev) => {
      const others = prev.filter((r) => r.date !== saved.date);
      return [...others, saved].sort((a, b) => a.date.localeCompare(b.date));
    });
  };

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <header className="mx-auto mb-8 flex max-w-5xl items-center justify-between">
        <h1 className="text-3xl font-bold text-leaf-700">🌱 植物生育管理</h1>
        <p className="text-sm text-slate-500">タブレットで観察記録</p>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6">
        {loadError && (
          <div className="card text-red-600">読み込みエラー: {loadError}</div>
        )}

        <DatePickerCard
          value={selectedDate}
          onChange={setSelectedDate}
          recordedDates={records.map((r) => r.date)}
        />

        <RecordForm dateId={selectedDate} onSaved={handleSaved} />

        <GrowthChart records={records} />
      </main>

      <footer className="mx-auto mt-10 max-w-5xl text-center text-xs text-slate-400">
        MVP build — {new Date().getFullYear()}
      </footer>
    </div>
  );
}
