import React from 'react';

export default function StrainRow({ strain, onChange, onRemove, canRemove }) {
  const update = (key, value) => onChange({ ...strain, [key]: value });

  const toNum = (v) => (v === '' ? '' : Number(v));

  return (
    <div className="card flex flex-col gap-4 md:flex-row md:items-end">
      <div className="md:w-32">
        <label className="block text-sm font-medium text-slate-500">株名</label>
        <input
          type="text"
          inputMode="text"
          value={strain.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="A株"
        />
      </div>

      <div className="flex-1">
        <label className="block text-sm font-medium text-slate-500">草丈 (cm)</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          value={strain.height}
          onChange={(e) => update('height', toNum(e.target.value))}
          placeholder="例: 12.5"
        />
      </div>

      <div className="flex-1">
        <label className="block text-sm font-medium text-slate-500">葉枚数 (枚)</label>
        <input
          type="number"
          inputMode="numeric"
          step="1"
          min="0"
          value={strain.leafCount}
          onChange={(e) => update('leafCount', toNum(e.target.value))}
          placeholder="例: 6"
        />
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        className="btn-ghost md:w-28 disabled:opacity-30"
        aria-label={`${strain.name}を削除`}
      >
        削除
      </button>
    </div>
  );
}
