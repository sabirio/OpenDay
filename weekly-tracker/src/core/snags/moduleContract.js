export const SNAG_MODULE_ID = 'openday.snags';

export const SNAG_MODULE_CAPABILITIES = Object.freeze([
  'snags.read',
  'snags.command',
  'snags.plans',
  'snags.evidence',
  'snags.history',
]);

export const SNAG_REQUIRED_SHARED_CAPABILITIES = Object.freeze([
  'identity.current-actor',
  'tenancy.company',
  'projects.identity',
  'projects.access',
  'audit.clock',
]);

export const SNAG_PROHIBITED_RUNTIME_MODULES = Object.freeze([
  'weekly-report',
  'site-visit',
  'progress-engine',
  'risk-engine',
  'readiness-engine',
]);

/** Minimal commercial/configuration seam; billing remains outside this module. */
export function isSnagModuleEnabled(entitlements) {
  return entitlements?.hasCapability?.(SNAG_MODULE_ID) === true;
}
