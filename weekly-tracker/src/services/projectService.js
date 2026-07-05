import { supabase } from '../lib/supabase';
import { ProjectSchema, ProgressHistoryRowSchema } from '../schemas/projectSchema';
import { validateArray, validateOne } from '../schemas/validate';

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
    phases:      normalizePhasesFromDB(row.phases || []),
    scope:       row.scope       || null,
    templateId:  row.template_id || null,
    // Conflict-detection baseline (see conflictGuard.js) — null on DBs that
    // haven't applied 016_updated_at.sql yet.
    updatedAt:   row.updated_at  || null,
    // ── Gantt fields (read-only, written by ganttService) ──────────────────
    templateType:               row.template_type                || null,
    storeSizeSqm:               row.store_size_sqm               || null,
    ganttGeneratedAt:           row.gantt_generated_at           || null,
    ganttEngineVersion:         row.gantt_engine_version         ?? null,
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
    phases:      project.phases      || [],
    scope:       project.scope       || null,
    template_id: project.templateId  || null,
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
  const projects = data.map(fromDB);

  try {
    const ids = projects.map(p => p.id);
    const { data: histRows, error: histErr } = await supabase
      .from('progress_history')
      .select('project_id, overall_progress, spi, recorded_at, week_number')
      .in('project_id', ids)
      .order('recorded_at', { ascending: false });
    if (histErr) console.warn('[progressHistory] fetch failed:', histErr);

    const histByProject = {};
    for (const row of (histRows || [])) {
      if (!histByProject[row.project_id]) histByProject[row.project_id] = [];
      histByProject[row.project_id].push(row);
    }
    // Validate progress_history rows independently, per project, BEFORE they're
    // embedded in the project object (P1.3): ProjectSchema.progressHistory is a
    // nested array, and Zod fails the whole parent parse on the first invalid
    // element — one corrupted historical snapshot would otherwise drop the
    // entire project (and everything derived from it) from getAll(), not just
    // that one snapshot. Filtering here keeps the "one bad row, one warning"
    // contract for nested collections too.
    const withHistory = projects.map(p => ({
      ...p,
      progressHistory: validateArray(ProgressHistoryRowSchema, histByProject[p.id] || [], `progress_history[project ${p.id}]`),
    }));
    return validateArray(ProjectSchema, withHistory, 'projects');
  } catch {
    return validateArray(ProjectSchema, projects.map(p => ({ ...p, progressHistory: [] })), 'projects');
  }
}

export async function getById(id) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return validateOne(ProjectSchema, fromDB(data), 'project');
}

export async function getProgressSnapshot(isoWeekStr) {
  const [yearStr, weekStr] = isoWeekStr.split('-W');
  const year = parseInt(yearStr), week = parseInt(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() - (jan4Day - 1) * 86400000 + (week - 1) * 7 * 86400000);
  const nextMonday = new Date(monday.getTime() + 7 * 86400000);

  const { data, error } = await supabase
    .from('progress_history')
    .select('project_id, overall_progress, spi, recorded_at')
    .gte('recorded_at', monday.toISOString())
    .lt('recorded_at', nextMonday.toISOString());

  if (error) throw error;

  const map = {};
  for (const row of (data || [])) {
    if (!map[row.project_id]) map[row.project_id] = row;
  }
  return map;
}

export async function create(project) {
  validateProject(project);
  const payload = toDB(project);
  // Pin to the active template at creation time if not already set.
  if (!payload.template_id) {
    const { data: tpl } = await supabase
      .from('templates')
      .select('id')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single();
    payload.template_id = tpl?.id ?? null;
  }
  const { data, error } = await supabase
    .from('projects')
    .insert([payload])
    .select()
    .single();
  if (error) throw error;
  return fromDB(data);
}

export async function update(id, project) {
  if (!id) throw new Error('Project ID is required for update');
  validateProject(project);
  const payload = toDB(project);
  // template_id is immutable after creation — never overwrite on update.
  delete payload.template_id;
  const { data, error } = await supabase
    .from('projects')
    .update(payload)
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
export async function updateGanttDates(id, {
  templateType,
  ganttGeneratedAt,
  ganttEngineVersion,
  constructionCompletionDate,
  forecastOpeningDate,
} = {}) {
  // Only include fields that were explicitly passed — avoids nullifying unrelated columns.
  const patch = {};
  if (templateType               !== undefined) patch.template_type                = templateType               || null;
  if (ganttGeneratedAt           !== undefined) patch.gantt_generated_at           = ganttGeneratedAt           || null;
  if (ganttEngineVersion         !== undefined) patch.gantt_engine_version         = ganttEngineVersion         ?? null;
  if (constructionCompletionDate !== undefined) patch.construction_completion_date = constructionCompletionDate || null;
  if (forecastOpeningDate        !== undefined) patch.forecast_opening_date        = forecastOpeningDate        || null;

  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from('projects').update(patch).eq('id', id);
  if (error) throw error;
}
