import { supabase } from '../lib/supabase';
import { SiteVisitSchema, SiteVisitWPSchema } from '../schemas/siteVisitSchema';
import { validateArray } from '../schemas/validate';

// ─── Submit site visit (pure I/O primitives — orchestration lives in
// core/siteVisit/submitSiteVisitModel.js) ──────────────────────────────────────

export async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user?.id) throw new Error('Cannot submit site visit without authenticated user');
  return data.user.id;
}

export async function insertSiteVisitHeader(projectId, contractorReportId, visitedBy, meta = {}) {
  const visitDate = meta.visitDate || new Date().toISOString().split('T')[0];
  const { data: siteVisit, error } = await supabase
    .from('site_visits')
    .insert([{
      project_id:               projectId,
      contractor_report_id:     contractorReportId || null,
      visited_by:               visitedBy,
      visit_date:               visitDate,
      overall_note:             meta.overallNote   || null,
      pm_schedule_assessment:   meta.pmScheduleAssessment || null,
      photo_urls:               meta.photoUrls || [],
    }])
    .select()
    .single();
  if (error) throw error;
  return siteVisit;
}

export async function insertSiteVisitWPObservations(rows) {
  const { error } = await supabase.from('site_visit_wps').insert(rows);
  if (error) throw error;
}

export async function insertSiteVisitDiscrepancies(rows) {
  if (rows.length === 0) return;
  const { error } = await supabase.from('site_visit_discrepancies').insert(rows);
  if (error) console.error('Discrepancy save error (non-fatal):', error);
}

export async function submitSiteVisitAtomic(projectId, contractorReportId, observations, meta) {
  const { data, error } = await supabase.rpc('submit_site_visit_atomic', {
    p_project_id: projectId,
    p_contractor_report_id: contractorReportId || null,
    p_visit_date: meta.visitDate,
    p_observations: observations,
    p_meta: {
      overallNote: meta.overallNote || null,
      pmScheduleAssessment: meta.pmScheduleAssessment || null,
      photoUrls: meta.photoUrls || [],
      calculatedAt: meta.calculatedAt,
      calculationVersion: meta.calculationVersion,
    },
    p_client_request_id: meta.clientRequestId,
  });
  if (error) throw error;
  return data;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

function mapRow(row) {
  if (!row) return row;
  return {
    ...row,
    projectId:              row.project_id,
    visitDate:              row.visit_date,
    submittedAt:            row.created_at,
    contractorReportId:     row.contractor_report_id,
    overallNote:            row.overall_note,
    visitedBy:              row.visited_by,
    pmScheduleAssessment:   row.pm_schedule_assessment,
    // P0 fix: these four were previously only readable via the raw
    // snake_case spread above (row.reference_report_id, etc.) — every other
    // consumer of this mapped shape (ComparisonResultsView.jsx,
    // SiteVisitComparison.jsx) reads the camelCase form, so without an
    // explicit mapping here a legacy site visit's own reference report,
    // PM work-package statuses, declaration, and photos were unreadable by
    // the screens that immediately render right after submit.
    referenceReportId:       row.reference_report_id,
    pmWorkPackageStatuses:   row.pm_work_package_statuses,
    declarationConfirmed:    row.declaration_confirmed,
    photoUrls:               row.photo_urls,
    // Drop and warn on individual malformed WP observations (P1.3) rather than
    // letting a corrupted gc_progress/observed_progress/discrepancy_delta
    // reach siteVisitEngine's discrepancy math unchecked.
    wps: row.wps ? validateArray(
      SiteVisitWPSchema,
      row.wps.map(wp => ({
        ...wp,
        workOntologyVersionId: wp.work_ontology_version_id || null,
        workGroupId: wp.work_group_id || null,
      })),
      `site_visit_wps[visit ${row.id}]`,
    ) : row.wps,
  };
}

export async function getAll() {
  const [visitsRes, wpsRes] = await Promise.all([
    supabase.from('site_visits').select('*').order('visit_date', { ascending: false }),
    supabase.from('site_visit_wps').select('*'),
  ]);
  if (visitsRes.error) throw visitsRes.error;

  const wpsByVisit = {};
  for (const wp of wpsRes.data || []) {
    if (!wpsByVisit[wp.site_visit_id]) wpsByVisit[wp.site_visit_id] = [];
    wpsByVisit[wp.site_visit_id].push(wp);
  }

  const visits = (visitsRes.data || []).map(v => mapRow({ ...v, wps: wpsByVisit[v.id] || [] }));
  return validateArray(SiteVisitSchema, visits, 'site_visits');
}

// Legacy compatibility — used by SiteVisitReport.jsx when no Gantt tasks are loaded.
// referenceReportId here is from the `reports` table (old weekly format), which is a
// different table from `contractor_reports` that site_visits.contractor_report_id references.
// Passing it would cause a FK violation on the contractor_report_id FK, so that
// column is intentionally left null in this path — reference_report_id (no FK
// constraint) is the correct column for it instead, see below.
//
// P0 fix: this previously inserted only project_id/visited_by/visit_date/
// photo_urls, silently discarding pmScheduleAssessment, declarationConfirmed,
// referenceReportId, pmWorkPackageStatuses and the form's `observations` note
// (SiteVisitReport.jsx's submit() already builds `visit` with every one of
// these fields via `{ ...form }` — they were simply never read here). The
// success screen still said "Site Visit Recorded" even though the PM's
// declaration, schedule assessment, and WP comparison notes vanished. Every
// field below already has a canonical column on site_visits (verified via
// \d site_visits) — no schema change needed.
export async function create(visit) {
  const visitedBy = visit.visitedBy || await getCurrentUserId();
  const referenceReportId = visit.referenceReportId ? Number(visit.referenceReportId) : null;
  const { data, error } = await supabase
    .from('site_visits')
    .insert([{
      project_id:               visit.projectId,
      visited_by:               visitedBy,
      visit_date:               visit.visitDate || new Date().toISOString().split('T')[0],
      photo_urls:               visit.photoUrls || [],
      // `observations` (not overall_note) is the column the legacy success
      // view (ComparisonResultsView.jsx) actually reads back for this path —
      // overall_note is the atomic-RPC/Gantt path's own column and is left
      // untouched here, matching "Gantt path unchanged".
      observations:             visit.observations || null,
      pm_schedule_assessment:   visit.pmScheduleAssessment || null,
      declaration_confirmed:    visit.declarationConfirmed === true,
      reference_report_id:      Number.isFinite(referenceReportId) ? referenceReportId : null,
      pm_work_package_statuses: visit.pmWorkPackageStatuses || {},
    }])
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}
