import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import StrainRow from './StrainRow';
import { UNCATEGORIZED, calcAveragesByCategory } from '../lib/categories';
import { calcAverages, fetchRecord, saveRecord, type SaveRecordResult } from '../lib/records';
import type { StrainFormValue } from '../types';

const emptyStrain = (index: number): StrainFormValue => ({
  id: String.fromCharCode(65 + index),
  category: '',
  name: `${String.fromCharCode(65 + index)}株`,
  height: '',
  leafCount: '',
  memo: '',
  photoPath: null,
  photoUrl: null,
});

const DEFAULT_STRAINS: StrainFormValue[] = [emptyStrain(0), emptyStrain(1), emptyStrain(2)];

type FormStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

type RecordFormProps = {
  user: User;
  dateId: string;
  onSaved?: (saved: SaveRecordResult) => void;
  /** 登録済みの品目リスト。プルダウンに並ぶ。 */
  registeredCategories?: string[];
  /** プルダウンから「新しい品目を追加」したときの永続化ハンドラ。 */
  onAddCategory?: (name: string) => void | Promise<void>;
};

export default function RecordForm({
  user,
  dateId,
  onSaved,
  registeredCategories = [],
  onAddCategory,
}: RecordFormProps) {
  const [strains, setStrains] = useState<StrainFormValue[]>(DEFAULT_STRAINS);
  const [status, setStatus] = useState<FormStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetchRecord(user.uid, dateId)
      .then((record) => {
        if (cancelled) return;
        if (record?.strains?.length) {
          setStrains(
            record.strains.map((s) => ({
              id: s.id,
              category: s.category ?? '',
              name: s.name ?? s.id,
              height: s.height ?? '',
              leafCount: s.leafCount ?? '',
              memo: s.memo ?? '',
              photoPath: s.photoPath ?? null,
              photoUrl: s.photoUrl ?? null,
            }))
          );
        } else {
          setStrains(DEFAULT_STRAINS);
        }
        setStatus('idle');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [user.uid, dateId]);

  const handleUploadingChange = (isUploading: boolean) => {
    setUploadingCount((n) => Math.max(0, n + (isUploading ? 1 : -1)));
  };

  const parsedForAverages = useMemo(
    () =>
      strains.map((s) => ({
        category: s.category,
        height: s.height === '' ? null : Number(s.height),
        leafCount: s.leafCount === '' ? null : Number(s.leafCount),
      })),
    [strains]
  );

  const averages = useMemo(() => calcAverages(parsedForAverages), [parsedForAverages]);

  const averagesByCategory = useMemo(
    () => calcAveragesByCategory(parsedForAverages),
    [parsedForAverages]
  );

  // 全部「未分類」しか入っていないなら従来通りまとめて 1 行表示。
  // 品目を 2 つ以上付けたら品目別に分けて表示する。
  const categoryKeys = Object.keys(averagesByCategory);
  const showByCategory =
    categoryKeys.length > 1 ||
    (categoryKeys.length === 1 && categoryKeys[0] !== UNCATEGORIZED);

  const addStrain = () => {
    setStrains((prev) => [...prev, emptyStrain(prev.length)]);
  };

  const removeStrain = (index: number) => {
    setStrains((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStrain = (index: number, next: StrainFormValue) => {
    setStrains((prev) => prev.map((s, i) => (i === index ? next : s)));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('saving');
    setError(null);
    try {
      const saved = await saveRecord({ user, dateId, strains });
      setStatus('saved');
      onSaved?.(saved);
      setTimeout(() => setStatus('idle'), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-leaf-700">{dateId} の記録</h2>
        <span className="text-sm text-slate-500">
          株数 {strains.length} / 未入力欄は平均計算から除外されます
        </span>
      </header>

      <div className="flex flex-col gap-3">
        {strains.map((s, i) => (
          <StrainRow
            key={`${s.id}-${i}`}
            strain={s}
            uid={user.uid}
            dateId={dateId}
            onChange={(next) => updateStrain(i, next)}
            onRemove={() => removeStrain(i)}
            canRemove={strains.length > 1}
            onUploadingChange={handleUploadingChange}
            registeredCategories={registeredCategories}
            onAddCategory={onAddCategory}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={addStrain} className="btn-secondary">
          ＋ 株を追加
        </button>
        <button
          type="submit"
          className="btn-primary flex-1"
          disabled={status === 'saving' || uploadingCount > 0}
        >
          {uploadingCount > 0
            ? '写真アップロード中…'
            : status === 'saving'
              ? '保存中…'
              : status === 'saved'
                ? '保存しました ✓'
                : '保存する'}
        </button>
      </div>

      <section className="card bg-leaf-50 ring-leaf-100">
        <h3 className="text-lg font-semibold text-leaf-700">本日の平均</h3>
        {showByCategory ? (
          <ul className="mt-2 flex flex-col gap-2 text-tap">
            {categoryKeys
              .sort((a, b) => a.localeCompare(b, 'ja'))
              .map((key) => {
                const a = averagesByCategory[key];
                return (
                  <li
                    key={key}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-white/70 px-3 py-2"
                  >
                    <span className="text-sm font-semibold text-leaf-700">{key}</span>
                    <span className="text-base text-slate-700">
                      草丈{' '}
                      <span className="font-bold text-leaf-700">{a.height ?? '—'}</span>
                      <span className="text-sm text-slate-500"> cm</span>
                      <span className="mx-2 text-slate-300">/</span>
                      葉{' '}
                      <span className="font-bold text-leaf-700">{a.leafCount ?? '—'}</span>
                      <span className="text-sm text-slate-500"> 枚</span>
                    </span>
                  </li>
                );
              })}
          </ul>
        ) : (
          <dl className="mt-2 grid grid-cols-2 gap-4 text-tap">
            <div>
              <dt className="text-slate-500">草丈</dt>
              <dd className="text-3xl font-bold text-leaf-700">
                {averages.height ?? '—'}
                <span className="text-base font-normal text-slate-500"> cm</span>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">葉枚数</dt>
              <dd className="text-3xl font-bold text-leaf-700">
                {averages.leafCount ?? '—'}
                <span className="text-base font-normal text-slate-500"> 枚</span>
              </dd>
            </div>
          </dl>
        )}
      </section>

      {error && (
        <p role="alert" className="text-red-600">
          エラー: {error}
        </p>
      )}
    </form>
  );
}
