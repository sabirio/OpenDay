export function groupPlatformCapabilities(capabilities=[]) {
  const groups=new Map();
  for(const capability of capabilities){
    const rows=groups.get(capability.group_code)??[];
    rows.push(capability);groups.set(capability.group_code,rows);
  }
  return [...groups.entries()];
}

export function indexEffectiveCapabilities(capabilities=[]) {
  return Object.fromEntries(capabilities.map(row=>[row.capabilityId,row]));
}

export function indexManualOverrides(entitlements=[]) {
  return Object.fromEntries(entitlements.filter(row=>row.source==='manual_override')
    .map(row=>[row.capability_id,row]));
}

export function buildPlatformOrganizationSummary(detail) {
  return {
    status:detail?.organization?.status??'Unknown',
    plan:detail?.subscription?.plan_id??'Not assigned',
    adminUsers:detail?.adminUsers?.length??0,
    effectiveCapabilities:countEnabledCapabilities(detail?.effective?.capabilities),
  };
}
import { countEnabledCapabilities } from '../../engines/platformAdminEngine.js';
