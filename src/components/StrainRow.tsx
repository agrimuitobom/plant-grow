import { useState } from 'react';
import { deleteStrainPhoto, uploadStrainPhoto } from '../lib/storage';
import { validateHeight, validateLeafCount } from '../lib/validation';
import type { StrainFormValue } from '../types';

type StrainRowProps = {
  strain: StrainFormValue;
  uid: string;
  dateId: string;
  onChange: (next: StrainFormValue) => void;
  onRemove: () => void;
  canRemove: boolean;
  onUploadingChange?: (isUploading: boolean) => void;
  /** 登録済み品目 (プルダウンに並ぶ)。 */
  registeredCategories?: string[];
  /**
   * プルダウンに無い品目をその場で追加するハンドラ。
   * 未指定ならフォールバック用のテキスト入力に切り替わる。
   */
  onAddCategory?: (name: string) => void | Promise<void>;
};

type PhotoStatus = 'idle' | 'uploading';

const ADD_NEW = '__ADD_NEW__';

export default function StrainRow({
  strain,
  uid,
  dateId,
  onChange,
  onRemove,
  canRemove,
  onUploadingChange,
  registeredCategories = [],
  onAddCategory,
}: StrainRowProps) {
  const [adding, setAdding] = useState(false);
  const [newCategoryDraft, setNewCategoryDraft] = useState('');
  // 既存レコードに登録外の品目が入っていても表示できるよう、現在値が未登録なら下部に option 追加。
  const currentMissing =
    strain.category && !registeredCategories.includes(strain.category)
      ? strain.category
      : null;

  const handleCategorySelect = (value: string) => {
    if (value === ADD_NEW) {
      setAdding(true);
      setNewCategoryDraft('');
      return;
    }
    update('category', value);
  };

  const commitNewCategory = async () => {
    const name = newCategoryDraft.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    if (onAddCategory) {
      await onAddCategory(name);
    }
    update('category', name);
    setNewCategoryDraft('');
    setAdding(false);
  };
  const [photoStatus, setPhotoStatus] = useState<PhotoStatus>('idle');
  const [photoError, setPhotoError] = useState<string | null>(null);

  const update = <K extends keyof StrainFormValue>(key: K, value: StrainFormValue[K]) =>
    onChange({ ...strain, [key]: value });

  const toNum = (v: string): number | '' => (v === '' ? '' : Number(v));

  // ±ステッパー: 空欄は 0 から始める。マイナス値にはしない。
  // 浮動小数誤差を避けるため 10 倍 → 整数演算 → 戻す。
  const adjustHeight = (delta: number) => {
    const current = typeof strain.height === 'number' ? strain.height : 0;
    const next = Math.max(0, Math.round((current + delta) * 10) / 10);
    update('height', next);
  };
  const adjustLeafCount = (delta: number) => {
    const current = typeof strain.leafCount === 'number' ? strain.leafCount : 0;
    update('leafCount', Math.max(0, current + delta));
  };

  // 入力値の妥当性チェック。範囲外でも保存はブロックしないので警告メッセージを返すだけ。
  const heightWarning = validateHeight(strain.height);
  const leafCountWarning = validateLeafCount(strain.leafCount);

  const setUploading = (v: boolean) => {
    setPhotoStatus(v ? 'uploading' : 'idle');
    onUploadingChange?.(v);
  };

  // 複数枚対応: アップロード成功した写真を photos 配列に追記する。
  // 同じ株 / 同じ日に「全体 + 葉のアップ」のような撮り方ができるよう、差替えではなく追加。
  const handlePickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    setUploading(true);
    try {
      const { photoPath, photoUrl } = await uploadStrainPhoto({
        uid,
        dateId,
        strainId: strain.id,
        file,
      });
      const existing = Array.isArray(strain.photos) ? strain.photos : [];
      onChange({ ...strain, photos: [...existing, { path: photoPath, url: photoUrl }] });
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  // 個別削除: 指定した path のものだけ配列から除去 + Storage からも消す。
  const handleRemovePhoto = (path: string) => {
    const existing = Array.isArray(strain.photos) ? strain.photos : [];
    onChange({ ...strain, photos: existing.filter((p) => p.path !== path) });
    deleteStrainPhoto(path).catch(() => {});
  };

  const memoLength = (strain.memo ?? '').length;

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="lg:w-32">
          <label className="block text-sm font-medium text-slate-500">品目</label>
          {adding ? (
            <div className="mt-1 flex gap-1">
              <input
                type="text"
                autoFocus
                value={newCategoryDraft}
                onChange={(e) => setNewCategoryDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitNewCategory();
                  } else if (e.key === 'Escape') {
                    setAdding(false);
                  }
                }}
                placeholder="例: トマト"
                maxLength={40}
                className="!min-h-0 !py-2 flex-1"
              />
              <button
                type="button"
                onClick={commitNewCategory}
                className="btn-secondary !min-h-0 !px-3 !py-2 text-xs"
              >
                追加
              </button>
            </div>
          ) : (
            <select
              value={strain.category}
              onChange={(e) => handleCategorySelect(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-tap focus:border-leaf-500 focus:outline-none"
            >
              <option value="">— 未分類 —</option>
              {registeredCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {currentMissing && (
                <option value={currentMissing}>{currentMissing} (未登録)</option>
              )}
              {onAddCategory && (
                <option value={ADD_NEW}>+ 新しい品目を追加…</option>
              )}
            </select>
          )}
        </div>

        <div className="lg:w-28">
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
          <div className="mt-1 flex items-stretch gap-1">
            <button
              type="button"
              onClick={() => adjustHeight(-0.5)}
              className="min-w-12 rounded-xl bg-slate-100 px-3 text-xl font-bold text-slate-700 hover:bg-slate-200 active:scale-95"
              aria-label="草丈を 0.5 cm 減らす"
            >
              −
            </button>
            <div className="flex-1">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                value={strain.height}
                onChange={(e) => update('height', toNum(e.target.value))}
                placeholder="例: 12.5"
                className="!mt-0 text-center"
              />
            </div>
            <button
              type="button"
              onClick={() => adjustHeight(0.5)}
              className="min-w-12 rounded-xl bg-slate-100 px-3 text-xl font-bold text-slate-700 hover:bg-slate-200 active:scale-95"
              aria-label="草丈を 0.5 cm 増やす"
            >
              ＋
            </button>
          </div>
          {heightWarning && (
            <p role="alert" className="mt-1 text-xs text-amber-700">
              ⚠️ {heightWarning}
            </p>
          )}
        </div>

        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-500">葉枚数 (枚)</label>
          <div className="mt-1 flex items-stretch gap-1">
            <button
              type="button"
              onClick={() => adjustLeafCount(-1)}
              className="min-w-12 rounded-xl bg-slate-100 px-3 text-xl font-bold text-slate-700 hover:bg-slate-200 active:scale-95"
              aria-label="葉枚数を 1 枚減らす"
            >
              −
            </button>
            <div className="flex-1">
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                value={strain.leafCount}
                onChange={(e) => update('leafCount', toNum(e.target.value))}
                placeholder="例: 6"
                className="!mt-0 text-center"
              />
            </div>
            <button
              type="button"
              onClick={() => adjustLeafCount(1)}
              className="min-w-12 rounded-xl bg-slate-100 px-3 text-xl font-bold text-slate-700 hover:bg-slate-200 active:scale-95"
              aria-label="葉枚数を 1 枚増やす"
            >
              ＋
            </button>
          </div>
          {leafCountWarning && (
            <p role="alert" className="mt-1 text-xs text-amber-700">
              ⚠️ {leafCountWarning}
            </p>
          )}
        </div>

        <div className="lg:w-40">
          <label className="block text-sm font-medium text-slate-500">
            写真 ({(strain.photos ?? []).length} 枚)
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            {(strain.photos ?? []).map((photo) => (
              <div key={photo.path} className="relative">
                <a href={photo.url} target="_blank" rel="noreferrer">
                  <img
                    src={photo.url}
                    alt={`${strain.name}の写真`}
                    className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200"
                  />
                </a>
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(photo.path)}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow-sm"
                  aria-label={`${strain.name}の写真を削除`}
                  title="この写真を削除"
                >
                  ✕
                </button>
              </div>
            ))}
            <label
              className={`inline-flex h-16 w-16 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-leaf-500 hover:text-leaf-700 ${
                photoStatus === 'uploading' ? 'pointer-events-none opacity-60' : ''
              }`}
              title="写真を追加 (1 株 / 日 に複数枚アップロード可能)"
            >
              {photoStatus === 'uploading' ? '…' : '＋追加'}
              {/*
                capture を指定しないことで、iPad Safari は標準のアクションシート
                (フォトライブラリ / 撮影 / ファイルを選択) を出す。
                オフライン中に iPad の Camera アプリで撮っておき、オンライン復帰後に
                ライブラリから選んでアップロードする運用を可能にする。
              */}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePickPhoto}
                disabled={photoStatus === 'uploading'}
              />
            </label>
          </div>
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
          className="btn-ghost lg:w-28 disabled:opacity-30"
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
          <span className="text-xs text-slate-500">{memoLength}/1000</span>
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
