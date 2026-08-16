import { supabase } from '../lib/supabase';
import { ProjectSchema, ProgressHistoryRowSchema } from '../schemas/projectSchema';
import { validateArray, validateOne } from '../schemas/validate';
import { isoWeekToMonday } from '../utils/scheduleUtils';
import {
  RETAIL_FITOUT_V2_FAMILY,
} from '../domains/construction/templates/versionedScopeTemplate.js';

const LEGACY_PHASE_MAP = {
  'Demolition works':        'demolition',
  'Construction works':      'rough_in',
  'Testing & Commissioning': 'commissioning',
  'Handover':                'handover',
};

export const PROJECT_CURRENCY_CODES = Object.freeze(['KZT', 'USD', 'EUR']);

function normalizePhasesFromDB(phases) {
  if (!Array.isArray(phases)) return [];
  return phases.map(p => LEGACY_PHASE_MAP[p] ?? p);
}

export function validateProject(project, requireId = false) {
  if (requireId && !project?.id) throw new Error('Project ID is required');
  if (!project?.storeCode?.trim()) throw new Error('Store code is required');
  if (!project?.country?.trim()) throw new Error('Country is required');
  if (project?.scope?.workOntologyVersionId && (!Array.isArray(project.scope.disciplineIds) || project.scope.disciplineIds.length === 0)) {
    throw new Error('Select at least one discipline');
  }

  // Location Type is optional at the DB level (frozen design: TEXT NULL, no
  // enum), but when a project declares one, the Mall/Street invariant is
  // enforced the same way Import v1's own integrity floor enforces it —
  // shopping_mall_name must never hold a street address or vice versa.
  if (project?.locationType === 'Mall' && !project?.shoppingMallName?.trim()) {
    throw new Error('Shopping Mall Name is required for a Mall location');
  }
  if (project?.locationType === 'Street' && !project?.street?.trim()) {
    throw new Error('Street Address is required for a Street location');
  }

  const dateFields = ['constructionStartDate', 'constructionEndDate', 'targetOpeningDate', 'actualConstructionStartDate', 'actualConstructionCompletionDate', 'actualOpeningDate'];
  for (const f of dateFields) {
    if (project[f] && isNaN(Date.parse(project[f]))) {
      throw new Error(`Invalid date for ${f}: ${project[f]}`);
    }
  }

  const areaFields = ['storeSizeSqm', 'salesAreaSqm', 'backOfHouseAreaSqm'];
  for (const f of areaFields) {
    if (project[f] !== '' && project[f] != null && Number(project[f]) < 0) {
      throw new Error(`${f} cannot be negative`);
    }
  }
  if (project?.salesAreaSqm !== '' && project?.salesAreaSqm != null && project?.storeSizeSqm !== '' && project?.storeSizeSqm != null
    && Number(project.salesAreaSqm) > Number(project.storeSizeSqm)) {
    throw new Error('Sales Area cannot exceed Total Area');
  }

  const moneyFields = ['budget', 'actualCost'];
  for (const f of moneyFields) {
    if (project[f] !== '' && project[f] != null && Number(project[f]) < 0) {
      throw new Error(`${f} cannot be negative`);
    }
  }
  const hasMoney = (project?.budget !== '' && project?.budget != null) || (project?.actualCost !== '' && project?.actualCost != null);
  if (project?.currencyCode && !PROJECT_CURRENCY_CODES.includes(project.currencyCode)) {
    throw new Error('Currency must be KZT, USD, or EUR');
  }
  if (hasMoney && !project?.currencyCode?.trim()) {
    throw new Error('Currency is required when Budget or Actual Cost is set');
  }
}

/**
 * fromDB maps every DB column → camelCase JS field.
 * Includes Gantt-computed fields (read-only — written only by ganttService).
 * toDB is the inverse but intentionally OMITS those computed fields so a
 * normal UI update() can never overwrite ganttService's calculations.
 */
export function fromDB(row) {
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
    companyId:    row.company_id || null,
    phases:      normalizePhasesFromDB(row.phases || []),
    scope:       row.scope       || null,
    templateId:  row.template_id || null,
    workOntologyVersionId: row.work_ontology_version_id || null,
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
    // Simplification Phase 3B/3C: AUTO_GENERATED default (046) — a project
    // fetched before this field existed on some historical row would still
    // fall back to the same default the DB column itself defaults to.
    // Literal, not the core/schedule/scheduleOwnershipMode.js constant:
    // services/ is persistence/I/O only and must never import core/ (the
    // architecture guard's service-purity rule) — this is the raw-DB-value
    // mapping boundary itself, the same shape every other enum-like column
    // default in this function already uses.
    scheduleOwnershipMode:      row.schedule_ownership_mode      || 'AUTO_GENERATED',
    // ── Retail Historical Project Profile v1 (migration 037) — same schema
    // serves live creation/editing AND historical import (Capture Once, Use
    // Everywhere). PM-editable here; actual_* dates are observed historical
    // facts, never engine-recalculated, and must not be confused with the
    // forecast fields above. ──────────────────────────────────────────────
    locationType:                     row.location_type                     || null,
    storeConcept:                     row.store_concept                     || null,
    // ?? (not ||) for every numeric field below — a genuine 0 (e.g. a kiosk
    // with no back-of-house split) must never be coerced to null/"unknown".
    salesAreaSqm:                     row.sales_area_sqm                    ?? null,
    backOfHouseAreaSqm:               row.back_of_house_area_sqm            ?? null,
    actualConstructionStartDate:      row.actual_construction_start_date      || null,
    actualConstructionCompletionDate: row.actual_construction_completion_date || null,
    actualOpeningDate:                row.actual_opening_date                 || null,
    budget:                           row.budget                            ?? null,
    actualCost:                       row.actual_cost                       ?? null,
    currencyCode:                     row.currency_code                     || null,
  };
}

export function toDB(project, { preserveLegacyZoneAreas = false } = {}) {
  // Mall/Street mutual exclusivity enforced at the write boundary — mirrors
  // the same invariant the trusted Import commit RPC enforces (migration
  // 039's integrity floor). Whichever field doesn't apply to the declared
  // location_type is written as NULL, so a stale value from a prior
  // selection (e.g. the user switched Street -> Mall without clearing the
  // old address) can never be silently resubmitted. A project with no
  // location_type at all (legacy rows predating migration 037) is left
  // untouched — this only applies once a location_type is actually set.
  const locationType = project.locationType || null;
  const shoppingMallName = locationType === 'Street' ? null : (project.shoppingMallName || null);
  const street = locationType === 'Mall' ? null : (project.street || null);
  return {
    store_code: project.storeCode || null,
    shopping_mall_name: shoppingMallName,
    city: project.city || null,
    street: street,
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
    company_id: project.companyId || null,
    phases:      project.phases      || [],
    // Scope is persisted as selection/configuration only for new projects.
    // Existing rows keep an explicit historical zoneAreas object verbatim;
    // this is write-boundary compatibility, not an alternate calculation.
    scope: (() => {
      if (!project.scope || typeof project.scope !== 'object' || Array.isArray(project.scope)) return null;
      const scope = { ...project.scope };
      delete scope.zoneAreas;
      if (preserveLegacyZoneAreas && project.scope.zoneAreas && typeof project.scope.zoneAreas === 'object' && !Array.isArray(project.scope.zoneAreas)) {
        scope.zoneAreas = { ...project.scope.zoneAreas };
      }
      return Object.keys(scope).length > 0 ? scope : null;
    })(),
    template_id: project.templateId  || null,
    work_ontology_version_id: project.workOntologyVersionId || project.scope?.workOntologyVersionId || null,
    // ── Gantt setup fields (PM-editable) ───────────────────────────────────
    template_type:  project.templateType  || null,
    store_size_sqm: project.storeSizeSqm === '' || project.storeSizeSqm == null ? null : project.storeSizeSqm,
    // NOTE: gantt_generated_at, construction_completion_date, forecast_opening_date
    // are intentionally excluded — they are owned by ganttService only.
    // ── Retail Historical Project Profile v1 (migration 037) — same schema
    // as Import; ?? (not ||) on every numeric field since a genuine 0 (e.g.
    // no back-of-house split) must never be coerced away. actual_* dates are
    // observed historical facts entered here exactly like any other planned
    // field — never engine-recalculated, never touching the forecast columns
    // above. ────────────────────────────────────────────────────────────────
    location_type: locationType,
    store_concept: project.storeConcept || null,
    sales_area_sqm: project.salesAreaSqm === '' || project.salesAreaSqm == null ? null : project.salesAreaSqm,
    back_of_house_area_sqm: project.backOfHouseAreaSqm === '' || project.backOfHouseAreaSqm == null ? null : project.backOfHouseAreaSqm,
    actual_construction_start_date: project.actualConstructionStartDate || null,
    actual_construction_completion_date: project.actualConstructionCompletionDate || null,
    actual_opening_date: project.actualOpeningDate || null,
    budget: project.budget === '' || project.budget == null ? null : project.budget,
    actual_cost: project.actualCost === '' || project.actualCost == null ? null : project.actualCost,
    currency_code: project.currencyCode || null,
  };
}

export async function getAll() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const projects = data.map(fromDB);
  // Template scope-metadata hydration is OPTIONAL enrichment of an already-
  // loaded, already-critical projects list - the known templates.family/
  // company_id schema-contract mismatch (production has not yet received
  // migration 041) must never fail the projects load itself. Any OTHER
  // failure (auth/RLS/network/a genuinely malformed template row/anything
  // else) still propagates and fails this load, exactly as before - see
  // templateService.js's settleOptionalTemplateRecords.
  const { fetchOptionalTemplateRecordsByIds } = await import('./templateService.js');
  const { templatesById } = await fetchOptionalTemplateRecordsByIds(projects.map(project => project.templateId));
  const hydratedProjects = projects.map(project => ({
    ...project,
    scopeTemplate: project.templateId ? (templatesById.get(project.templateId) ?? null) : null,
  }));

  try {
    const ids = hydratedProjects.map(p => p.id);
    const { data: histRows, error: histErr } = await supabase
      .from('progress_history')
      .select('project_id, overall_progress, spi, recorded_at, week_number, work_ontology_version_id')
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
    const withHistory = hydratedProjects.map(p => ({
      ...p,
      progressHistory: validateArray(ProgressHistoryRowSchema, histByProject[p.id] || [], `progress_history[project ${p.id}]`),
    }));
    return validateArray(ProjectSchema, withHistory, 'projects');
  } catch {
    return validateArray(ProjectSchema, hydratedProjects.map(p => ({ ...p, progressHistory: [] })), 'projects');
  }
}

export async function getById(id) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  const project = fromDB(data);
  const { fetchOptionalTemplateRecordById } = await import('./templateService.js');
  const { template: scopeTemplate } = await fetchOptionalTemplateRecordById(project.templateId);
  return validateOne(ProjectSchema, { ...project, scopeTemplate }, 'project');
}

export async function getProgressSnapshot(isoWeekStr) {
  const monday = isoWeekToMonday(isoWeekStr);
  const nextMonday = new Date(monday.getTime() + 7 * 86400000);

  const { data, error } = await supabase
    .from('progress_history')
    .select('project_id, overall_progress, spi, recorded_at, work_ontology_version_id')
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
  const {
    fetchOptionalTemplateRecordById,
    getCurrentCompanyId,
    resolveDefaultScopeTemplateForCurrentCompany,
    resolveLegacyGlobalDefaultTemplateId,
  } = await import('./templateService.js');
  const payload = toDB(project, { preserveLegacyZoneAreas: false });
  const companyId = payload.company_id ?? await getCurrentCompanyId();
  payload.company_id = companyId;

  let pinnedTemplate = null;
  // V2 projects pin the exact company-specific default when present, or the
  // global OpenDay default otherwise. RLS ensures another company's private
  // template is never among these candidates.
  //
  // On the current legacy production schema (no `family` column at all),
  // resolveDefaultScopeTemplateForCurrentCompany can never find a matching
  // row and throws TemplateConfigurationUnavailableError - it never falls
  // back to guessing a template, and this create() call intentionally lets
  // that error propagate uncaught: no project is ever created with an
  // unproven/ambiguous template (see templateService.js's
  // TemplateConfigurationUnavailableError and this task's Phase 7/6).
  if (!payload.template_id && payload.template_type === RETAIL_FITOUT_V2_FAMILY) {
    pinnedTemplate = await resolveDefaultScopeTemplateForCurrentCompany(RETAIL_FITOUT_V2_FAMILY);
    payload.template_id = pinnedTemplate.id;
  }

  // Preserve the existing database-template behavior for V1/custom projects,
  // but exclude the newly-seeded V2 family from that legacy global lookup.
  // Schema-compatible and never assumes exactly one active row exists: zero
  // candidates preserves the pre-existing template_id = null behavior; more
  // than one candidate throws TemplateConfigurationUnavailableError instead
  // of picking one arbitrarily - see resolveLegacyGlobalDefaultTemplateId's
  // own header comment for why the baseline schema permits this.
  if (!payload.template_id) {
    payload.template_id = await resolveLegacyGlobalDefaultTemplateId();
  }
  const { data, error } = await supabase
    .from('projects')
    .insert([payload])
    .select()
    .single();
  if (error) throw error;
  const saved = fromDB(data);
  // The project row already exists at this point (the insert above
  // succeeded) - a scope-template hydration failure here must not make
  // create() throw and mislead the caller into thinking nothing was
  // created. Degrades to scopeTemplate: null on the known schema-contract
  // mismatch only; any other error still propagates.
  if (!pinnedTemplate && saved.templateId) {
    const { template } = await fetchOptionalTemplateRecordById(saved.templateId);
    pinnedTemplate = template;
  }
  return { ...saved, scopeTemplate: pinnedTemplate };
}

/**
 * Atomically create a CONTRACTOR_MANAGED project via
 * create_contractor_managed_project() (052_create_contractor_managed_project.sql):
 * one call creates the project row, persists Scope, and materializes one
 * unscheduled project_gantt_tasks row per active Scope WP, or rolls back
 * everything. This is a thin RPC wrapper — it does not resolve Scope
 * selection itself (the caller supplies the already-resolved active WP id
 * list; see core/projects/createContractorManagedProjectCommand.js) and it
 * never falls back to the plain create() path on failure.
 *
 * p_project uses the same camelCase field names as the JS project object —
 * NOT toDB()'s snake_case shape — because the RPC reads them directly out of
 * the jsonb payload by camelCase key. template_id and schedule_ownership_mode
 * are deliberately absent: the server resolves the template and hardcodes
 * ownership to CONTRACTOR_MANAGED; neither can be supplied by the client.
 *
 * @param {object} project — the in-progress new-project form state
 * @param {string[]} scopeWpIds — the resolved active Scope WP ids (non-empty)
 * @param {string} clientRequestId — uuid, stable across retries of one logical create attempt
 * @returns {Promise<object & { materializedCount: number, idempotentReplay: boolean }>}
 */
export async function createContractorManagedProject(project, scopeWpIds, clientRequestId) {
  validateProject(project);
  const { data, error } = await supabase.rpc('create_contractor_managed_project', {
    p_project: {
      storeCode: project.storeCode || null,
      shoppingMallName: project.shoppingMallName || null,
      city: project.city || null,
      street: project.street || null,
      state: project.state || null,
      country: project.country || null,
      salesMarket: project.salesMarket || null,
      constructionStartDate: project.constructionStartDate || null,
      constructionEndDate: project.constructionEndDate || null,
      targetOpeningDate: project.targetOpeningDate || null,
      projectManager: project.projectManager || null,
      generalContractor: project.generalContractor || null,
      contractorEmail: project.contractorEmail || null,
      securityManager: project.securityManager || null,
      itManager: project.itManager || null,
      facilityManager: project.facilityManager || null,
      hrManager: project.hrManager || null,
      supplyManager: project.supplyManager || null,
      projectType: project.projectType || null,
      projectStatus: project.projectStatus || null,
      companyId: project.companyId || null,
      locationType: project.locationType || null,
      storeConcept: project.storeConcept || null,
      storeSizeSqm: project.storeSizeSqm === '' || project.storeSizeSqm == null ? null : project.storeSizeSqm,
      salesAreaSqm: project.salesAreaSqm === '' || project.salesAreaSqm == null ? null : project.salesAreaSqm,
      backOfHouseAreaSqm: project.backOfHouseAreaSqm === '' || project.backOfHouseAreaSqm == null ? null : project.backOfHouseAreaSqm,
      budget: project.budget === '' || project.budget == null ? null : project.budget,
      currencyCode: project.currencyCode || null,
      scope: project.scope || null,
      workOntologyVersionId: project.workOntologyVersionId || project.scope?.workOntologyVersionId || null,
    },
    p_scope_wp_ids: scopeWpIds,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  const saved = fromDB(data);
  // Mirror create()'s own contract: every project this service hands back
  // carries its resolved scopeTemplate, never left for the caller to fetch
  // separately (project.templateId was resolved server-side, not supplied by
  // the caller, so there is no client-known template to pass through here).
  const { fetchTemplateRecordById } = await import('./templateService.js');
  const scopeTemplate = saved.templateId ? await fetchTemplateRecordById(saved.templateId) : null;
  return {
    ...saved,
    scopeTemplate,
    materializedCount: data?.materializedCount ?? 0,
    idempotentReplay: data?.idempotentReplay === true,
  };
}

/**
 * Atomically edit a CONTRACTOR_MANAGED project's Scope via
 * update_contractor_managed_project_scope() (053_contractor_managed_project_scope_sync.sql):
 * one call updates projects.scope AND materializes/unarchives/archives the
 * matching project_gantt_tasks rows in the same transaction. Replaces the
 * plain projects.update() Scope-edit path for CONTRACTOR_MANAGED projects,
 * which never touched schedule rows at all. Thin RPC wrapper — it does not
 * resolve Scope selection itself (the caller supplies the already-resolved
 * active WP id list) and never falls back to a plain update() on failure.
 *
 * @param {string|number} projectId
 * @param {object} scope — the new project.scope value to persist verbatim
 * @param {string[]} scopeWpIds — the resolved active Scope WP ids (non-empty)
 * @param {string} clientRequestId — uuid, stable across retries of one logical edit attempt
 * @returns {Promise<object & { addedCount: number, unarchivedCount: number, archivedCount: number, idempotentReplay: boolean }>}
 */
export async function updateContractorManagedProjectScope(projectId, scope, scopeWpIds, clientRequestId) {
  const { data, error } = await supabase.rpc('update_contractor_managed_project_scope', {
    p_project_id: projectId,
    p_scope: scope || null,
    p_scope_wp_ids: scopeWpIds,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  return {
    ...fromDB(data),
    addedCount: data?.addedCount ?? 0,
    unarchivedCount: data?.unarchivedCount ?? 0,
    archivedCount: data?.archivedCount ?? 0,
    idempotentReplay: data?.idempotentReplay === true,
  };
}

export async function update(id, project) {
  if (!id) throw new Error('Project ID is required for update');
  validateProject(project);
  const payload = toDB(project, { preserveLegacyZoneAreas: true });
  // template_id is immutable after creation — never overwrite on update.
  delete payload.template_id;
  delete payload.work_ontology_version_id;
  const { data, error } = await supabase
    .from('projects')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const saved = fromDB(data);
  const { fetchTemplateRecordById } = await import('./templateService.js');
  return {
    ...saved,
    scopeTemplate: await fetchTemplateRecordById(saved.templateId),
  };
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
