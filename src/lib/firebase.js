import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase コンソール → プロジェクトの設定 → マイアプリ で取得した値を貼り付けてください。
// これらの値は「公開しても安全」な識別子です (アクセス制御は firestore.rules 側で行います)。
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:xxxxxxxxxxxxxxxx',
};

// クラス単位でデータを分けるための識別子。学年/年度で切り替えたい場合に変更。
export const CLASS_ID = 'class-demo';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ルールが「認証済みのみ」を要求するため、起動時に匿名サインインしておく。
// 生徒がログイン操作なしで使える一方、未認証ユーザの書き込みは Firestore 側で拒否される。
export const authReady = new Promise((resolve, reject) => {
  onAuthStateChanged(auth, (user) => {
    if (user) resolve(user);
  });
  signInAnonymously(auth).catch(reject);
});
