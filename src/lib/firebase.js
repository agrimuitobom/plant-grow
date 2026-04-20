import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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

export const CLASS_ID = import.meta.env.VITE_CLASS_ID || 'class-demo';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ルールが「認証済みのみ」を要求するため、起動時に匿名サインインしておく。
export const authReady = new Promise((resolve, reject) => {
  onAuthStateChanged(auth, (user) => {
    if (user) resolve(user);
  });
  signInAnonymously(auth).catch(reject);
});
