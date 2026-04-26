import type { RecordDoc } from '../types';

const HEADERS = ['日付', '株名', '草丈(cm)', '葉枚数(枚)', '写真URL'] as const;

// RFC 4180: フィールドが , " \r \n を含むときはダブルクォートで囲み、内部の " は "" にする。
function escapeField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function recordsToCsv(records: RecordDoc[]): string {
  const rows: string[][] = [[...HEADERS]];
  for (const r of records) {
    for (const s of r.strains ?? []) {
      rows.push([
        r.date,
        s.name ?? s.id,
        s.height == null ? '' : String(s.height),
        s.leafCount == null ? '' : String(s.leafCount),
        s.photoUrl ?? '',
      ]);
    }
  }
  // Excel 互換のため CRLF。
  return rows.map((row) => row.map(escapeField).join(',')).join('\r\n');
}

export function toCsvBlob(records: RecordDoc[]): Blob {
  // BOM (U+FEFF) を先頭に付けないと Excel が UTF-8 と認識せず日本語が文字化けする。
  const BOM = String.fromCharCode(0xfeff);
  return new Blob([BOM + recordsToCsv(records)], {
    type: 'text/csv;charset=utf-8;',
  });
}
