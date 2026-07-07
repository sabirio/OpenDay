import { supabase } from '../lib/supabase';
import { updateGanttDiscrepancy } from './ganttService';
import { SiteVisitSchema, SiteVisitWPSchema } from '../schemas/siteVisitSchema';
import { validateArray } from '../schemas/validate';
import { computeWPObservationDiscrepancy } from '../engines/discrepancyEngine';

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
      photo_urls:               meta.photoUrls || [],
    }])
    .select()
    .single();
  if (svErr) throw svErr;

  // 2. Insert site_visit_wps observations (calculate discrepancy live)
  // gc_progress and gc_status are passed per-task from the caller (SiteVisitReport.jsx).
  const discrepancies = [];
  const observationRows = wpObservationsArray.map(w => {
    const { gcProgress, pmProgress, gcStatus, signedDelta, absDelta, discStatus } = computeWPObservationDiscrepancy(w);

    if (absDelta > 0) {
      discrepancies.push({
        wpId:                w.wpId,
        contractor_progress: gcProgress,
        site_visit_progress: pmProgress,
        delta:               absDelta,
        // P2.2: signedDelta preserves direction (negative = PM found LESS
        // than the contractor claimed, i.e. an overstatement; positive = PM
        // found MORE). `delta` above is abs-only, which loses this — needed
        // by GanttSuccessView to bucket "discrepancy" vs "PM ahead" without
        // re-deriving its own (and previously inconsistent) comparison.
        // Progress alone can't always tell direction either: when both sides
        // report 0% but disagree on status rank (e.g. not_started vs
        // blocked), site_visit_progress === contractor_progress === 0.
        signedDelta:         signedDelta,
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

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user?.id) throw new Error('Cannot submit site visit without authenticated user');
  return data.user.id;
}
