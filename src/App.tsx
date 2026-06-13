import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import CategoryManager from './components/CategoryManager';
import DatePickerCard from './components/DatePickerCard';
import ExportCsvButton from './components/ExportCsvButton';
import FirstTeacherBanner from './components/FirstTeacherBanner';
import RecordForm from './components/RecordForm';
import RecordsList from './components/RecordsList';
import SignInScreen from './components/SignInScreen';
import Toast from './components/Toast';

// バンドル分割: 初期表示には不要な重い依存 (Recharts や CommentBoard の
// Firestore クエリ) を Lazy 化してフォーム表示までを軽くする。
const GrowthChart = lazy(() => import('./components/GrowthChart'));
const PhotoTimeline = lazy(() => import('./components/PhotoTimeline'));
const CommentBoard = lazy(() => import('./components/CommentBoard'));
const EventLog = lazy(() => import('./components/EventLog'));
const TeacherDashboard = lazy(() => import('./components/TeacherDashboard'));

const CardFallback = ({ label }: { label: string }) => (
  <div className="card text-slate-400">{label} を読み込み中…</div>
);
import {
  categorySuggestions,
  fetchRegisteredCategories,
  saveRegisteredCategories,
} from './lib/categories';
import { markAllCommentsRead } from './lib/comments';
import { subscribeToEvents } from './lib/events';
import { signOutUser, subscribeToAuth } from './lib/firebase';
import { classHasNoTeachers } from './lib/firstTeacher';
import { printPortfolio } from './lib/print';
import {
  rosterDoc,
  subscribeToRecords,
  toDateId,
  type SaveRecordResult,
} from './lib/records';
import { fetchTeacherProfile } from './lib/teacher';
import type {
  EventDoc,
  RecordDoc,
  RosterEntry,
  TeacherProfile,
  ToastMessage,
} from './types';
import { getDoc } from 'firebase/firestore';

type AuthState = { status: 'loading'; user: null } | { status: 'ready'; user: User | null };
type ViewMode = 'self' | 'teacher';

export default function App() {
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading', user: null });
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateId(new Date()));
  const [records, setRecords] = useState<RecordDoc[]>([]);
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile | null>(null);
  // 教員ログイン時はクラス全体ビューを既定表示にする。
  const [viewMode, setViewMode] = useState<ViewMode>('self');
  // クラスに教員が 1 人もいない時のみ true。FirstTeacherBanner の表示制御に使う。
  const [needsFirstTeacher, setNeedsFirstTeacher] = useState(false);
  const [registeredCategories, setRegisteredCategories] = useState<string[]>([]);
  // 未読コメントの計算用: ロード時に名簿の commentsLastReadAt をミリ秒で取り込む。
  // 既読化したら setLastReadMs(Date.now()) で楽観更新 → サーバ書き込み。
  const [lastReadMs, setLastReadMs] = useState<number>(0);
  const [unreadComments, setUnreadComments] = useState(0);

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

  // 教員ロール判定 + 初期セットアップ要否判定。失敗 (Rules で拒否される等) は生徒として扱う。
  const refreshRoleState = useCallback(async (currentUid: string) => {
    try {
      const p = await fetchTeacherProfile(currentUid);
      setTeacherProfile(p);
      if (p) {
        setViewMode('teacher');
        setNeedsFirstTeacher(false);
        return;
      }
      setViewMode('self');
      // 自分が教員でない時だけ「教員 0 人」のチェックを走らせる。
      // 教員ならどのみち表示しないので無駄なフェッチを避ける。
      try {
        const empty = await classHasNoTeachers();
        setNeedsFirstTeacher(empty);
      } catch {
        setNeedsFirstTeacher(false);
      }
    } catch {
      setTeacherProfile(null);
      setViewMode('self');
      setNeedsFirstTeacher(false);
    }
  }, []);

  useEffect(() => {
    if (!uid) {
      setTeacherProfile(null);
      setViewMode('self');
      setNeedsFirstTeacher(false);
      return;
    }
    let cancelled = false;
    void refreshRoleState(uid).then(() => {
      // cancelled なら何もしない (setState を空打ちしてもいいが念のため)
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [uid, refreshRoleState]);

  // 生徒自身の全レコードを購読。保存直後はローカルキャッシュから即座に snapshot が
  // 発火するので、楽観更新を手で書かなくても UI が「保存した瞬間に伸びる」。
  useEffect(() => {
    if (!uid) {
      setRecords([]);
      setEvents([]);
      return;
    }
    const unsubRecords = subscribeToRecords(
      uid,
      (all) => {
        setRecords(all);
        setLoadError(null);
      },
      (e) => setLoadError(e.message)
    );
    // 観察イベント (水やり / 肥料 / 天気) も並行購読
    const unsubEvents = subscribeToEvents(
      uid,
      (all) => setEvents(all),
      () => {}
    );
    return () => {
      unsubRecords();
      unsubEvents();
    };
  }, [uid]);

  // 登録済み品目を Firestore から取得。失敗時は空のままにしてフォームを止めない。
  useEffect(() => {
    if (!uid) {
      setRegisteredCategories([]);
      setLastReadMs(0);
      setUnreadComments(0);
      return;
    }
    let cancelled = false;
    fetchRegisteredCategories(uid)
      .then((list) => {
        if (!cancelled) setRegisteredCategories(list);
      })
      .catch(() => {});
    // 名簿の commentsLastReadAt を 1 回フェッチ。以降は楽観更新で済ませる
    // (1 ユーザが複数端末同時に開いた時のみ若干ずれるが、画面リロードで解消)。
    getDoc(rosterDoc(uid))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const data = snap.data() as RosterEntry;
        const v = data.commentsLastReadAt as { toMillis?: () => number } | undefined;
        setLastReadMs(typeof v?.toMillis === 'function' ? v.toMillis() : 0);
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
    // records 配列は subscribeToRecords が Firestore のローカルキャッシュ書き込みを
    // 受けて自動更新するので、ここで手動 setRecords する必要はない (二重描画になるだけ)。
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

  const user = authState.user;
  const isTeacher = teacherProfile !== null;
  const showTeacherView = isTeacher && viewMode === 'teacher';

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <header className="mx-auto mb-8 flex max-w-5xl flex-wrap items-center justify-between gap-3 print:hidden">
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
        <div className="mx-auto mb-6 flex max-w-5xl gap-2 print:hidden">
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
        {/* 教員 0 人のクラスでは、最初に「自分が教員になる」バナーを表示する。
            生徒が押したら本物の事故になるので、休日や運用開始前など人がいないタイミングで使う想定。 */}
        {needsFirstTeacher && !isTeacher && (
          <FirstTeacherBanner onClaimed={() => refreshRoleState(user.uid)} />
        )}

        {showTeacherView ? (
          <Suspense fallback={<CardFallback label="教員ダッシュボード" />}>
            <TeacherDashboard
              currentUid={user.uid}
              currentDisplayName={user.displayName || user.email || user.uid}
            />
          </Suspense>
        ) : (
          <>
            {/* 印刷時のみ表示する見出し: 生徒名と観察期間 */}
            <div className="hidden print:block">
              <h1 className="text-2xl font-bold text-leaf-700">
                {(user.displayName || user.email || user.uid)} さんの観察ポートフォリオ
              </h1>
              {records.length > 0 && (
                <p className="mt-1 text-sm text-slate-600">
                  {records[0].date} 〜 {records[records.length - 1].date} ({records.length} 日分)
                </p>
              )}
            </div>

            {loadError && (
              <div className="card text-red-600 print:hidden">読み込みエラー: {loadError}</div>
            )}

            <div className="print:hidden">
              <DatePickerCard
                value={selectedDate}
                onChange={setSelectedDate}
                recordedDates={records.map((r) => r.date)}
              />
            </div>

            <div className="print:hidden">
              <CategoryManager
                categories={registeredCategories}
                usedInRecords={usedCategoriesInRecords}
                onChange={persistCategories}
              />
            </div>

            <div className="print:hidden">
              <RecordForm
                user={user}
                dateId={selectedDate}
                onSaved={handleSaved}
                registeredCategories={registeredCategories}
                onAddCategory={handleAddCategoryFromRow}
                records={records}
              />
            </div>

            <Suspense fallback={<CardFallback label="観察イベント" />}>
              <EventLog
                studentUid={user.uid}
                dateId={selectedDate}
                events={events}
                poster={user}
              />
            </Suspense>

            <div className="flex justify-end gap-2 print:hidden">
              <ExportCsvButton
                records={records}
                ownerLabel={user.displayName || user.email || null}
              />
              <button
                type="button"
                onClick={() => void printPortfolio()}
                disabled={records.length === 0}
                className="btn-ghost !min-h-0 !px-4 !py-2 text-sm disabled:opacity-40"
                title="グラフ・記録・写真・コメントをまとめて印刷します。ブラウザの印刷ダイアログから「PDF として保存」も可能。"
              >
                🖨️ 印刷 / PDF
              </button>
            </div>

            <Suspense fallback={<CardFallback label="グラフ" />}>
              <GrowthChart records={records} />
            </Suspense>

            <RecordsList
              records={records}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />

            <Suspense fallback={<CardFallback label="写真アルバム" />}>
              <PhotoTimeline records={records} />
            </Suspense>

            {records.length > 0 && (
              <Suspense fallback={<CardFallback label="コメント" />}>
                <CommentBoard
                  studentUid={user.uid}
                  records={records}
                  viewer={{
                    uid: user.uid,
                    lastReadAt: { toMillis: () => lastReadMs },
                  }}
                  onUnreadCountChange={setUnreadComments}
                />
              </Suspense>
            )}
          </>
        )}
      </main>

      <footer className="mx-auto mt-10 max-w-5xl text-center text-xs text-slate-400 print:hidden">
        MVP build — {new Date().getFullYear()}
      </footer>

      {/* 未読コメントのフローティングバッジ。生徒モード時のみ、未読 > 0 の時だけ表示。
          タップでコメント欄へスムーズスクロール + 楽観的に既読化 (UI は即座に消える)。 */}
      {!showTeacherView && unreadComments > 0 && (
        <button
          type="button"
          onClick={() => {
            document
              .getElementById('comment-board')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // 楽観更新でバッジを即座に消す。サーバ書き込みは失敗しても UI は維持。
            setLastReadMs(Date.now());
            setUnreadComments(0);
            markAllCommentsRead(user).catch(() => {});
          }}
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-amber-600 print:hidden"
          aria-label={`先生からの新しいコメント ${unreadComments} 件`}
        >
          💬 新しいコメント {unreadComments}
        </button>
      )}

      <div className="print:hidden">
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </div>
    </div>
  );
}
