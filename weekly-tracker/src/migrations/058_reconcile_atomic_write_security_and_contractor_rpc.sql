-- 058_reconcile_atomic_write_security_and_contractor_rpc.sql
--
-- Forward-only reconciliation for owner-confirmed staging drift: migration
-- 029's atomic-RPC/ledger-sequence ACL outcome is absent or was reversed,
-- migration 036's canonical contractor RPC body is absent or was reversed,
-- and service_role retains a direct default-ACL MAINTAIN grant on the ledger.
-- This migration changes only those exact objects. Historical migrations are
-- neither edited nor reapplied; migration 028 is not rerun wholesale because
-- its broader schema/function reconciliation is outside the proved drift.
-- Rollback policy is a new forward fix, never a historical migration revert.
-- Certification for this migration is local/disposable only; no live apply is
-- authorized by this file or its accompanying tests.

BEGIN;

-- Exact canonical definition from 036_contractor_report_legacy_wp_scope.sql.
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

-- Deterministic function ACLs. REVOKE ALL clears direct grant options before
-- plain EXECUTE is restored to the two roles required by the security contract.
REVOKE ALL ON FUNCTION public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)
  TO authenticated, service_role;

-- Deterministic ledger-sequence ACL from migration 028/029's security contract.
REVOKE ALL ON SEQUENCE public.write_command_requests_id_seq
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.write_command_requests_id_seq
  TO service_role;

-- Remove only the proved direct default-ACL residual; preserve every other
-- explicitly justified service_role table privilege from migration 028.
REVOKE MAINTAIN ON TABLE public.write_command_requests FROM service_role;

COMMIT;
