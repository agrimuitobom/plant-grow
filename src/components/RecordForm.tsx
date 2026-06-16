import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import HistoryPanel from './HistoryPanel';
import StrainRow from './StrainRow';
import { formatAuditCaption } from '../lib/audit';
import { UNCATEGORIZED, calcAveragesByCategory } from '../lib/categories';
import { calcAverages, fetchRecord, saveRecord, type SaveRecordResult } from '../lib/records';
import { getStrainPhotos } from '../lib/strain';
import type { RecordDoc, Strain, StrainFormValue } from '../types';

const emptyStrain = (index: number): StrainFormValue => ({
  id: String.fromCharCode(65 + index),
  category: '',
  name: `${String.fromCharCode(65 + index)}株`,
  height: '',
  leafCount: '',
  memo: '',
  photos: [],
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
  /** 「前回の値を入れる」検索用。指定日より前の最新レコードを採用する。 */
  records?: RecordDoc[];
};

export default function RecordForm({
  user,
  dateId,
  onSaved,
  registeredCategories = [],
  onAddCategory,
  records = [],
}: RecordFormProps) {
  const [strains, setStrains] = useState<StrainFormValue[]>(DEFAULT_STRAINS);
  const [status, setStatus] = useState<FormStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  // 既存レコードを開いた時にタイトル横に「最終更新: ...」バッジを出すためのキャプション。
  // 新規日付や読込前は空文字。
  const [auditCaption, setAuditCaption] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setAuditCaption('');
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
              photos: getStrainPhotos(s),
            }))
          );
          setAuditCaption(
            formatAuditCaption({
              name: record.updatedByName,
              timestamp: record.updatedAt ?? null,
            })
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

  // 「前回の値を入れる」: 現在の dateId より前で最も新しい記録を採用。
  // 同じ株 id を持つ株について height / leafCount だけ流し込む。
  // memo は日替わりの観察なので、photo は日付固有なのでコピーしない。
  const previousRecord = useMemo(() => {
    if (!records.length) return null;
    const earlier = records.filter((r) => r.date < dateId);
    if (earlier.length === 0) return null;
    return earlier.reduce((a, b) => (a.date > b.date ? a : b));
  }, [records, dateId]);

  const applyPreviousValues = () => {
    if (!previousRecord) return;
    setStrains((prev) =>
      prev.map((s) => {
        const match = previousRecord.strains.find((p) => p.id === s.id);
        if (!match) return s;
        return {
          ...s,
          height: match.height ?? '',
          leafCount: match.leafCount ?? '',
        };
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('saving');
    setError(null);
    try {
      const saved = await saveRecord({ user, dateId, strains });
      setStatus('saved');
      onSaved?.(saved);
      // 保存に成功したら履歴一覧をリフレッシュさせる (新しい snapshot が積まれているはず)。
      setHistoryRefreshKey((k) => k + 1);
      setTimeout(() => setStatus('idle'), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  // 履歴から復元する: Firestore はまだ書き換えず、フォームに値を流し込むだけ。
  const handleRestore = (snap: Strain[]) => {
    setStrains(
      snap.map((s) => ({
        id: s.id,
        category: s.category ?? '',
        name: s.name ?? s.id,
        height: s.height ?? '',
        leafCount: s.leafCount ?? '',
        memo: s.memo ?? '',
        photos: getStrainPhotos(s),
      }))
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-2xl font-bold text-leaf-700">{dateId} の記録</h2>
          {auditCaption && (
            <span
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
              title="この日のレコードの最終更新者と時刻"
            >
              最終更新: {auditCaption}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={applyPreviousValues}
            disabled={!previousRecord}
            className="btn-ghost !min-h-0 !px-3 !py-2 text-sm disabled:opacity-40"
            title={
              previousRecord
                ? `${previousRecord.date} の草丈・葉枚数を取り込みます`
                : '取り込める過去の記録がありません'
            }
          >
            📋 前回の値を入れる
            {previousRecord && (
              <span className="ml-1 text-xs text-slate-500">
                ({previousRecord.date})
              </span>
            )}
          </button>
          <span className="text-sm text-slate-500">
            株数 {strains.length} / 未入力欄は平均計算から除外されます
          </span>
        </div>
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
          aria-busy={status === 'saving' || uploadingCount > 0}
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

      <HistoryPanel
        uid={user.uid}
        dateId={dateId}
        refreshKey={historyRefreshKey}
        onRestore={handleRestore}
      />

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
