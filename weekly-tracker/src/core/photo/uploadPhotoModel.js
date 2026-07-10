import { compressImage } from '../../utils/compressImage';
import { getCurrentUserId, uploadPhotoToBucket, removePhotoPaths, getSignedPhotoUrls } from '../../services/photoService';
import { buildEvidencePath } from '../write/evidencePath.js';

export { getCurrentUserId, removePhotoPaths, getSignedPhotoUrls };

const UPLOAD_TIMEOUT_MS = 20_000;
const RETRY_BACKOFF_MS = 1_500;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Neither compressImage() nor supabase-js's storage.upload() enforce their own
// timeout — a stalled network request (bad mobile connection, or a backend
// hiccup) leaves its promise pending forever. Without this, `uploading: true`
// never flips back, Submit stays disabled with no error shown, and the only
// recovery is reloading the whole form. Race against a timeout so a hang
// becomes a normal, recoverable upload failure instead.
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

async function attemptUpload(projectId, userId, file) {
  const compressed = await withTimeout(
    compressImage(file),
    UPLOAD_TIMEOUT_MS,
    'Photo processing timed out — try a different photo.'
  );
  if (!compressed?.size || compressed.size > MAX_UPLOAD_BYTES) {
    throw new Error('Processed photo must be between 1 byte and 5 MB.');
  }
  const path = buildEvidencePath(projectId, userId, new Date(), globalThis.crypto.randomUUID());
  return withTimeout(
    uploadPhotoToBucket(path, compressed),
    UPLOAD_TIMEOUT_MS,
    'Photo upload timed out — check your connection and try again.'
  );
}

/**
 * Compress+upload one photo with one retry after a transient failure — the
 * exact policy PhotoUpload.jsx applies per-file so N photos in a batch don't
 * all appear stuck when only one of them is.
 */
export async function uploadPhotoWithRetry(projectId, userId, file, _seq) {
  try {
    return await attemptUpload(projectId, userId, file);
  } catch {
    await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
    return attemptUpload(projectId, userId, file);
  }
}
