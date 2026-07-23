-- 036_contractor_report_legacy_wp_scope.sql
-- P0 data-integrity fix follow-up: 027_contractor_report_wp_validation.sql's
-- WORK_PACKAGE_OUT_OF_SCOPE check requires every submitted wpId to match an
-- existing, non-archived public.project_gantt_tasks row for the project.
-- That check was silently vacuous for every legacy (non-Gantt) project until
-- now, because those projects' wpProgressArray was unconditionally empty (an
-- empty array can never fail an "every item must exist in scope" check) —
-- itself the exact contractor_report_wps data-loss bug this task fixes.
--
-- Once buildContractorReportSubmission.js starts sending real rows for
-- legacy projects (encodeLegacyWpTaskId(), format
-- "legacy::<wpGroupId>::<taskName>" — see config/workPackages.js), every one
-- of them is rejected: KZ-TEST-02 (and every other legacy project) has zero
-- project_gantt_tasks rows by design, so no wpId can ever match.
--
-- This migration narrowly extends the scope check: a wpId is also considered
-- in-scope when (a) it has the exact "legacy::" prefix produced only by
-- encodeLegacyWpTaskId(), AND (b) the project has zero active (non-archived)
-- Gantt tasks at all — i.e. it's a genuinely non-Gantt/legacy project, not a
-- Gantt-scoped project someone is trying to smuggle an unscoped row into.
-- Any project with real Gantt scope keeps the exact original validation
-- behavior, unchanged. Append-only; migration 027's function is superseded
-- by this CREATE OR REPLACE, migrations 000-035 remain otherwise untouched.
--
-- Rollback: re-apply the function definition from
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
       OR (
         NOT EXISTS (
           SELECT 1
           FROM public.project_gantt_tasks task
           WHERE task.project_id = p_project_id
             AND task.wp_id = item."wpId"
             AND NOT COALESCE(task.is_archived, false)
         )
         AND NOT (
           item."wpId" LIKE 'legacy::%'
           AND NOT EXISTS (
             SELECT 1
             FROM public.project_gantt_tasks scoped
             WHERE scoped.project_id = p_project_id
               AND NOT COALESCE(scoped.is_archived, false)
           )
         )
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
GRANT EXECUTE ON FUNCTION public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid) TO authenticated;
