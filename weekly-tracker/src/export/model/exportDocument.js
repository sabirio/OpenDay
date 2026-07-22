// Generic document contract shared by every OpenDay export (Weekly Report
// PDF today; Site Snag / Site Visit PDFs later). A template consumes one of
// these plus an ExportProfile — it never reaches back into React state,
// Supabase, or engine internals itself.

export const EXPORT_DOCUMENT_VERSION = 1;

/**
 * @param {object} input
 * @param {string} input.documentType - e.g. 'weekly-report'
 * @param {object} input.project - minimal project identity for the header/footer
 * @param {object} input.branding - an ExportProfile (see exportProfile.js)
 * @param {object} [input.metadata] - document-level facts (generatedAt is added automatically)
 * @param {object} input.sections - document-type-specific payload (opaque to this layer)
 * @param {string} [input.generatedAt] - ISO timestamp; defaults to now. Pass an explicit
 *   value in tests so output is deterministic.
 */
export function createExportDocument({ documentType, project, branding, metadata = {}, sections, generatedAt }) {
  if (!documentType) throw new Error('createExportDocument: documentType is required');
  return {
    documentType,
    version: EXPORT_DOCUMENT_VERSION,
    generatedAt: generatedAt ?? new Date().toISOString(),
    project: project ?? null,
    branding: branding ?? null,
    metadata,
    sections: sections ?? {},
  };
}
