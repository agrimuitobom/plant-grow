import React, { useEffect, useMemo, useState } from 'react';
import StrainRow from './StrainRow';
import { calcAverages, fetchRecord, saveRecord } from '../lib/records';

const emptyStrain = (index) => ({
  id: String.fromCharCode(65 + index),
  name: `${String.fromCharCode(65 + index)}株`,
  height: '',
  leafCount: '',
});

const DEFAULT_STRAINS = [emptyStrain(0), emptyStrain(1), emptyStrain(2)];

export default function RecordForm({ dateId, onSaved }) {
  const [strains, setStrains] = useState(DEFAULT_STRAINS);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetchRecord(dateId)
      .then((record) => {
        if (cancelled) return;
        if (record?.strains?.length) {
          setStrains(
            record.strains.map((s) => ({
              id: s.id,
              name: s.name ?? s.id,
              height: s.height ?? '',
              leafCount: s.leafCount ?? '',
            }))
          );
        } else {
          setStrains(DEFAULT_STRAINS);
        }
        setStatus('idle');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [dateId]);

  const averages = useMemo(() => {
    const parsed = strains.map((s) => ({
      ...s,
      height: s.height === '' ? null : Number(s.height),
      leafCount: s.leafCount === '' ? null : Number(s.leafCount),
    }));
    return calcAverages(parsed);
  }, [strains]);

  const addStrain = () => {
    setStrains((prev) => [...prev, emptyStrain(prev.length)]);
  };

  const removeStrain = (index) => {
    setStrains((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStrain = (index, next) => {
    setStrains((prev) => prev.map((s, i) => (i === index ? next : s)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('saving');
    setError(null);
    try {
      const saved = await saveRecord({ dateId, strains });
      setStatus('saved');
      onSaved?.(saved);
      setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      setError(err.message);
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
            onChange={(next) => updateStrain(i, next)}
            onRemove={() => removeStrain(i)}
            canRemove={strains.length > 1}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={addStrain} className="btn-secondary">
          ＋ 株を追加
        </button>
        <button type="submit" className="btn-primary flex-1" disabled={status === 'saving'}>
          {status === 'saving' ? '保存中…' : status === 'saved' ? '保存しました ✓' : '保存する'}
        </button>
      </div>

      <section className="card bg-leaf-50 ring-leaf-100">
        <h3 className="text-lg font-semibold text-leaf-700">本日の平均</h3>
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
      </section>

      {error && (
        <p role="alert" className="text-red-600">
          エラー: {error}
        </p>
      )}
    </form>
  );
}
