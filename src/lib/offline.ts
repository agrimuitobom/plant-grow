/**
 * Firestore の書き込み Promise は「サーバが受理した時」に解決する。
 * オフライン中はローカルキャッシュへの反映 (= onSnapshot の発火) は即座に起きるのに
 * Promise だけが復帰まで解決しないため、素直に await すると UI が「保存中…」のまま固まる。
 *
 * settleWrite はその差を吸収する:
 *   - オフライン: 待たずに 'queued' を返す (書き込みは端末に保留され、復帰後に自動同期)
 *   - オンライン: サーバ応答を待って 'synced'。Rules 拒否などのエラーはそのまま throw
 *   - オンラインだが応答が遅い (電波が弱い教室など): timeoutMs で見切って 'queued'
 *
 * 'queued' で返した後に書き込みが失敗した場合は onLateError に通知する
 * (握りつぶすと「保存できたつもり」になるため、呼び出し側でトースト等を出す)。
 */
export type WriteOutcome = 'synced' | 'queued';

export type SettleWriteOptions = {
  /** オンライン時にサーバ応答を待つ上限。既定 8 秒。 */
  timeoutMs?: number;
  /** 'queued' を返した後で書き込みが失敗した時に呼ばれる。 */
  onLateError?: (err: unknown) => void;
  /** テスト用: 接続状態の判定を差し替える。既定は navigator.onLine。 */
  isOnline?: () => boolean;
};

const DEFAULT_TIMEOUT_MS = 8000;

function defaultIsOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export async function settleWrite(
  write: Promise<unknown>,
  { timeoutMs = DEFAULT_TIMEOUT_MS, onLateError, isOnline = defaultIsOnline }: SettleWriteOptions = {}
): Promise<WriteOutcome> {
  let settled = false;
  let timedOut = false;
  // 見切った後の失敗を unhandled rejection にしない。見切る前の失敗は下の race が throw する。
  const tracked = write.then(
    () => {
      settled = true;
    },
    (err: unknown) => {
      settled = true;
      if (timedOut) onLateError?.(err);
      else throw err;
    }
  );

  if (!isOnline()) {
    timedOut = true;
    void tracked;
    return 'queued';
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      if (!settled) timedOut = true;
      resolve();
    }, timeoutMs);
  });
  try {
    await Promise.race([tracked, timeout]);
  } finally {
    clearTimeout(timer);
  }
  return timedOut ? 'queued' : 'synced';
}

/** Firestore の「オフラインでキャッシュにも無い」エラーかどうか。 */
export function isOfflineReadError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'unavailable' || code === 'failed-precondition';
}
