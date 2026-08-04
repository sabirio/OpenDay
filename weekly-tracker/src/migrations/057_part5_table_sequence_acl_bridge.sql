-- Bridge migration 028 Part 5's never-effective outcome on this table/
-- sequence set. Gate 13C (Simplification Phase 3E.5) proved live: all 15
-- tables 028 Part 5 intended to narrow currently grant every one of
-- SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN to both
-- anon and authenticated (public.projects has an explicit, non-default
-- relacl - not NULL/platform-default-only), classified
-- 028_OUTCOME_NEVER_EFFECTIVE_OBJECT_SPECIFIC_BRIDGE_REQUIRED. This is a
-- new, explicit, object-specific bridge - not a reapply of 028 itself,
-- which was never proven safe to reapply wholesale and which does not
-- revoke authenticated's MAINTAIN privilege or address every sequence
-- associated with these tables.
--
-- Scope: the same 15 tables migration 028 Part 5 named, plus every
-- sequence actually associated with them - verified two ways: by reading
-- 000_baseline.sql, 019_primary_key_defaults.sql, and 015_audit_log.sql
-- directly, AND by querying pg_depend (deptype='a', "auto"-dependency,
-- the catalog relationship a serial/identity column's owned sequence
-- always has) against a disposable database built from this repo's exact
-- migration chain - both methods agree exactly:
--   6 tables have a native bigserial PRIMARY KEY, sequence auto-created at
--   CREATE TABLE time: audit_log (015_audit_log.sql), contractor_reports,
--   contractor_report_wps, project_gantt_tasks, site_visit_discrepancies,
--   site_visit_wps (000_baseline.sql).
--   4 tables were captured in 000_baseline.sql as plain `bigint PRIMARY
--   KEY` with no default, then given a sequence-backed default
--   retroactively by 019_primary_key_defaults.sql: projects, reports,
--   site_visits, progress_history.
--   That is 10 sequences total. 5 tables have no owned sequence at all:
--   profiles (uuid PK), pending_invites (text PK), templates (uuid PK,
--   gen_random_uuid() default), task_groups (text PK), task_group_members
--   (composite PK, no serial column).
--
-- Target privileges, explicit and deterministic (REVOKE ALL first on every
-- object, from every role including authenticated/service_role
-- themselves, then re-GRANT exactly the intended set - the same pattern
-- 056 established for the grant-option hazard: a bare GRANT does not
-- narrow a pre-existing broader grant or grant option, so nothing here is
-- layered on top of unknown prior state):
--
--   PUBLIC:          nothing on any of the 15 tables or 10 sequences.
--   anon:            nothing on any of the 15 tables or 10 sequences.
--   authenticated:   SELECT/INSERT/UPDATE/DELETE on the 14 tables migration
--                    026 already scoped this way (026's own header: derived
--                    from pg_policies.cmd per table, cross-checked here
--                    against the actual CREATE POLICY statements in
--                    010_rls_by_roles.sql/021_multi_tenant_hardening.sql/
--                    041_versioned_scope_templates.sql for templates,
--                    task_groups, task_group_members, pending_invites -
--                    all four have SELECT+INSERT+UPDATE+DELETE policies, so
--                    026's grant is not excess for any of them); SELECT
--                    only on audit_log (writes happen exclusively through
--                    fn_audit_log()'s SECURITY DEFINER trigger, which runs
--                    as the table owner, never as authenticated - matches
--                    026's own precedent exactly); USAGE only (never
--                    SELECT/UPDATE) on the 9 non-audit_log sequences,
--                    matching 028 Part 4's own already-correct rationale;
--                    nothing on audit_log_id_seq. No
--                    TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on anything.
--
--   service_role:    Evidence-backed, per-table, NOT a blanket grant.
--                    "service_role bypasses RLS" is not by itself a
--                    justification for CRUD on every table - a repository-
--                    wide audit of every genuine service-role PostgREST
--                    client (createClient(url, SUPABASE_SERVICE_ROLE_KEY,
--                    ...) followed by an actual .from(...) call, as
--                    distinct from (a) raw psql fixture operations that
--                    run as the postgres superuser and prove nothing about
--                    service_role's own ACL, (b) SECURITY DEFINER function
--                    bodies, which execute under the function owner's
--                    privileges regardless of caller role, and (c)
--                    supabase.auth.admin.* Admin Auth API calls, which are
--                    a separate GoTrue authority with no relationship to
--                    Postgres table GRANTs at all) found real service-role
--                    evidence for exactly 9 of the 15 tables; the remaining
--                    6 tables receive no service_role privileges:
--                      seed.mjs:131-134,144-147,312-315,320-323  SELECT projects, project_gantt_tasks
--                      seed.mjs:202-206                          INSERT projects (no explicit id -> nextval via default)
--                      seed.mjs:265-267                          INSERT project_gantt_tasks (no explicit id -> nextval via default)
--                      seed.mjs:282-286                          UPDATE projects
--                      seed.mjs:177-180 (cleanup loop)            DELETE projects, project_gantt_tasks, contractor_report_wps, contractor_reports, site_visit_wps, site_visit_discrepancies, site_visits
--                      backfillProgressHistory.js:71-74           DELETE progress_history
--                      backfillProgressHistory.js:79-82           SELECT projects
--                      backfillProgressHistory.js:87-103          SELECT reports
--                      backfillProgressHistory.js:140-142         INSERT progress_history (no explicit id -> nextval via default)
--                      verify-f03-scope-narrowing.mjs:44          SELECT project_gantt_tasks
--                      verify-f03-scope-narrowing.mjs:78          SELECT projects
--                      verify-f03-scope-narrowing.mjs:146-147     DELETE project_gantt_tasks, projects
--                    No UPDATE evidence exists anywhere for
--                    project_gantt_tasks, contractor_report_wps,
--                    contractor_reports, site_visit_wps,
--                    site_visit_discrepancies, site_visits, or
--                    progress_history - none is granted. The remaining 6
--                    tables (audit_log, profiles, pending_invites,
--                    task_groups, task_group_members, templates) have zero
--                    direct service-role call sites at all, confirmed by a
--                    repository-wide grep for every .from('<table>') call
--                    and manual classification of every matching client
--                    variable, and get NOTHING for service_role. audit_log
--                    in particular: no script reads or writes it via
--                    service_role; its only writer is fn_audit_log()'s
--                    SECURITY DEFINER trigger, which needs no session-role
--                    grant at all to do its job - "the smoke test
--                    currently succeeds" is not treated as justification
--                    (bare superuser/default-ACL behavior proves nothing
--                    about what's actually required).
--
--                    Runtime-privilege correction (found only by actually
--                    exercising the exact PostgREST call shape, not by
--                    has_table_privilege() assertions alone): PostgreSQL's
--                    DELETE requires SELECT on any column read by the
--                    condition, not just the DELETE privilege itself -
--                    empirically confirmed (`DELETE FROM t WHERE id IS NOT
--                    NULL` fails with "permission denied for table t" under
--                    DELETE-only; succeeds once SELECT is added). Every
--                    service-role delete in this repository filters
--                    exclusively on the `id` column - seed.mjs's cleanup
--                    loop uses `.not('id','is',null)` for
--                    contractor_report_wps/contractor_reports/
--                    site_visit_wps/site_visit_discrepancies/site_visits,
--                    and backfillProgressHistory.js uses `.neq('id',0)` for
--                    progress_history - and neither call chains .select()
--                    (Prefer: return=minimal, no RETURNING evaluation), so
--                    the narrowest proven-working fix is column-level
--                    `SELECT (id)`, not table-wide SELECT. Verified two
--                    ways: raw SQL under `SET ROLE` (DELETE succeeds with
--                    only SELECT(id); a separate SELECT * still correctly
--                    fails) and the actual PostgREST HTTP call shape
--                    (`DELETE /table?id=not.is.null` and
--                    `DELETE /table?id=neq.0`, both return 204 and actually
--                    delete the matching rows, while `?select=*` still
--                    returns 403 through the same role). No INSERT in this
--                    repository needs any additional SELECT: the two
--                    service-role inserts that don't already have table
--                    SELECT for another reason (project_gantt_tasks,
--                    progress_history) never chain .select() and never use
--                    .upsert()/onConflict, so no RETURNING or conflict
--                    expression ever reads a column back.
--
--                    Exact per-table service_role result:
--                      projects:                  SELECT, INSERT, UPDATE, DELETE
--                      project_gantt_tasks:       SELECT, INSERT, DELETE
--                      progress_history:          SELECT (id only), INSERT, DELETE
--                      reports:                   SELECT
--                      contractor_report_wps:     SELECT (id only), DELETE
--                      contractor_reports:        SELECT (id only), DELETE
--                      site_visit_wps:            SELECT (id only), DELETE
--                      site_visit_discrepancies:  SELECT (id only), DELETE
--                      site_visits:               SELECT (id only), DELETE
--                      audit_log:                 nothing
--                      profiles:                  nothing
--                      pending_invites:           nothing
--                      task_groups:               nothing
--                      task_group_members:        nothing
--                      templates:                 nothing
--
--                    Sequences follow the same insert-site evidence: USAGE
--                    only (never SELECT/UPDATE - no setval/currval/explicit-
--                    id call site exists anywhere) on exactly the 3
--                    sequences backing a table service_role actually
--                    INSERTs into without an explicit id: projects_id_seq,
--                    project_gantt_tasks_id_seq, progress_history_id_seq.
--                    Nothing on the other 7 sequences (service_role never
--                    inserts into their owning tables at all, or - for
--                    audit_log_id_seq - never touches the table at all).
--
--                    Explicitly NOT granted to service_role on anything:
--                    TRUNCATE/REFERENCES/TRIGGER/MAINTAIN. No script in
--                    this repository uses any of these four - even
--                    seed.mjs's bulk table cleanup uses
--                    `.delete().not('id','is',null)`, not TRUNCATE.
--
--   postgres (owner): untouched. This migration never alters ownership or
--                    the owner's own implicit privileges.
--
-- This migration is table/sequence ACL only: idempotent, safely
-- re-applicable privilege narrowing; no function-body, schema, data,
-- ownership, or policy mutation. No ALTER DEFAULT PRIVILEGES (the
-- platform-level default-ACL rule that explains why these objects started
-- broad is left as a separate, standing future-object risk - see
-- src/tests/aclNormalizationGuard.test.mjs for the forward-looking
-- structural guard against the SAME gap recurring for any migration 058+).
-- No ALL TABLES IN SCHEMA / ALL SEQUENCES IN SCHEMA (every object is named
-- explicitly), no CASCADE, no WITH GRANT OPTION anywhere.
--
-- Rollback (not recommended - see docs/PRODUCTION_ROLLBACK_RUNBOOK.md
-- forward-only policy): there is no safe mechanical rollback for a
-- privilege-narrowing migration; re-widening any specific privilege
-- requires a new, explicit, reasoned future migration, not a revert.

-- ============================================================
-- PART 1: Tables
-- ============================================================

REVOKE ALL ON
  public.audit_log,
  public.contractor_report_wps,
  public.contractor_reports,
  public.pending_invites,
  public.profiles,
  public.progress_history,
  public.project_gantt_tasks,
  public.projects,
  public.reports,
  public.site_visit_discrepancies,
  public.site_visit_wps,
  public.site_visits,
  public.task_group_members,
  public.task_groups,
  public.templates
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.contractor_report_wps,
  public.contractor_reports,
  public.pending_invites,
  public.profiles,
  public.progress_history,
  public.project_gantt_tasks,
  public.projects,
  public.reports,
  public.site_visit_discrepancies,
  public.site_visit_wps,
  public.site_visits,
  public.task_group_members,
  public.task_groups,
  public.templates
TO authenticated;

GRANT SELECT ON public.audit_log TO authenticated;

-- service_role: exact per-table grants, evidence-backed (see header).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO service_role;
GRANT SELECT, INSERT, DELETE ON public.project_gantt_tasks TO service_role;
GRANT INSERT, DELETE ON public.progress_history TO service_role;
GRANT SELECT ON public.reports TO service_role;
GRANT DELETE ON
  public.contractor_report_wps,
  public.contractor_reports,
  public.site_visit_discrepancies,
  public.site_visit_wps,
  public.site_visits
TO service_role;

-- Column-level SELECT(id) only, not table-wide SELECT: PostgreSQL's DELETE
-- requires SELECT on any column its condition reads, and every
-- service-role delete on these 6 tables filters exclusively on `id`
-- (seed.mjs's `.not('id','is',null)`, backfillProgressHistory.js's
-- `.neq('id',0)`) with no .select() chained (no RETURNING evaluation).
-- Empirically verified both at the raw-SQL level (DELETE succeeds with
-- only SELECT(id); a separate SELECT * still fails) and through the
-- actual PostgREST HTTP call shape (204, rows actually deleted;
-- ?select=* still 403) - table-wide SELECT would be excess.
GRANT SELECT (id) ON
  public.contractor_report_wps,
  public.contractor_reports,
  public.progress_history,
  public.site_visit_discrepancies,
  public.site_visit_wps,
  public.site_visits
TO service_role;
-- No grant to service_role on audit_log, profiles, pending_invites,
-- task_groups, task_group_members, or templates - REVOKE ALL above already
-- leaves these at zero for service_role; no call site justifies more.

-- ============================================================
-- PART 2: Sequences
-- ============================================================

REVOKE ALL ON SEQUENCE
  public.audit_log_id_seq,
  public.contractor_report_wps_id_seq,
  public.contractor_reports_id_seq,
  public.progress_history_id_seq,
  public.project_gantt_tasks_id_seq,
  public.projects_id_seq,
  public.reports_id_seq,
  public.site_visit_discrepancies_id_seq,
  public.site_visit_wps_id_seq,
  public.site_visits_id_seq
FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SEQUENCE
  public.contractor_report_wps_id_seq,
  public.contractor_reports_id_seq,
  public.progress_history_id_seq,
  public.project_gantt_tasks_id_seq,
  public.projects_id_seq,
  public.reports_id_seq,
  public.site_visit_discrepancies_id_seq,
  public.site_visit_wps_id_seq,
  public.site_visits_id_seq
TO authenticated;

-- service_role: USAGE only, only on the 3 sequences backing a table
-- service_role actually INSERTs into without an explicit id (see header).
GRANT USAGE ON SEQUENCE
  public.progress_history_id_seq,
  public.project_gantt_tasks_id_seq,
  public.projects_id_seq
TO service_role;
