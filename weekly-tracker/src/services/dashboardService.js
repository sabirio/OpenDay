import { supabase } from '../lib/supabase';

// ─── Site visit analytics ─────────────────────────────────────────────────────
// Schedule performance (SPI, Gantt) lives in ganttService.js.

/**
 * Get recent discrepancy records for a project from site_visit_discrepancies,
 * enriched with the site visit date.
 * Returns Array<{ wpId, delta, status, visitDate, contractorPct, sitePct }>
 */
export async function getDiscrepancyHistory(projectId, limit = 20) {
  // Fetch recent site visits for the project
  const { data: visits, error: vErr } = await supabase
    .from('site_visits')
    .select('id,visit_date')
    .eq('project_id', projectId)
    .order('visit_date', { ascending: false })
    .limit(limit);
  if (vErr) throw vErr;
  if (!visits || visits.length === 0) return [];

  const visitIds  = visits.map(v => v.id);
  const visitDate = Object.fromEntries(visits.map(v => [v.id, v.visit_date]));

  const { data: discs, error: dErr } = await supabase
    .from('site_visit_discrepancies')
    .select('*')
    .in('site_visit_id', visitIds)
    .order('site_visit_id', { ascending: false });
  if (dErr) throw dErr;

  return (discs || []).map(d => ({
    wpId:            d.wp_id,
    delta:           d.delta,
    status:          d.status,
    visitDate:       visitDate[d.site_visit_id] ?? null,
    contractorPct:   d.contractor_progress,
    sitePct:         d.site_visit_progress,
    siteVisitId:     d.site_visit_id,
  }));
}

/**
 * Get contractor reliability score for a given list of project IDs.
 * Score = 1 - (critical_discrepancies / total_discrepancies), per project.
 * Returns Map<projectId, { score, critical, warning, ok, total }>
 */
export async function getContractorReliability(projectIds) {
  if (!projectIds || projectIds.length === 0) return new Map();

  const { data: discs, error } = await supabase
    .from('site_visit_discrepancies')
    .select('project_id,status')
    .in('project_id', projectIds);
  if (error) throw error;

  const byProject = new Map();
  for (const d of discs || []) {
    if (!byProject.has(d.project_id)) byProject.set(d.project_id, { ok: 0, warning: 0, critical: 0 });
    const bucket = byProject.get(d.project_id);
    if      (d.status === 'critical') bucket.critical++;
    else if (d.status === 'warning')  bucket.warning++;
    else                              bucket.ok++;
  }

  const result = new Map();
  for (const pid of projectIds) {
    const b     = byProject.get(pid) || { ok: 0, warning: 0, critical: 0 };
    const total = b.ok + b.warning + b.critical;
    result.set(pid, {
      ...b,
      total,
      score: total > 0 ? Math.round((1 - b.critical / total) * 100) : null,
    });
  }
  return result;
}
