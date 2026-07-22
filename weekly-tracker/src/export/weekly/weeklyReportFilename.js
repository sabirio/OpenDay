// Deterministic, sanitized filename for a Weekly Report PDF. Same
// (storeCode, reportingDate) always produces the same filename — no
// timestamp component, so re-exporting an old report doesn't churn.

function sanitizeSegment(value) {
  return String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/\.{2,}/g, '_') // collapse ".." (and longer runs) so sanitized output can never look like a path-traversal segment
    .replace(/_+/g, '_')
    .replace(/^[_.]+|_+$/g, '');
}

/**
 * @param {object} input
 * @param {string} input.storeCode
 * @param {string} [input.reportingDate] - ISO date (YYYY-MM-DD) preferred
 * @param {string} [input.submittedAt] - fallback date source if reportingDate is absent
 * @returns {string} e.g. "OpenDay_Weekly_Report_AA0011_2026-07-14.pdf"
 */
export function buildWeeklyReportFilename({ storeCode, reportingDate, submittedAt }) {
  const store = sanitizeSegment(storeCode) || 'Project';
  const rawDate = reportingDate || submittedAt || '';
  const datePart = sanitizeSegment(rawDate.slice(0, 10)) || 'undated';
  return `OpenDay_Weekly_Report_${store}_${datePart}.pdf`;
}
