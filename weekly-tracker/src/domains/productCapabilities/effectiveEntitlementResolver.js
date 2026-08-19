import { ENTITLEMENT_SOURCE_PRIORITY } from './planEntitlementModel.js';

function asDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isActiveWindow(startsAt, expiresAt, at) {
  const start = asDate(startsAt);
  const end = asDate(expiresAt);
  return (!start || start <= at) && (!end || end > at);
}

function mergeConfig(base, override) {
  return { ...(base ?? {}), ...(override ?? {}) };
}

function earliestExpiry(first, second) {
  const firstDate = asDate(first);
  const secondDate = asDate(second);
  if (!firstDate) return second ?? null;
  if (!secondDate) return first ?? null;
  return firstDate <= secondDate ? first : second;
}

export function resolveEffectiveEntitlements({
  subscription,
  planCapabilities = [],
  organizationEntitlements = [],
  dependencies = [],
  at = new Date(),
} = {}) {
  const resolutionAt = at instanceof Date ? at : new Date(at);
  const subscriptionActive = subscription
    && ['ACTIVE', 'TRIAL'].includes(subscription.status)
    && isActiveWindow(subscription.startsAt, subscription.endsAt, resolutionAt);
  if (!subscriptionActive) return { subscriptionActive: false, capabilities: [] };

  const planDefaults = new Map();
  const candidates = new Map();
  for (const row of planCapabilities) {
    if (row.planId !== subscription.planId || row.enabled !== true) continue;
    const config = row.defaultConfig ?? {};
    planDefaults.set(row.capabilityId, config);
    candidates.set(row.capabilityId, {
      capabilityId: row.capabilityId,
      enabled: true,
      source: 'plan',
      priority: ENTITLEMENT_SOURCE_PRIORITY.plan,
      recordPriority: 0,
      config,
      expiresAt: subscription.endsAt ?? null,
    });
  }

  for (const row of organizationEntitlements) {
    if (row.organizationId !== subscription.organizationId) continue;
    if (!isActiveWindow(row.startsAt, row.expiresAt, resolutionAt)) continue;
    const priority = ENTITLEMENT_SOURCE_PRIORITY[row.source];
    if (!priority) continue;
    const current = candidates.get(row.capabilityId);
    if (current && (current.priority > priority
      || (current.priority === priority && current.recordPriority >= 1))) continue;
    candidates.set(row.capabilityId, {
      capabilityId: row.capabilityId,
      enabled: row.enabled === true,
      source: row.source,
      priority,
      recordPriority: 1,
      config: mergeConfig(planDefaults.get(row.capabilityId), row.config),
      expiresAt: earliestExpiry(row.expiresAt, subscription.endsAt),
    });
  }

  const disabled = new Set(
    [...candidates.values()].filter((row) => !row.enabled).map((row) => row.capabilityId),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const dependency of dependencies) {
      const candidate = candidates.get(dependency.capabilityId);
      if (!candidate || disabled.has(dependency.capabilityId)) continue;
      const required = candidates.get(dependency.requiredCapabilityId);
      if (!required || !required.enabled || disabled.has(dependency.requiredCapabilityId)) {
        disabled.add(dependency.capabilityId);
        changed = true;
      }
    }
  }

  return {
    subscriptionActive: true,
    capabilities: [...candidates.values()].map((row) => ({
      capabilityId: row.capabilityId,
      enabled: row.enabled && !disabled.has(row.capabilityId),
      source: row.source,
      config: row.config,
      expiresAt: row.expiresAt,
      disabledReason: !row.enabled
        ? 'EXPLICITLY_DISABLED'
        : disabled.has(row.capabilityId) ? 'DEPENDENCY_NOT_ENTITLED' : null,
    })).sort((a, b) => a.capabilityId.localeCompare(b.capabilityId)),
  };
}
