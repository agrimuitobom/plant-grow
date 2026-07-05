import { useEffect, useMemo, useState } from 'react';
import GrowthLineChart from './GrowthLineChart';
import {
  UNCATEGORIZED,
  dailyAveragesFor,
  uniqueCategories,
} from '../lib/categories';
import {
  fetchClassAverages,
  translateClassAveragesError,
  type ClassAveragePoint,
} from '../lib/classAverages';
import type { EventDoc, RecordDoc } from '../types';

const CLASS_AVG_TOGGLE_KEY = 'plant-grow.classAvgOverlay';

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

  // クラス平均オーバーレイ。設定は localStorage に永続化して画面遷移しても消えないように。
  const [showClassAvg, setShowClassAvg] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(CLASS_AVG_TOGGLE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [classAvg, setClassAvg] = useState<ClassAveragePoint[] | null>(null);
  const [classAvgStatus, setClassAvgStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle');
  const [classAvgError, setClassAvgError] = useState<string | null>(null);

  // トグル変更で永続化
  useEffect(() => {
    try {
      localStorage.setItem(CLASS_AVG_TOGGLE_KEY, String(showClassAvg));
    } catch {
      /* private mode 等: 永続化に失敗してもオンメモリの state は維持 */
    }
  }, [showClassAvg]);

  // ON 切替時にクラス平均を取得 (5分キャッシュあり)
  useEffect(() => {
    if (!showClassAvg) return;
    if (classAvg) return; // 既に持っている
    let cancelled = false;
    setClassAvgStatus('loading');
    setClassAvgError(null);
    fetchClassAverages()
      .then((points) => {
        if (cancelled) return;
        setClassAvg(points);
        setClassAvgStatus('idle');
      })
      .catch((e) => {
        if (cancelled) return;
        setClassAvgError(translateClassAveragesError(e));
        setClassAvgStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [showClassAvg, classAvg]);

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
    const own = dailyAveragesFor(records, filterCategory).filter(
      (d) => d.height != null || d.leafCount != null
    );
    if (!showClassAvg || !classAvg) {
      return own.map((d) => ({
        date: d.date,
        height: d.height,
        leafCount: d.leafCount,
        classHeight: null as number | null,
        classLeafCount: null as number | null,
      }));
    }
    // クラス平均は日付キーで突き合わせ。自分のチャートに無い日でもクラス側はあり得る (他生徒のみ記録)
    // → 自分の日付 ∪ クラスの日付を union で並べる
    const ownByDate = new Map(own.map((d) => [d.date, d]));
    const classByDate = new Map(classAvg.map((c) => [c.date, c]));
    const allDates = [...new Set([...ownByDate.keys(), ...classByDate.keys()])].sort();
    return allDates.map((date) => {
      const o = ownByDate.get(date);
      const c = classByDate.get(date);
      return {
        date,
        height: o?.height ?? null,
        leafCount: o?.leafCount ?? null,
        classHeight: c?.height ?? null,
        classLeafCount: c?.leafCount ?? null,
      };
    });
  }, [records, selected, showClassAvg, classAvg]);

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
        <label className="flex items-center gap-1 text-xs text-slate-600 print:hidden">
          <input
            type="checkbox"
            checked={showClassAvg}
            onChange={(e) => setShowClassAvg(e.target.checked)}
            className="h-4 w-4"
          />
          クラス平均を重ねる
          {classAvgStatus === 'loading' && (
            <span className="ml-1 text-slate-500">(計算中…)</span>
          )}
          {classAvgStatus === 'error' && (
            <span
              className="ml-1 text-red-600"
              title={classAvgError ?? undefined}
            >
              (取得失敗)
            </span>
          )}
        </label>
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

      <div className="mt-4 w-full">
        {data.length === 0 ? (
          <div className="flex h-80 items-center justify-center text-slate-500">
            この品目のデータはまだありません。
          </div>
        ) : (
          <GrowthLineChart
            rows={data}
            waterDates={eventMarkers.water}
            fertilizerDates={eventMarkers.fertilizer}
            showClassAvg={showClassAvg && classAvg !== null}
          />
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
