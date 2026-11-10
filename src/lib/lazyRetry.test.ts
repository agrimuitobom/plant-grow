import { describe, expect, it, vi } from 'vitest';
import { importWithRetry } from './lazyRetry';

describe('importWithRetry', () => {
  it('一時的な失敗の後に成功すればその値を返す', async () => {
    const factory = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue('ok');
    await expect(importWithRetry(factory, 2, 1)).resolves.toBe('ok');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('再試行回数を使い切ったら最後のエラーを投げる', async () => {
    const factory = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('down'));
    await expect(importWithRetry(factory, 2, 1)).rejects.toThrow('down');
    expect(factory).toHaveBeenCalledTimes(3);
  });
});
