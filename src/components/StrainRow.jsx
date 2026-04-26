import React, { useState } from 'react';
import { deleteStrainPhoto, uploadStrainPhoto } from '../lib/storage';

export default function StrainRow({
  strain,
  uid,
  dateId,
  onChange,
  onRemove,
  canRemove,
  onUploadingChange,
}) {
  const [photoStatus, setPhotoStatus] = useState('idle');
  const [photoError, setPhotoError] = useState(null);

  const update = (key, value) => onChange({ ...strain, [key]: value });

  const toNum = (v) => (v === '' ? '' : Number(v));

  const setUploading = (v) => {
    setPhotoStatus(v ? 'uploading' : 'idle');
    onUploadingChange?.(v);
  };

  const handlePickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    setUploading(true);
    const previousPath = strain.photoPath;
    try {
      const { photoPath, photoUrl } = await uploadStrainPhoto({
        uid,
        dateId,
        strainId: strain.id,
        file,
      });
      onChange({ ...strain, photoPath, photoUrl });
      if (previousPath && previousPath !== photoPath) {
        deleteStrainPhoto(previousPath).catch(() => {});
      }
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    const path = strain.photoPath;
    onChange({ ...strain, photoPath: null, photoUrl: null });
    if (path) {
      deleteStrainPhoto(path).catch(() => {});
    }
  };

  const memoLength = (strain.memo ?? '').length;

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
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

        <div className="md:w-40">
          <label className="block text-sm font-medium text-slate-500">写真</label>
          {strain.photoUrl ? (
            <div className="mt-1 flex items-center gap-2">
              <a href={strain.photoUrl} target="_blank" rel="noreferrer" className="block">
                <img
                  src={strain.photoUrl}
                  alt={`${strain.name}の写真`}
                  className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200"
                />
              </a>
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="text-sm text-red-600 underline"
                aria-label={`${strain.name}の写真を削除`}
              >
                削除
              </button>
            </div>
          ) : (
            <label
              className={`mt-1 inline-flex h-16 w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-2 text-sm text-slate-500 hover:border-leaf-500 hover:text-leaf-700 ${
                photoStatus === 'uploading' ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              {photoStatus === 'uploading' ? 'アップロード中…' : '＋ 撮影 / 選択'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePickPhoto}
                disabled={photoStatus === 'uploading'}
              />
            </label>
          )}
          {photoError && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {photoError}
            </p>
          )}
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

      <div>
        <div className="flex items-baseline justify-between">
          <label
            className="block text-sm font-medium text-slate-500"
            htmlFor={`memo-${strain.id}`}
          >
            観察メモ
          </label>
          <span className="text-xs text-slate-400">{memoLength}/1000</span>
        </div>
        <textarea
          id={`memo-${strain.id}`}
          rows={2}
          maxLength={1000}
          value={strain.memo ?? ''}
          onChange={(e) => update('memo', e.target.value)}
          placeholder="今日気づいたこと（葉の色、害虫、天気の影響など）"
          className="mt-1 w-full resize-y rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base focus:border-leaf-500 focus:outline-none"
        />
      </div>
    </div>
  );
}
