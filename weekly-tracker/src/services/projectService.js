import { supabase } from '../lib/supabase';

function fromDB(row) {
  return {
    id: row.id,
    storeCode: row.store_code,
    shoppingMallName: row.shopping_mall_name,
    city: row.city,
    street: row.street,
    state: row.state,
    country: row.country,
    salesMarket: row.sales_market,
    constructionStartDate: row.construction_start_date,
    constructionEndDate: row.construction_end_date,
    targetOpeningDate: row.target_opening_date,
    projectManager: row.project_manager,
    securityManager: row.security_manager,
    itManager: row.it_manager,
    facilityManager: row.facility_manager,
    hrManager: row.hr_manager,
    supplyManager: row.supply_manager,
    generalContractor: row.general_contractor,
    contractorEmail: row.contractor_email,
    projectType: row.project_type,
    projectStatus: row.project_status,
    ganttTemplate: row.gantt_template || 'fitout',
    phases: row.phases || [],
  };
}

function toDB(project) {
  return {
    store_code: project.storeCode || null,
    shopping_mall_name: project.shoppingMallName || null,
    city: project.city || null,
    street: project.street || null,
    state: project.state || null,
    country: project.country || null,
    sales_market: project.salesMarket || null,
    construction_start_date: project.constructionStartDate || null,
    construction_end_date: project.constructionEndDate || null,
    target_opening_date: project.targetOpeningDate || null,
    project_manager: project.projectManager || null,
    security_manager: project.securityManager || null,
    it_manager: project.itManager || null,
    facility_manager: project.facilityManager || null,
    hr_manager: project.hrManager || null,
    supply_manager: project.supplyManager || null,
    general_contractor: project.generalContractor || null,
    contractor_email: project.contractorEmail || null,
    project_type: project.projectType || 'New Opening',
    project_status: project.projectStatus || 'Active',
    phases: project.phases || [],
  };
}

export async function getAll() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(fromDB);
}

export async function create(project) {
  const { data, error } = await supabase
    .from('projects')
    .insert([toDB(project)])
    .select()
    .single();
  if (error) throw error;
  return fromDB(data);
}

export async function update(id, project) {
  const { data, error } = await supabase
    .from('projects')
    .update(toDB(project))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return fromDB(data);
}

export async function remove(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}
