import { useState } from 'react';
import {
  buildShareUrl,
  createParentShare,
  revokeParentShare,
  translateShareError,
} from '../lib/parentShare';

type Props = {
  studentUid: string;
  studentDisplayName: string;
  onClose: () => void;
};

type Stage =
  | { kind: 'review' }
  | { kind: 'submitting' }
  | { kind: 'issued'; token: string; url: string; expiresAt: string }
  | { kind: 'error'; message: string };

export default function ParentSharePanel({
  studentUid,
  studentDisplayName,
  onClose,
}: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'review' });
  const [copied, setCopied] = useState(false);

  const issue = async () => {
    if (
      !confirm(
        `${studentDisplayName} さんの保護者向けリンクを発行します。既存のリンクがあれば取り消されます。`
      )
    ) {
      return;
    }
    setStage({ kind: 'submitting' });
    try {
      const { token, expiresAt } = await createParentShare({ studentUid });
      setStage({
        kind: 'issued',
        token,
        url: buildShareUrl(token),
        expiresAt,
      });
    } catch (err) {
      setStage({ kind: 'error', message: translateShareError(err) });
    }
  };

  const revoke = async () => {
    if (stage.kind !== 'issued') return;
    if (!confirm('発行したリンクを取り消します。もう開けなくなります。よろしいですか?')) {
      return;
    }
    try {
      await revokeParentShare(stage.token);
      onClose();
    } catch (err) {
      alert('取り消しに失敗しました: ' + translateShareError(err));
    }
  };

  const copyUrl = async () => {
    if (stage.kind !== 'issued') return;
    try {
      await navigator.clipboard.writeText(stage.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボード未許可なら手動コピーしてもらう
    }
  };

  return (
    <section className="card border-2 border-sky-300 bg-sky-50 print:hidden">
      <header className="flex items-baseline justify-between">
        <h3 className="text-lg font-bold text-sky-900">🔗 保護者向け共有リンク</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-sky-900 underline"
        >
          閉じる
        </button>
      </header>
      <p className="mt-2 text-sm text-sky-900">
        生徒: <span className="font-semibold">{studentDisplayName}</span>
      </p>

      {stage.kind === 'review' && (
        <>
          <p className="mt-3 text-sm text-sky-900">
            発行すると、現在の観察記録・写真・イベントの **スナップショット** をログイン不要で見られる URL が生成されます。
            72 時間で自動失効、いつでも取消可。コメントは含まれません。
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost !min-h-0 !px-4 !py-2 text-sm"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void issue()}
              className="btn-primary !min-h-0 !px-4 !py-2 text-sm"
            >
              リンクを発行する
            </button>
          </div>
        </>
      )}

      {stage.kind === 'submitting' && (
        <p className="mt-3 text-sm text-sky-900">発行中…</p>
      )}

      {stage.kind === 'issued' && (
        <div className="mt-3">
          <p className="text-xs text-sky-800">
            このリンクを保護者の方にお伝えください (LINE / 紙でも可)。
          </p>
          <div className="mt-2 rounded-xl bg-white p-3 ring-1 ring-sky-200">
            <p className="break-all font-mono text-sm text-slate-900">
              {stage.url}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                有効期限: {new Date(stage.expiresAt).toLocaleString('ja-JP')}
              </span>
              <button
                type="button"
                onClick={() => void copyUrl()}
                className="btn-secondary !min-h-0 !px-3 !py-1.5 text-xs"
              >
                {copied ? '✓ コピーしました' : 'URL をコピー'}
              </button>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void revoke()}
              className="text-xs text-red-700 underline"
            >
              このリンクを取り消す
            </button>
          </div>
        </div>
      )}

      {stage.kind === 'error' && (
        <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <p className="font-semibold">発行に失敗しました</p>
          <p className="mt-1">{stage.message}</p>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setStage({ kind: 'review' })}
              className="btn-secondary !min-h-0 !px-3 !py-1.5 text-xs"
            >
              再試行
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
