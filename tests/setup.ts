import { vi } from 'vitest';

// 純粋関数のテストでは Firestore / Storage / Auth を実体としては使わない。
// しかし src/lib/* がそれらの SDK モジュールから値を import しているので、
// Vitest の解決時にスタブを差し込んでおく。

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {
    setCustomParameters() {}
  },
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args: unknown[]) => ({ __ref: 'collection', args })),
  doc: vi.fn((...args: unknown[]) => ({ __ref: 'doc', args })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn((q) => q),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => '__SERVER_TIMESTAMP__'),
  initializeFirestore: vi.fn(() => ({})),
  persistentLocalCache: vi.fn(() => ({})),
  persistentMultipleTabManager: vi.fn(() => ({})),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}));
