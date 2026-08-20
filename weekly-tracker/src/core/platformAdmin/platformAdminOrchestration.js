import {
  getPlatformOrganization,listPlatformCapabilities,listPlatformEntitlementEvents,
  listPlatformOrganizations,listPlatformPlans,setPlatformOrganizationEntitlement,
  setPlatformOrganizationStatus,setPlatformOrganizationSubscription,
} from '../../services/platformAdminService.js';

export const loadPlatformOrganizations=()=>listPlatformOrganizations();
export const loadPlatformPlans=()=>listPlatformPlans();
export const loadPlatformCapabilities=()=>listPlatformCapabilities();
export const loadPlatformOrganization=organizationId=>getPlatformOrganization(organizationId);
export const loadPlatformEntitlementEvents=organizationId=>listPlatformEntitlementEvents(organizationId);
export const commitPlatformOrganizationStatus=input=>setPlatformOrganizationStatus(input);
export const commitPlatformOrganizationSubscription=input=>setPlatformOrganizationSubscription(input);
export const commitPlatformOrganizationEntitlement=input=>setPlatformOrganizationEntitlement(input);
