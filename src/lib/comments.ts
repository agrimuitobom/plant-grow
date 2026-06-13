import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, getCurrentClassId } from './firebase';
import { rosterDoc } from './records';
import type { CommentDoc } from '../types';

function commentsCol(uid: string, dateId: string) {
  return collection(db, 'classes', getCurrentClassId(), 'students', uid, 'records', dateId, 'comments');
}

/** 指定日のコメントを古い順で返す。 */
export async function fetchComments(uid: string, dateId: string): Promise<CommentDoc[]> {
  const q = query(commentsCol(uid, dateId), orderBy('createdAt', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    dateId,
    ...(d.data() as Omit<CommentDoc, 'id' | 'dateId'>),
  }));
}

/**
 * 与えられた日付集合 (= 生徒のレコード日付) のコメントをまとめて取得。
 * 1 学期 60 日程度なら 60 リクエストで済む。コメント未投稿の日も空配列を返すので
 * UI 側で「コメントなし」と表示するか間引くかを選択できる。
 */
export async function fetchAllComments(
  uid: string,
  dateIds: string[]
): Promise<CommentDoc[]> {
  if (dateIds.length === 0) return [];
  const results = await Promise.all(dateIds.map((d) => fetchComments(uid, d)));
  return results.flat();
}

export type AddCommentArgs = {
  studentUid: string;
  dateId: string;
  text: string;
  authorUid: string;
  authorName: string;
};

export async function addComment(args: AddCommentArgs): Promise<void> {
  await addDoc(commentsCol(args.studentUid, args.dateId), {
    text: args.text,
    createdAt: serverTimestamp(),
    createdBy: args.authorUid,
    createdByName: args.authorName,
  });
}

/** コメント文を編集。Rules で「作成者のみ」が強制される。 */
export async function updateCommentText(
  studentUid: string,
  dateId: string,
  commentId: string,
  text: string
): Promise<void> {
  await updateDoc(doc(commentsCol(studentUid, dateId), commentId), {
    text,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteComment(
  studentUid: string,
  dateId: string,
  commentId: string
): Promise<void> {
  await deleteDoc(doc(commentsCol(studentUid, dateId), commentId));
}

/**
 * 「先生からのコメントを全て既読にした」とマークする。
 * 名簿ドキュメントの commentsLastReadAt を serverTimestamp で上書きする。
 * Rules は uid + displayName が一致する update を許可しているのでそれら 2 つも一緒に書く。
 */
export async function markAllCommentsRead(
  user: Pick<User, 'uid' | 'displayName' | 'email'>
): Promise<void> {
  await setDoc(
    rosterDoc(user.uid),
    {
      uid: user.uid,
      displayName: user.displayName || user.email || user.uid,
      commentsLastReadAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * 「未読」と判定するヘルパ: 自分以外が書いた、かつ既読時刻より新しいコメントを数える。
 * commentsLastReadAt 未設定 (= 一度も既読化していない) なら全コメント (他人作) が未読扱い。
 */
export function countUnreadComments(
  comments: readonly CommentDoc[],
  myUid: string,
  lastReadAt: { toMillis?: () => number } | undefined | null
): number {
  const lastMs = lastReadAt && typeof lastReadAt.toMillis === 'function'
    ? lastReadAt.toMillis()
    : 0;
  return comments.filter((c) => {
    if (c.createdBy === myUid) return false;
    const created = c.createdAt as { toMillis?: () => number } | undefined;
    const createdMs = created && typeof created.toMillis === 'function'
      ? created.toMillis()
      : 0;
    return createdMs > lastMs;
  }).length;
}
