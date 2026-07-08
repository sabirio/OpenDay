import { fetchProjectAuditLog } from '../../services/auditLogService.js';

export async function loadProjectAuditLog(projectId) {
  if (!projectId) return [];
  return fetchProjectAuditLog(projectId);
}
