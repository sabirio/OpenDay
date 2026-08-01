-- 050_contractor_schedule_draft_lifecycle_lock.sql
-- Simplification Phase 4B.1: Contractor Draft lifecycle lock.
--
-- CREATE OR REPLACE keeps save_contractor_schedule_draft's exact same outer
-- signature (bigint, jsonb, uuid) — this replaces 048's function body only
-- (same pattern 047/048 each used against their predecessor: migrations are
-- not rewritten after the fact in this repository). Everything is
-- byte-identical to 048 except ONE new check, inserted immediately after
-- the existing mutual-exclusion (schedule_ownership_mode) guard and before
-- any batch validation: Save Draft is rejected once a schedule submission
-- exists that the Contractor is not free to keep editing under.
--
-- Server is the final authority — this is not a UI-only lock. A future
-- Contractor Schedule page that fails to disable its own Save Draft button
-- during PENDING_REVIEW still cannot mutate project_gantt_tasks, because
-- this RPC is the only write path into it.
--
-- Save Draft allowed when contractor_schedule_lifecycle_status() = 'DRAFT'
-- (never submitted yet, or the most recent submission was returned via
-- Request Changes — both collapse to 'DRAFT', see migration 049's own
-- header). Rejected with a deterministic, product-meaningful error when the
-- status is 'PENDING_REVIEW' (SCHEDULE_PENDING_REVIEW) or 'APPROVED'
-- (BASELINE_ALREADY_APPROVED) — matching the exact error vocabulary
-- submit_contractor_schedule (049) already uses for the same two states.
--
-- No table/column/RLS change. No change to authorization, atomicity,
-- idempotency, WP/project scope binding, protected-field boundary,
-- server-derived duration, or the human-inclusive plannedFinish contract —
-- all of that remains exactly as 048 left it.
--
-- Rollback:
--   Re-apply 048_contractor_schedule_ownership_enforcement.sql's function
--   body (CREATE OR REPLACE FUNCTION public.save_contractor_schedule_draft(...)
--   without the lifecycle-lock check) to restore the prior contract.

CREATE OR REPLACE FUNCTION public.save_contractor_schedule_draft(
  p_project_id bigint,
  p_changes jsonb,
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
  v_assigned_projects integer[] := '{}'::integer[];
  v_schedule_mode text;
  v_authorized boolean := false;
  v_lifecycle_status text;
  v_request public.write_command_requests%ROWTYPE;
  v_updated_wp_ids text[];
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) = 0 THEN
    RAISE EXCEPTION 'EMPTY_BATCH: p_changes must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT schedule_ownership_mode
    INTO v_schedule_mode
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id USING ERRCODE = 'P0002';
  END IF;

  -- Authorization (unchanged since 048): Contractor-only, full stop.
  SELECT lower(role), COALESCE(assigned_projects, '{}'::integer[])
    INTO v_role, v_assigned_projects
  FROM public.profiles
  WHERE id = v_uid;

  IF v_role = 'contractor' AND p_project_id = ANY(v_assigned_projects::bigint[]) THEN
    v_authorized := true;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized for this project schedule' USING ERRCODE = '42501';
  END IF;

  -- Mutual exclusion (unchanged since 046): AUTO_GENERATED projects belong
  -- entirely to generateAndSaveGantt/regenerateGantt.
  IF v_schedule_mode <> 'CONTRACTOR_MANAGED' THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_CONTRACTOR_MANAGED: project schedule is not contractor-managed'
      USING ERRCODE = '42501';
  END IF;

  -- Lifecycle lock (new in Phase 4B.1): Save Draft is a Draft-stage action
  -- only. Once a submission exists that is PENDING_REVIEW or APPROVED, this
  -- RPC refuses regardless of what any client UI does or fails to disable.
  v_lifecycle_status := public.contractor_schedule_lifecycle_status(p_project_id);
  IF v_lifecycle_status = 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'SCHEDULE_PENDING_REVIEW: a schedule submission is already pending review' USING ERRCODE = '55000';
  END IF;
  IF v_lifecycle_status = 'APPROVED' THEN
    RAISE EXCEPTION 'BASELINE_ALREADY_APPROVED: an approved baseline already exists for this project' USING ERRCODE = '55000';
  END IF;

  -- Batch validation — the whole payload, before any mutation. Duplicate WP.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_changes) AS item("wpId" text)
    GROUP BY item."wpId"
    HAVING item."wpId" IS NOT NULL AND COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_WORK_PACKAGE: each WP may appear only once' USING ERRCODE = '22023';
  END IF;

  -- Every WP must belong to this project's active, non-archived scope —
  -- same shape as submit_contractor_report_atomic's WORK_PACKAGE_OUT_OF_SCOPE
  -- guard (027_contractor_report_wp_validation.sql), so a contractor cannot
  -- reference another project's row (or an archived one) merely by knowing
  -- its wp_id.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_changes) AS item("wpId" text)
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

  -- Date integrity — parseable dates (the jsonb_to_recordset ::date cast
  -- below already raises on a malformed string) and start <= finish, using
  -- HUMAN INCLUSIVE semantics: plannedStart == plannedFinish is valid and
  -- means exactly one calendar day. No reference-duration/dependency/CPM
  -- validation — those are not data integrity, they are professional
  -- planning judgement.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_changes) AS item("wpId" text, "plannedStart" date, "plannedFinish" date)
    WHERE item."plannedStart" IS NULL
       OR item."plannedFinish" IS NULL
       OR item."plannedStart" > item."plannedFinish"
  ) THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE_DATES: plannedStart/plannedFinish must be valid dates with start <= finish'
      USING ERRCODE = '22023';
  END IF;

  -- Idempotency — one Save Draft action, one command identity. Reuses the
  -- existing generic ledger (025_atomic_write_commands.sql); no second
  -- idempotency subsystem.
  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES (v_uid, 'schedule.save_draft', p_client_request_id, p_project_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;

  SELECT * INTO v_request
  FROM public.write_command_requests
  WHERE actor_id = v_uid AND operation = 'schedule.save_draft'
    AND client_request_id = p_client_request_id;

  IF v_request.project_id <> p_project_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE = '23505';
  END IF;
  IF v_request.response IS NOT NULL THEN
    RETURN v_request.response || jsonb_build_object('idempotentReplay', true);
  END IF;

  -- One set-based statement — all rows in the batch, or none. The ONLY
  -- place human-inclusive Finish is canonicalized to the internal exclusive
  -- boundary: planned_end = plannedFinish + 1. duration_days is then the
  -- same exclusive-boundary span ganttEngine.js's CPM engine has always
  -- used (planned_end - planned_start), so a 1-day task (Start=Finish)
  -- persists as duration_days = 1, not 0. Only these three columns are
  -- touched; everything else (actual_progress, status, is_critical,
  -- is_archived, project_id/wp_id identity, ...) is untouched by
  -- construction — this statement's SET list is exhaustive and does not
  -- reference them.
  WITH changes AS (
    SELECT
      "wpId" AS wp_id,
      "plannedStart" AS planned_start,
      ("plannedFinish" + 1) AS planned_end
    FROM jsonb_to_recordset(p_changes) AS item("wpId" text, "plannedStart" date, "plannedFinish" date)
  )
  UPDATE public.project_gantt_tasks task
  SET planned_start = changes.planned_start,
      planned_end   = changes.planned_end,
      duration_days = (changes.planned_end - changes.planned_start),
      updated_at    = now()
  FROM changes
  WHERE task.project_id = p_project_id
    AND task.wp_id = changes.wp_id;

  SELECT array_agg(item."wpId") INTO v_updated_wp_ids
  FROM jsonb_to_recordset(p_changes) AS item("wpId" text);

  v_result := jsonb_build_object(
    'projectId', p_project_id,
    'updatedCount', jsonb_array_length(p_changes),
    'wpIds', to_jsonb(v_updated_wp_ids)
  );

  UPDATE public.write_command_requests
  SET response = v_result, completed_at = now()
  WHERE id = v_request.id;

  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.save_contractor_schedule_draft(bigint, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_contractor_schedule_draft(bigint, jsonb, uuid) TO authenticated;
