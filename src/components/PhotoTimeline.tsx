import { useMemo, useState } from 'react';
import { UNCATEGORIZED, categoryOf, uniqueCategories } from '../lib/categories';
import { getStrainPhotos } from '../lib/strain';
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
      const photoCount = getStrainPhotos(s).length;
      if (photoCount === 0) continue;
      const cat = categoryOf(s);
      // 同じ id でも品目が変われば別の株として扱う (トマトA とナスA を混ぜない)。
      const key = `${cat}::${s.id}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += photoCount;
        existing.name = s.name ?? existing.name;
      } else {
        map.set(key, { id: s.id, name: s.name ?? s.id, category: cat, count: photoCount });
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
      if (s.id !== strainId) continue;
      if (categoryOf(s) !== category) continue;
      // 1 株 / 日に複数枚の写真がある場合は、それぞれを別タイルとしてタイムラインに並べる。
      for (const photo of getStrainPhotos(s)) {
        items.push({
          date: r.date,
          photoUrl: photo.url,
          height: s.height,
          leafCount: s.leafCount,
          memo: s.memo ?? '',
          name: s.name ?? s.id,
          category: categoryOf(s),
        });
      }
    }
  }
  // 観察日記としては「最近の様子」が最初に見える方が自然。
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

// 初期表示タイル数。1 年分 (数百枚) を一気に DOM に載せると古い iPad が重くなる。
const PAGE_SIZE = 24;

export default function PhotoTimeline({ records }: Props) {
  const allOptions = useMemo(() => buildStrainOptions(records), [records]);
  const categories = useMemo(() => uniqueCategories(records), [records]);
  const showCategoryFilter =
    categories.length > 1 || (categories.length === 1 && categories[0] !== UNCATEGORIZED);

  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [selected, setSelected] = useState<{ id: string; category: string } | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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
            <div className="mt-4 flex flex-wrap items-center gap-2 print:hidden">
              <span className="text-xs text-slate-500">品目:</span>
              {[ALL_CATEGORIES, ...categories].map((c) => {
                const active = c === categoryFilter;
                const label = c === ALL_CATEGORIES ? 'すべて' : c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCategoryFilter(c);
                      setVisibleCount(PAGE_SIZE);
                    }}
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

          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
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
                    onClick={() => {
                      setSelected({ id: o.id, category: o.category });
                      setVisibleCount(PAGE_SIZE);
                    }}
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
                      className={`ml-2 text-xs ${active ? 'text-leaf-50' : 'text-slate-500'}`}
                    >
                      {o.count}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <ol className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.slice(0, visibleCount).map((item) => (
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

          {items.length > visibleCount && (
            <div className="mt-4 text-center print:hidden">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="btn-ghost !min-h-0 !px-4 !py-2 text-sm"
              >
                さらに表示 (残り {items.length - visibleCount} 枚)
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
