import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addComment,
  countUnreadComments,
  deleteComment,
  fetchAllComments,
  updateCommentText,
} from '../lib/comments';
import type { CommentDoc, RecordDoc } from '../types';

type Status = 'loading' | 'ready' | 'error';

type Props = {
  /** コメント対象の生徒 uid。 */
  studentUid: string;
  /** 一覧表示のために必要。dateId を絞り込む select にも使う。 */
  records: RecordDoc[];
  /** 教員モード: 投稿者として書き込み権限を持つ場合に指定。 */
  poster?: { uid: string; displayName: string };
  /** 上部見出し。教員モードでは「(生徒名) へのフィードバック」など。 */
  heading?: string;
  /**
   * 未読判定用。生徒自身が自分の画面で見る時にだけ意味がある。
   * 教員モードや別生徒を見ている時は未指定 → 未読ハイライト無効。
   */
  viewer?: {
    uid: string;
    /** 名簿ドキュメントの commentsLastReadAt。未指定なら全コメントを未読扱い。 */
    lastReadAt?: { toMillis?: () => number } | null;
  };
  /** 未読件数が変わったときに呼ぶ。App 側のフローティングバッジ更新に使う。 */
  onUnreadCountChange?: (count: number) => void;
};

function formatTimestamp(c: CommentDoc): string {
  const v = c.createdAt as { toDate?: () => Date } | undefined;
  if (!v?.toDate) return '';
  const d = v.toDate();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da} ${h}:${m}`;
}

export default function CommentBoard({
  studentUid,
  records,
  poster,
  heading,
  viewer,
  onUnreadCountChange,
}: Props) {
  const [comments, setComments] = useState<CommentDoc[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const [draftDate, setDraftDate] = useState<string>('');
  const [draftText, setDraftText] = useState('');
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const dateOptions = useMemo(
    () => records.map((r) => r.date).sort((a, b) => b.localeCompare(a)),
    [records]
  );

  // 投稿フォームの初期日付: 最新の記録日。
  useEffect(() => {
    if (!draftDate && dateOptions[0]) setDraftDate(dateOptions[0]);
  }, [dateOptions, draftDate]);

  const reload = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const list = await fetchAllComments(studentUid, dateOptions);
      // 新しい順 (date desc, createdAt desc)
      list.sort((a, b) => {
        if (a.dateId !== b.dateId) return (b.dateId ?? '').localeCompare(a.dateId ?? '');
        const ta = (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
        const tb = (b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
        return tb - ta;
      });
      setComments(list);
      setStatus('ready');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [studentUid, dateOptions]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poster) return;
    const text = draftText.trim();
    if (!text || !draftDate) return;
    setBusy(true);
    try {
      await addComment({
        studentUid,
        dateId: draftDate,
        text,
        authorUid: poster.uid,
        authorName: poster.displayName,
      });
      setDraftText('');
      await reload();
    } catch (e: unknown) {
      alert('コメントを投稿できませんでした: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleStartEdit = (c: CommentDoc) => {
    setEditingId(c.id);
    setEditText(c.text);
  };

  const handleSaveEdit = async (c: CommentDoc) => {
    const text = editText.trim();
    if (!text || !c.dateId) return;
    setBusy(true);
    try {
      await updateCommentText(studentUid, c.dateId, c.id, text);
      setEditingId(null);
      await reload();
    } catch (e: unknown) {
      alert('編集を保存できませんでした: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (c: CommentDoc) => {
    if (!c.dateId) return;
    if (!confirm('このコメントを削除しますか?')) return;
    setBusy(true);
    try {
      await deleteComment(studentUid, c.dateId, c.id);
      await reload();
    } catch (e: unknown) {
      alert('削除できませんでした: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const title = heading ?? (poster ? '先生からのコメント (投稿可)' : '先生からのコメント');

  // 未読件数を算出 & 親に通知。viewer 未指定なら 0 を返して何もしない。
  const unreadCount = useMemo(() => {
    if (!viewer) return 0;
    return countUnreadComments(comments, viewer.uid, viewer.lastReadAt ?? null);
  }, [comments, viewer]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
    // unmount 時に 0 を通知して App 側のバッジを残さないように。
    return () => onUnreadCountChange?.(0);
  }, [unreadCount, onUnreadCountChange]);

  // 未読ハイライト判定: viewer 指定時のみ意味がある。
  const lastReadMs =
    viewer?.lastReadAt && typeof viewer.lastReadAt.toMillis === 'function'
      ? viewer.lastReadAt.toMillis()
      : 0;

  return (
    <section className="card" id="comment-board">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-leaf-700">{title}</h2>
        <span className="text-xs text-slate-500">
          {comments.length} 件
          {unreadCount > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
              未読 {unreadCount}
            </span>
          )}
        </span>
      </header>

      {poster && (
        <form
          onSubmit={handleAdd}
          className="mt-4 flex flex-col gap-2 rounded-2xl bg-leaf-50 p-3 ring-1 ring-leaf-100 print:hidden"
        >
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-slate-500">対象日</label>
              <select
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className="mt-1 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base"
                disabled={dateOptions.length === 0}
              >
                {dateOptions.length === 0 ? (
                  <option value="">記録がありません</option>
                ) : (
                  dateOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="この日の観察へのコメントを書く (1〜1000 文字)"
            maxLength={1000}
            rows={3}
            className="w-full resize-y rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base focus:border-leaf-500 focus:outline-none"
            disabled={busy || dateOptions.length === 0}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">{draftText.length}/1000</span>
            <button
              type="submit"
              disabled={busy || !draftText.trim() || !draftDate}
              className="btn-secondary !min-h-0 !px-4 !py-2 text-sm disabled:opacity-40"
            >
              投稿する
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {status === 'loading' && (
          <p role="status" className="text-slate-500">
            読み込み中…
          </p>
        )}
        {status === 'error' && <p className="text-red-600">読み込みエラー: {error}</p>}
        {status === 'ready' && comments.length === 0 && (
          <p className="text-slate-500">
            {poster
              ? 'まだコメントがありません。上の欄から投稿できます。'
              : 'まだコメントが届いていません。'}
          </p>
        )}
        {comments.map((c) => {
          const isOwn = poster?.uid === c.createdBy;
          const isEditing = editingId === c.id;
          // 未読判定: viewer 指定 + 自分以外が書いた + 既読時刻より新しい
          const createdMs =
            (c.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          const isUnread =
            !!viewer &&
            c.createdBy !== viewer.uid &&
            createdMs > lastReadMs;
          return (
            <article
              key={c.id}
              className={`rounded-2xl p-3 ring-1 ${
                isUnread
                  ? 'bg-amber-50 ring-amber-300'
                  : 'bg-white ring-slate-100'
              }`}
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm">
                  <span className="font-semibold text-leaf-700">{c.dateId}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {c.createdByName} {formatTimestamp(c)}
                  </span>
                </div>
                {isOwn && !isEditing && (
                  <div className="flex gap-3 text-xs print:hidden">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(c)}
                      className="text-leaf-700 underline"
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c)}
                      className="text-red-600 underline"
                    >
                      削除
                    </button>
                  </div>
                )}
              </header>
              {isEditing ? (
                <div className="mt-2 flex flex-col gap-2">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    className="w-full resize-y rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-base focus:border-leaf-500 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-slate-500 underline"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(c)}
                      disabled={busy || !editText.trim()}
                      className="font-semibold text-leaf-700 underline disabled:opacity-40"
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{c.text}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
