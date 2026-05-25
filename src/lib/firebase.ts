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

export const CLASS_ID: string = import.meta.env.VITE_CLASS_ID || 'class-demo';

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
  return CLASS_ID.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'plant-grow';
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
