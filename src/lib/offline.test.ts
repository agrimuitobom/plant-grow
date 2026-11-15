import { describe, expect, it, vi } from 'vitest';
import { isOfflineReadError, settleWrite } from './offline';

const never = () => new Promise<void>(() => {});

describe('settleWrite', () => {
  it('オンラインでサーバ応答があれば synced', async () => {
    await expect(settleWrite(Promise.resolve(), { isOnline: () => true })).resolves.toBe('synced');
  });

  it('オンラインで拒否されたらエラーをそのまま投げる', async () => {
    const err = new Error('permission-denied');
    await expect(settleWrite(Promise.reject(err), { isOnline: () => true })).rejects.toBe(err);
  });

  it('オフラインなら解決しない書き込みを待たずに queued', async () => {
    await expect(settleWrite(never(), { isOnline: () => false })).resolves.toBe('queued');
  });

  it('オンラインでも応答が遅ければ timeout で queued', async () => {
    await expect(
      settleWrite(never(), { isOnline: () => true, timeoutMs: 10 })
    ).resolves.toBe('queued');
  });

  it('queued の後で失敗したら onLateError に通知する', async () => {
    const onLateError = vi.fn();
    let reject!: (e: unknown) => void;
    const write = new Promise<void>((_, rej) => {
      reject = rej;
    });
    await expect(settleWrite(write, { isOnline: () => false, onLateError })).resolves.toBe('queued');
    const err = new Error('late');
    reject(err);
    await Promise.resolve();
    await Promise.resolve();
    expect(onLateError).toHaveBeenCalledWith(err);
  });
});

describe('isOfflineReadError', () => {
  it('unavailable をオフライン読み取り失敗として扱う', () => {
    expect(isOfflineReadError({ code: 'unavailable' })).toBe(true);
    expect(isOfflineReadError({ code: 'permission-denied' })).toBe(false);
    expect(isOfflineReadError(null)).toBe(false);
  });
});
