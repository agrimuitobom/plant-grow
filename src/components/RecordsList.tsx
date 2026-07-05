import { useMemo, useState } from 'react';
import { formatAuditCaption } from '../lib/audit';
import { UNCATEGORIZED, categoryOf, uniqueCategories } from '../lib/categories';
import { calcAverages } from '../lib/records';
import type { Averages, RecordDoc } from '../types';

const ALL_KEY = '__ALL__';

type Row = {
  date: string;
  count: number;
  avg: Averages;
  /** 「田中先生 (5/10 14:30)」形式の最終更新者キャプション。なければ空文字。 */
  auditCaption: string;
};

function buildRows(records: RecordDoc[], category: string | null): Row[] {
  const rows: Row[] = records.map((r) => {
    const filtered = (r.strains ?? []).filter(
      (s) => category == null || categoryOf(s) === category
    );
    return {
      date: r.date,
      count: filtered.length,
      avg: calcAverages(filtered),
      auditCaption: formatAuditCaption({
        name: r.updatedByName,
        timestamp: r.updatedAt ?? null,
      }),
    };
  });
  // 観察日記として「最近の様子」が先頭に来る方が自然。
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

type Props = {
  records: RecordDoc[];
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
};

// 初期表示行数。1 学期 ~60 日でもテーブルが長くなりすぎないよう最新 30 日に絞る。
const PAGE_SIZE = 30;

export default function RecordsList({ records, selectedDate, onSelectDate }: Props) {
  const [selected, setSelected] = useState<string>(ALL_KEY);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const categories = useMemo(() => uniqueCategories(records), [records]);
  const showTabs =
    categories.length > 1 || (categories.length === 1 && categories[0] !== UNCATEGORIZED);

  const rows = useMemo(() => {
    const filterCategory = selected === ALL_KEY ? null : selected;
    const all = buildRows(records, filterCategory);
    // 品目で絞り込んだ時に該当株が 1 つもない日はリストから除く。
    return filterCategory == null ? all : all.filter((r) => r.count > 0);
  }, [records, selected]);

  if (records.length === 0) {
    return (
      <div className="card text-center text-slate-500">
        まだ記録がありません。
      </div>
    );
  }

  return (
    <section className="card">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-leaf-700">記録一覧</h2>
        <span className="text-xs text-slate-500">全 {records.length} 日</span>
      </header>

      {showTabs && (
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

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-2 pr-2 font-medium">日付</th>
              <th className="pb-2 px-2 text-right font-medium">草丈(cm)</th>
              <th className="pb-2 px-2 text-right font-medium">葉(枚)</th>
              <th className="pb-2 pl-2 text-right font-medium">株数</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-500">
                  この品目の記録はまだありません。
                </td>
              </tr>
            ) : (
              rows.map((r, index) => {
                const isCurrent = r.date === selectedDate;
                // ページング: 画面では最新 visibleCount 行のみ描画コストを払う。
                // 印刷時は print:table-row で全行復活させ、ポートフォリオの完全性を保つ。
                const isPaged = index >= visibleCount;
                return (
                  <tr
                    key={r.date}
                    className={`border-t border-slate-100 ${isCurrent ? 'bg-leaf-50' : ''} ${
                      isPaged ? 'hidden print:table-row' : ''
                    }`}
                  >
                    <td className="py-2 pr-2 align-top">
                      {onSelectDate ? (
                        <button
                          type="button"
                          onClick={() => onSelectDate(r.date)}
                          className="font-semibold text-leaf-700 hover:underline"
                          aria-label={`${r.date} の記録を開く`}
                        >
                          {r.date}
                        </button>
                      ) : (
                        <span className="font-semibold text-slate-700">{r.date}</span>
                      )}
                      {r.auditCaption && (
                        <div
                          className="text-xs text-slate-500"
                          title="最終更新者と時刻"
                        >
                          {r.auditCaption}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right align-top tabular-nums">
                      {r.avg.height ?? '—'}
                    </td>
                    <td className="py-2 px-2 text-right align-top tabular-nums">
                      {r.avg.leafCount ?? '—'}
                    </td>
                    <td className="py-2 pl-2 text-right align-top tabular-nums text-slate-500">
                      {r.count}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {rows.length > visibleCount && (
        <div className="mt-3 text-center print:hidden">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="btn-ghost !min-h-0 !px-4 !py-2 text-sm"
          >
            さらに表示 (残り {rows.length - visibleCount} 日)
          </button>
        </div>
      )}
    </section>
  );
}
