-- 048_contractor_schedule_ownership_enforcement.sql
-- Simplification Phase 3C.1: Contractor Draft Ownership & Navigation
-- Safety Gate — server-side authorization correction.
--
-- Audit finding: save_contractor_schedule_draft() (046, body replaced by
-- 047) authorizes admin/pm via the generic public.can_write_project()
-- helper — the same helper every other project-write RPC/RLS policy in
-- this codebase uses. That was an accidental inheritance from the
-- "admin/pm can write project data" pattern, not a deliberate product
-- decision for this specific RPC: it let an authorized PM (or Admin)
-- successfully call Save Draft and mutate the Contractor Proposed
-- Schedule, even though the UI never exposed that path deliberately.
--
-- Canonical product rule (OPENDAY_CONSTITUTION.md's responsibility
-- boundary, restated for this workflow): the Contractor owns the
-- Contractor Proposed Schedule / Draft. PM reviews and later approves or
-- requests changes — a distinct, not-yet-built workflow. PM must not be
-- able to edit or Save the Draft through this RPC. No implicit Admin
-- override either: any future Admin support-override must be its own
-- explicit, separately documented authorization branch — never inherited
-- silently from can_write_project() the way this RPC did until now.
--
-- CREATE OR REPLACE keeps the exact same outer signature
-- (bigint, jsonb, uuid) — this replaces 047's function body only (same
-- pattern 047 used against 046: migrations are not rewritten after the
-- fact in this repository). Everything except the authorization block is
-- byte-identical to 047: atomic single-statement batch write, one
-- client_request_id idempotency ledger entry, WP/project scope binding,
-- archived/out-of-scope rejection, protected-field boundary (only
-- planned_start/planned_end/duration_days are ever touched),
-- server-derived duration_days, and the human-inclusive plannedFinish
-- input contract (planned_end = plannedFinish + 1).
--
-- No table/column/RLS/generic-write-path change. project_gantt_tasks RLS
-- (can_write_project()-gated) is untouched and continues to govern
-- AUTO_GENERATED projects' PM/admin writes exactly as before — this
-- migration narrows only this one RPC's own authorization branch, not the
-- generic table policy other legitimate admin/pm writes still rely on.
--
-- Rollback:
--   Re-apply 047_contractor_schedule_human_date_semantics.sql's function
--   body (CREATE OR REPLACE FUNCTION public.save_contractor_schedule_draft(...)
--   with the can_write_project()-inclusive authorization branch) to
--   restore the prior (broader) contract.

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

  SELECT schedule_ownership_mode
    INTO v_schedule_mode
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id USING ERRCODE = 'P0002';
  END IF;

  -- Authorization (Simplification Phase 3C.1): Contractor-only, full stop.
  -- Prior versions also authorized admin/pm via can_write_project() — see
  -- this migration's header for why that was removed. Sole authorization
  -- truth for this RPC: role = contractor AND
  -- project_id ∈ profiles.assigned_projects. No contractor_email fallback
  -- (unchanged since 046).
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

  -- Mutual exclusion: this RPC is the Contractor Draft write path only. An
  -- AUTO_GENERATED project's schedule belongs entirely to
  -- generateAndSaveGantt/regenerateGantt — reject regardless of who is
  -- calling, so the two write paths can never both own the same project's
  -- planned schedule.
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
