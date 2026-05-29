import { supabase } from '../lib/supabase';

const LEGACY_PHASE_MAP = {
  'Demolition works':        'demolition',
  'Construction works':      'rough_in',
  'Testing & Commissioning': 'commissioning',
  'Handover':                'handover',
};

function normalizePhasesFromDB(phases) {
  if (!Array.isArray(phases)) return [];
  return phases.map(p => LEGACY_PHASE_MAP[p] ?? p);
}

function validateProject(project, requireId = false) {
  if (requireId && !project?.id) throw new Error('Project ID is required');
  if (!project?.storeCode?.trim()) throw new Error('Store code is required');
  if (!project?.shoppingMallName?.trim()) throw new Error('Shopping mall name is required');
  if (!project?.country?.trim()) throw new Error('Country is required');
  const dateFields = ['constructionStartDate', 'constructionEndDate', 'targetOpeningDate'];
  for (const f of dateFields) {
    if (project[f] && isNaN(Date.parse(project[f]))) {
      throw new Error(`Invalid date for ${f}: ${project[f]}`);
    }
  }
  if (project.storeSizeSqm !== undefined && project.storeSizeSqm !== null) {
    const sqm = Number(project.storeSizeSqm);
    if (isNaN(sqm) || sqm <= 0) throw new Error('store_size_sqm must be a positive number');
  }
}

/**
 * fromDB maps every DB column → camelCase JS field.
 * Includes Gantt-computed fields (read-only — written only by ganttService).
 * toDB is the inverse but intentionally OMITS those computed fields so a
 * normal UI update() can never overwrite ganttService's calculations.
 */
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
    phases: normalizePhasesFromDB(row.phases || []),
    // ── Gantt fields (read-only, written by ganttService) ──────────────────
    templateType:               row.template_type                || null,
    storeSizeSqm:               row.store_size_sqm               || null,
    ganttGeneratedAt:           row.gantt_generated_at           || null,
    constructionCompletionDate: row.construction_completion_date || null,
    forecastOpeningDate:        row.forecast_opening_date        || null,
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
    // ── Gantt setup fields (PM-editable) ───────────────────────────────────
    template_type:  project.templateType  || null,
    store_size_sqm: project.storeSizeSqm  || null,
    // NOTE: gantt_generated_at, construction_completion_date, forecast_opening_date
    // are intentionally excluded — they are owned by ganttService only.
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
  validateProject(project);
  const { data, error } = await supabase
    .from('projects')
    .insert([toDB(project)])
    .select()
    .single();
  if (error) throw error;
  return fromDB(data);
}

export async function update(id, project) {
  if (!id) throw new Error('Project ID is required for update');
  validateProject(project);
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

/**
 * Called exclusively by ganttService after Gantt calculation.
 * Updates computed date fields only — never called from UI directly.
 */
export async function updateGanttDates(id, { templateType, ganttGeneratedAt, constructionCompletionDate, forecastOpeningDate }) {
  const { error } = await supabase
    .from('projects')
    .update({
      template_type:                templateType               || null,
      gantt_generated_at:           ganttGeneratedAt           || null,
      construction_completion_date: constructionCompletionDate || null,
      forecast_opening_date:        forecastOpeningDate        || null,
    })
    .eq('id', id);
  if (error) throw error;
}
