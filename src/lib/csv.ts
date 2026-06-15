import { getStrainPhotos } from './strain';
import type { RecordDoc } from '../types';

const HEADERS = ['日付', '品目', '株名', '草丈(cm)', '葉枚数(枚)', '写真URL'] as const;

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
      // 複数枚の URL は改行区切りでひとつのセルに集約する。
      // RFC 4180 ではフィールドに \n を含む場合ダブルクォートで囲めば OK で、Excel もこの形式を
      // 「セル内改行」として正しく解釈する。
      const photoUrls = getStrainPhotos(s).map((p) => p.url).join('\n');
      rows.push([
        r.date,
        s.category ?? '',
        // saveRecord 側でも空文字を id にフォールバックさせているのでここでも揃える。
        s.name || s.id,
        s.height == null ? '' : String(s.height),
        s.leafCount == null ? '' : String(s.leafCount),
        photoUrls,
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
