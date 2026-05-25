import Calendar from 'react-calendar';
import { toDateId } from '../lib/records';

type DatePickerCardProps = {
  value: string;
  onChange: (dateId: string) => void;
  recordedDates?: string[];
};

function todayId(): string {
  return toDateId(new Date());
}
function yesterdayId(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDateId(d);
}

export default function DatePickerCard({
  value,
  onChange,
  recordedDates = [],
}: DatePickerCardProps) {
  const recorded = new Set(recordedDates);
  const today = todayId();
  const yesterday = yesterdayId();

  const Chip = ({ label, target }: { label: string; target: string }) => {
    const active = value === target;
    return (
      <button
        type="button"
        onClick={() => onChange(target)}
        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
          active
            ? 'bg-leaf-500 text-white shadow'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
        aria-pressed={active}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-leaf-700">日付を選ぶ</h2>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="!w-auto"
        />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Chip label="今日" target={today} />
        <Chip label="昨日" target={yesterday} />
      </div>
      <Calendar
        value={new Date(value)}
        onChange={(d) => {
          // react-calendar の onChange は Value (Date | [Date, Date] | null) を返す。
          // 単一選択モードでは Date が来るが、念のため絞り込む。
          if (d instanceof Date) onChange(toDateId(d));
        }}
        locale="ja-JP"
        calendarType="gregory"
        tileClassName={({ date, view }) => {
          if (view !== 'month') return null;
          return recorded.has(toDateId(date)) ? 'has-record' : null;
        }}
      />
      <p className="mt-3 text-sm text-slate-500">
        ● マークのついた日は過去に記録があります。選択すると編集できます。
      </p>
    </div>
  );
}
