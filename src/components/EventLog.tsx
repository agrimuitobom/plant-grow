import { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { addEvent, deleteEvent, groupEventsByDate } from '../lib/events';
import type { EventDoc, EventType } from '../types';

type Props = {
  /** イベント所有者の生徒 uid。教員モードでは閲覧対象生徒の uid を渡す。 */
  studentUid: string;
  /** 現在選択中の日付 (生徒モードのみ使う。教員モードでは全期間表示するので無視)。 */
  dateId: string;
  /** 全イベント。App / TeacherDashboard が subscribeToEvents で持っているものをそのまま渡す。 */
  events: EventDoc[];
  /** タップ追加できる主体。生徒自身のときだけ渡し、教員観覧モードでは undefined。 */
  poster?: Pick<User, 'uid' | 'displayName' | 'email'>;
};

type Chip = { type: EventType; emoji: string; label: string; bg: string };

const CHIPS: Chip[] = [
  { type: 'water', emoji: '💧', label: '水やり', bg: 'bg-sky-100 hover:bg-sky-200 text-sky-800' },
  { type: 'fertilizer', emoji: '🌱', label: '肥料', bg: 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800' },
  { type: 'weather-sunny', emoji: '☀️', label: '晴れ', bg: 'bg-amber-100 hover:bg-amber-200 text-amber-800' },
  { type: 'weather-cloudy', emoji: '☁️', label: '曇り', bg: 'bg-slate-100 hover:bg-slate-200 text-slate-800' },
  { type: 'weather-rain', emoji: '🌧️', label: '雨', bg: 'bg-blue-100 hover:bg-blue-200 text-blue-800' },
  { type: 'weather-storm', emoji: '⛈️', label: '嵐', bg: 'bg-purple-100 hover:bg-purple-200 text-purple-800' },
];

const TYPE_LABEL: Record<EventType, string> = {
  water: '💧 水やり',
  fertilizer: '🌱 肥料',
  'weather-sunny': '☀️ 晴れ',
  'weather-cloudy': '☁️ 曇り',
  'weather-rain': '🌧️ 雨',
  'weather-storm': '⛈️ 嵐',
};

function formatTime(c: EventDoc): string {
  const v = c.createdAt as { toDate?: () => Date } | undefined;
  if (!v?.toDate) return '';
  const d = v.toDate();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export default function EventLog({ studentUid, dateId, events, poster }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todaysEvents = useMemo(
    () => events.filter((e) => e.date === dateId).sort((a, b) => {
      const ta = (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
      const tb = (b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
      return ta - tb;
    }),
    [events, dateId]
  );

  // 教員モード: 過去 14 日分のサマリーを date desc で表示。生徒に「振り返り」を提示しやすい。
  const recentByDate = useMemo(() => {
    if (poster) return new Map<string, EventDoc[]>(); // 生徒モードでは使わない
    const all = groupEventsByDate(events);
    const dates = [...all.keys()].sort((a, b) => b.localeCompare(a)).slice(0, 14);
    const result = new Map<string, EventDoc[]>();
    for (const d of dates) result.set(d, all.get(d) ?? []);
    return result;
  }, [events, poster]);

  const handleAdd = async (type: EventType) => {
    if (!poster) return;
    setBusy(true);
    setError(null);
    try {
      await addEvent({ user: poster, dateId, type });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (e: EventDoc) => {
    if (!poster) return;
    if (!confirm(`${TYPE_LABEL[e.type]} (${e.date}) のイベントを削除しますか?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteEvent(studentUid, e.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-leaf-700">観察イベント</h2>
        <span className="text-xs text-slate-500">
          {poster ? `${dateId} のイベント` : `直近 14 日`}
        </span>
      </header>

      {poster && (
        <>
          <p className="mt-2 text-sm text-slate-500">
            水やり・肥料・天気を 1 タップで記録できます。後で草丈の変化と並べて振り返りに使えます。
          </p>
          <div className="mt-3 flex flex-wrap gap-2 print:hidden">
            {CHIPS.map((c) => (
              <button
                key={c.type}
                type="button"
                onClick={() => void handleAdd(c.type)}
                disabled={busy}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition disabled:opacity-40 ${c.bg}`}
                aria-label={`${c.label}を記録`}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              エラー: {error}
            </p>
          )}

          <div className="mt-4 flex flex-col gap-2">
            {todaysEvents.length === 0 ? (
              <p className="text-sm text-slate-500">この日のイベントはまだありません。</p>
            ) : (
              todaysEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
                >
                  <span className="text-sm text-slate-700">
                    {TYPE_LABEL[ev.type]}
                    <span className="ml-2 text-xs text-slate-400">{formatTime(ev)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(ev)}
                    disabled={busy}
                    className="text-xs text-red-600 underline disabled:opacity-40"
                  >
                    削除
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {!poster && (
        // 教員モード: 直近 14 日のイベントを date 降順で並べる。
        <div className="mt-3 flex flex-col gap-2">
          {recentByDate.size === 0 ? (
            <p className="text-sm text-slate-500">記録されたイベントはまだありません。</p>
          ) : (
            [...recentByDate.entries()].map(([date, list]) => (
              <div key={date} className="rounded-xl bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold text-slate-600">{date}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {list.map((ev) => (
                    <span
                      key={ev.id}
                      className="rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-slate-200"
                    >
                      {TYPE_LABEL[ev.type]}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
