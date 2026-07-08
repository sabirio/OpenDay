import { supabase } from '../lib/supabase';

// ─── Submit contractor report ──────────────────────────────────────────────────

/**
 * Submit a contractor report with per-WP progress data.
 *
 * @param {string} projectId
 * @param {Array<{ wpId, progress_pct, status, comment }>} wpProgressArray
 * @param {object} [meta] — { reportDate, overallProgress, photoUrls }
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

// ─── Get last report ────────────────────────────────────────────────────────────

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

// ─── Raw fetch for "screens" shape (pure I/O — adaptation/validation lives in
// core/contractorReport/contractorReportScreensModel.js) ───────────────────────

export async function fetchAllContractorReportsRaw() {
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

  return {
    reports:  reportsRes.data || [],
    wps:      wpsRes.data || [],
    projects: projectsRes.data || [],
  };
}

export async function fetchContractorReportsForProjectRaw(projectId) {
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

  const reports_ = reports || [];
  const templateType = projectRow?.template_type;
  const reportIds = reports_.map((report) => report.id);
  if (reportIds.length === 0) return { reports: [], wps: [], templateType };

  const { data: wps, error: wpsError } = await supabase
    .from('contractor_report_wps')
    .select('*')
    .in('report_id', reportIds);
  if (wpsError) throw wpsError;

  return { reports: reports_, wps: wps || [], templateType };
}
