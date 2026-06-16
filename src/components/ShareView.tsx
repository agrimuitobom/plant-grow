import { Suspense, lazy, useEffect, useState } from 'react';
import { fetchShareByToken, type ParentShareDoc } from '../lib/parentShare';

const GrowthChart = lazy(() => import('./GrowthChart'));
const PhotoTimeline = lazy(() => import('./PhotoTimeline'));
const RecordsList = lazy(() => import('./RecordsList'));
const EventLog = lazy(() => import('./EventLog'));

type Props = {
  token: string;
};

type Status = 'loading' | 'ready' | 'not-found' | 'error';

function CardFallback({ label }: { label: string }) {
  return <div className="card text-slate-500">{label} を読み込み中…</div>;
}

function formatExpires(
  expiresAt: ParentShareDoc['expiresAt'] | undefined
): string {
  if (!expiresAt?.toDate) return '';
  const d = expiresAt.toDate();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da} ${h}:${m}`;
}

/**
 * 保護者向け公開ビュー。
 *
 * - URL に埋め込まれたトークンで shares/{token} を直接 fetch する (未認証 OK)。
 * - 期限切れや token 不正は「リンクが無効です」を出して終了。
 * - 表示するのは観察ポートフォリオ (グラフ・記録一覧・アルバム・イベント) の read-only スナップショット。
 * - コメントは含まれない (発行時にスナップショットから除外している)。
 */
export default function ShareView({ token }: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [share, setShare] = useState<ParentShareDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetchShareByToken(token)
      .then((s) => {
        if (cancelled) return;
        if (!s) {
          setStatus('not-found');
          return;
        }
        setShare(s);
        setStatus('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        読み込み中…
      </div>
    );
  }

  if (status === 'not-found' || status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-red-600">⚠️ リンクが見つかりません</h1>
          <p className="mt-3 text-sm text-slate-500">
            このリンクは無効か、すでに有効期限が切れています。発行者にもう一度新しいリンクをお願いしてください。
          </p>
          {status === 'error' && error && (
            <p className="mt-3 text-xs text-slate-500">技術情報: {error}</p>
          )}
        </div>
      </div>
    );
  }

  if (!share) return null;

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <header className="mx-auto mb-6 max-w-5xl">
        <h1 className="text-3xl font-bold text-leaf-700">
          🌱 {share.studentDisplayName} さんの観察ポートフォリオ
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          発行時点のスナップショット (記録 {share.records.length} 日 / イベント{' '}
          {share.events.length} 件)
        </p>
        <p className="mt-1 text-xs text-slate-500">
          ※ このページは保護者向けの読み取り専用ビューです。
          {formatExpires(share.expiresAt) && (
            <> 有効期限: {formatExpires(share.expiresAt)}</>
          )}
        </p>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6">
        <Suspense fallback={<CardFallback label="グラフ" />}>
          <GrowthChart records={share.records} events={share.events} />
        </Suspense>

        <Suspense fallback={<CardFallback label="記録一覧" />}>
          <RecordsList records={share.records} />
        </Suspense>

        <Suspense fallback={<CardFallback label="観察イベント" />}>
          <EventLog
            studentUid={share.studentUid}
            dateId=""
            events={share.events}
          />
        </Suspense>

        <Suspense fallback={<CardFallback label="写真アルバム" />}>
          <PhotoTimeline records={share.records} />
        </Suspense>
      </main>

      <footer className="mx-auto mt-10 max-w-5xl text-center text-xs text-slate-500">
        植物生育管理 — 保護者向け共有ビュー
      </footer>
    </div>
  );
}
