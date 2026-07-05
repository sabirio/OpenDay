import { supabase } from '../lib/supabase';
import { updateGanttDiscrepancy } from './ganttService';
import { SiteVisitSchema } from '../schemas/siteVisitSchema';
import { validateArray } from '../schemas/validate';

// ─── Submit site visit ────────────────────────────────────────────────────────

/**
 * Submit a PM site visit with per-WP observations.
 *
 * @param {string} projectId
 * @param {string|null} contractorReportId  — links visit to a specific report
 * @param {Array<{ wpId, observed_progress, observed_status, pm_note }>} wpObservationsArray
 * @param {object} [meta] — { visitDate, overallNote }
 * @returns { siteVisit, discrepancies }
 */
export async function submitSiteVisit(projectId, contractorReportId, wpObservationsArray, meta = {}) {
  const visitDate = meta.visitDate || new Date().toISOString().split('T')[0];
  const visitedBy = meta.visitedBy || await getCurrentUserId();

  // 1. Insert site_visits header
  const { data: siteVisit, error: svErr } = await supabase
    .from('site_visits')
    .insert([{
      project_id:               projectId,
      contractor_report_id:     contractorReportId || null,
      visited_by:               visitedBy,
      visit_date:               visitDate,
      overall_note:             meta.overallNote   || null,
      pm_schedule_assessment:   meta.pmScheduleAssessment || null,
    }])
    .select()
    .single();
  if (svErr) throw svErr;

  // 2. Insert site_visit_wps observations (calculate discrepancy live)
  // gc_progress and gc_status are passed per-task from the caller (SiteVisitReport.jsx).
  // Progress delta is primary when either side has progress; status-rank delta (×10) is the fallback.
  const STATUS_RANK = { completed: 2, in_progress: 1, not_started: 0, delayed: -1, blocked: -2 };
  const discrepancies = [];
  const observationRows = wpObservationsArray.map(w => {
    const gcProgress  = w.gc_progress  ?? 0;
    const pmProgress  = w.observed_progress ?? 0;
    const gcStatus    = w.gc_status    ?? 'not_started';
    const pmStatus    = w.observed_status ?? gcStatus;

    const gcRank    = STATUS_RANK[gcStatus] ?? 0;
    const pmRank    = STATUS_RANK[pmStatus] ?? 0;
    const rankDelta = pmRank - gcRank;

    const progressDelta = pmProgress - gcProgress;
    const signedDelta = (pmProgress !== 0 || gcProgress !== 0)
      ? progressDelta
      : rankDelta * 10;
    const absDelta    = Math.abs(signedDelta);
    const discStatus  = absDelta >= 20 ? 'critical' : absDelta >= 10 ? 'warning' : 'ok';

    if (absDelta > 0) {
      discrepancies.push({
        wpId:                w.wpId,
        contractor_progress: gcProgress,
        site_visit_progress: pmProgress,
        delta:               absDelta,
        status:              discStatus,
      });
    }

    return {
      site_visit_id:      siteVisit.id,
      project_id:         projectId,
      wp_id:              w.wpId,
      observed_progress:  pmProgress,
      observed_status:    w.observed_status || 'not_started',
      pm_note:            w.pm_note         || null,
      discrepancy_status: discStatus,
      discrepancy_delta:  signedDelta,
      gc_status:          gcStatus,
    };
  });

  const { error: wErr } = await supabase
    .from('site_visit_wps')
    .insert(observationRows);
  if (wErr) throw wErr;

  // 3. Save discrepancy summary to site_visit_discrepancies
  if (discrepancies.length > 0) {
    const discRows = discrepancies.map(d => ({
      site_visit_id:          siteVisit.id,
      project_id:             projectId,
      wp_id:                  d.wpId,
      contractor_progress:    d.contractor_progress,
      site_visit_progress:    d.site_visit_progress,
      delta:                  d.delta,
      status:                 d.status,
    }));

    const { error: dErr } = await supabase
      .from('site_visit_discrepancies')
      .insert(discRows);
    if (dErr) console.error('Discrepancy save error (non-fatal):', dErr);
  }

  // 4. Update project_gantt_tasks with discrepancy fields
  for (const d of discrepancies) {
    await updateGanttDiscrepancy(projectId, d.wpId, {
      siteVisitProgress: d.site_visit_progress,
      discrepancyStatus: d.status,
      discrepancyDelta:  d.delta,
    }).catch(() => {}); // non-fatal
  }

  return { siteVisit, discrepancies };
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function getLastSiteVisit(projectId) {
  const { data, error } = await supabase
    .from('site_visits')
    .select('*')
    .eq('project_id', projectId)
    .order('visit_date', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;

  const visit = data[0];
  const { data: wps, error: wErr } = await supabase
    .from('site_visit_wps')
    .select('*')
    .eq('site_visit_id', visit.id);
  if (wErr) throw wErr;

  return mapRow({ ...visit, wps: wps || [] });
}

export async function getAllSiteVisits(projectId) {
  const { data, error } = await supabase
    .from('site_visits')
    .select('*')
    .eq('project_id', projectId)
    .order('visit_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapRow);
}

export async function getSiteVisitForReport(contractorReportId) {
  if (!contractorReportId) return null;

  const { data, error } = await supabase
    .from('site_visits')
    .select('*')
    .eq('contractor_report_id', contractorReportId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: wps, error: wErr } = await supabase
    .from('site_visit_wps')
    .select('*')
    .eq('site_visit_id', data.id);
  if (wErr) throw wErr;

  return mapRow({ ...data, wps: wps || [] });
}

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
    }])
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user?.id) throw new Error('Cannot submit site visit without authenticated user');
  return data.user.id;
}
