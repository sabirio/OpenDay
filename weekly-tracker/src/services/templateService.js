import { supabase } from '../lib/supabase';

export function fromDBTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    family: row.family ?? null,
    familyId: row.family_id ?? null,
    companyId: row.company_id ?? null,
    version: row.version,
    isActive: row.is_active,
    data: row.data,
  };
}

const TEMPLATE_COLUMNS = 'id,name,family,family_id,company_id,version,is_active,data';

export async function getCurrentCompanyId() {
  const { data, error } = await supabase.rpc('current_company_id');
  if (error) throw error;
  return data ?? null;
}

export async function fetchApplicableTemplateRecords(family) {
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_COLUMNS)
    .eq('family', family)
    .eq('is_active', true)
    .order('version', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDBTemplate);
}

export async function fetchTemplateRecordsByIds(ids) {
  const uniqueIds = [...new Set((ids ?? []).filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_COLUMNS)
    .in('id', uniqueIds);
  if (error) throw error;
  return new Map((data ?? []).map(row => {
    const mapped = fromDBTemplate(row);
    return [mapped.id, mapped];
  }));
}

export async function fetchTemplateRecordById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return fromDBTemplate(data);
}
