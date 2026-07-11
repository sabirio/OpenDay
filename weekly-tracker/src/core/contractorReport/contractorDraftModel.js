export const CONTRACTOR_DRAFT_SCHEMA_VERSION = 1;
// 14 days. Kept as a policy constant (not a business calculation).
export const CONTRACTOR_DRAFT_STALE_MS = 1_209_600_000;
const PREFIX = 'openday:contractor-report';

function segment(value) { return encodeURIComponent(String(value || 'unknown')); }

export function buildContractorDraftKey({ userId, projectId, reportPeriod }) {
  return `${PREFIX}:v${CONTRACTOR_DRAFT_SCHEMA_VERSION}:${segment(userId)}:${segment(projectId)}:${segment(reportPeriod)}`;
}

export function buildContractorDraftEnvelope(input, now = new Date()) {
  const timestamp = now.toISOString();
  return {
    schemaVersion: CONTRACTOR_DRAFT_SCHEMA_VERSION,
    workflowType: 'contractor-report',
    userId: String(input.userId), projectId: String(input.projectId),
    reportDate: input.reportDate, reportPeriod: input.reportPeriod || input.reportDate,
    clientRequestId: input.clientRequestId,
    formData: input.formData,
    workPackageRows: input.workPackageRows || {},
    evidenceItems: (input.evidenceItems || []).filter(item => typeof item === 'string' || item?.path).map(item => typeof item === 'string' ? { path: item, status: 'uploaded' } : { path: item.path, status: item.status === 'uploaded' ? 'uploaded' : 'needs-reselection' }),
    createdAt: input.createdAt || timestamp, updatedAt: timestamp,
  };
}

export function inspectContractorDraft(raw, identity, now = new Date()) {
  if (!raw) return { status: 'missing', draft: null };
  let draft;
  try { draft = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return { status: 'corrupt', draft: null, reason: 'Draft data is not valid JSON.' }; }
  if (!draft) return { status: 'corrupt', draft: null, reason: 'Draft data is empty.' };
  if (String(draft.userId) !== String(identity.userId) || String(draft.projectId) !== String(identity.projectId)) return { status: 'foreign', draft: null, reason: 'Draft identity does not match the current user and project.' };
  if (draft.schemaVersion !== CONTRACTOR_DRAFT_SCHEMA_VERSION || draft.workflowType !== 'contractor-report') return { status: 'incompatible', draft: null, reason: 'This draft was created by an unsupported version.' };
  if (!draft.clientRequestId || !draft.formData || !draft.reportPeriod || !Date.parse(draft.updatedAt)) return { status: 'corrupt', draft: null, reason: 'Draft is missing required workflow data.' };
  const stale = now.getTime() - new Date(draft.updatedAt).getTime() > CONTRACTOR_DRAFT_STALE_MS;
  return { status: stale ? 'stale' : 'compatible', draft: normalizeRecoveredContractorDraft(draft) };
}

export function normalizeRecoveredContractorDraft(draft) {
  return { ...draft, evidenceItems: (draft.evidenceItems || []).map(item => item?.path ? { path: item.path, status: item.status === 'uploaded' ? 'uploaded' : 'needs-reselection' } : null).filter(Boolean) };
}

export function findContractorDraft(storage, identity, now = new Date()) {
  const identitySuffix = `:${segment(identity.userId)}:${segment(identity.projectId)}:`;
  const candidates = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key?.startsWith(`${PREFIX}:v`) || !key.includes(identitySuffix)) continue;
    const inspected = inspectContractorDraft(storage.getItem(key), identity, now);
    if (inspected.status !== 'foreign') candidates.push({ key, ...inspected });
  }
  const newest = candidates.sort((a, b) => new Date(b.draft?.updatedAt || 0) - new Date(a.draft?.updatedAt || 0))[0];
  if (newest) return newest;
  const legacyKey = `contractor_draft_${identity.projectId}`;
  if (storage.getItem(legacyKey)) return { status: 'incompatible', draft: null, key: legacyKey, reason: 'This older draft cannot be safely matched to the current user.' };
  return { status: 'missing', draft: null, key: null };
}

export function saveContractorDraft(storage, draft) {
  const key = buildContractorDraftKey(draft);
  storage.setItem(key, JSON.stringify(draft));
  return key;
}

export function removeContractorDraft(storage, key) { if (key) storage.removeItem(key); }
