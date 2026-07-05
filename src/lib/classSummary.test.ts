import { describe, expect, it } from 'vitest';
import { buildStudentSummary, summariesToCsv } from './classSummary';
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

const student = { uid: 'student-a', displayName: 'あおい' };

describe('buildStudentSummary', () => {
  it('returns zeros/nulls for a student with no records', () => {
    expect(buildStudentSummary(student, [])).toEqual({
      uid: 'student-a',
      displayName: 'あおい',
      recordCount: 0,
      memoDays: 0,
      photoCount: 0,
      lastDate: null,
      latestHeight: null,
    });
  });

  it('counts records, memo days and photos across both photo formats', () => {
    const records = [
      rec('2026-04-20', [
        {
          id: 'A',
          name: 'A株',
          height: 10,
          leafCount: 4,
          memo: '元気',
          photos: [
            { path: 'p/1.jpg', url: 'https://x/1.jpg' },
            { path: 'p/2.jpg', url: 'https://x/2.jpg' },
          ],
        },
        // 旧形式 (単数 photoPath/photoUrl) も 1 枚として数える
        {
          id: 'B',
          name: 'B株',
          height: 12,
          leafCount: 5,
          memo: '',
          photoPath: 'p/legacy.jpg',
          photoUrl: 'https://x/legacy.jpg',
        },
      ]),
      rec('2026-04-22', [
        { id: 'A', name: 'A株', height: 14, leafCount: 6, memo: '  ', photos: [] },
      ]),
    ];
    const s = buildStudentSummary(student, records);
    expect(s.recordCount).toBe(2);
    // 4/20 は memo あり、4/22 は空白のみ → 1 日
    expect(s.memoDays).toBe(1);
    expect(s.photoCount).toBe(3);
    expect(s.lastDate).toBe('2026-04-22');
    expect(s.latestHeight).toBe(14);
  });

  it('finds the last date even when records are out of order', () => {
    const records = [
      rec('2026-05-10', [{ id: 'A', name: 'A', height: 20, leafCount: 8, memo: '', photos: [] }]),
      rec('2026-04-01', [{ id: 'A', name: 'A', height: 5, leafCount: 2, memo: '', photos: [] }]),
    ];
    const s = buildStudentSummary(student, records);
    expect(s.lastDate).toBe('2026-05-10');
    expect(s.latestHeight).toBe(20);
  });

  it('latestHeight averages the strains of the latest record only', () => {
    const records = [
      rec('2026-05-01', [
        { id: 'A', name: 'A', height: 10, leafCount: 4, memo: '', photos: [] },
        { id: 'B', name: 'B', height: 20, leafCount: 6, memo: '', photos: [] },
        { id: 'C', name: 'C', height: null, leafCount: null, memo: '', photos: [] },
      ]),
    ];
    // null 株は平均から除外 → (10 + 20) / 2 = 15
    expect(buildStudentSummary(student, records).latestHeight).toBe(15);
  });
});

describe('summariesToCsv', () => {
  it('produces a header and one row per student with CRLF joins', () => {
    const csv = summariesToCsv([
      {
        uid: 'a',
        displayName: 'あおい',
        recordCount: 12,
        memoDays: 8,
        photoCount: 30,
        lastDate: '2026-06-13',
        latestHeight: 23.5,
      },
      {
        uid: 'b',
        displayName: 'かえで',
        recordCount: 0,
        memoDays: 0,
        photoCount: 0,
        lastDate: null,
        latestHeight: null,
      },
    ]);
    expect(csv).toBe(
      [
        '生徒名,記録日数,メモあり日数,写真枚数,最終記録日,最新草丈(cm)',
        'あおい,12,8,30,2026-06-13,23.5',
        'かえで,0,0,0,,',
      ].join('\r\n')
    );
  });

  it('escapes commas in display names', () => {
    const csv = summariesToCsv([
      {
        uid: 'a',
        displayName: 'A,さん',
        recordCount: 1,
        memoDays: 0,
        photoCount: 0,
        lastDate: '2026-06-01',
        latestHeight: null,
      },
    ]);
    expect(csv.split('\r\n')[1]).toBe('"A,さん",1,0,0,2026-06-01,');
  });
});
