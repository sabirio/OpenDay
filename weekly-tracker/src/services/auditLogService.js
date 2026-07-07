import { supabase } from '../lib/supabase';

const AUDIT_LOG_COLUMNS = 'id, table_name, record_id, action, changed_by, changed_at, diff';

/**
 * Fetch all recent audit entries for a project across projects/contractor_reports/
 * site_visits, merged and sorted newest-first.
 *
 * Three separate queries rather than one combined filter: `projects` rows are
 * matched by their own `record_id` (= the project's id), while
 * `contractor_reports`/`site_visits` rows are matched by the `project_id` key
 * inside their stored new_data/old_data JSON — those are two different shapes
 * of "belongs to this project" that don't reduce to a single .or() filter.
 */
export async function fetchProjectAuditLog(projectId, limit = 100) {
  const pid = String(projectId);

  const [projectRes, reportRes, visitRes] = await Promise.all([
    supabase
      .from('audit_log')
      .select(AUDIT_LOG_COLUMNS)
      .eq('table_name', 'projects')
      .eq('record_id', pid)
      .order('changed_at', { ascending: false })
      .limit(limit),
    supabase
      .from('audit_log')
      .select(AUDIT_LOG_COLUMNS)
      .eq('table_name', 'contractor_reports')
      .or(`new_data->>project_id.eq.${pid},old_data->>project_id.eq.${pid}`)
      .order('changed_at', { ascending: false })
      .limit(limit),
    supabase
      .from('audit_log')
      .select(AUDIT_LOG_COLUMNS)
      .eq('table_name', 'site_visits')
      .or(`new_data->>project_id.eq.${pid},old_data->>project_id.eq.${pid}`)
      .order('changed_at', { ascending: false })
      .limit(limit),
  ]);

  for (const res of [projectRes, reportRes, visitRes]) {
    if (res.error) throw res.error;
  }

  return [...projectRes.data, ...reportRes.data, ...visitRes.data]
    .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at))
    .slice(0, limit);
}
