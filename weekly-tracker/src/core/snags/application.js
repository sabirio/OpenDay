import { createSnagState, requireText, SnagDomainError } from './domain.js';
import { transitionSnag, updateSnagDetails, updateSnagLocation } from './workflow.js';

const canonicalize = value => Array.isArray(value) ? value.map(canonicalize)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])])) : value;
const stable = value => JSON.stringify(canonicalize(value));
export class InMemorySnagRepository {
  constructor() { this.snags = new Map(); this.events = []; this.evidence = []; this.requests = new Map(); this.sequence = new Map(); }
  get(id) { return this.snags.get(String(id)) || null; }
}

function eventRecord(state, event, command, now, index) {
  return { id: `event-${index}`, snagId: state.id, projectId: state.projectId, actorId: String(command.actor.id), eventType: event.type,
    previousState: event.previous || null, newState: event.next || null, reason: event.reason || null, sourceCommandId: command.clientRequestId,
    occurredAt: now, schemaVersion: 1 };
}

export function executeSnagCommand(repo, command, options = {}) {
  if (!command?.actor?.id || !command.clientRequestId || !command.projectId) throw new SnagDomainError('VALIDATION_ERROR', 'actor, projectId and clientRequestId are required');
  const requestKey = `${command.actor.id}:${command.clientRequestId}`;
  const fingerprint = stable({ ...command, actor: { id: command.actor.id, role: command.actor.role } });
  const replay = repo.requests.get(requestKey);
  if (replay) {
    if (replay.fingerprint !== fingerprint) throw new SnagDomainError('IDEMPOTENCY_CONFLICT', 'clientRequestId was already used with another payload');
    return structuredClone({ ...replay.result, idempotentReplay: true });
  }
  const now = new Date(options.now || Date.now()).toISOString();
  let state, event, evidence = null;
  if (command.type === 'createSnag') {
    const role = String(command.actor.role || '').toUpperCase();
    if (!['ADMIN', 'PM'].includes(role)) throw new SnagDomainError('FORBIDDEN', 'Only PM/Admin may create snags');
    const projectId = String(command.projectId); const snagNumber = (repo.sequence.get(projectId) || 0) + 1;
    state = createSnagState(command.payload || {}, { snagId: options.snagId || `snag-${projectId}-${snagNumber}`, projectId, snagNumber, actorId: command.actor.id, now });
    event = { type: 'SNAG_CREATED', previous: null, next: state };
    repo.sequence.set(projectId, snagNumber);
  } else {
    const current = repo.get(command.snagId);
    if (!current) throw new SnagDomainError('NOT_FOUND', 'Snag not found');
    if (command.type === 'updateSnagDetails') ({ state, event } = updateSnagDetails(current, command, { now }));
    else if (command.type === 'updateSnagLocation') ({ state, event } = updateSnagLocation(current, command, { now }));
    else if (command.type === 'addSnagEvidence') {
      const role = String(command.actor.role || '').toUpperCase();
      if (!['ADMIN', 'PM', 'CONTRACTOR'].includes(role) || (role === 'CONTRACTOR' && String(current.assigneeId) !== String(command.actor.id))) throw new SnagDomainError('FORBIDDEN', 'Actor cannot add evidence');
      if (['CLOSED', 'CANCELLED'].includes(current.status)) throw new SnagDomainError('TERMINAL_STATE', 'Evidence cannot be added to a terminal snag');
      if (command.expectedVersion !== current.version) throw new SnagDomainError('VERSION_CONFLICT', 'Snag version has changed');
      evidence = { id: options.evidenceId || `evidence-${repo.evidence.length + 1}`, snagId: current.id, evidenceType: requireText(command.payload?.evidenceType, 'evidenceType'), storagePath: requireText(command.payload?.storagePath, 'storagePath'), note: String(command.payload?.note || ''), createdBy: String(command.actor.id), createdAt: now };
      state = { ...current, updatedAt: now, version: current.version + 1 }; event = { type: 'SNAG_EVIDENCE_ADDED', previous: null, next: { evidenceId: evidence.id } };
    } else ({ state, event } = transitionSnag(current, command, { now }));
  }
  repo.snags.set(state.id, structuredClone(state));
  if (evidence) repo.evidence.push(structuredClone(evidence));
  const recordedEvent = eventRecord(state, event, command, now, repo.events.length + 1); repo.events.push(recordedEvent);
  const result = { snag: structuredClone(state), event: structuredClone(recordedEvent), evidence: structuredClone(evidence), idempotentReplay: false };
  repo.requests.set(requestKey, { fingerprint, result: structuredClone(result) });
  return result;
}
