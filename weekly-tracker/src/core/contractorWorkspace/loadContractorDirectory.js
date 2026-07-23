import { listContractors } from '../../services/contractorInviteService.js';

/**
 * Admin-only contractor directory for the Contractor Workspace selector —
 * thin I/O passthrough, no composition needed here. Each contractor's
 * assignedProjects is the same field a real Contractor's own session reads
 * at login (authService.buildUser), so resolving a selected contractor's
 * scope from this list is faithful to what that contractor would see.
 */
export async function loadContractorDirectory() {
  return listContractors();
}
