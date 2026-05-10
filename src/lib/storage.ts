import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage';
import { CLASS_ID, storage } from './firebase';

const MAX_WIDTH = 1080;
const JPEG_QUALITY = 0.8;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// iPad で撮影された写真は数MBあるので、アップロード前に長辺基準ではなく
// 「幅 1080px」を上限に縮小する。Storage の課金と転送量の双方を抑える。
async function compressImage(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const ratio = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
  const targetW = Math.round(img.width * ratio);
  const targetH = Math.round(img.height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context が取得できません');
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('画像の圧縮に失敗しました'))),
      'image/jpeg',
      JPEG_QUALITY
    );
  });

  // DevTools で「ちゃんと圧縮されているか」が一目で分かるように、毎回 before/after を出力。
  // Vite の build モードでは console.info も残るので、本番ビルドでも教員が確認できる。
  const before = (file.size / 1024).toFixed(0);
  const after = (blob.size / 1024).toFixed(0);
  const reduction =
    file.size > 0 ? Math.round((1 - blob.size / file.size) * 100) : 0;
  console.info(
    `[plant-grow:photo] ${file.name || '(no name)'} ` +
      `${img.width}×${img.height} → ${targetW}×${targetH}, ` +
      `${before}KB → ${after}KB (-${reduction}%)`
  );

  return blob;
}

function photoRef(uid: string, dateId: string, strainId: string) {
  // ファイル名にタイムスタンプを入れて、同じ株に再アップロードしても衝突しない。
  const filename = `${strainId}-${Date.now()}.jpg`;
  return storageRef(
    storage,
    `classes/${CLASS_ID}/students/${uid}/photos/${dateId}/${filename}`
  );
}

export type UploadStrainPhotoArgs = {
  uid: string;
  dateId: string;
  strainId: string;
  file: File;
};

export type UploadStrainPhotoResult = {
  photoPath: string;
  photoUrl: string;
};

export async function uploadStrainPhoto({
  uid,
  dateId,
  strainId,
  file,
}: UploadStrainPhotoArgs): Promise<UploadStrainPhotoResult> {
  const blob = await compressImage(file);
  const ref = photoRef(uid, dateId, strainId);
  await uploadBytes(ref, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(ref);
  return { photoPath: ref.fullPath, photoUrl: url };
}

export async function deleteStrainPhoto(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await deleteObject(storageRef(storage, path));
  } catch (e) {
    // すでに削除済み (object-not-found) は許容。それ以外は呼び出し元に任せる。
    if ((e as { code?: string })?.code !== 'storage/object-not-found') throw e;
  }
}
