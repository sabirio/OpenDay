export const REPORT_SCOPE_SNAPSHOT_VERSION = 1;

function stableIds(ids) {
  return [...new Set((ids || []).filter(id => typeof id === 'string' && id.length > 0))].sort();
}

export function scopeFingerprintPayload({ templateId = null, templateVersion = null, schemaVersion = null, selectedWpIds = [], reportPeriodStart, reportPeriodEnd, scheduleVersionId = null }) {
  return [
    `r${REPORT_SCOPE_SNAPSHOT_VERSION}`,
    templateId || '',
    templateVersion ?? '',
    schemaVersion ?? '',
    stableIds(selectedWpIds).join('\n'),
    reportPeriodStart || '',
    reportPeriodEnd || '',
    scheduleVersionId ?? '',
  ].join('|');
}

export async function fingerprintReportScope(input) {
  const bytes = new TextEncoder().encode(scopeFingerprintPayload(input));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildReportScopeSnapshot({ project, scopeTemplate, selectedWpIds, reportPeriodStart, reportPeriodEnd, scheduleVersionId = null }) {
  const snapshot = {
    snapshotVersion: REPORT_SCOPE_SNAPSHOT_VERSION,
    templateId: project.templateId ?? project.template_id ?? scopeTemplate?.id ?? null,
    templateVersion: scopeTemplate?.version ?? project.templateVersion ?? null,
    schemaVersion: scopeTemplate?.data?.schemaVersion ?? null,
    selectedWpIds: stableIds(selectedWpIds),
    reportPeriodStart,
    reportPeriodEnd,
    scheduleVersionId,
  };
  return { ...snapshot, scopeFingerprint: await fingerprintReportScope(snapshot) };
}
