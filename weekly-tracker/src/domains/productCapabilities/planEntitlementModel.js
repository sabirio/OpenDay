import { resolveCapabilityClosure, validateCapabilityGraph } from './capabilityGraph.js';

export const ENTITLEMENT_SOURCE_PRIORITY = Object.freeze({
  plan: 100,
  trial: 200,
  enterprise_contract: 300,
  manual_override: 400,
});

export function validatePlanCapabilitySelection(capabilityIds, graph) {
  const graphValidation = validateCapabilityGraph(graph);
  if (!graphValidation.ok) return graphValidation;
  const selected = [...new Set(capabilityIds ?? [])];
  const closure = resolveCapabilityClosure(selected, graph);
  if (!closure.ok) return closure;
  const selectedSet = new Set(selected);
  const missingDependencyIds = closure.capabilityIds.filter((id) => !selectedSet.has(id));
  return {
    ok: missingDependencyIds.length === 0,
    issues: missingDependencyIds.map((capabilityId) => ({
      code: 'PLAN_DEPENDENCY_MISSING', capabilityId,
    })),
  };
}

export function validateEntitlementRecord(record, now = new Date()) {
  const issues = [];
  if (!record?.organizationId) issues.push({ code: 'ORGANIZATION_REQUIRED' });
  if (!record?.capabilityId) issues.push({ code: 'CAPABILITY_REQUIRED' });
  if (!(record?.source in ENTITLEMENT_SOURCE_PRIORITY)) {
    issues.push({ code: 'INVALID_ENTITLEMENT_SOURCE' });
  }
  if (typeof record?.enabled !== 'boolean') issues.push({ code: 'ENABLED_BOOLEAN_REQUIRED' });
  if (record?.config == null || Array.isArray(record.config) || typeof record.config !== 'object') {
    issues.push({ code: 'CONFIG_OBJECT_REQUIRED' });
  }
  const startsAt = record?.startsAt ? new Date(record.startsAt) : null;
  const expiresAt = record?.expiresAt ? new Date(record.expiresAt) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) issues.push({ code: 'INVALID_START_DATE' });
  if (expiresAt && Number.isNaN(expiresAt.getTime())) issues.push({ code: 'INVALID_EXPIRY_DATE' });
  if (startsAt && expiresAt && expiresAt <= startsAt) issues.push({ code: 'EXPIRY_NOT_AFTER_START' });

  return {
    ok: issues.length === 0,
    issues,
    isCurrentlyValid: issues.length === 0
      && (!startsAt || startsAt <= now)
      && (!expiresAt || expiresAt > now),
  };
}
