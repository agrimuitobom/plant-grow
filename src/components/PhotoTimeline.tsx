import { useMemo, useState } from 'react';
import { UNCATEGORIZED, categoryOf, uniqueCategories } from '../lib/categories';
import type { RecordDoc } from '../types';

type Props = {
  records: RecordDoc[];
};

type TimelineItem = {
  date: string;
  photoUrl: string;
  height: number | null;
  leafCount: number | null;
  memo: string;
  name: string;
  category: string;
};

type StrainOption = {
  id: string;
  name: string;
  category: string;
  count: number;
};

const ALL_CATEGORIES = '__ALL__';

// 株の id (A/B/C…) と品目の組を軸に集計する。name は途中で改名されうるため、最後に観測された name を採用する。
function buildStrainOptions(records: RecordDoc[]): StrainOption[] {
  const map = new Map<string, StrainOption>();
  for (const r of records) {
    for (const s of r.strains ?? []) {
      if (!s.photoUrl) continue;
      const cat = categoryOf(s);
      // 同じ id でも品目が変われば別の株として扱う (トマトA とナスA を混ぜない)。
      const key = `${cat}::${s.id}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.name = s.name ?? existing.name;
      } else {
        map.set(key, { id: s.id, name: s.name ?? s.id, category: cat, count: 1 });
      }
    }
  }
  return [...map.values()].sort((a, b) => {
    const c = a.category.localeCompare(b.category, 'ja');
    return c !== 0 ? c : a.id.localeCompare(b.id);
  });
}

function buildTimeline(
  records: RecordDoc[],
  strainId: string,
  category: string
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const r of records) {
    for (const s of r.strains ?? []) {
      if (s.id !== strainId || !s.photoUrl) continue;
      if (categoryOf(s) !== category) continue;
      items.push({
        date: r.date,
        photoUrl: s.photoUrl,
        height: s.height,
        leafCount: s.leafCount,
        memo: s.memo ?? '',
        name: s.name ?? s.id,
        category: categoryOf(s),
      });
    }
  }
  // 観察日記としては「最近の様子」が最初に見える方が自然。
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export default function PhotoTimeline({ records }: Props) {
  const allOptions = useMemo(() => buildStrainOptions(records), [records]);
  const categories = useMemo(() => uniqueCategories(records), [records]);
  const showCategoryFilter =
    categories.length > 1 || (categories.length === 1 && categories[0] !== UNCATEGORIZED);

  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [selected, setSelected] = useState<{ id: string; category: string } | null>(null);

  // 品目フィルタを通した株の選択肢。
  const options = useMemo(
    () =>
      categoryFilter === ALL_CATEGORIES
        ? allOptions
        : allOptions.filter((o) => o.category === categoryFilter),
    [allOptions, categoryFilter]
  );

  // 株の追加/削除や品目フィルタ変更で選択中の (id, category) が消えた時のフォールバック。
  const effectiveSelected =
    selected && options.some((o) => o.id === selected.id && o.category === selected.category)
      ? selected
      : options[0]
        ? { id: options[0].id, category: options[0].category }
        : null;

  const items = useMemo(
    () =>
      effectiveSelected
        ? buildTimeline(records, effectiveSelected.id, effectiveSelected.category)
        : [],
    [records, effectiveSelected]
  );

  return (
    <section className="card">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-leaf-700">写真アルバム</h2>
        <span className="text-xs text-slate-500">株を選んで成長を時系列で見る</span>
      </header>

      {allOptions.length === 0 ? (
        <p className="mt-4 text-slate-500">
          写真付きの記録がまだありません。観察フォームから写真を追加するとここに並びます。
        </p>
      ) : (
        <>
          {showCategoryFilter && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">品目:</span>
              {[ALL_CATEGORIES, ...categories].map((c) => {
                const active = c === categoryFilter;
                const label = c === ALL_CATEGORIES ? 'すべて' : c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategoryFilter(c)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      active
                        ? 'bg-leaf-700 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    aria-pressed={active}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {options.length === 0 ? (
              <p className="text-sm text-slate-500">この品目には写真付きの株がありません。</p>
            ) : (
              options.map((o) => {
                const active =
                  effectiveSelected?.id === o.id &&
                  effectiveSelected?.category === o.category;
                return (
                  <button
                    key={`${o.category}::${o.id}`}
                    type="button"
                    onClick={() => setSelected({ id: o.id, category: o.category })}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      active
                        ? 'bg-leaf-500 text-white shadow'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                    aria-pressed={active}
                  >
                    {showCategoryFilter && o.category !== UNCATEGORIZED && (
                      <span className="mr-1 text-xs opacity-80">{o.category}</span>
                    )}
                    {o.name}
                    <span
                      className={`ml-2 text-xs ${active ? 'text-leaf-50' : 'text-slate-400'}`}
                    >
                      {o.count}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <ol className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li
                key={`${item.date}-${item.photoUrl}`}
                className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100"
              >
                <a href={item.photoUrl} target="_blank" rel="noreferrer">
                  <img
                    src={item.photoUrl}
                    alt={`${item.name} ${item.date} の写真`}
                    loading="lazy"
                    className="h-48 w-full object-cover"
                  />
                </a>
                <div className="p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-700">{item.date}</span>
                    <span className="text-xs text-slate-500">
                      {item.height != null && `草丈 ${item.height}cm`}
                      {item.height != null && item.leafCount != null && ' / '}
                      {item.leafCount != null && `葉 ${item.leafCount}枚`}
                    </span>
                  </div>
                  {item.memo && (
                    <p className="mt-1 line-clamp-3 text-xs text-slate-500">{item.memo}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
