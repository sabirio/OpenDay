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
    // Drop and warn on individual malformed WP observations (P1.3) rather than
    // letting a corrupted gc_progress/observed_progress/discrepancy_delta
    // reach siteVisitEngine's discrepancy math unchecked.
    wps: row.wps ? validateArray(SiteVisitWPSchema, row.wps, `site_visit_wps[visit ${row.id}]`) : row.wps,
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
// Passing it would cause a FK violation, so we omit the FK field in this path.
export async function create(visit) {
  const visitedBy = visit.visitedBy || await getCurrentUserId();
  const { data, error } = await supabase
    .from('site_visits')
    .insert([{
      project_id:   visit.projectId,
      visited_by:   visitedBy,
      visit_date:   visit.visitDate || new Date().toISOString().split('T')[0],
      overall_note: visit.overallNote || null,
      photo_urls:   visit.photoUrls || [],
    }])
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}
