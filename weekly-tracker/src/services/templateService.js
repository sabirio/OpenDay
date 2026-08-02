import { supabase } from '../lib/supabase';
import { selectDefaultScopeTemplate } from '../domains/construction/templates/versionedScopeTemplate.js';
import {
  TEMPLATE_SELECT,
  fromDBTemplate,
  getTemplateLoadErrorMessage,
  selectActiveLegacyTemplate,
  settleOptionalTemplateRecord,
  settleOptionalTemplateRecords,
} from './templateRecordContract.js';

export {
  TEMPLATE_SELECT,
  deriveTemplateFamily,
  fromDBTemplate,
  getTemplateLoadErrorMessage,
  isTemplateSchemaContractError,
  selectActiveLegacyTemplate,
} from './templateRecordContract.js';

export async function getCurrentCompanyId() {
  const { data, error } = await supabase.rpc('current_company_id');
  if (error) throw error;
  return data ?? null;
}

export async function fetchApplicableTemplateRecords(family) {
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_SELECT)
    .eq('is_active', true)
    .order('version', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDBTemplate).filter(record => record.family === family);
}

export async function resolveDefaultScopeTemplateForCurrentCompany(family) {
  const [companyId, records] = await Promise.all([
    getCurrentCompanyId(),
    fetchApplicableTemplateRecords(family),
  ]);
  return selectDefaultScopeTemplate(records, { family, companyId });
}

export async function fetchTemplateRecordsByIds(ids) {
  const uniqueIds = [...new Set((ids ?? []).filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_SELECT)
    .in('id', uniqueIds);
  if (error) throw error;
  return new Map((data ?? []).map(row => {
    const mapped = fromDBTemplate(row);
    return [mapped.id, mapped];
  }));
}

export async function fetchOptionalTemplateRecordsByIds(ids, fetcher = fetchTemplateRecordsByIds) {
  const result = await settleOptionalTemplateRecords(ids, fetcher);
  if (result.error) {
    const { error } = result;
    console.warn('[templates] Optional template hydration failed:', getTemplateLoadErrorMessage(error), error);
  }
  return result;
}

export async function fetchTemplateRecordById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return fromDBTemplate(data);
}

export async function fetchOptionalTemplateRecordById(id, fetcher = fetchTemplateRecordById) {
  const result = await settleOptionalTemplateRecord(id, fetcher);
  if (result.error) {
    const { error } = result;
    console.warn('[templates] Optional template hydration failed:', getTemplateLoadErrorMessage(error), error);
  }
  return result;
}

export async function fetchAllTemplateRecords() {
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_SELECT);
  if (error) throw error;
  return (data ?? []).map(fromDBTemplate);
}

export async function fetchActiveLegacyTemplateRecord() {
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_SELECT)
    .eq('is_active', true)
    .order('version', { ascending: false });
  if (error) throw error;
  return selectActiveLegacyTemplate(data);
}
