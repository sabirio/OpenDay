export function createClientRequestId() {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure request ID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

export function validateProgress(value, path) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw Object.assign(new Error(`${path} must be a finite number between 0 and 100`), { code: 'VALIDATION_ERROR', field: path });
  }
  return numeric;
}

export function validateUniqueWPItems(items, operation) {
  if (!Array.isArray(items) || items.length === 0) throw Object.assign(new Error(`${operation} requires at least one WP item`), { code: 'VALIDATION_ERROR' });
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    if (!item?.wpId || ids.has(String(item.wpId))) throw Object.assign(new Error(`Duplicate or missing WP at index ${index}`), { code: 'VALIDATION_ERROR', field: `items[${index}].wpId` });
    ids.add(String(item.wpId));
    const value = item.progress_pct ?? item.observed_progress;
    validateProgress(value, `items[${index}].progress`);
  }
  return items;
}

export function normalizeWriteError(error, operation, requestId) {
  const pgCode = error?.code;
  const code = pgCode === '42501' ? 'AUTHORIZATION_ERROR'
    : pgCode === '28000' ? 'AUTHENTICATION_ERROR'
    : pgCode === '23505' ? 'CONFLICT'
    : error?.code === 'VALIDATION_ERROR' ? 'VALIDATION_ERROR'
    : /network|fetch|timeout/i.test(error?.message || '') ? 'NETWORK_ERROR'
    : 'DATABASE_ERROR';
  return {
    code,
    message: error?.message || 'Write command failed',
    operation,
    retryable: code === 'NETWORK_ERROR' || code === 'CONFLICT',
    fieldErrors: error?.field ? { [error.field]: error.message } : {},
    requestId,
    cause: error,
  };
}

