import { calcAverages } from './records';
import { getStrainPhotos } from './strain';
import type { RecordDoc, RosterEntry } from '../types';

/**
 * 評価サマリー表の 1 行。教員が「クラス全体の取り組み状況」を横並びで比較するための集計値。
 */
export type StudentSummary = {
  uid: string;
  displayName: string;
  /** 記録した日数 */
  recordCount: number;
  /** 観察メモを 1 文字以上書いた日数 (取り組みの丁寧さの目安) */
  memoDays: number;
  /** アップロードした写真の総枚数 (新旧両形式を合算) */
  photoCount: number;
  /** 最後に記録した日付 (YYYY-MM-DD)。記録なしなら null */
  lastDate: string | null;
  /** 最終記録日の平均草丈 (cm)。成長のアウトカム比較用 */
  latestHeight: number | null;
};

/**
 * 1 生徒分のサマリーを組み立てる純粋関数。
 * records は fetchAllRecords の返り値 (date 昇順) を想定するが、
 * 念のため内部で最終日を max 探索するので順不同でも壊れない。
 */
export function buildStudentSummary(
  student: Pick<RosterEntry, 'uid' | 'displayName'>,
  records: RecordDoc[]
): StudentSummary {
  let lastDate: string | null = null;
  let lastRecord: RecordDoc | null = null;
  let memoDays = 0;
  let photoCount = 0;

  for (const r of records) {
    if (lastDate === null || r.date > lastDate) {
      lastDate = r.date;
      lastRecord = r;
    }
    const strains = r.strains ?? [];
    if (strains.some((s) => (s.memo ?? '').trim() !== '')) {
      memoDays++;
    }
    for (const s of strains) {
      photoCount += getStrainPhotos(s).length;
    }
  }

  return {
    uid: student.uid,
    displayName: student.displayName,
    recordCount: records.length,
    memoDays,
    photoCount,
    lastDate,
    latestHeight: lastRecord
      ? calcAverages(lastRecord.strains ?? []).height
      : null,
  };
}

/** サマリー表を CSV 化する (Excel 互換は csv.ts の csvStringToBlob 側で担保)。 */
export function summariesToCsv(rows: readonly StudentSummary[]): string {
  const header = '生徒名,記録日数,メモあり日数,写真枚数,最終記録日,最新草丈(cm)';
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = rows.map((r) =>
    [
      esc(r.displayName),
      String(r.recordCount),
      String(r.memoDays),
      String(r.photoCount),
      r.lastDate ?? '',
      r.latestHeight == null ? '' : String(r.latestHeight),
    ].join(',')
  );
  return [header, ...lines].join('\r\n');
}
