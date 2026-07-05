/**
 * Compresses an image File using the canvas API — no external dependencies.
 *
 * Known limitation: HEIC/HEIF files picked from an iOS photo library (as
 * opposed to a fresh camera capture via <input capture="environment">,
 * which iOS Safari normally delivers as JPEG) can't be decoded by
 * <img>/canvas in Chrome/Firefox/Android — there's no web-standard HEIC
 * decoder, and adding one would mean a new dependency. Image.onerror below
 * surfaces that as a clear "unsupported format" error rather than a silent
 * failure or a generic one.
 *
 * @param {File} file - original image file
 * @param {object} [options]
 * @param {number} [options.maxWidth]  - default 1280
 * @param {number} [options.maxHeight] - default 1280
 * @param {number} [options.quality]   - JPEG quality 0-1, default 0.75
 * @returns {Promise<Blob>} compressed image as a JPEG blob
 */
export function compressImage(file, {
  maxWidth  = 1280,
  maxHeight = 1280,
  quality   = 0.75,
} = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('Image compression failed')); return; }
          resolve(blob);
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      const isHeic = /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]/i.test(file.type);
      reject(new Error(
        isHeic
          ? 'This photo format (HEIC) isn’t supported here — please take a new photo or choose a JPEG/PNG.'
          : 'Could not read this image file.'
      ));
    };

    img.src = url;
  });
}
