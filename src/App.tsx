import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import CategoryManager from './components/CategoryManager';
import DatePickerCard from './components/DatePickerCard';
import ExportCsvButton from './components/ExportCsvButton';
import GrowthChart from './components/GrowthChart';
import PhotoTimeline from './components/PhotoTimeline';
import RecordForm from './components/RecordForm';
import RecordsList from './components/RecordsList';
import SignInScreen from './components/SignInScreen';
import TeacherDashboard from './components/TeacherDashboard';
import Toast from './components/Toast';
import {
  categorySuggestions,
  fetchRegisteredCategories,
  saveRegisteredCategories,
} from './lib/categories';
import {
  ALLOWED_EMAIL_DOMAINS,
  isEmailAllowed,
  signOutUser,
  subscribeToAuth,
} from './lib/firebase';
import { fetchAllRecords, toDateId, type SaveRecordResult } from './lib/records';
import { fetchTeacherProfile } from './lib/teacher';
import type { RecordDoc, TeacherProfile, ToastMessage } from './types';

type AuthState = { status: 'loading'; user: null } | { status: 'ready'; user: User | null };
type ViewMode = 'self' | 'teacher';

export default function App() {
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading', user: null });
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateId(new Date()));
  const [records, setRecords] = useState<RecordDoc[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile | null>(null);
  // 教員ログイン時はクラス全体ビューを既定表示にする。
  const [viewMode, setViewMode] = useState<ViewMode>('self');
  const [registeredCategories, setRegisteredCategories] = useState<string[]>([]);
  const [signInNotice, setSignInNotice] = useState<string | null>(null);

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
      // 許可ドメイン制限を超えたユーザは即座にサインアウトしてログイン画面に戻す。
      // (Auth フローではなく Auth state 側で弾くと、ポップアップ閉じ後の状態遷移にも対応できる。)
      if (user && !isEmailAllowed(user.email)) {
        const allowed = ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(' / ');
        setSignInNotice(
          `このメールアドレス (${user.email ?? '不明'}) ではログインできません。校内アカウント (${allowed}) を使ってください。`
        );
        signOutUser().catch(() => {});
        setAuthState({ status: 'ready', user: null });
        return;
      }
      if (user) setSignInNotice(null);
      setAuthState({ status: 'ready', user });
    });
  }, []);

  const uid = authState.user?.uid;

  // 教員ロール判定。失敗 (Rules で拒否される等) は生徒として扱う。
  useEffect(() => {
    if (!uid) {
      setTeacherProfile(null);
      setViewMode('self');
      return;
    }
    let cancelled = false;
    fetchTeacherProfile(uid)
      .then((p) => {
        if (cancelled) return;
        setTeacherProfile(p);
        setViewMode(p ? 'teacher' : 'self');
      })
      .catch(() => {
        if (cancelled) return;
        setTeacherProfile(null);
        setViewMode('self');
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

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

  // 登録済み品目を Firestore から取得。失敗時は空のままにしてフォームを止めない。
  useEffect(() => {
    if (!uid) {
      setRegisteredCategories([]);
      return;
    }
    let cancelled = false;
    fetchRegisteredCategories(uid)
      .then((list) => {
        if (!cancelled) setRegisteredCategories(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const usedCategoriesInRecords = useMemo(() => categorySuggestions(records), [records]);

  const persistCategories = useCallback(
    async (next: string[]): Promise<void> => {
      if (!authState.user) return;
      const saved = await saveRegisteredCategories(authState.user, next);
      setRegisteredCategories(saved);
    },
    [authState.user]
  );

  const handleAddCategoryFromRow = useCallback(
    async (name: string) => {
      if (registeredCategories.includes(name)) return;
      await persistCategories([...registeredCategories, name]);
    },
    [registeredCategories, persistCategories]
  );

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
    return <SignInScreen notice={signInNotice} />;
  }

  const user = authState.user;
  const isTeacher = teacherProfile !== null;
  const showTeacherView = isTeacher && viewMode === 'teacher';

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <header className="mx-auto mb-8 flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-leaf-700">🌱 植物生育管理</h1>
          <p className="text-sm text-slate-500">
            {isTeacher
              ? `${user.displayName ?? '先生'} (先生)`
              : user.displayName
                ? `${user.displayName} さんの観察記録`
                : 'タブレットで観察記録'}
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

      {isTeacher && (
        <div className="mx-auto mb-6 flex max-w-5xl gap-2">
          <button
            type="button"
            onClick={() => setViewMode('teacher')}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              viewMode === 'teacher'
                ? 'bg-leaf-700 text-white shadow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            aria-pressed={viewMode === 'teacher'}
          >
            👨‍🏫 クラスを見る
          </button>
          <button
            type="button"
            onClick={() => setViewMode('self')}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              viewMode === 'self'
                ? 'bg-leaf-700 text-white shadow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            aria-pressed={viewMode === 'self'}
          >
            🌱 自分の記録
          </button>
        </div>
      )}

      <main className="mx-auto flex max-w-5xl flex-col gap-6">
        {showTeacherView ? (
          <TeacherDashboard currentUid={user.uid} />
        ) : (
          <>
            {loadError && (
              <div className="card text-red-600">読み込みエラー: {loadError}</div>
            )}

            <DatePickerCard
              value={selectedDate}
              onChange={setSelectedDate}
              recordedDates={records.map((r) => r.date)}
            />

            <CategoryManager
              categories={registeredCategories}
              usedInRecords={usedCategoriesInRecords}
              onChange={persistCategories}
            />

            <RecordForm
              user={user}
              dateId={selectedDate}
              onSaved={handleSaved}
              registeredCategories={registeredCategories}
              onAddCategory={handleAddCategoryFromRow}
            />

            <div className="flex justify-end">
              <ExportCsvButton
                records={records}
                ownerLabel={user.displayName || user.email || null}
              />
            </div>

            <GrowthChart records={records} />

            <RecordsList
              records={records}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />

            <PhotoTimeline records={records} />
          </>
        )}
      </main>

      <footer className="mx-auto mt-10 max-w-5xl text-center text-xs text-slate-400">
        MVP build — {new Date().getFullYear()}
      </footer>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
