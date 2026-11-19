import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from './firebase';

/**
 * Firebase Storage Layer (Phase 9)
 * Strictly separates citizen complaint photographs and authority resolution videos:
 *   - Citizen photos: complaints/{complaintId}/{filename}
 *   - Authority 30s resolution videos: resolutions/{complaintId}/{filename}
 *
 * Includes bounded retry & timeout protection so unavailable/unprovisioned
 * Storage buckets fail fast instead of stalling for Firebase's default 10-minute retry window.
 */

const STORAGE_UPLOAD_TIMEOUT_MS = 6000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function getBoundedStorage() {
  const storage: any = getStorage(app);
  if (storage && typeof storage === 'object') {
    try {
      storage.maxUploadRetryTime = 5000;
      storage.maxOperationRetryTime = 5000;
    } catch {
      // Ignore on mocked/read-only storage instances
    }
  }
  return storage;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0]?.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(parts[1] || '');
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export async function uploadComplaintImageToStorage(params: {
  complaintId: string;
  imageDataUrl: string;
}): Promise<{ ok: boolean; url?: string; storagePath?: string; error?: string }> {
  try {
    const storage = getBoundedStorage();
    const blob = dataUrlToBlob(params.imageDataUrl);
    const storagePath = `complaints/${params.complaintId}/evidence_${Date.now()}.jpg`;
    const storageRef = ref(storage, storagePath);
    await withTimeout(
      uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' }),
      STORAGE_UPLOAD_TIMEOUT_MS,
      'Firebase Storage image upload timed out.'
    );
    const url = await withTimeout(
      getDownloadURL(storageRef),
      STORAGE_UPLOAD_TIMEOUT_MS,
      'Firebase Storage URL fetch timed out.'
    );
    return { ok: true, url, storagePath };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Firebase Storage upload failed for citizen complaint photograph.',
    };
  }
}

export async function uploadResolutionVideoToStorage(params: {
  complaintId: string;
  videoBlob: Blob;
  authorityUid: string;
}): Promise<{ ok: boolean; url?: string; storagePath?: string; error?: string }> {
  try {
    const storage = getBoundedStorage();
    const storagePath = `resolutions/${params.complaintId}/resolution_${params.authorityUid}_${Date.now()}.webm`;
    const storageRef = ref(storage, storagePath);
    await withTimeout(
      uploadBytes(storageRef, params.videoBlob, {
        contentType: params.videoBlob.type || 'video/webm',
      }),
      STORAGE_UPLOAD_TIMEOUT_MS,
      'Firebase Storage video upload timed out.'
    );
    const url = await withTimeout(
      getDownloadURL(storageRef),
      STORAGE_UPLOAD_TIMEOUT_MS,
      'Firebase Storage video URL fetch timed out.'
    );
    return { ok: true, url, storagePath };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Firebase Storage upload failed for authority resolution video.',
    };
  }
}
