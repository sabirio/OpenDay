// The stable read contract shared by every templates-table consumer.
// `*` is deliberate: PostgREST rejects a request when a named additive
// column has not reached an environment yet, while `*` returns the columns
// that actually exist and lets this adapter preserve one application model.
export const TEMPLATE_SELECT = '*';

export function deriveTemplateFamily(row) {
  return row?.family ?? row?.data?.templateType ?? null;
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
  return error?.code === '42703';
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
    return { templatesById: new Map(), error };
  }
}

export async function settleOptionalTemplateRecord(id, fetcher) {
  try {
    return { template: await fetcher(id), error: null };
  } catch (error) {
    return { template: null, error };
  }
}
