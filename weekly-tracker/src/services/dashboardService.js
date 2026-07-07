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

export async function fetchContractorReliabilityRecords(projectIds) {
  if (!projectIds || projectIds.length === 0) return [];
  const { data: discs, error } = await supabase
    .from('site_visit_discrepancies')
    .select('project_id,status')
    .in('project_id', projectIds);
  if (error) throw error;
  return discs || [];
}
