import { toCsvBlob } from '../lib/csv';
import type { RecordDoc } from '../types';

type Props = {
  records: RecordDoc[];
  ownerLabel?: string | null;
};

function safeFilename(s: string): string {
  return s.replace(/[\/\\?%*:|"<>\s]+/g, '_').slice(0, 40) || 'records';
}

export default function ExportCsvButton({ records, ownerLabel }: Props) {
  const disabled = records.length === 0;

  const handleClick = () => {
    if (disabled) return;
    const blob = toCsvBlob(records);
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const owner = ownerLabel ? safeFilename(ownerLabel) : 'records';
    const a = document.createElement('a');
    a.href = url;
    a.download = `plant-grow-${owner}-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="btn-ghost !min-h-0 !px-4 !py-2 text-sm disabled:opacity-40"
      title="観察記録を CSV ファイルとしてダウンロード（Excel 対応）"
    >
      📥 CSV エクスポート
    </button>
  );
}
