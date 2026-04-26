import { useMemo, useState } from 'react';
import { sanitizeCategories } from '../lib/categories';

type Props = {
  /** 現在の登録済み品目。 */
  categories: string[];
  /** 過去レコードに登場した品目 (一括取り込み候補)。 */
  usedInRecords: string[];
  /** 永続化を含む保存。Promise が解決するまでボタンを無効化する。 */
  onChange: (next: string[]) => Promise<void>;
};

export default function CategoryManager({ categories, usedInRecords, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importable = useMemo(
    () => usedInRecords.filter((c) => !categories.includes(c)),
    [usedInRecords, categories]
  );

  const persist = async (next: string[]) => {
    setBusy(true);
    setError(null);
    try {
      await onChange(sanitizeCategories(next));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    const name = draft.trim();
    if (!name) return;
    if (categories.includes(name)) {
      setError('同じ名前の品目はすでに登録されています。');
      return;
    }
    setDraft('');
    await persist([...categories, name]);
  };

  const handleRemove = async (name: string) => {
    await persist(categories.filter((c) => c !== name));
  };

  const handleImportAll = async () => {
    await persist([...categories, ...importable]);
  };

  return (
    <section className="card">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-leaf-700">品目を管理</h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-sm text-leaf-700 underline"
          aria-expanded={open}
        >
          {open ? '閉じる' : `${categories.length} 件 / 開く`}
        </button>
      </header>

      {open && (
        <div className="mt-4 flex flex-col gap-4">
          {categories.length === 0 ? (
            <p className="text-sm text-slate-500">
              まだ品目が登録されていません。下の入力欄から追加してください。
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <li
                  key={c}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm"
                >
                  <span className="font-medium text-slate-700">{c}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(c)}
                    disabled={busy}
                    className="text-xs text-red-600 hover:underline disabled:opacity-40"
                    aria-label={`${c} を削除`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="例: トマト"
              maxLength={40}
              className="!min-h-0 !py-2 md:flex-1"
              disabled={busy}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={busy || !draft.trim()}
              className="btn-secondary !min-h-0 !px-4 !py-2 text-sm disabled:opacity-40"
            >
              追加
            </button>
          </div>

          {importable.length > 0 && (
            <div className="rounded-2xl bg-leaf-50 p-3 text-sm text-leaf-700">
              過去の記録に「{importable.join('、')}」が使われています。
              <button
                type="button"
                onClick={handleImportAll}
                disabled={busy}
                className="ml-2 underline disabled:opacity-40"
              >
                まとめて登録する ({importable.length} 件)
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
