import { SNAG_PRIORITIES, SNAG_SCHEMA_VERSION, SNAG_STATUSES, SNAG_WORKFLOW_VERSION } from './config.js';

export class SnagDomainError extends Error {
  constructor(code, message, field = null) { super(message); this.name = 'SnagDomainError'; this.code = code; this.field = field; }
}

export const requireText = (value, field) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new SnagDomainError('VALIDATION_ERROR', `${field} is required`, field);
  return text;
};

export function normalizeLocation(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SnagDomainError('VALIDATION_ERROR', 'location must be an object', 'location');
  const location = {
    zoneId: value.zoneId == null ? null : String(value.zoneId),
    level: value.level == null ? null : String(value.level).trim() || null,
    room: value.room == null ? null : String(value.room).trim() || null,
    text: value.text == null ? null : String(value.text).trim() || null,
    planVersionId: value.planVersionId == null ? null : String(value.planVersionId),
    x: value.x == null ? null : Number(value.x),
    y: value.y == null ? null : Number(value.y),
    schemaVersion: 1,
  };
  if (!location.zoneId && !location.level && !location.room && !location.text) throw new SnagDomainError('VALIDATION_ERROR', 'textual or structured location is required', 'location');
  const hasCoordinate = location.x != null || location.y != null;
  if (hasCoordinate && !location.planVersionId) throw new SnagDomainError('VALIDATION_ERROR', 'plan coordinates require planVersionId', 'location.planVersionId');
  if (hasCoordinate && (location.x == null || location.y == null || !Number.isFinite(location.x) || !Number.isFinite(location.y) || location.x < 0 || location.x > 1 || location.y < 0 || location.y > 1)) {
    throw new SnagDomainError('VALIDATION_ERROR', 'plan coordinates must be finite numbers from 0 to 1', 'location.coordinates');
  }
  return location;
}

export function normalizeDueDate(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new SnagDomainError('VALIDATION_ERROR', 'dueDate must be an ISO date', 'dueDate');
  return value;
}

export function validateStatus(value) {
  if (!SNAG_STATUSES.includes(value)) throw new SnagDomainError('UNKNOWN_STATUS', `Unknown snag status: ${String(value)}`, 'status');
  return value;
}

export function validatePriority(value) {
  const priority = value || 'MEDIUM';
  if (!SNAG_PRIORITIES.includes(priority)) throw new SnagDomainError('VALIDATION_ERROR', `Unknown priority: ${String(priority)}`, 'priority');
  return priority;
}

export function createSnagState(payload, context) {
  const assigneeId = payload.assigneeId == null ? null : String(payload.assigneeId);
  return {
    id: String(context.snagId), projectId: String(context.projectId), snagNumber: context.snagNumber,
    title: requireText(payload.title, 'title'), description: String(payload.description || '').trim(),
    categoryCode: requireText(payload.categoryCode || 'GENERAL', 'categoryCode'), disciplineCode: requireText(payload.disciplineCode || 'GENERAL', 'disciplineCode'),
    priority: validatePriority(payload.priority), status: assigneeId ? 'ASSIGNED' : 'OPEN', assigneeId,
    dueDate: normalizeDueDate(payload.dueDate), location: normalizeLocation(payload.location),
    createdBy: String(context.actorId), createdAt: context.now, updatedAt: context.now,
    closedAt: null, cancelledAt: null, version: 1, schemaVersion: SNAG_SCHEMA_VERSION, workflowVersion: SNAG_WORKFLOW_VERSION,
  };
}
