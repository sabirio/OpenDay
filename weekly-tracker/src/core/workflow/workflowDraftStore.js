const STALE_MS = 1_209_600_000;
const segment = value => encodeURIComponent(String(value || 'unknown'));

export function buildWorkflowDraftKey({ workflowType, schemaVersion, userId, projectId, contextId }) {
  return `openday:${workflowType}:v${schemaVersion}:${segment(userId)}:${segment(projectId)}:${segment(contextId)}`;
}

export function inspectWorkflowDraft(raw, identity, normalize, now = new Date()) {
  if (!raw) return { status: 'missing', draft: null };
  let draft;
  try { draft = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { status: 'corrupt', draft: null, reason: 'Draft data is not valid JSON.' }; }
  if (!draft || String(draft.userId) !== String(identity.userId) || String(draft.projectId) !== String(identity.projectId)) return { status: 'foreign', draft: null };
  if (draft.workflowType !== identity.workflowType || draft.schemaVersion !== identity.schemaVersion) return { status: 'incompatible', draft: null, reason: 'This draft was created by an unsupported version.' };
  if (!draft.clientRequestId || !draft.contextId || !Date.parse(draft.updatedAt)) return { status: 'corrupt', draft: null, reason: 'Draft is missing required workflow data.' };
  const stale = now.getTime() - new Date(draft.updatedAt).getTime() > STALE_MS;
  return { status: stale ? 'stale' : 'compatible', draft: normalize ? normalize(draft) : draft };
}

export function findWorkflowDraft(storage, identity, normalize, legacyKey, now = new Date()) {
  const marker = `:${segment(identity.userId)}:${segment(identity.projectId)}:`;
  const candidates = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(`openday:${identity.workflowType}:v`) || !key.includes(marker)) continue;
    const result = inspectWorkflowDraft(storage.getItem(key), identity, normalize, now);
    if (result.status !== 'foreign') candidates.push({ key, ...result });
  }
  const found = candidates.sort((a, b) => new Date(b.draft?.updatedAt || 0) - new Date(a.draft?.updatedAt || 0))[0];
  if (found) return found;
  if (legacyKey && storage.getItem(legacyKey)) return { key: legacyKey, status: 'incompatible', draft: null, reason: 'This older draft cannot be safely matched to the current user and visit context.' };
  return { key: null, status: 'missing', draft: null };
}

export function saveWorkflowDraft(storage, draft) {
  const key = buildWorkflowDraftKey(draft);
  storage.setItem(key, JSON.stringify(draft));
  return key;
}

export function removeWorkflowDraft(storage, key) { if (key) storage.removeItem(key); }
