import { getFunctions, httpsCallable, type FunctionsError } from 'firebase/functions';
import { app, getCurrentClassId } from './firebase';

const functions = getFunctions(app, 'asia-northeast1');

export type StorageUsage = {
  totalBytes: number;
  photoCount: number;
  computedAt: number;
};

/**
 * 現在のクラスの写真容量を集計取得。教員のみ呼び出し可。
 * 関数側で 1〜3 秒かかる場合がある (Storage 全列挙) ので、呼び出し側で
 * ローディング状態を出す前提。
 */
export async function fetchStorageUsage(): Promise<StorageUsage> {
  const callable = httpsCallable<{ classId: string }, StorageUsage>(
    functions,
    'getStorageUsage'
  );
  const res = await callable({ classId: getCurrentClassId() });
  return res.data;
}

/** 1234567 → "1.18 MB" のような人間向け表記。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function translateUsageError(err: unknown): string {
  const code = (err as FunctionsError | undefined)?.code;
  const msg = (err as FunctionsError | undefined)?.message;
  switch (code) {
    case 'functions/permission-denied':
      return msg ?? 'このクラスの教員のみ集計を見られます。';
    case 'functions/unauthenticated':
      return 'ログインが切れています。';
    default:
      return msg ?? (err instanceof Error ? err.message : String(err));
  }
}
