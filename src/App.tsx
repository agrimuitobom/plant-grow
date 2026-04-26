import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import DatePickerCard from './components/DatePickerCard';
import ExportCsvButton from './components/ExportCsvButton';
import GrowthChart from './components/GrowthChart';
import PhotoTimeline from './components/PhotoTimeline';
import RecordForm from './components/RecordForm';
import SignInScreen from './components/SignInScreen';
import Toast from './components/Toast';
import { signOutUser, subscribeToAuth } from './lib/firebase';
import { fetchAllRecords, toDateId, type SaveRecordResult } from './lib/records';
import type { RecordDoc, ToastMessage } from './types';

type AuthState = { status: 'loading'; user: null } | { status: 'ready'; user: User | null };

export default function App() {
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading', user: null });
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateId(new Date()));
  const [records, setRecords] = useState<RecordDoc[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    return subscribeToAuth((user) => {
      setAuthState({ status: 'ready', user });
    });
  }, []);

  const uid = authState.user?.uid;
  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      const all = await fetchAllRecords(uid);
      setRecords(all);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [uid]);

  useEffect(() => {
    if (uid) {
      reload();
    } else {
      setRecords([]);
    }
  }, [uid, reload]);

  const handleSaved = (saved: SaveRecordResult) => {
    setRecords((prev) => {
      const others = prev.filter((r) => r.date !== saved.date);
      // SaveRecordResult は averages を持つ最低限の RecordDoc 互換。
      // 監査フィールドは reload 時に取り直されるので、ここでは画面表示用の最小値で十分。
      const next: RecordDoc = {
        date: saved.date,
        strains: saved.strains,
        averages: saved.averages,
        createdBy: uid ?? '',
        updatedBy: uid ?? '',
        updatedByName: '',
      };
      return [...others, next].sort((a, b) => a.date.localeCompare(b.date));
    });
    // iPad Safari は Vibration API 非対応だが、Android タブレットや Chromebook では震える。
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(60);
    }
    setToast({
      tone: 'success',
      message: navigator.onLine
        ? `${saved.date} の記録を保存しました ✓`
        : `${saved.date} の記録を端末に保存しました（オンライン復帰時に自動同期）`,
    });
  };

  if (authState.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        読み込み中…
      </div>
    );
  }

  if (!authState.user) {
    return <SignInScreen />;
  }

  const { user } = authState;

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <header className="mx-auto mb-8 flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-leaf-700">🌱 植物生育管理</h1>
          <p className="text-sm text-slate-500">
            {user.displayName ? `${user.displayName} さんの観察記録` : 'タブレットで観察記録'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isOnline && (
            <span
              className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800"
              title="通信が切れています。入力は端末に保留され、オンライン復帰時に自動同期されます。"
            >
              ● オフライン
            </span>
          )}
          {user.photoURL && (
            <img
              src={user.photoURL}
              alt=""
              className="h-9 w-9 rounded-full ring-2 ring-leaf-100"
              referrerPolicy="no-referrer"
            />
          )}
          <span className="text-sm text-slate-600">
            {user.displayName || user.email}
          </span>
          <button type="button" onClick={() => signOutUser()} className="btn-ghost !min-h-0 !px-4 !py-2 text-sm">
            ログアウト
          </button>
        </div>
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

        <RecordForm user={user} dateId={selectedDate} onSaved={handleSaved} />

        <div className="flex justify-end">
          <ExportCsvButton
            records={records}
            ownerLabel={user.displayName || user.email || null}
          />
        </div>

        <GrowthChart records={records} />

        <PhotoTimeline records={records} />
      </main>

      <footer className="mx-auto mt-10 max-w-5xl text-center text-xs text-slate-400">
        MVP build — {new Date().getFullYear()}
      </footer>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
