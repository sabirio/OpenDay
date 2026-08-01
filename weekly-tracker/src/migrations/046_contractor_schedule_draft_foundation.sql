-- 046_contractor_schedule_draft_foundation.sql
-- Simplification Phase 3B: Contractor Schedule Foundation.
--
-- Two things, deliberately bundled because the second depends on the first:
--
-- 1. Explicit per-project schedule ownership mode. No existing column
--    expresses this (audited: template_type is which scope/WP template a
--    project uses, not who owns its schedule lifecycle; gantt_engine_version
--    tracks CPM staleness, not ownership). Every project defaults to, and
--    every existing row is backfilled to, AUTO_GENERATED — nothing is
--    silently switched. Only a project explicitly set to CONTRACTOR_MANAGED
--    (not done by this migration, not done by Create Project yet) may ever
--    use the new RPC below.
--
-- 2. save_contractor_schedule_draft(): ONE atomic, idempotent RPC for the
--    entire "Save Draft" action — validates the whole batch, then performs
--    all writes in a single statement, or none at all. Mirrors
--    submit_contractor_report_atomic() (027_contractor_report_wp_validation.sql)
--    exactly: same write_command_requests idempotency ledger, same
--    WORK_PACKAGE_OUT_OF_SCOPE scope/archived guard shape. Contractor
--    authorization is assigned_projects only (profiles.assigned_projects) —
--    no contractor_email fallback; admin/pm authorization reuses the
--    existing can_write_project() canonical helper unchanged, so there is
--    exactly one authorization truth per role, not two.
--
-- The RPC can mutate only planned_start/planned_end/duration_days (duration
-- always server-derived as planned_end - planned_start, the same calendar-day
-- convention ganttEngine.js already uses — never accepted from the client).
-- It refuses outright on any project not in CONTRACTOR_MANAGED mode, so it
-- cannot collide with generateAndSaveGantt/regenerateGantt's automatic
-- writes on AUTO_GENERATED projects.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.save_contractor_schedule_draft(bigint, jsonb, uuid);
--   ALTER TABLE public.projects DROP COLUMN IF EXISTS schedule_ownership_mode;

-- ─── 1. Schedule ownership mode ────────────────────────────────────────────

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS schedule_ownership_mode text;

UPDATE public.projects
  SET schedule_ownership_mode = 'AUTO_GENERATED'
  WHERE schedule_ownership_mode IS NULL;

ALTER TABLE public.projects
  ALTER COLUMN schedule_ownership_mode SET DEFAULT 'AUTO_GENERATED',
  ALTER COLUMN schedule_ownership_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_schedule_ownership_mode_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_schedule_ownership_mode_check
      CHECK (schedule_ownership_mode IN ('AUTO_GENERATED', 'CONTRACTOR_MANAGED'));
  END IF;
END $$;

-- ─── 2. Atomic Contractor Draft save ────────────────────────────────────────

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
  -- below already raises on a malformed string) and start <= end. No
  -- reference-duration/dependency/CPM validation — those are not data
  -- integrity, they are professional planning judgement.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_changes) AS item("wpId" text, "plannedStart" date, "plannedEnd" date)
    WHERE item."plannedStart" IS NULL
       OR item."plannedEnd" IS NULL
       OR item."plannedStart" > item."plannedEnd"
  ) THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE_DATES: plannedStart/plannedEnd must be valid dates with start <= end'
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

  -- One set-based statement — all rows in the batch, or none. duration_days
  -- is always server-derived (planned_end - planned_start on DATE columns is
  -- exactly ganttEngine.js's diffDays() formula for whole calendar days —
  -- same convention, not a new calendar model). Only these three columns are
  -- touched; everything else (actual_progress, status, is_critical,
  -- is_archived, project_id/wp_id identity, ...) is untouched by construction
  -- — this statement's SET list is exhaustive and does not reference them.
  WITH changes AS (
    SELECT "wpId" AS wp_id, "plannedStart" AS planned_start, "plannedEnd" AS planned_end
    FROM jsonb_to_recordset(p_changes) AS item("wpId" text, "plannedStart" date, "plannedEnd" date)
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
