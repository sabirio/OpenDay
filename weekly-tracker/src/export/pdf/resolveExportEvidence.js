// Bridges a WeeklyReportExportModel's raw evidence.photos (storage paths)
// into displayable image sources, using the SAME authenticated/private
// retrieval path the on-screen PhotoGallery already uses — no new bucket,
// no public URLs. Deliberately kept out of buildWeeklyReportExportModel.js
// (which stays synchronous and Supabase-free) and out of the PDF template
// (which only ever receives ready-to-embed URLs).
//
// Signed URLs expire (see photoService.js's 1hr TTL) — call this right
// before rendering, not on some earlier/cached schedule. The resulting PDF
// embeds the actual image bytes, so the finished file keeps working after
// the signed URL itself has expired.

import { getSignedPhotoUrls } from '../../services/photoService.js';

/**
 * @param {string[]} photoPaths
 * @returns {Promise<Array<{ path: string, url: string }>>}
 */
export async function resolveExportEvidence(photoPaths) {
  if (!Array.isArray(photoPaths) || photoPaths.length === 0) return [];
  const signed = await getSignedPhotoUrls(photoPaths);
  return signed.map(item => ({ path: item.path, url: item.signedUrl }));
}
