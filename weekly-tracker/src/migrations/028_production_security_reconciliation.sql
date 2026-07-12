-- 028_production_security_reconciliation.sql
-- Forward-only production security reconciliation.
--
-- Forensic basis (full detail: docs/PRODUCTION_SECURITY_REMEDIATION_PLAN.md,
-- backups/production/20260711T084934Z/composite-certification.json):
--
--   A. Migrations 025 (atomic write commands) and 027 (contractor report WP
--      validation) were never applied to production, even though 026
--      (numerically between them) was - confirmed independent: 026 only
--      GRANTs privileges on pre-existing tables and never references
--      write_command_requests or the two atomic RPCs, so its success proves
--      nothing about 025/027. Confirmed absent via the immutable production
--      security inventory (functions/tablePrivileges/sequencePrivileges show
--      zero rows for write_command_requests, submit_contractor_report_atomic,
--      submit_site_visit_atomic) and via production having no
--      supabase_migrations history table at all (restore-verification.json:
--      "not_present" - this repository's migrations have only ever been
--      applied manually, so out-of-order/partial application is expected,
--      not a corrupted state). contractorReportService.js and
--      siteVisitService.js already call the *_atomic RPCs unconditionally,
--      so their absence is a real production gap, not a deferred feature.
--
--   B. public.handle_new_user() and public.rls_auto_enable() exist in
--      production (confirmed via the immutable inventory's functions
--      category and via backups/production/20260711T084934Z/schema.sql,
--      which additionally proves both are wired to real, active triggers:
--      `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users ...
--      EXECUTE FUNCTION public.handle_new_user()` and `CREATE EVENT TRIGGER
--      ensure_rls ON ddl_command_end ... EXECUTE FUNCTION
--      public.rls_auto_enable()`) but were never captured by any migration
--      in this repository. handle_new_user() provisions the public.profiles
--      row every new Supabase Auth signup depends on; rls_auto_enable() is
--      this project's own defense-in-depth guarantee that any new public
--      table gets RLS forced on regardless of how it was created. Both are
--      classified APPLICATION_REQUIRED (not Supabase platform defaults -
--      Supabase does not ship either by default) and brought under
--      canonical migration control here (spec section 7, Variant A).
--
--   C. anon and authenticated retain broader table/sequence/function
--      privileges than 026's own documented design intends - almost
--      certainly the same "Supabase project-creation-time default exposure"
--      026's own header already describes for authenticated, just never
--      cleaned up for anon, and never revisited for sequences/functions.
--      Exact matrix confirmed against the immutable production inventory
--      (docs/PRODUCTION_SECURITY_REMEDIATION_PLAN.md section E). RLS
--      already fully mitigates the table-level exposure for anon (RLS
--      enabled + zero `TO anon` policies = default-deny per 010's design),
--      so this is ACL hygiene, not an active exploit - but it is real drift
--      from documented intent and is corrected here with targeted REVOKEs,
--      never REVOKE ALL FROM PUBLIC.
--
--   D. authenticated legitimately needs sequence USAGE (not SELECT/UPDATE)
--      on every bigserial-backed table it can INSERT into - Postgres
--      requires it for nextval()-via-column-DEFAULT to succeed
--      (019_primary_key_defaults.sql exists precisely because the app
--      inserts without supplying an id). No migration ever GRANTed this
--      explicitly; production already has it correctly for the 9 relevant
--      sequences (confirmed via inventory) alongside the SELECT/UPDATE
--      excess this migration removes. This migration GRANTs it explicitly
--      so the gap does not resurface on the next fresh install.
--
-- Idempotent and safe to run against any of: a genuinely fresh canonical
-- install, production's current 026-only state, a fully-canonical state
-- (already remediated), or a partially-applied state. Every structural
-- statement uses IF NOT EXISTS / CREATE OR REPLACE / DROP...IF EXISTS+CREATE;
-- every GRANT/REVOKE is a Postgres no-op if already in the target state.
-- Wrapped in one transaction: ON_ERROR_STOP means any failure rolls back
-- the whole file, so this can never leave a partially-applied structural or
-- ACL state.

BEGIN;

-- ===========================================================================
-- Part 1: 025's structural objects, unchanged from 025_atomic_write_commands.sql
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.write_command_requests (
  id bigserial PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation text NOT NULL,
  client_request_id uuid NOT NULL,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_record_id bigint,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (actor_id, operation, client_request_id)
);

ALTER TABLE public.write_command_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.write_command_requests FROM anon, authenticated;
-- service_role bypasses RLS and holds full ACL on every in-scope object by
-- Supabase platform design (see canonical-security-contract.json's
-- roleAttributes rationale) - explicit here rather than assumed, so this
-- migration is correct regardless of whether the platform's own default-
-- privilege behavior actually reaches a table created by an application
-- migration rather than the platform's own provisioning step.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.write_command_requests TO service_role;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.write_command_requests_id_seq TO service_role;

ALTER TABLE public.site_visit_wps
  ADD COLUMN IF NOT EXISTS gc_progress numeric,
  ADD COLUMN IF NOT EXISTS discrepancy_sign_convention text,
  ADD COLUMN IF NOT EXISTS discrepancy_version integer;

ALTER TABLE public.site_visit_discrepancies
  ADD COLUMN IF NOT EXISTS signed_delta numeric,
  ADD COLUMN IF NOT EXISTS discrepancy_sign_convention text,
  ADD COLUMN IF NOT EXISTS discrepancy_version integer;

CREATE UNIQUE INDEX IF NOT EXISTS site_visit_wps_visit_wp_uniq
  ON public.site_visit_wps(site_visit_id, wp_id)
  WHERE discrepancy_version = 1;

CREATE UNIQUE INDEX IF NOT EXISTS site_visit_discrepancies_visit_wp_uniq
  ON public.site_visit_discrepancies(site_visit_id, wp_id)
  WHERE discrepancy_version = 1;

-- ===========================================================================
-- Part 2: atomic RPCs, final (027-superseded) definitions
-- ===========================================================================

-- submit_site_visit_atomic is only ever defined once (025); 027 does not
-- touch it. Verbatim from 025_atomic_write_commands.sql.
CREATE OR REPLACE FUNCTION public.submit_site_visit_atomic(
  p_project_id bigint,
  p_contractor_report_id bigint,
  p_visit_date date,
  p_observations jsonb,
  p_meta jsonb,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_request public.write_command_requests%ROWTYPE;
  v_visit public.site_visits%ROWTYPE;
  v_response jsonb;
  v_photo_urls text[] := '{}'::text[];
  v_observation_count integer;
  v_discrepancies jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'client_request_id is required' USING ERRCODE = '22023'; END IF;
  IF p_observations IS NULL OR jsonb_typeof(p_observations) <> 'array' OR jsonb_array_length(p_observations) = 0 THEN
    RAISE EXCEPTION 'observations must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role NOT IN ('admin', 'pm') OR NOT public.can_write_project(p_project_id) THEN
    RAISE EXCEPTION 'Not authorized to submit site visit for project %', p_project_id USING ERRCODE = '42501';
  END IF;

  IF p_contractor_report_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contractor_reports
    WHERE id = p_contractor_report_id AND project_id = p_project_id
  ) THEN RAISE EXCEPTION 'Contractor report does not belong to project' USING ERRCODE = '23503'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_observations) AS x("wpId" text)
    GROUP BY "wpId" HAVING COUNT(*) > 1
  ) THEN RAISE EXCEPTION 'Duplicate WP observations' USING ERRCODE = '22023'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_observations)
      AS x("wpId" text, observed_progress numeric, gc_progress numeric)
    WHERE "wpId" IS NULL OR observed_progress < 0 OR observed_progress > 100
       OR gc_progress < 0 OR gc_progress > 100
       OR NOT EXISTS (SELECT 1 FROM public.project_gantt_tasks t WHERE t.project_id = p_project_id AND t.wp_id = x."wpId" AND NOT COALESCE(t.is_archived, false))
  ) THEN RAISE EXCEPTION 'Invalid or out-of-scope WP observation' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES (v_uid, 'site_visit.submit', p_client_request_id, p_project_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests
   WHERE actor_id = v_uid AND operation = 'site_visit.submit' AND client_request_id = p_client_request_id;
  IF v_request.project_id <> p_project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE = '23505'; END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response || jsonb_build_object('idempotentReplay', true); END IF;

  SELECT COALESCE(array_agg(value), '{}'::text[]) INTO v_photo_urls
  FROM jsonb_array_elements_text(COALESCE(p_meta->'photoUrls', '[]'::jsonb)) AS value;

  INSERT INTO public.site_visits(project_id, contractor_report_id, visited_by, visit_date, overall_note, pm_schedule_assessment, photo_urls)
  VALUES (p_project_id, p_contractor_report_id, v_uid, p_visit_date,
          NULLIF(p_meta->>'overallNote', ''), NULLIF(p_meta->>'pmScheduleAssessment', ''), v_photo_urls)
  RETURNING * INTO v_visit;

  WITH rows AS (
    SELECT * FROM jsonb_to_recordset(p_observations) AS x(
      "wpId" text, observed_progress numeric, observed_status text, pm_note text,
      gc_progress numeric, gc_status text, signed_delta numeric, absolute_delta numeric, discrepancy_status text)
  ), inserted AS (
    INSERT INTO public.site_visit_wps(site_visit_id, project_id, wp_id, observed_progress, observed_status, pm_note,
      discrepancy_status, discrepancy_delta, gc_status, gc_progress, discrepancy_sign_convention, discrepancy_version)
    SELECT v_visit.id, p_project_id, "wpId", observed_progress, COALESCE(observed_status, 'not_started'), NULLIF(pm_note, ''),
      COALESCE(discrepancy_status, 'ok'), COALESCE(signed_delta, 0), COALESCE(gc_status, 'not_started'), gc_progress,
      'pm-minus-contractor', 1 FROM rows RETURNING *
  ) SELECT COUNT(*) INTO v_observation_count FROM inserted;

  WITH rows AS (
    SELECT * FROM jsonb_to_recordset(p_observations) AS x(
      "wpId" text, observed_progress numeric, gc_progress numeric, signed_delta numeric, absolute_delta numeric, discrepancy_status text)
    WHERE COALESCE(absolute_delta, 0) > 0
  ), inserted AS (
    INSERT INTO public.site_visit_discrepancies(site_visit_id, project_id, wp_id, contractor_progress, site_visit_progress,
      delta, signed_delta, status, discrepancy_sign_convention, discrepancy_version)
    SELECT v_visit.id, p_project_id, "wpId", gc_progress, observed_progress, absolute_delta, signed_delta,
      discrepancy_status, 'pm-minus-contractor', 1 FROM rows RETURNING *
  ) SELECT COALESCE(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb) INTO v_discrepancies FROM inserted;

  UPDATE public.project_gantt_tasks t SET
    site_visit_progress = x.observed_progress,
    discrepancy_status = x.discrepancy_status,
    discrepancy_delta = x.absolute_delta,
    updated_at = now()
  FROM jsonb_to_recordset(p_observations) AS x("wpId" text, observed_progress numeric, absolute_delta numeric, discrepancy_status text)
  WHERE t.project_id = p_project_id AND t.wp_id = x."wpId";

  INSERT INTO public.progress_history(project_id, week_number, overall_progress, spi, recorded_at, snapshot)
  VALUES (p_project_id, EXTRACT(WEEK FROM p_visit_date)::integer, NULL, NULL, p_visit_date::timestamptz,
    jsonb_build_object('snapshot_schema_version', 1, 'source_type', 'site_visit', 'source_record_id', v_visit.id,
      'site_visit_id', v_visit.id, 'contractor_report_id', p_contractor_report_id, 'client_request_id', p_client_request_id,
      'actor_id', v_uid, 'calculation_version', COALESCE(p_meta->>'calculationVersion', 'openday-canonical-core/1'),
      'discrepancy_sign_convention', 'pm-minus-contractor', 'discrepancy_version', 1,
      'observations', p_observations, 'calculated_at', COALESCE(p_meta->>'calculatedAt', now()::text)));

  v_response := jsonb_build_object('siteVisit', to_jsonb(v_visit), 'discrepancies', v_discrepancies,
    'observationCount', v_observation_count, 'idempotentReplay', false);
  UPDATE public.write_command_requests SET response = v_response, source_record_id = v_visit.id, completed_at = now() WHERE id = v_request.id;
  RETURN v_response;
END;
$$;

-- submit_contractor_report_atomic: final (027-superseded) definition, with
-- 027's duplicate/out-of-scope WP validation folded in. Verbatim from
-- 027_contractor_report_wp_validation.sql.
CREATE OR REPLACE FUNCTION public.submit_contractor_report_atomic(
  p_project_id bigint,
  p_report_date date,
  p_wp_progress jsonb,
  p_meta jsonb,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_request public.write_command_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'client_request_id is required' USING ERRCODE = '22023'; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_wp_progress) AS item("wpId" text)
    GROUP BY item."wpId"
    HAVING item."wpId" IS NOT NULL AND COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_WORK_PACKAGE: each WP may appear only once'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_wp_progress) AS item("wpId" text)
    WHERE item."wpId" IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.project_gantt_tasks task
         WHERE task.project_id = p_project_id
           AND task.wp_id = item."wpId"
           AND NOT COALESCE(task.is_archived, false)
       )
  ) THEN
    RAISE EXCEPTION 'WORK_PACKAGE_OUT_OF_SCOPE: WP must belong to the active project scope'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES (v_uid, 'contractor_report.submit', p_client_request_id, p_project_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;

  SELECT * INTO v_request
  FROM public.write_command_requests
  WHERE actor_id = v_uid AND operation = 'contractor_report.submit'
    AND client_request_id = p_client_request_id;

  IF v_request.project_id <> p_project_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE = '23505';
  END IF;
  IF v_request.response IS NOT NULL THEN
    RETURN v_request.response || jsonb_build_object('idempotentReplay', true);
  END IF;

  v_result := public.submit_contractor_report(p_project_id, p_report_date, p_wp_progress, p_meta);

  UPDATE public.write_command_requests
  SET response = v_result, source_record_id = (v_result->'report'->>'id')::bigint,
      completed_at = now()
  WHERE id = v_request.id;

  UPDATE public.progress_history
  SET snapshot = COALESCE(snapshot, '{}'::jsonb) || jsonb_build_object(
    'snapshot_schema_version', 1,
    'calculation_version', COALESCE(p_meta->>'calculationVersion', 'openday-canonical-core/1'),
    'source_type', 'contractor_report',
    'source_record_id', (v_result->'report'->>'id')::bigint,
    'client_request_id', p_client_request_id,
    'actor_id', v_uid,
    'calculated_at', COALESCE(p_meta->>'calculatedAt', now()::text)
  )
  WHERE project_id = p_project_id
    AND snapshot->>'contractor_report_id' = v_result->'report'->>'id';

  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid) TO authenticated;
-- service_role platform-managed default, explicit for the same reason as
-- the write_command_requests table/sequence grants above.
GRANT EXECUTE ON FUNCTION public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid) TO service_role;

-- ===========================================================================
-- Part 3: canonicalize the two production-only functions (spec section 7,
-- Variant A - both proven APPLICATION_REQUIRED via real wiring in the
-- production backup's schema.sql, see header notes B above)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  insert into public.profiles (id, email, name, role, assigned_projects)
  values (new.id, new.email, split_part(new.email, '@', 1), 'Viewer', '{}')
  on conflict (id) do nothing;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table', 'partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public')
       AND cmd.schema_name NOT IN ('pg_catalog', 'information_schema')
       AND cmd.schema_name NOT LIKE 'pg_toast%'
       AND cmd.schema_name NOT LIKE 'pg_temp%'
    THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    ELSE
      RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
    END IF;
  END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();

-- ===========================================================================
-- Part 4: sequence USAGE grants (fills a migration-history gap - see header
-- note D above; production already has this correctly, no migration ever
-- declared it)
-- ===========================================================================

GRANT USAGE ON SEQUENCE
  public.projects_id_seq,
  public.reports_id_seq,
  public.site_visits_id_seq,
  public.progress_history_id_seq,
  public.contractor_reports_id_seq,
  public.contractor_report_wps_id_seq,
  public.site_visit_wps_id_seq,
  public.site_visit_discrepancies_id_seq,
  public.project_gantt_tasks_id_seq
TO authenticated;

-- ===========================================================================
-- Part 5: ACL drift cleanup - targeted REVOKEs only, never REVOKE ALL FROM
-- PUBLIC (see header note C above)
-- ===========================================================================

-- anon: 026 intentionally grants it nothing at all. Remove every table
-- privilege the platform's project-creation-time defaults left behind.
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
FROM anon;

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
FROM anon;

-- authenticated: 026 grants exactly SELECT/INSERT/UPDATE/DELETE on the 14
-- tables and SELECT-only on audit_log. Remove the platform-default
-- privileges 026 never asked for (REFERENCES/TRIGGER/TRUNCATE everywhere,
-- plus INSERT/UPDATE/DELETE/REFERENCES/TRIGGER/TRUNCATE on audit_log, which
-- should remain SELECT-only per 026's own header - "audit_log only ever has
-- a SELECT policy").
REVOKE REFERENCES, TRIGGER, TRUNCATE ON
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
FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated;

-- authenticated needs sequence USAGE only (granted in Part 4) for the 9
-- tables it can INSERT into - SELECT/UPDATE on those sequences and every
-- privilege on audit_log_id_seq (authenticated has no INSERT on audit_log
-- at all - writes happen exclusively through fn_audit_log()'s SECURITY
-- DEFINER trigger, which runs as the table owner) are excess.
REVOKE SELECT, UPDATE ON SEQUENCE
  public.contractor_reports_id_seq,
  public.contractor_report_wps_id_seq,
  public.progress_history_id_seq,
  public.project_gantt_tasks_id_seq,
  public.projects_id_seq,
  public.reports_id_seq,
  public.site_visit_discrepancies_id_seq,
  public.site_visit_wps_id_seq,
  public.site_visits_id_seq
FROM authenticated;

REVOKE ALL ON SEQUENCE public.audit_log_id_seq FROM authenticated;

-- fn_audit_log(): 020_rls_company_role_hardening.sql already contains
-- `REVOKE ALL ON FUNCTION public.fn_audit_log() FROM PUBLIC;` (line 315),
-- matching its own header's stated intent, but a real rehearsal against
-- production's actual current state (production security state emulator,
-- hydrated from the immutable inventory) proved anon/authenticated can
-- still execute it via a DIRECT grant, separate from and in addition to
-- whatever PUBLIC currently has - meaning either 020's PUBLIC revoke was
-- never applied to production (this repo's migrations have only ever
-- been applied manually - see 028's header note A) or a direct grant was
-- issued to these roles some other way afterward. REVOKE FROM PUBLIC does
-- not touch a role-specific direct grant, so both are required here.
REVOKE EXECUTE ON FUNCTION public.fn_audit_log() FROM PUBLIC, anon, authenticated;

-- submit_contractor_report(): 018's header says "grants execute only to
-- authenticated" - anon should never have been able to call this RPC.
-- Same PUBLIC-and-direct-grant reasoning as fn_audit_log() above.
REVOKE EXECUTE ON FUNCTION public.submit_contractor_report(bigint, date, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_contractor_report(bigint, date, jsonb, jsonb) TO authenticated;

COMMIT;

-- Rollback (forward-fix only - see docs/PRODUCTION_SECURITY_REMEDIATION_PLAN.md
-- "Rollback and forward-fix strategy" for the full decision tree):
--   Structural objects (write_command_requests, its columns/indexes, both
--   atomic RPCs, handle_new_user, rls_auto_enable, their triggers) should
--   NOT be dropped once any real request/report/user-signup has used them -
--   that is a data-loss rollback, not a schema rollback, and must be a
--   separate, reviewed decision. The ACL REVOKEs in Parts 4-5 are the only
--   part of this migration safely reversible by re-running the exact GRANT
--   statements this migration revoked (they are listed explicitly above,
--   nothing was ever REVOKE ALL FROM PUBLIC, so the reverse grant list is
--   exact and requires no guessing).
