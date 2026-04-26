import { describe, expect, it } from 'vitest';
import { recordsToCsv, toCsvBlob } from './csv';
import type { RecordDoc } from '../types';

function rec(date: string, strains: RecordDoc['strains']): RecordDoc {
  return {
    date,
    strains,
    averages: { height: null, leafCount: null },
    createdBy: 'u',
    updatedBy: 'u',
    updatedByName: '',
  };
}

describe('recordsToCsv', () => {
  it('emits header row even when no records', () => {
    const csv = recordsToCsv([]);
    expect(csv).toBe('日付,品目,株名,草丈(cm),葉枚数(枚),写真URL');
  });

  it('flattens one row per (date × strain) and joins with CRLF', () => {
    const csv = recordsToCsv([
      rec('2026-04-20', [
        {
          id: 'A',
          category: 'トマト',
          name: 'A株',
          height: 12.5,
          leafCount: 6,
          memo: '',
          photoPath: null,
          photoUrl: 'https://x/a.jpg',
        },
        {
          id: 'B',
          category: 'ナス',
          name: 'B株',
          height: null,
          leafCount: null,
          memo: '',
          photoPath: null,
          photoUrl: null,
        },
      ]),
    ]);
    expect(csv).toBe(
      [
        '日付,品目,株名,草丈(cm),葉枚数(枚),写真URL',
        '2026-04-20,トマト,A株,12.5,6,https://x/a.jpg',
        '2026-04-20,ナス,B株,,,',
      ].join('\r\n')
    );
  });

  it('quotes fields containing comma / double-quote / newline per RFC 4180', () => {
    const csv = recordsToCsv([
      rec('2026-04-21', [
        {
          id: 'A',
          category: '',
          name: 'B,株',
          height: 10,
          leafCount: 5,
          memo: '',
          photoPath: null,
          photoUrl: null,
        },
        {
          id: 'B',
          category: '',
          name: '改"名',
          height: 11,
          leafCount: 5,
          memo: '',
          photoPath: null,
          photoUrl: null,
        },
        {
          id: 'C',
          category: '改\n行',
          name: 'C',
          height: 12,
          leafCount: 5,
          memo: '',
          photoPath: null,
          photoUrl: null,
        },
      ]),
    ]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('2026-04-21,,"B,株",10,5,');
    expect(lines[2]).toBe('2026-04-21,,"改""名",11,5,');
    expect(lines[3]).toBe('2026-04-21,"改\n行",C,12,5,');
  });

  it('treats missing optional fields as empty', () => {
    const csv = recordsToCsv([
      rec('2026-04-22', [
        {
          id: 'A',
          // category, photoPath, photoUrl 省略
          name: '',
          height: null,
          leafCount: null,
          memo: '',
        } as never,
      ]),
    ]);
    // name 空 → s.id にフォールバック ('A'), category undefined → '', photoUrl undefined → ''
    expect(csv.split('\r\n')[1]).toBe('2026-04-22,,A,,,');
  });
});

describe('toCsvBlob', () => {
  it('prepends UTF-8 BOM and uses text/csv content-type', async () => {
    const blob = toCsvBlob([]);
    expect(blob.type).toContain('text/csv');
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
