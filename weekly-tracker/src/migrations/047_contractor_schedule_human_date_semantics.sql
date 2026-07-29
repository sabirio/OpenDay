-- 047_contractor_schedule_human_date_semantics.sql
-- Simplification Phase 3B.1: finalizes save_contractor_schedule_draft()'s
-- public contract to human-facing inclusive Finish dates, per Owner
-- correction — the RPC introduced in 046 accepted the internal exclusive
-- boundary (plannedEnd) directly from the client, which is correct for the
-- existing AUTO_GENERATED CPM engine's own internal use but wrong for a
-- Contractor typing a Finish date: a human entering Start=Finish=Aug 1
-- naturally means one calendar day of work, not zero.
--
-- CREATE OR REPLACE keeps the exact same outer signature
-- (bigint, jsonb, uuid) — this replaces 046's function body, not its
-- identity, so no DROP/re-GRANT is needed and no second overload is
-- created. 046 itself is untouched (migrations are not rewritten after the
-- fact in this repository — see 021 fixing gaps left by 020, 041 not
-- touching anything earlier).
--
-- Contract change:
--   OLD: p_changes item shape {"wpId", "plannedStart", "plannedEnd"} —
--        plannedEnd was the internal EXCLUSIVE boundary, accepted as-is.
--   NEW: p_changes item shape {"wpId", "plannedStart", "plannedFinish"} —
--        plannedFinish is the human-facing INCLUSIVE Finish date. The
--        server canonicalizes it to the internal exclusive boundary
--        (planned_end = plannedFinish + 1) before persistence — the ONE
--        place this conversion happens for writes; see
--        engines/ganttLayout.js's toHumanFinishInclusive/
--        toInternalEndBoundary for the matching client-side READ-direction
--        adapter (display only, never re-derives what this RPC does).
--
-- The internal DB column meaning is UNCHANGED: planned_end remains the
-- exclusive boundary ganttEngine.js's CPM engine has always used
-- (earlyFinish = addDays(earlyStart, duration_days)). Only this RPC's
-- INPUT contract changes; AUTO_GENERATED projects, generateAndSaveGantt,
-- regenerateGantt, and the raw project_gantt_tasks columns are untouched.
--
-- Zero-day protection: plannedStart == plannedFinish is now explicitly
-- VALID (it means exactly one calendar day of work,
-- planned_end = plannedFinish + 1, duration_days = 1) — the old contract's
-- "plannedStart <= plannedEnd" check would have treated an equal
-- exclusive-boundary pair as a zero-width task; this migration's validation
-- is deliberately plannedStart <= plannedFinish (inclusive), which makes
-- equality the normal one-day case, not an edge case.
--
-- No table/column/RLS/authorization change — everything from 046 (schedule
-- ownership mode, authorization, atomicity, idempotency ledger, protected-
-- field boundary) is reused unmodified; only the date-shape and the single
-- canonicalization expression inside the mutation change.
--
-- Rollback:
--   Re-apply 046_contractor_schedule_draft_foundation.sql's function body
--   (CREATE OR REPLACE FUNCTION public.save_contractor_schedule_draft(...)
--   with the plannedEnd-shaped body) to restore the prior contract.

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

  -- company_id is deliberately not re-read here: can_write_project() (for
  -- admin/pm) and the contractor branch below each independently resolve
  -- their own company comparison against the canonical source already;
  -- duplicating it into a throwaway local would add a second copy of the
  -- same check, not a new one.
  SELECT schedule_ownership_mode
    INTO v_schedule_mode
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id USING ERRCODE = 'P0002';
  END IF;

  -- Authorization: exactly one truth per role.
  --   admin/pm  -> existing canonical can_write_project() helper, unchanged.
  --   contractor -> profiles.assigned_projects only, no email fallback.
  IF public.can_write_project(p_project_id) THEN
    v_authorized := true;
  ELSE
    SELECT lower(role), COALESCE(assigned_projects, '{}'::integer[])
      INTO v_role, v_assigned_projects
    FROM public.profiles
    WHERE id = v_uid;

    IF v_role = 'contractor' AND p_project_id = ANY(v_assigned_projects::bigint[]) THEN
      v_authorized := true;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized for this project schedule' USING ERRCODE = '42501';
  END IF;

  -- Mutual exclusion: this RPC is the Contractor Draft write path only. An
  -- AUTO_GENERATED project's schedule belongs entirely to
  -- generateAndSaveGantt/regenerateGantt — reject regardless of who is
  -- calling, admin/pm included, so the two write paths can never both own
  -- the same project's planned schedule.
  IF v_schedule_mode <> 'CONTRACTOR_MANAGED' THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_CONTRACTOR_MANAGED: project schedule is not contractor-managed'
      USING ERRCODE = '42501';
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
  -- means exactly one calendar day (this is the zero-day-protection fix —
  -- the old exclusive-boundary contract would have rejected this same
  -- input as a zero-width task). No reference-duration/dependency/CPM
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
