import Calendar from 'react-calendar';
import { toDateId } from '../lib/records';

type DatePickerCardProps = {
  value: string;
  onChange: (dateId: string) => void;
  recordedDates?: string[];
};

export default function DatePickerCard({
  value,
  onChange,
  recordedDates = [],
}: DatePickerCardProps) {
  const recorded = new Set(recordedDates);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-bold text-leaf-700">日付を選ぶ</h2>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="!w-auto"
        />
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
