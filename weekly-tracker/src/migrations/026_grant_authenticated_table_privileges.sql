-- 026_grant_authenticated_table_privileges.sql
-- Sprint 4.5 certification defect fix (DEFECT-03).
--
-- Root cause (reproduced by direct runtime testing, not inferred from
-- reading SQL): on a genuinely fresh database built from this repo's
-- documented fresh-install chain (000, 010, 012-025), the `authenticated`
-- role has RLS policies defined on every application table (via
-- 010/020/021/022), but was NEVER granted the underlying SQL table
-- privileges (SELECT/INSERT/UPDATE/DELETE) those policies are meant to
-- filter. Postgres checks base GRANTs before RLS policies are even
-- evaluated — with no GRANT, every direct PostgREST call
-- (`supabase.from('projects').select()` etc.) fails immediately with
-- `42501: permission denied for table projects`, regardless of how correct
-- the RLS policy itself is. This was invisible to every previous
-- verification pass in this project (including the "RLS tests" audited in
-- docs/CERTIFICATION_ENVIRONMENT.md, which only read migration SQL text —
-- never executed a real authenticated query against a fresh database) and
-- to production, because the real `openday.fit` Supabase project already
-- has these base grants — almost certainly from Supabase's own
-- project-creation-time defaults (older CLI/dashboard versions auto-expose
-- new `public` tables to `anon`/`authenticated`; newer local CLI versions
-- default this off — see `supabase/config.toml`'s `auto_expose_new_tables`
-- comment) — but that step was never captured as a migration in this repo.
-- The documented fresh-install chain therefore could not actually stand up
-- a working copy of the app's data layer, only its function/RLS
-- *definitions*.
--
-- Fix: explicitly grant exactly the privileges each table's own RLS
-- policies already expect the `authenticated` role to attempt (derived from
-- `pg_policies.cmd` per table, not a blanket grant — see below for why
-- `write_command_requests` is deliberately excluded). RLS remains the real
-- authorization boundary; these grants only make the attempt reach RLS
-- evaluation at all, matching what production has always effectively had.
--
-- write_command_requests is intentionally NOT granted here.
-- 025_atomic_write_commands.sql explicitly revokes all direct access
-- (`REVOKE ALL ON public.write_command_requests FROM anon, authenticated`)
-- so the idempotency ledger is reachable only through the SECURITY DEFINER
-- RPCs. Granting it here would silently re-open exactly the direct-access
-- path 025 closed.
--
-- anon is intentionally NOT granted anything here. No policy in this
-- project's RLS is scoped `TO anon`; unauthenticated access must remain
-- fully denied, and it already correctly is — this migration does not
-- change that.
--
-- Rollback:
--   REVOKE SELECT, INSERT, UPDATE, DELETE ON
--     public.profiles, public.projects, public.reports, public.site_visits,
--     public.project_gantt_tasks, public.contractor_reports,
--     public.contractor_report_wps, public.site_visit_wps,
--     public.site_visit_discrepancies, public.progress_history,
--     public.task_groups, public.task_group_members, public.templates,
--     public.pending_invites
--   FROM authenticated;
--   REVOKE SELECT ON public.audit_log FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles,
  public.projects,
  public.reports,
  public.site_visits,
  public.project_gantt_tasks,
  public.contractor_reports,
  public.contractor_report_wps,
  public.site_visit_wps,
  public.site_visit_discrepancies,
  public.progress_history,
  public.task_groups,
  public.task_group_members,
  public.templates,
  public.pending_invites
TO authenticated;

-- audit_log only ever has a SELECT policy (writes happen exclusively
-- through fn_audit_log()'s trigger, which runs as the table owner, not as
-- the invoking authenticated role) — matches pg_policies.cmd for this
-- table exactly (SELECT only, confirmed by query during certification).
GRANT SELECT ON public.audit_log TO authenticated;
