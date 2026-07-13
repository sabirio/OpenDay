import { SnagDomainError, normalizeDueDate, normalizeLocation, requireText, validatePriority, validateStatus } from './domain.js';

const PM_ROLES = new Set(['ADMIN', 'PM']);
const TRANSITIONS = Object.freeze({
  assignSnag: { roles: PM_ROLES, from: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'], to: state => state.status === 'OPEN' ? 'ASSIGNED' : state.status, event: 'SNAG_ASSIGNED' },
  unassignSnag: { roles: PM_ROLES, from: ['ASSIGNED'], to: 'OPEN', event: 'SNAG_UNASSIGNED' },
  startSnagWork: { roles: new Set(['CONTRACTOR']), from: ['ASSIGNED'], to: 'IN_PROGRESS', event: 'SNAG_STATUS_CHANGED', assigned: true },
  markSnagReadyForReview: { roles: new Set(['CONTRACTOR']), from: ['IN_PROGRESS'], to: 'READY_FOR_REVIEW', event: 'SNAG_STATUS_CHANGED', assigned: true },
  approveAndCloseSnag: { roles: PM_ROLES, from: ['READY_FOR_REVIEW'], to: 'CLOSED', event: 'SNAG_CLOSED' },
  rejectSnag: { roles: PM_ROLES, from: ['READY_FOR_REVIEW'], to: 'IN_PROGRESS', event: 'SNAG_REJECTED', reason: true },
  reopenSnag: { roles: PM_ROLES, from: ['CLOSED'], to: 'IN_PROGRESS', event: 'SNAG_REOPENED', reason: true },
  cancelSnag: { roles: PM_ROLES, from: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'CLOSED'], to: 'CANCELLED', event: 'SNAG_CANCELLED', reason: true },
});

const roleOf = actor => String(actor?.role || '').toUpperCase();
function authorize(spec, state, actor) {
  const role = roleOf(actor);
  if (role === 'VIEWER' || !spec.roles.has(role)) throw new SnagDomainError('FORBIDDEN', 'Actor cannot execute this snag command');
  if (spec.assigned && String(state.assigneeId) !== String(actor.id)) throw new SnagDomainError('FORBIDDEN', 'Contractor may update only an assigned snag');
}

export function transitionSnag(state, command, context) {
  const spec = TRANSITIONS[command.type];
  if (!spec) throw new SnagDomainError('UNKNOWN_COMMAND', `Unknown snag command: ${String(command.type)}`);
  validateStatus(state?.status);
  if (String(state.projectId) !== String(command.projectId)) throw new SnagDomainError('PROJECT_BOUNDARY', 'Snag belongs to another project');
  if (command.expectedVersion !== state.version) throw new SnagDomainError('VERSION_CONFLICT', 'Snag version has changed');
  authorize(spec, state, command.actor);
  if (!spec.from.includes(state.status)) throw new SnagDomainError('INVALID_TRANSITION', `${command.type} is invalid from ${state.status}`);
  const reason = spec.reason ? requireText(command.payload?.reason, 'reason') : (command.payload?.reason || null);
  const previous = structuredClone(state);
  const nextStatus = typeof spec.to === 'function' ? spec.to(state) : spec.to;
  const next = { ...state, status: nextStatus, updatedAt: context.now, version: state.version + 1 };
  if (command.type === 'assignSnag') next.assigneeId = requireText(command.payload?.assigneeId, 'assigneeId');
  if (command.type === 'unassignSnag') next.assigneeId = null;
  next.closedAt = spec.to === 'CLOSED' ? context.now : null;
  next.cancelledAt = spec.to === 'CANCELLED' ? context.now : null;
  return { state: next, event: { type: spec.event, previous: { status: previous.status, assigneeId: previous.assigneeId }, next: { status: next.status, assigneeId: next.assigneeId }, reason } };
}

export function updateSnagDetails(state, command, context) {
  if (String(state.projectId) !== String(command.projectId)) throw new SnagDomainError('PROJECT_BOUNDARY', 'Snag belongs to another project');
  if (command.expectedVersion !== state.version) throw new SnagDomainError('VERSION_CONFLICT', 'Snag version has changed');
  if (!PM_ROLES.has(roleOf(command.actor))) throw new SnagDomainError('FORBIDDEN', 'Only PM/Admin may update snag details');
  if (['CLOSED', 'CANCELLED'].includes(state.status)) throw new SnagDomainError('TERMINAL_STATE', 'Closed or cancelled snag cannot be silently edited');
  const payload = command.payload || {};
  const next = { ...state, updatedAt: context.now, version: state.version + 1 };
  if ('title' in payload) next.title = requireText(payload.title, 'title');
  if ('description' in payload) next.description = String(payload.description || '').trim();
  if ('priority' in payload) next.priority = validatePriority(payload.priority);
  if ('dueDate' in payload) next.dueDate = normalizeDueDate(payload.dueDate);
  return { state: next, event: { type: 'SNAG_DETAILS_CHANGED', previous: { title: state.title, priority: state.priority, dueDate: state.dueDate }, next: { title: next.title, priority: next.priority, dueDate: next.dueDate } } };
}

export function updateSnagLocation(state, command, context) {
  if (String(state.projectId) !== String(command.projectId)) throw new SnagDomainError('PROJECT_BOUNDARY', 'Snag belongs to another project');
  if (command.expectedVersion !== state.version) throw new SnagDomainError('VERSION_CONFLICT', 'Snag version has changed');
  if (!PM_ROLES.has(roleOf(command.actor))) throw new SnagDomainError('FORBIDDEN', 'Only PM/Admin may update location');
  if (['CLOSED', 'CANCELLED'].includes(state.status)) throw new SnagDomainError('TERMINAL_STATE', 'Closed or cancelled snag cannot be silently edited');
  const location = normalizeLocation(command.payload?.location);
  return { state: { ...state, location, updatedAt: context.now, version: state.version + 1 }, event: { type: 'SNAG_LOCATION_CHANGED', previous: state.location, next: location } };
}

export { TRANSITIONS };

export function getAvailableSnagActions(state, actor) {
  if (!state || !actor) return [];
  const role = roleOf(actor);
  const actions = [];
  for (const [type, spec] of Object.entries(TRANSITIONS)) {
    if (!spec.roles.has(role) || !spec.from.includes(state.status)) continue;
    if (spec.assigned && String(state.assigneeId) !== String(actor.id)) continue;
    actions.push(type);
  }
  if (PM_ROLES.has(role) && !['CLOSED', 'CANCELLED'].includes(state.status)) actions.push('updateSnagDetails', 'updateSnagLocation');
  if (role === 'CONTRACTOR' && !['CLOSED', 'CANCELLED'].includes(state.status)
    && String(state.assigneeId) === String(actor.id)) actions.push('addSnagEvidence');
  return actions;
}
