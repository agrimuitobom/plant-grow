import { useCallback, useEffect, useState } from 'react';
import ExportCsvButton from './ExportCsvButton';
import GrowthChart from './GrowthChart';
import PhotoTimeline from './PhotoTimeline';
import RecordsList from './RecordsList';
import { fetchAllRecords } from '../lib/records';
import {
  demoteTeacher,
  listClassRoster,
  listTeachers,
  promoteToTeacher,
} from '../lib/teacher';
import type { RecordDoc, RosterEntry, TeacherProfile } from '../types';

type RosterStatus = 'loading' | 'ready' | 'error';
type StudentStatus = 'idle' | 'loading' | 'ready' | 'error';
type TeachersStatus = 'idle' | 'loading' | 'ready' | 'error';
type Tab = 'students' | 'teachers';

type Props = {
  /** 自分自身を解除させないために必要。 */
  currentUid: string;
};

function formatLastActive(entry: RosterEntry): string {
  const v = entry.lastRecordedAt as { toDate?: () => Date } | undefined;
  if (!v?.toDate) return '記録なし';
  const d = v.toDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function TeacherDashboard({ currentUid }: Props) {
  const [tab, setTab] = useState<Tab>('students');

  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterStatus, setRosterStatus] = useState<RosterStatus>('loading');
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [teachersStatus, setTeachersStatus] = useState<TeachersStatus>('idle');
  const [teachersError, setTeachersError] = useState<string | null>(null);

  const [selected, setSelected] = useState<RosterEntry | null>(null);
  const [records, setRecords] = useState<RecordDoc[]>([]);
  const [studentStatus, setStudentStatus] = useState<StudentStatus>('idle');
  const [studentError, setStudentError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  const reloadRoster = useCallback(async () => {
    setRosterStatus('loading');
    try {
      const list = await listClassRoster();
      setRoster(list);
      setRosterStatus('ready');
    } catch (e: unknown) {
      setRosterError(e instanceof Error ? e.message : String(e));
      setRosterStatus('error');
    }
  }, []);

  const reloadTeachers = useCallback(async () => {
    setTeachersStatus('loading');
    try {
      const list = await listTeachers();
      setTeachers(list);
      setTeachersStatus('ready');
    } catch (e: unknown) {
      setTeachersError(e instanceof Error ? e.message : String(e));
      setTeachersStatus('error');
    }
  }, []);

  useEffect(() => {
    void reloadRoster();
  }, [reloadRoster]);

  useEffect(() => {
    if (tab === 'teachers') {
      void reloadTeachers();
    }
  }, [tab, reloadTeachers]);

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

  const handlePromote = async (entry: RosterEntry) => {
    if (!confirm(`${entry.displayName} さんを教員に昇格させますか?`)) return;
    setBusy(true);
    try {
      await promoteToTeacher({
        uid: entry.uid,
        displayName: entry.displayName,
        email: entry.email,
      });
      await reloadTeachers();
    } catch (e: unknown) {
      alert('教員に昇格できませんでした: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleDemote = async (t: TeacherProfile) => {
    if (!confirm(`${t.displayName} さんの教員ロールを解除しますか?`)) return;
    setBusy(true);
    try {
      await demoteTeacher(t.uid);
      await reloadTeachers();
    } catch (e: unknown) {
      alert('解除できませんでした: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  // 生徒の詳細ビュー (タブを跨いでも表示できる)。
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
              ← 一覧に戻る
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

  const teacherUids = new Set(teachers.map((t) => t.uid));
  const promotable = roster.filter((s) => !teacherUids.has(s.uid));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('students')}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            tab === 'students'
              ? 'bg-leaf-500 text-white shadow'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          aria-pressed={tab === 'students'}
        >
          生徒一覧
        </button>
        <button
          type="button"
          onClick={() => setTab('teachers')}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            tab === 'teachers'
              ? 'bg-leaf-500 text-white shadow'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          aria-pressed={tab === 'teachers'}
        >
          教員管理
        </button>
      </div>

      {tab === 'students' && (
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
      )}

      {tab === 'teachers' && (
        <>
          <section className="card">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold text-leaf-700">現在の教員</h2>
              <span className="text-xs text-slate-500">{teachers.length} 名</span>
            </header>

            {teachersStatus === 'loading' && (
              <p className="mt-4 text-slate-500">読み込み中…</p>
            )}
            {teachersStatus === 'error' && (
              <p className="mt-4 text-red-600">取得できませんでした: {teachersError}</p>
            )}
            {teachersStatus === 'ready' && teachers.length === 0 && (
              <p className="mt-4 text-slate-500">教員が登録されていません。</p>
            )}
            {teachersStatus === 'ready' && teachers.length > 0 && (
              <ul className="mt-4 flex flex-col divide-y divide-slate-100">
                {teachers.map((t) => {
                  const isSelf = t.uid === currentUid;
                  return (
                    <li
                      key={t.uid}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <div>
                        <span className="font-semibold text-slate-700">{t.displayName}</span>
                        {isSelf && (
                          <span className="ml-2 rounded-full bg-leaf-100 px-2 py-0.5 text-xs text-leaf-700">
                            自分
                          </span>
                        )}
                        {t.email && (
                          <p className="text-xs text-slate-500">{t.email}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDemote(t)}
                        disabled={busy || isSelf}
                        className="text-sm text-red-600 underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
                        title={isSelf ? '自分自身は解除できません' : ''}
                      >
                        教員から外す
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold text-leaf-700">教員に昇格できる生徒</h2>
              <span className="text-xs text-slate-500">{promotable.length} 名</span>
            </header>
            <p className="mt-2 text-sm text-slate-500">
              生徒として一度ログインして観察を保存した人が候補に並びます。
            </p>

            {promotable.length === 0 ? (
              <p className="mt-4 text-slate-500">該当者がいません。</p>
            ) : (
              <ul className="mt-4 flex flex-col divide-y divide-slate-100">
                {promotable.map((s) => (
                  <li
                    key={s.uid}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div>
                      <span className="font-semibold text-slate-700">
                        {s.displayName}
                      </span>
                      {s.email && (
                        <p className="text-xs text-slate-500">{s.email}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePromote(s)}
                      disabled={busy}
                      className="btn-secondary !min-h-0 !px-3 !py-2 text-sm disabled:opacity-40"
                    >
                      教員にする
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
