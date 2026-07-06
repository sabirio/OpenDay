import { supabase } from '../lib/supabase';
import { adaptContractorReportsToLegacy } from './contractorReportAdapter';
import { ContractorReportSchema } from '../schemas/contractorReportSchema';
import { validateArray } from '../schemas/validate';

// в”Ђв”Ђв”Ђ Submit contractor report в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

/**
 * Submit a contractor report with per-WP progress data.
 *
 * @param {string} projectId
 * @param {Array<{ wpId, progress_pct, status, comment }>} wpProgressArray
 * @param {object} [meta] вЂ” { reportDate, overallProgress, photoUrls }
 * @returns { report, wpLineItems }
 */
export async function submitReport(projectId, wpProgressArray, meta = {}) {
  const reportDate = meta.reportDate || new Date().toISOString().split('T')[0];
  const rpcMeta = {
    overallProgress: meta.overallProgress,
    cumulativeProgress: meta.cumulativeProgress,
    masterReportId: meta.masterReportId ?? null,
    reportSnapshot: meta.reportSnapshot ?? null,
    photoUrls: meta.photoUrls || [],
  };

  const { data, error } = await supabase.rpc('submit_contractor_report', {
    p_project_id: projectId,
    p_report_date: reportDate,
    p_wp_progress: wpProgressArray,
    p_meta: rpcMeta,
  });

  if (error) throw error;

  return {
    report: data?.report,
    wpLineItems: data?.wpLineItems || [],
    lineItemCount: data?.lineItemCount ?? 0,
  };
}

// Get last report
// в”Ђв”Ђв”Ђ Get last report в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

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
  const [reportsRes, wpsRes, projectsRes] = await Promise.all([
    supabase
      .from('contractor_reports')
      .select('*')
      .order('report_date', { ascending: false }),
    supabase
      .from('contractor_report_wps')
      .select('*'),
    supabase
      .from('projects')
      .select('id, template_type'),
  ]);
  if (reportsRes.error) throw reportsRes.error;
  if (wpsRes.error) throw wpsRes.error;
  if (projectsRes.error) throw projectsRes.error;

  const wpsByReportId = {};
  for (const wp of wpsRes.data || []) {
    if (!wpsByReportId[wp.report_id]) wpsByReportId[wp.report_id] = [];
    wpsByReportId[wp.report_id].push(wp);
  }
  const templateTypeByProjectId = {};
  for (const p of projectsRes.data || []) templateTypeByProjectId[p.id] = p.template_type;

  return validateArray(
    ContractorReportSchema,
    adaptContractorReportsToLegacy(reportsRes.data || [], wpsByReportId, templateTypeByProjectId),
    'contractor_reports'
  );
}

export async function getReportsForProjectForScreens(projectId) {
  const [{ data: reports, error }, { data: projectRow, error: projectError }] = await Promise.all([
    supabase
      .from('contractor_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('report_date', { ascending: false }),
    supabase
      .from('projects')
      .select('template_type')
      .eq('id', projectId)
      .single(),
  ]);
  if (error) throw error;
  if (projectError) throw projectError;

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

  return validateArray(
    ContractorReportSchema,
    adaptContractorReportsToLegacy(reports || [], wpsByReportId, { [projectId]: projectRow?.template_type }),
    'contractor_reports'
  );
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

