import { supabase } from '../lib/supabase';
import { calculateDiscrepancy } from '../engines/discrepancyEngine';
import { updateGanttDiscrepancy } from './ganttService';

// ─── Submit site visit ────────────────────────────────────────────────────────

/**
 * Submit a PM site visit with per-WP observations.
 *
 * @param {string} projectId
 * @param {string|null} contractorReportId  — links visit to a specific report
 * @param {Array<{ wpId, observed_progress, observed_status, pm_note }>} wpObservationsArray
 * @param {object} [meta] — { visitDate, visitedBy, overallNote }
 * @returns { siteVisit, discrepancies }
 */
export async function submitSiteVisit(projectId, contractorReportId, wpObservationsArray, meta = {}) {
  const visitDate = meta.visitDate || new Date().toISOString().split('T')[0];

  // 1. Insert site_visits header
  const { data: siteVisit, error: svErr } = await supabase
    .from('site_visits')
    .insert([{
      project_id:            projectId,
      contractor_report_id:  contractorReportId || null,
      visited_by:            meta.visitedBy     || null,
      visit_date:            visitDate,
      overall_note:          meta.overallNote   || null,
    }])
    .select()
    .single();
  if (svErr) throw svErr;

  // 2. Insert site_visit_wps observations (calculate discrepancy live)
  let contractorWPs = [];
  if (contractorReportId) {
    const { data: cwps } = await supabase
      .from('contractor_report_wps')
      .select('wp_id, progress_pct')
      .eq('report_id', contractorReportId);
    contractorWPs = (cwps || []).map(w => ({
      wpId:     w.wp_id,
      progress: w.progress_pct,
    }));
  }

  const siteVisitWPsNorm = wpObservationsArray.map(w => ({
    wpId:       w.wpId,
    progress:   w.observed_progress ?? 0,
    pm_note:    w.pm_note || null,
    visit_date: visitDate,
  }));

  const discrepancies = calculateDiscrepancy(contractorWPs, siteVisitWPsNorm);
  const discMap = Object.fromEntries(discrepancies.map(d => [d.wpId, d]));

  const observationRows = wpObservationsArray.map(w => {
    const disc = discMap[w.wpId] || null;
    return {
      site_visit_id:       siteVisit.id,
      project_id:          projectId,
      wp_id:               w.wpId,
      observed_progress:   w.observed_progress ?? 0,
      observed_status:     w.observed_status   || 'not_started',
      pm_note:             w.pm_note           || null,
      discrepancy_status:  disc?.status        || 'ok',
      discrepancy_delta:   disc?.delta         ?? 0,
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

  return { ...visit, wps: wps || [] };
}

export async function getAllSiteVisits(projectId) {
  const { data, error } = await supabase
    .from('site_visits')
    .select('*')
    .eq('project_id', projectId)
    .order('visit_date', { ascending: false });
  if (error) throw error;
  return data || [];
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

  return { ...data, wps: wps || [] };
}

export async function getAll() {
  const { data, error } = await supabase
    .from('site_visits')
    .select('*')
    .order('visit_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Legacy compatibility — used by SiteVisitReport.jsx when no Gantt tasks are loaded.
// referenceReportId here is from the `reports` table (old weekly format), which is a
// different table from `contractor_reports` that site_visits.contractor_report_id references.
// Passing it would cause a FK violation, so we omit the FK field in this path.
export async function create(visit) {
  const { data, error } = await supabase
    .from('site_visits')
    .insert([{
      project_id:   visit.projectId,
      visit_date:   visit.visitDate || new Date().toISOString().split('T')[0],
      overall_note: visit.overallNote || null,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}
