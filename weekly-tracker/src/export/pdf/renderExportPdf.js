// Generic PDF renderer/download boundary. Takes any @react-pdf/renderer
// <Document> element produced by ANY template — this document type is the
// first consumer, more will follow later — and turns it into a Blob or a
// browser download. Nothing here knows about a specific document type, work
// packages, or any other document-specific concept; that's the template's job.
//
// @react-pdf/renderer is intentionally imported here only, not at module
// scope anywhere else in the app — callers reach this file via dynamic
// import so the PDF engine (and its layout/font subsystem) is not part of
// the app's normal startup bundle. See the export button component that
// wires a specific template into this renderer for an example caller.

import { pdf } from '@react-pdf/renderer';

/**
 * @param {import('react').ReactElement} documentElement - a <Document>...</Document> tree
 * @returns {Promise<Blob>}
 */
export async function renderPdfBlob(documentElement) {
  const instance = pdf(documentElement);
  return instance.toBlob();
}

/**
 * Triggers a normal browser file download for a Blob. No server round-trip —
 * client-side download is the accepted v1 behaviour.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadPdfBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Give the browser a moment to pick up the blob: URL before revoking it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
