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

/** 1 レコード分の行 (日付〜写真URL) を組み立てる。単生徒/クラス一括の両 CSV で共用。 */
function recordRows(records: RecordDoc[]): string[][] {
  const rows: string[][] = [];
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
  return rows;
}

export function recordsToCsv(records: RecordDoc[]): string {
  const rows: string[][] = [[...HEADERS], ...recordRows(records)];
  // Excel 互換のため CRLF。
  return rows.map((row) => row.map(escapeField).join(',')).join('\r\n');
}

/**
 * クラス全員の記録を 1 ファイルにまとめる。
 * 先頭に「生徒名」列が付く以外は単生徒 CSV と同じ形式なので、
 * Excel のピボット/フィルタで生徒別・品目別の集計がそのままできる。
 */
export function classRecordsToCsv(
  entries: readonly { studentName: string; records: RecordDoc[] }[]
): string {
  const rows: string[][] = [['生徒名', ...HEADERS]];
  for (const entry of entries) {
    for (const row of recordRows(entry.records)) {
      rows.push([entry.studentName, ...row]);
    }
  }
  return rows.map((row) => row.map(escapeField).join(',')).join('\r\n');
}

/**
 * 任意の CSV 文字列を Excel 互換の Blob にする。
 * BOM (U+FEFF) を先頭に付けないと Excel が UTF-8 と認識せず日本語が文字化けする。
 */
export function csvStringToBlob(csv: string): Blob {
  const BOM = String.fromCharCode(0xfeff);
  return new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
}

export function toCsvBlob(records: RecordDoc[]): Blob {
  return csvStringToBlob(recordsToCsv(records));
}
