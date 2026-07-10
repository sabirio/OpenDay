export function buildEvidencePath(projectId, userId, now = new Date(), fileId = globalThis.crypto?.randomUUID?.()) {
  if (!/^\d+$/.test(String(projectId))) throw new Error('A numeric project ID is required for photo upload');
  if (!/^[0-9a-f-]{36}$/i.test(String(userId))) throw new Error('An authenticated user UUID is required for photo upload');
  if (!/^[0-9a-f-]{36}$/i.test(String(fileId))) throw new Error('A secure file UUID is required for photo upload');
  const yearMonth = new Date(now).toISOString().slice(0, 7);
  return `${projectId}/${yearMonth}/${userId}_${fileId}.jpg`;
}
