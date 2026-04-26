import { useEffect, useState } from 'react';
import ExportCsvButton from './ExportCsvButton';
import GrowthChart from './GrowthChart';
import PhotoTimeline from './PhotoTimeline';
import RecordsList from './RecordsList';
import { fetchAllRecords } from '../lib/records';
import { listClassRoster } from '../lib/teacher';
import type { RecordDoc, RosterEntry } from '../types';

type RosterStatus = 'loading' | 'ready' | 'error';
type StudentStatus = 'idle' | 'loading' | 'ready' | 'error';

function formatLastActive(entry: RosterEntry): string {
  const v = entry.lastRecordedAt as { toDate?: () => Date } | undefined;
  if (!v?.toDate) return '記録なし';
  const d = v.toDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function TeacherDashboard() {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterStatus, setRosterStatus] = useState<RosterStatus>('loading');
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [selected, setSelected] = useState<RosterEntry | null>(null);
  const [records, setRecords] = useState<RecordDoc[]>([]);
  const [studentStatus, setStudentStatus] = useState<StudentStatus>('idle');
  const [studentError, setStudentError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRosterStatus('loading');
    listClassRoster()
      .then((list) => {
        if (cancelled) return;
        setRoster(list);
        setRosterStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setRosterError(e instanceof Error ? e.message : String(e));
        setRosterStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setStudentStatus('loading');
    setStudentError(null);
    fetchAllRecords(selected.uid)
      .then((list) => {
        if (cancelled) return;
        setRecords(list);
        setStudentStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStudentError(e instanceof Error ? e.message : String(e));
        setStudentStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (rosterStatus === 'loading') {
    return <div className="card text-slate-500">クラス名簿を読み込み中…</div>;
  }
  if (rosterStatus === 'error') {
    return (
      <div className="card text-red-600">
        クラス名簿を取得できませんでした: {rosterError}
      </div>
    );
  }

  if (selected) {
    return (
      <div className="flex flex-col gap-6">
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setRecords([]);
                setStudentStatus('idle');
              }}
              className="text-sm text-leaf-700 underline"
            >
              ← クラス一覧に戻る
            </button>
            <h2 className="mt-2 text-2xl font-bold text-leaf-700">
              {selected.displayName}
            </h2>
            {selected.email && (
              <p className="text-sm text-slate-500">{selected.email}</p>
            )}
          </div>
          <ExportCsvButton records={records} ownerLabel={selected.displayName} />
        </div>

        {studentStatus === 'loading' && (
          <div className="card text-slate-500">記録を読み込み中…</div>
        )}
        {studentStatus === 'error' && (
          <div className="card text-red-600">読み込みエラー: {studentError}</div>
        )}
        {studentStatus === 'ready' && records.length === 0 && (
          <div className="card text-center text-slate-500">
            この生徒はまだ記録を保存していません。
          </div>
        )}
        {studentStatus === 'ready' && records.length > 0 && (
          <>
            <GrowthChart records={records} />
            <RecordsList records={records} />
            <PhotoTimeline records={records} />
          </>
        )}
      </div>
    );
  }

  return (
    <section className="card">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-leaf-700">クラスの生徒</h2>
        <span className="text-xs text-slate-500">{roster.length} 名</span>
      </header>

      {roster.length === 0 ? (
        <p className="mt-4 text-slate-500">
          まだ記録を保存した生徒がいません。生徒が観察を保存すると一覧に表示されます。
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roster.map((s) => (
            <li key={s.uid}>
              <button
                type="button"
                onClick={() => setSelected(s)}
                className="flex w-full flex-col rounded-2xl bg-white p-4 text-left ring-1 ring-slate-100 transition hover:ring-leaf-500"
              >
                <span className="text-base font-semibold text-slate-700">
                  {s.displayName}
                </span>
                {s.email && (
                  <span className="mt-0.5 truncate text-xs text-slate-500">{s.email}</span>
                )}
                <span className="mt-2 text-xs text-slate-400">
                  最終記録: {formatLastActive(s)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
