import { useMemo, useState } from 'react';
import {
  buildStudentSummary,
  summariesToCsv,
  type StudentSummary,
} from '../lib/classSummary';
import { classRecordsToCsv, csvStringToBlob } from '../lib/csv';
import { fetchAllRecords } from '../lib/records';
import type { RecordDoc, RosterEntry } from '../types';

type Props = {
  /** 名前順にソート済みの名簿 (TeacherDashboard の sortedRoster をそのまま渡す)。 */
  roster: RosterEntry[];
  /** 行の生徒名クリックで詳細ビューへ飛ばす。 */
  onOpenStudent: (student: RosterEntry) => void;
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

type SortKey = keyof Pick<
  StudentSummary,
  'displayName' | 'recordCount' | 'memoDays' | 'photoCount' | 'lastDate' | 'latestHeight'
>;

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'displayName', label: '生徒名', numeric: false },
  { key: 'recordCount', label: '記録日数', numeric: true },
  { key: 'memoDays', label: 'メモあり日数', numeric: true },
  { key: 'photoCount', label: '写真枚数', numeric: true },
  { key: 'lastDate', label: '最終記録日', numeric: false },
  { key: 'latestHeight', label: '最新草丈(cm)', numeric: true },
];

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function download(filename: string, csv: string): void {
  const url = URL.createObjectURL(csvStringToBlob(csv));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * 評価サマリータブ。
 * クラス全員の記録を読み込み、生徒 × 集計値の表にする。成績付けの一次資料。
 *
 * 読み込みは明示ボタン起動 (30 人 × 60 日 ≒ 1800 doc read を毎回のタブ表示で
 * 消費しないため)。読み込んだ records は一括 CSV 用にメモリ保持する。
 */
export default function EvaluationSummary({ roster, onOpenStudent }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<StudentSummary[]>([]);
  const [recordsByUid, setRecordsByUid] = useState<Map<string, RecordDoc[]>>(
    new Map()
  );
  const [failedNames, setFailedNames] = useState<string[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>('displayName');
  const [sortDesc, setSortDesc] = useState(false);

  const load = async () => {
    setStatus('loading');
    setProgress(0);
    setError(null);
    setFailedNames([]);
    try {
      const collected = new Map<string, RecordDoc[]>();
      const rows: StudentSummary[] = [];
      const failed: string[] = [];
      // 直列で 1 人ずつ (進捗表示のため + Firestore への同時接続を抑える)。
      // 30 人 × 数十 doc なら合計数秒で終わる。
      for (const student of roster) {
        try {
          const records = await fetchAllRecords(student.uid);
          collected.set(student.uid, records);
          rows.push(buildStudentSummary(student, records));
        } catch {
          failed.push(student.displayName);
        }
        setProgress((n) => n + 1);
      }
      setRecordsByUid(collected);
      setSummaries(rows);
      setFailedNames(failed);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  const sorted = useMemo(() => {
    const dir = sortDesc ? -1 : 1;
    return [...summaries].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      // null は常に末尾へ (昇順/降順に関わらず)
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * dir;
      }
      return String(va).localeCompare(String(vb), 'ja') * dir;
    });
  }, [summaries, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      // 数値列は「多い順」で見たいことが多いので降順スタート、名前などは昇順スタート
      setSortDesc(COLUMNS.find((c) => c.key === key)?.numeric ?? false);
    }
  };

  const exportSummaryCsv = () => {
    download(`plant-grow-class-summary-${todayStamp()}.csv`, summariesToCsv(sorted));
  };

  const exportAllRecordsCsv = () => {
    const entries = roster
      .map((s) => ({
        studentName: s.displayName,
        records: recordsByUid.get(s.uid) ?? [],
      }))
      .filter((e) => e.records.length > 0);
    download(
      `plant-grow-class-all-records-${todayStamp()}.csv`,
      classRecordsToCsv(entries)
    );
  };

  return (
    <section className="card">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-leaf-700">評価サマリー</h2>
        <span className="text-xs text-slate-500">
          クラス全体の取り組みを一覧で比較
        </span>
      </header>

      {status === 'idle' && (
        <div className="mt-4">
          <p className="text-sm text-slate-600">
            クラス全員 ({roster.length} 名) の記録を読み込んで、記録日数・メモ・写真・草丈を
            1 つの表にまとめます。読み込みには数秒かかります。
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="btn-primary mt-3 !min-h-0 !px-5 !py-2.5 text-sm"
            disabled={roster.length === 0}
          >
            クラス全体を集計する
          </button>
        </div>
      )}

      {status === 'loading' && (
        <p role="status" className="mt-4 text-sm text-slate-500">
          読み込み中… ({progress} / {roster.length} 人)
        </p>
      )}

      {status === 'error' && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          集計に失敗しました: {error}
        </p>
      )}

      {status === 'ready' && (
        <>
          {failedNames.length > 0 && (
            <p role="alert" className="mt-3 text-sm text-amber-700">
              ⚠️ {failedNames.join('、')} さんの読み込みに失敗しました (表には含まれていません)。
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2 print:hidden">
            <button
              type="button"
              onClick={exportSummaryCsv}
              className="btn-ghost !min-h-0 !px-4 !py-2 text-sm"
              title="この表をそのまま CSV でダウンロード"
            >
              📥 サマリーを CSV
            </button>
            <button
              type="button"
              onClick={exportAllRecordsCsv}
              className="btn-ghost !min-h-0 !px-4 !py-2 text-sm"
              title="全員の全記録 (日付 × 株ごと) を 1 ファイルの CSV でダウンロード"
            >
              📥 全員の記録を一括 CSV
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="btn-ghost !min-h-0 !px-4 !py-2 text-sm"
            >
              ↻ 再集計
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`pb-2 pr-3 font-medium ${col.numeric ? 'text-right' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="hover:text-leaf-700 hover:underline"
                        title="クリックで並び替え"
                      >
                        {col.label}
                        {sortKey === col.key && (
                          <span aria-hidden className="ml-0.5">
                            {sortDesc ? '▼' : '▲'}
                          </span>
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const student = roster.find((r) => r.uid === s.uid);
                  return (
                    <tr key={s.uid} className="border-t border-slate-100">
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          onClick={() => student && onOpenStudent(student)}
                          className="font-semibold text-leaf-700 hover:underline"
                          title={`${s.displayName} さんの詳細を開く`}
                        >
                          {s.displayName}
                        </button>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {s.recordCount}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.memoDays}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {s.photoCount}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{s.lastDate ?? '—'}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {s.latestHeight ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            生徒名をクリックすると詳細 (前へ / 次へで巡回可能) が開きます。
            列見出しのクリックで並び替えできます。
          </p>
        </>
      )}
    </section>
  );
}
