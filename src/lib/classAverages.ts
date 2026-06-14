import { getFunctions, httpsCallable, type FunctionsError } from 'firebase/functions';
import { app, getCurrentClassId } from './firebase';

const functions = getFunctions(app, 'asia-northeast1');

export type ClassAveragePoint = {
  date: string;
  height: number | null;
  leafCount: number | null;
  sampleSize: number;
};

type Cached = {
  classId: string;
  averages: ClassAveragePoint[];
  computedAt: number;
};

const CACHE_KEY_PREFIX = 'plant-grow.classAverages.';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分

function readCache(classId: string): ClassAveragePoint[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + classId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (parsed.classId !== classId) return null;
    if (Date.now() - parsed.computedAt > CACHE_TTL_MS) return null;
    return parsed.averages;
  } catch {
    return null;
  }
}

function writeCache(classId: string, averages: ClassAveragePoint[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload: Cached = { classId, averages, computedAt: Date.now() };
    localStorage.setItem(CACHE_KEY_PREFIX + classId, JSON.stringify(payload));
  } catch {
    // QuotaExceeded など。失敗してもアプリ動作には影響しない。
  }
}

/**
 * 現在のクラスの日付別平均値を取得。
 * 5 分以内に取得したものはローカルキャッシュから即返す (Cloud Function を毎回叩かない)。
 * forceRefresh: true でキャッシュを無視して最新を取りに行く。
 */
export async function fetchClassAverages(
  forceRefresh = false
): Promise<ClassAveragePoint[]> {
  const classId = getCurrentClassId();
  if (!forceRefresh) {
    const cached = readCache(classId);
    if (cached) return cached;
  }
  const callable = httpsCallable<
    { classId: string },
    { averages: ClassAveragePoint[]; computedAt: number }
  >(functions, 'getClassAverages');
  const res = await callable({ classId });
  writeCache(classId, res.data.averages);
  return res.data.averages;
}

export function translateClassAveragesError(err: unknown): string {
  const code = (err as FunctionsError | undefined)?.code;
  const msg = (err as FunctionsError | undefined)?.message;
  switch (code) {
    case 'functions/permission-denied':
      return msg ?? 'このクラスのメンバーのみ平均値を見られます。';
    case 'functions/unauthenticated':
      return 'ログインが切れています。';
    default:
      return msg ?? (err instanceof Error ? err.message : String(err));
  }
}
