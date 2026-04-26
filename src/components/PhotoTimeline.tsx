import { useMemo, useState } from 'react';
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
};

type StrainOption = {
  id: string;
  name: string;
  count: number;
};

// 株の id (A/B/C…) を軸に集計する。name は途中で改名されうるため、最後に観測された name を採用する。
function buildStrainOptions(records: RecordDoc[]): StrainOption[] {
  const map = new Map<string, StrainOption>();
  for (const r of records) {
    for (const s of r.strains ?? []) {
      if (!s.photoUrl) continue;
      const existing = map.get(s.id);
      if (existing) {
        existing.count += 1;
        existing.name = s.name ?? existing.name;
      } else {
        map.set(s.id, { id: s.id, name: s.name ?? s.id, count: 1 });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function buildTimeline(records: RecordDoc[], strainId: string): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const r of records) {
    for (const s of r.strains ?? []) {
      if (s.id !== strainId || !s.photoUrl) continue;
      items.push({
        date: r.date,
        photoUrl: s.photoUrl,
        height: s.height,
        leafCount: s.leafCount,
        memo: s.memo ?? '',
        name: s.name ?? s.id,
      });
    }
  }
  // 観察日記としては「最近の様子」が最初に見える方が自然。
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export default function PhotoTimeline({ records }: Props) {
  const options = useMemo(() => buildStrainOptions(records), [records]);
  const [selected, setSelected] = useState<string | null>(null);

  // 株の追加/削除で選択中の id が消えた時に最初の株へフォールバック。
  const effectiveSelected =
    selected && options.some((o) => o.id === selected) ? selected : options[0]?.id ?? null;

  const items = useMemo(
    () => (effectiveSelected ? buildTimeline(records, effectiveSelected) : []),
    [records, effectiveSelected]
  );

  return (
    <section className="card">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-leaf-700">写真アルバム</h2>
        <span className="text-xs text-slate-500">株を選んで成長を時系列で見る</span>
      </header>

      {options.length === 0 ? (
        <p className="mt-4 text-slate-500">
          写真付きの記録がまだありません。観察フォームから写真を追加するとここに並びます。
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {options.map((o) => {
              const active = o.id === effectiveSelected;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelected(o.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? 'bg-leaf-500 text-white shadow'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  aria-pressed={active}
                >
                  {o.name}
                  <span
                    className={`ml-2 text-xs ${active ? 'text-leaf-50' : 'text-slate-400'}`}
                  >
                    {o.count}
                  </span>
                </button>
              );
            })}
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
