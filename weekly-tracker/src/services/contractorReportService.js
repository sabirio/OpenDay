import { supabase } from '../lib/supabase';
import { batchUpdateWPProgress, updateForecast } from './ganttService';
import { DAY_MS } from '../utils/reportUtils';
import { adaptContractorReportsToLegacy } from './contractorReportAdapter';

// ─── Submit contractor report ─────────────────────────────────────────────────

/**
 * Submit a contractor report with per-WP progress data.
 *
 * @param {string} projectId
 * @param {Array<{ wpId, progress_pct, status, comment }>} wpProgressArray
 * @param {object} [meta] — { reportDate, overallProgress }
 * @returns { report, wpLineItems }
 */
export async function submitReport(projectId, wpProgressArray, meta = {}) {
  const reportDate = meta.reportDate || new Date().toISOString().split('T')[0];
  const today      = new Date(reportDate);
  const weekNumber = getISOWeekNumber(today);
  const submittedBy = meta.submittedBy || await getCurrentUserId();

  // 1. Insert contractor_reports header row
  const { data: report, error: rErr } = await supabase
    .from('contractor_reports')
    .insert([{
      project_id:       projectId,
      submitted_by:     submittedBy,
      report_date:      reportDate,
      week_number:      weekNumber,
      overall_progress: meta.overallProgress || computeOverallProgress(wpProgressArray),
      status:           'submitted',
    }])
    .select()
    .single();
  if (rErr) throw rErr;

  // 2. Insert contractor_report_wps line items
  const lineItems = wpProgressArray.map(wp => ({
    report_id:    report.id,
    project_id:   projectId,
    wp_id:        wp.wpId,
    progress_pct: wp.progress_pct ?? 0,
    status:       wp.status       || 'not_started',
    comment:      wp.comment      || null,
  }));

  const { data: wps, error: wErr } = await supabase
    .from('contractor_report_wps')
    .insert(lineItems)
    .select();
  if (wErr) throw wErr;

  // meta.cumulativeProgress (canonical, from progressEngine) is expected here.
  // The computeOverallProgress() fallback is dead in practice today — the sole
  // caller (ContractorReport.jsx) always supplies cumulativeProgress — but a
  // future caller that omits it would silently write the raw contractor
  // average into this OFFICIAL snapshot field. See PROGRESS_MODEL.md.
  const historyProgress = meta.cumulativeProgress ?? report.overall_progress ?? computeOverallProgress(wpProgressArray);
  const { error: histErr } = await supabase.from('progress_history').insert({
    project_id:       projectId,
    week_number:      weekNumber,
    overall_progress: historyProgress,
    spi:              null,
    recorded_at:      new Date(reportDate).toISOString(),
    snapshot: {
      contractor_report_id: report.id,
      master_report_id:     meta.masterReportId || null,
      work_packages:        wpProgressArray,
      legacy_report:        meta.reportSnapshot || null,
    },
  });
  if (histErr) throw new Error(`Contractor report saved but progress history write failed: ${histErr.message}`);

  // 3. Update project_gantt_tasks with new progress
  await batchUpdateWPProgress(projectId, wpProgressArray);

  // 4. Recalculate forecast opening date
  await updateForecast(projectId).catch(() => {}); // non-fatal

  return { report, wpLineItems: wps };
}

// ─── Get last report ──────────────────────────────────────────────────────────

/**
 * Get the most recent contractor report for a project, with WP line items.
 */
export async function getLastReport(projectId) {
  const { data: reports, error } = await supabase
    .from('contractor_reports')
    .select('*')
    .eq('project_id', projectId)
    .order('report_date', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!reports || reports.length === 0) return null;

  const report = reports[0];
  const { data: wps, error: wErr } = await supabase
    .from('contractor_report_wps')
    .select('*')
    .eq('report_id', report.id);
  if (wErr) throw wErr;

  return {
    ...report,
    wps: (wps || []).map(w => ({
      wpId:        w.wp_id,
      progress_pct: w.progress_pct,
      status:      w.status,
      comment:     w.comment,
    })),
  };
}

/**
 * Get all reports for a project, ordered newest first.
 */
export async function getAllReports(projectId) {
  const { data, error } = await supabase
    .from('contractor_reports')
    .select('*')
    .eq('project_id', projectId)
    .order('report_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Fetch canonical contractor reports and adapt them for legacy-shaped screens.
 */
export async function getAllReportsForScreens() {
  const [reportsRes, wpsRes] = await Promise.all([
    supabase
      .from('contractor_reports')
      .select('*')
      .order('report_date', { ascending: false }),
    supabase
      .from('contractor_report_wps')
      .select('*'),
  ]);
  if (reportsRes.error) throw reportsRes.error;
  if (wpsRes.error) throw wpsRes.error;

  const wpsByReportId = {};
  for (const wp of wpsRes.data || []) {
    if (!wpsByReportId[wp.report_id]) wpsByReportId[wp.report_id] = [];
    wpsByReportId[wp.report_id].push(wp);
  }

  return adaptContractorReportsToLegacy(reportsRes.data || [], wpsByReportId);
}

export async function getReportsForProjectForScreens(projectId) {
  const { data: reports, error } = await supabase
    .from('contractor_reports')
    .select('*')
    .eq('project_id', projectId)
    .order('report_date', { ascending: false });
  if (error) throw error;

  const reportIds = (reports || []).map((report) => report.id);
  if (reportIds.length === 0) return [];

  const { data: wps, error: wpsError } = await supabase
    .from('contractor_report_wps')
    .select('*')
    .in('report_id', reportIds);
  if (wpsError) throw wpsError;

  const wpsByReportId = {};
  for (const wp of wps || []) {
    if (!wpsByReportId[wp.report_id]) wpsByReportId[wp.report_id] = [];
    wpsByReportId[wp.report_id].push(wp);
  }

  return adaptContractorReportsToLegacy(reports || [], wpsByReportId);
}

/**
 * Get a specific report with WP line items.
 */
export async function getReportById(reportId) {
  const { data: report, error } = await supabase
    .from('contractor_reports')
    .select('*')
    .eq('id', reportId)
    .single();
  if (error) throw error;

  const { data: wps, error: wErr } = await supabase
    .from('contractor_report_wps')
    .select('*')
    .eq('report_id', reportId);
  if (wErr) throw wErr;

  return {
    ...report,
    wps: (wps || []).map(w => ({
      wpId:        w.wp_id,
      progress_pct: w.progress_pct,
      status:      w.status,
      comment:     w.comment,
    })),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Contractor raw average only (unweighted sum/count). For official progress
// use progressEngine.js — see src/engines/PROGRESS_MODEL.md.
function computeOverallProgress(wpProgressArray) {
  if (!wpProgressArray.length) return 0;
  const sum = wpProgressArray.reduce((s, wp) => s + (wp.progress_pct || 0), 0);
  return Math.round(sum / wpProgressArray.length);
}

function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / DAY_MS) + 1) / 7);
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user?.id) throw new Error('Cannot submit contractor report without authenticated user');
  return data.user.id;
}
