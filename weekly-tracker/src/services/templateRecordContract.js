// Temporary rollout-compatible read contract shared by every production
// templates-table consumer. This is intentionally not the permanent
// canonical column contract: PostgREST rejects a request when a named
// additive column has not reached an environment yet, while `*` returns the
// columns that actually exist and lets this adapter preserve one app model.
export const TEMPLATE_SELECT = '*';
const ROLLOUT_ROUTING_TEMPLATE_TYPES = new Set(['retail-fitout-v2']);

export function deriveTemplateFamily(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new TypeError('Malformed template record');
  }
  if (!row.data || typeof row.data !== 'object' || Array.isArray(row.data)) {
    throw new TypeError('Malformed template data');
  }

  if (row.family != null) {
    if (typeof row.family !== 'string' || row.family.trim() === '') {
      throw new TypeError('Malformed template family');
    }
    return row.family;
  }

  const legacyTemplateType = row.data.templateType;
  if (legacyTemplateType == null) return null;
  if (typeof legacyTemplateType !== 'string' || legacyTemplateType.trim() === '') {
    throw new TypeError('Malformed template templateType');
  }
  return ROLLOUT_ROUTING_TEMPLATE_TYPES.has(legacyTemplateType) ? legacyTemplateType : null;
}

export function fromDBTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    family: deriveTemplateFamily(row),
    familyId: row.family_id ?? null,
    companyId: row.company_id ?? null,
    version: row.version,
    isActive: row.is_active,
    data: row.data,
  };
}

export function isTemplateSchemaContractError(error) {
  if (error?.code !== '42703' || typeof error?.message !== 'string') return false;
  const normalizedMessage = error.message.replace(/["']/g, '').replace(/\s+/g, ' ').trim();
  return /^column (?:public\.)?templates\.(?:family|company_id) does not exist$/i.test(normalizedMessage);
}

export function getTemplateLoadErrorMessage(error) {
  if (isTemplateSchemaContractError(error)) {
    return 'Template data is unavailable because the application and database schema are out of sync.';
  }
  return 'Template data could not be loaded. Other project data remains available.';
}

export function selectActiveLegacyTemplate(records) {
  return (records ?? []).map(fromDBTemplate).find(record => record?.isActive && record.family == null) ?? null;
}

export async function settleOptionalTemplateRecords(ids, fetcher) {
  try {
    return { templatesById: await fetcher(ids), error: null };
  } catch (error) {
    if (!isTemplateSchemaContractError(error)) throw error;
    return { templatesById: new Map(), error };
  }
}

export async function settleOptionalTemplateRecord(id, fetcher) {
  try {
    return { template: await fetcher(id), error: null };
  } catch (error) {
    if (!isTemplateSchemaContractError(error)) throw error;
    return { template: null, error };
  }
}
