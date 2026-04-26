import type { FieldValue, Timestamp } from 'firebase/firestore';

/**
 * フォームで保持する株データ。
 * <input type="number"> から来る空入力をそのまま許容するため
 * height / leafCount は空文字も型に含める。saveRecord 時に number | null に正規化される。
 */
export type StrainFormValue = {
  id: string;
  /** 品目 (トマト / ナス など)。空文字は「未分類」として扱う。 */
  category: string;
  name: string;
  height: number | '';
  leafCount: number | '';
  memo: string;
  photoPath: string | null;
  photoUrl: string | null;
};

/** Firestore に保存される株データ。 */
export type Strain = {
  id: string;
  /** 品目 (トマト / ナス など)。古いレコードには存在しないので読み出し時は ?? '' で扱う。 */
  category?: string;
  name: string;
  height: number | null;
  leafCount: number | null;
  memo: string;
  photoPath: string | null;
  photoUrl: string | null;
};

export type Averages = {
  height: number | null;
  leafCount: number | null;
};

/**
 * Firestore のレコード本体。
 * createdAt / updatedAt は書き込み時に serverTimestamp() を渡すため、
 * クライアントから見ると「読み出し時 Timestamp / 書き込み時 FieldValue」のユニオン型。
 */
export type RecordDoc = {
  date: string;
  strains: Strain[];
  averages: Averages;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
  createdBy: string;
  createdByName?: string;
  updatedBy: string;
  updatedByName: string;
};

/**
 * クラス名簿エントリ。生徒が初めて記録を保存した時に upsert される。
 * 教員ダッシュボードで生徒一覧を作るためのインデックスとして使う。
 */
export type RosterEntry = {
  uid: string;
  displayName: string;
  email: string;
  lastRecordedAt?: Timestamp | FieldValue;
};

/** 教員ドキュメント (Firebase Console から手動で追加する運用)。 */
export type TeacherProfile = {
  uid: string;
  displayName: string;
  email?: string;
};

export type ToastTone = 'success' | 'error' | 'info';

export type ToastMessage = {
  tone: ToastTone;
  message: string;
  duration?: number;
};
