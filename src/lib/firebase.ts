import { initializeApp } from 'firebase/app';
import {
  type User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// これらの値は「公開しても安全」な識別子 (アクセス制御は firestore.rules 側で実施)。
// ローカルでは .env.local、CI/本番では GitHub Actions の Secrets から注入される。
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * 既定クラス ID。ビルド時の VITE_CLASS_ID または "class-demo"。
 * 端末ごとに localStorage で上書き可能 (getCurrentClassId / setCurrentClassId 参照)。
 * 新年度・新クラスを開設するときは、運用者が UI から ID を入れ直して切り替える。
 */
const DEFAULT_CLASS_ID: string = import.meta.env.VITE_CLASS_ID || 'class-demo';
const CLASS_ID_STORAGE_KEY = 'plant-grow.classId';

function readPersistedClassId(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_CLASS_ID;
  try {
    const v = localStorage.getItem(CLASS_ID_STORAGE_KEY);
    return v && v.trim() !== '' ? v : DEFAULT_CLASS_ID;
  } catch {
    return DEFAULT_CLASS_ID;
  }
}

let _currentClassId = readPersistedClassId();
const classChangeListeners = new Set<(classId: string) => void>();

/** 全 Firestore / Storage 操作で使う現在のクラス ID。lib/* / components/* はこれを呼ぶ。 */
export function getCurrentClassId(): string {
  return _currentClassId;
}

/** クラス ID を切り替える。localStorage に永続化、購読中のコンポーネントに通知する。 */
export function setCurrentClassId(classId: string): void {
  const next = classId.trim() || DEFAULT_CLASS_ID;
  if (_currentClassId === next) return;
  _currentClassId = next;
  try {
    localStorage.setItem(CLASS_ID_STORAGE_KEY, next);
  } catch {
    // private mode 等で書き込み失敗。メモリ内の値だけ保持する。
  }
  classChangeListeners.forEach((cb) => cb(next));
}

/** クラス ID 変更を購読する。useEffect の cleanup で unsubscribe を呼ぶこと。 */
export function onClassIdChange(cb: (classId: string) => void): () => void {
  classChangeListeners.add(cb);
  return () => {
    classChangeListeners.delete(cb);
  };
}

/**
 * @deprecated 後方互換のために残す。新コードは getCurrentClassId() を使うこと。
 * モジュール読込時の値で固定されるため、切替後は陳腐化する可能性がある。
 */
export const CLASS_ID: string = _currentClassId;

export const app = initializeApp(firebaseConfig);
// IndexedDB ベースの永続キャッシュを有効化。授業中に Wi-Fi が切れても
// 書き込みは端末に保留され、復帰後に自動同期される。
// 利用不可な環境 (プライベートブラウジング等) では自動的にメモリキャッシュにフォールバック。
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const auth = getAuth(app);
export const storage = getStorage(app);

/**
 * 学校用 ID を Firebase Auth が要求するメール形式に変換する。
 * - 生徒は「ID」だけ入力すればよい (実在のメールは不要)。
 * - .invalid は RFC 2606 で予約された never-resolves な TLD なので、
 *   万一外部に流出しても本物のメールアドレスにはならない。
 * - CLASS_ID をドメインに含めることでクラス間で名前空間を分離。
 */
function sanitizeIdForAuth(id: string): string {
  return id.trim().replace(/[^a-z0-9._-]/gi, '').toLowerCase();
}

function classDomain(): string {
  return getCurrentClassId().replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'plant-grow';
}

export function idToAuthEmail(id: string): string {
  const safeId = sanitizeIdForAuth(id);
  if (!safeId) throw new Error('ID は半角英数字 (.,_,-) で 1 文字以上にしてください。');
  return `${safeId}@${classDomain()}.invalid`;
}

export function signInWithIdPassword(id: string, password: string) {
  return signInWithEmailAndPassword(auth, idToAuthEmail(id), password);
}

export async function signUpWithIdPassword(args: {
  id: string;
  password: string;
  displayName: string;
}) {
  const credential = await createUserWithEmailAndPassword(
    auth,
    idToAuthEmail(args.id),
    args.password
  );
  const name = args.displayName.trim();
  if (name) {
    await updateProfile(credential.user, { displayName: name });
    // updateProfile 直後の onAuthStateChanged は古い User を返すので、明示的に reload して
    // 後続の subscribe コールバックが新しい displayName を受け取れるようにする。
    await credential.user.reload();
  }
  return credential;
}

export function signOutUser() {
  return signOut(auth);
}

export function subscribeToAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}
