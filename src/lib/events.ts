import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { CLASS_ID, db } from './firebase';
import type { EventDoc, EventType } from '../types';

function eventsCol(uid: string) {
  return collection(db, 'classes', CLASS_ID, 'students', uid, 'events');
}

/**
 * 指定生徒の全イベントを購読する。createdAt 昇順なので、UI 側で日付別にグループ化する想定。
 * 教員が別生徒の購読をする場合: Rules で同クラスの教員に read を許可しているのでそのまま動く。
 */
export function subscribeToEvents(
  uid: string,
  onChange: (events: EventDoc[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(eventsCol(uid), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EventDoc, 'id'>) }))
      ),
    onError
  );
}

export type AddEventArgs = {
  user: Pick<User, 'uid' | 'displayName' | 'email'>;
  dateId: string;
  type: EventType;
};

export async function addEvent({ user, dateId, type }: AddEventArgs): Promise<void> {
  await addDoc(eventsCol(user.uid), {
    date: dateId,
    type,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    createdByName: user.displayName || user.email || user.uid,
  });
}

export async function deleteEvent(uid: string, eventId: string): Promise<void> {
  await deleteDoc(doc(eventsCol(uid), eventId));
}

/** date 文字列でグループ化したマップを返す。UI 側で日別表示するためのユーティリティ。 */
export function groupEventsByDate(events: readonly EventDoc[]): Map<string, EventDoc[]> {
  const out = new Map<string, EventDoc[]>();
  for (const e of events) {
    const list = out.get(e.date) ?? [];
    list.push(e);
    out.set(e.date, list);
  }
  return out;
}
