const MAX_SOURCE_BYTES = 20_971_520;
const SUPPORTED_SOURCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validatePhotoFile(file) {
  if (!file || !SUPPORTED_SOURCE_TYPES.has(String(file.type).toLowerCase())) throw new Error('Choose a JPEG, PNG, or WebP photo. HEIC files are not supported.');
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('The selected photo is empty or unreadable.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('The selected photo is larger than 20 MB. Choose a smaller image.');
  return file;
}
