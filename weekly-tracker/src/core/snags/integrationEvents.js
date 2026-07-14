import { SnagDomainError } from './domain.js';

export const SNAG_INTEGRATION_EVENT_SCHEMA_VERSION = 1;
export const SNAG_INTEGRATION_EVENT_TYPES = Object.freeze([
  'SNAG_CREATED',
  'SNAG_ASSIGNED',
  'SNAG_UNASSIGNED',
  'SNAG_STATUS_CHANGED',
  'SNAG_CLOSED',
  'SNAG_REJECTED',
  'SNAG_REOPENED',
  'SNAG_CANCELLED',
  'SNAG_DETAILS_CHANGED',
  'SNAG_LOCATION_CHANGED',
  'SNAG_EVIDENCE_ADDED',
]);

const FORBIDDEN_PAYLOAD_KEY = /(?:url|uri|token|secret|authorization|storage_?path|storagePath|access_?key)/i;

function required(value, field) {
  if (value == null || String(value).trim() === '') {
    throw new SnagDomainError('INVALID_INTEGRATION_EVENT', `${field} is required`, field);
  }
  return String(value);
}

function safePayload(value) {
  if (Array.isArray(value)) return value.map(safePayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !FORBIDDEN_PAYLOAD_KEY.test(key))
    .map(([key, entry]) => [key, safePayload(entry)]));
}

/**
 * Converts an existing append-only Snag event into the stable CPOS integration
 * envelope. Tenant identity is supplied by the Shared Core/orchestrator; the
 * Snag bounded context never resolves or duplicates Company membership.
 */
export function toSnagIntegrationEvent(event, context) {
  const eventType = required(event?.eventType ?? event?.event_type, 'eventType');
  if (!SNAG_INTEGRATION_EVENT_TYPES.includes(eventType)) {
    throw new SnagDomainError('UNKNOWN_INTEGRATION_EVENT', `Unsupported Snag event: ${eventType}`, 'eventType');
  }
  const projectId = required(event?.projectId ?? event?.project_id, 'projectId');
  if (context?.projectId != null && String(context.projectId) !== projectId) {
    throw new SnagDomainError('PROJECT_BOUNDARY', 'Event and integration context project differ', 'projectId');
  }

  return Object.freeze({
    eventType,
    schemaVersion: SNAG_INTEGRATION_EVENT_SCHEMA_VERSION,
    eventId: required(event?.id, 'eventId'),
    occurredAt: required(event?.occurredAt ?? event?.occurred_at, 'occurredAt'),
    actorId: required(event?.actorId ?? event?.actor_id, 'actorId'),
    companyId: required(context?.companyId, 'companyId'),
    projectId,
    aggregateType: 'SNAG',
    aggregateId: required(event?.snagId ?? event?.snag_id, 'aggregateId'),
    correlationId: required(event?.sourceCommandId ?? event?.source_command_id, 'correlationId'),
    payload: Object.freeze(safePayload({
      previousState: event?.previousState ?? event?.previous_state ?? null,
      newState: event?.newState ?? event?.new_state ?? null,
      reason: event?.reason ?? null,
    })),
  });
}
