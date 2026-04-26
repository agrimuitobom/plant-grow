import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  type User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
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

/**
 * 校内利用に限定するための許可ドメインリスト。
 * カンマ区切りで複数指定でき、空文字なら制限なし (誰でもログイン可能)。
 */
export const ALLOWED_EMAIL_DOMAINS: string[] = (
  import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || ''
)
  .split(',')
  .map((d: string) => d.trim().toLowerCase())
  .filter(Boolean);

/** メールアドレスが許可ドメインに属するか判定する。許可ドメイン未設定なら全許可。 */
export function isEmailAllowed(email: string | null | undefined): boolean {
  if (ALLOWED_EMAIL_DOMAINS.length === 0) return true;
  if (!email) return false;
  const at = email.toLowerCase().lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

export const app = initializeApp(firebaseConfig);
// IndexedDB ベースの永続キャッシュを有効化。授業中に Wi-Fi が切れても
// 書き込みは端末に保留され、復帰後に自動同期される。
// 利用不可な環境 (プライベートブラウジング等) では自動的にメモリキャッシュにフォールバック。
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const auth = getAuth(app);
export const storage = getStorage(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

export function subscribeToAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}
