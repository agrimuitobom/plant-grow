import { lazy, type ComponentType } from 'react';

/**
 * 失敗したら少し待って再試行する import()。
 * 一瞬の電波切れでチャンク取得に失敗しただけなら、利用者に見せずに復旧できる。
 */
export async function importWithRetry<T>(
  factory: () => Promise<T>,
  retries = 2,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await factory();
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
}

/** React.lazy の再試行つき版。 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(() => importWithRetry(factory));
}
