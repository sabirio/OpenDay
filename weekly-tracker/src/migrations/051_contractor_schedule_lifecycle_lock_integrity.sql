-- 051_contractor_schedule_lifecycle_lock_integrity.sql
-- Simplification Phase 4B.1.1: Schedule Lifecycle Lock Integrity —
-- Scope-mutation database lock + deterministic Save/Submit serialization.
--
-- Two independent gaps closed, both against migrations 049/050 (untouched
-- by this file; CREATE OR REPLACE only, same established pattern every
-- prior migration in this feature has used against its predecessor).
--
-- ─── Gap 1: Scope mutation had no database-level lock ──────────────────────
--
-- The approved product policy already existed as a pure JS contract
-- (core/schedule/contractorScheduleLifecycle.js's canEditScope()) but
-- nothing enforced it server-side — Projects.jsx's existing Scope-edit path
-- (a plain `projects` UPDATE, RLS-gated only by can_write_project()) could
-- silently change projects.scope for a CONTRACTOR_MANAGED project at ANY
-- lifecycle stage, including PENDING_REVIEW or APPROVED, with no guard at
-- all. A narrowly-scoped BEFORE UPDATE trigger closes this: it fires only
-- when NEW.scope IS DISTINCT FROM OLD.scope (every other project field
-- edit — dates, store code, contractor_email, anything else — is
-- completely unaffected), and only evaluates the lifecycle guard for
-- CONTRACTOR_MANAGED projects (AUTO_GENERATED Scope edits are untouched,
-- zero new restriction). It reuses the ONE canonical
-- contractor_schedule_lifecycle_status() function (049) — no second Scope
-- source of truth, no duplicated status derivation.
--
-- Because this is a plain BEFORE UPDATE trigger on the row being updated,
-- it automatically shares the SAME row-level lock every ordinary
-- `UPDATE projects SET scope = ... WHERE id = X` already takes — which is
-- the identical lock submit_contractor_schedule's explicit
-- `SELECT ... FOR UPDATE` acquires below. No extra locking code is needed
-- for Scope-update-vs-Submit serialization (Phase 4B.1.1 Section I) — it
-- falls out of ordinary Postgres row-level MVCC semantics for free.
--
-- ─── Gap 2: save_contractor_schedule_draft / submit_contractor_schedule ────
-- ─── shared no real serialization boundary ─────────────────────────────────
--
-- submit_contractor_schedule (049) already took `SELECT ... FOR UPDATE` on
-- the project row, but save_contractor_schedule_draft (050) never did —
-- meaning the two commands never actually contended for the same lock, so
-- two concurrent calls (one Save, one Submit) could each observe a
-- consistent-at-the-time snapshot with no real mutual exclusion between
-- them. Both functions are replaced here to share the exact same contract:
--   1. idempotency-ledger check FIRST (a legitimate replay must return its
--      cached result even if lifecycle has since moved on — this ordering
--      was already fixed once for submit_contractor_schedule during Phase
--      4B.1's own DB certification; save_contractor_schedule_draft had the
--      SAME latent bug — its idempotency check ran only after the
--      lifecycle guard AND all batch validation, so a legitimate Save
--      Draft replay issued after a later Submit would have incorrectly
--      failed with SCHEDULE_PENDING_REVIEW instead of returning the cached
--      response);
--   2. lock + resolve the project row (`SELECT ... FOR UPDATE`) — the ONE
--      shared serialization boundary between the two commands;
--   3. re-evaluate authorization and lifecycle against the now-locked row;
--   4. perform the mutation.
--
-- This makes both required race outcomes deterministic:
--   Save-wins:   Save's UPDATE (and its implicit row lock) commits first;
--                Submit then acquires the lock, and its snapshot query
--                (a plain, un-locked SELECT against project_gantt_tasks,
--                run only after the project row lock is held) reads
--                exactly what Save just committed.
--   Submit-wins: Submit's FOR UPDATE commits PENDING_REVIEW first; Save
--                then acquires the lock, re-evaluates lifecycle against
--                the now-committed state, and is rejected with
--                SCHEDULE_PENDING_REVIEW before touching project_gantt_tasks.
-- There is no interleaving in which a late Save can mutate
-- project_gantt_tasks after Submit's snapshot has already been taken and
-- committed — the row lock forces total ordering between the two
-- transactions.
--
-- Everything else in both functions — authorization shape, mutual
-- exclusion, batch validation, protected-field boundary, human-inclusive
-- Finish canonicalization, completeness rules, snapshot contents — is
-- byte-identical in substance to 049/050, only reordered around the new
-- lock.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS projects_scope_lifecycle_lock ON public.projects;
--   DROP FUNCTION IF EXISTS public.prevent_scope_mutation_during_review();
--   Re-apply 050_contractor_schedule_draft_lifecycle_lock.sql's and
--   049_contractor_schedule_submission_lifecycle.sql's function bodies
--   (CREATE OR REPLACE) to restore the prior (unlocked, differently-ordered)
--   contracts.

-- ─── 1. Scope-mutation database lock ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_scope_mutation_during_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_lifecycle_status text;
BEGIN
  -- AUTO_GENERATED projects: existing Scope-update behavior is completely
  -- unchanged — this guard only ever evaluates for CONTRACTOR_MANAGED.
  IF NEW.schedule_ownership_mode IS DISTINCT FROM 'CONTRACTOR_MANAGED' THEN
    RETURN NEW;
  END IF;

  v_lifecycle_status := public.contractor_schedule_lifecycle_status(NEW.id);

  IF v_lifecycle_status = 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'SCHEDULE_PENDING_REVIEW: Scope cannot be edited while a schedule submission is pending review'
      USING ERRCODE = '55000';
  END IF;
  IF v_lifecycle_status = 'APPROVED' THEN
    RAISE EXCEPTION 'BASELINE_ALREADY_APPROVED: Scope cannot be edited once a baseline is approved'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_scope_lifecycle_lock ON public.projects;
CREATE TRIGGER projects_scope_lifecycle_lock
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  WHEN (NEW.scope IS DISTINCT FROM OLD.scope)
  EXECUTE FUNCTION public.prevent_scope_mutation_during_review();

-- ─── 2. save_contractor_schedule_draft — shared lock + idempotency-first ───

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

  -- Idempotency FIRST (Phase 4B.1.1 Section F/H): a legitimate replay must
  -- return its cached result even if lifecycle has since moved on. This
  -- must run before the project lock/lifecycle re-check below, exactly as
  -- submit_contractor_schedule already does.
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

  -- Lock + resolve the project row — the ONE serialization boundary shared
  -- with submit_contractor_schedule (both lock the same row, in the same
  -- position relative to idempotency, so the two commands totally order
  -- against each other regardless of which acquires the lock first).
  SELECT schedule_ownership_mode
    INTO v_schedule_mode
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id USING ERRCODE = 'P0002';
  END IF;

  -- Authorization (unchanged since 048): Contractor-only, full stop. Now
  -- re-evaluated against the locked project row.
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

  -- Lifecycle lock (unchanged rule since 050, now checked against the
  -- locked row): Save Draft is a Draft-stage action only.
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

-- ─── 3. submit_contractor_schedule — shared lock + idempotency-first ───────
-- Reordered to match save_contractor_schedule_draft's contract exactly:
-- idempotency first, then lock+resolve, then re-evaluate authorization and
-- lifecycle. (49's own idempotency-before-lifecycle fix is preserved; this
-- migration additionally moves authorization/mode resolution to occur
-- after the lock, for full symmetry with the Draft RPC.)

CREATE OR REPLACE FUNCTION public.submit_contractor_schedule(
  p_project_id bigint,
  p_client_request_id uuid,
  p_contractor_comment text DEFAULT NULL
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
  v_template_id uuid;
  v_lifecycle_status text;
  v_request public.write_command_requests%ROWTYPE;
  v_version_id bigint;
  v_submission_number integer;
  v_scope_count integer;
  v_incomplete_count integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id is required' USING ERRCODE = '22023';
  END IF;

  -- Idempotency FIRST — see save_contractor_schedule_draft above for the
  -- shared rationale. A legitimate replay must return its cached result
  -- even if lifecycle has since moved on (e.g. this exact submission was
  -- already reviewed).
  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES (v_uid, 'schedule.submit', p_client_request_id, p_project_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;

  SELECT * INTO v_request
  FROM public.write_command_requests
  WHERE actor_id = v_uid AND operation = 'schedule.submit' AND client_request_id = p_client_request_id;

  IF v_request.project_id <> p_project_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE = '23505';
  END IF;
  IF v_request.response IS NOT NULL THEN
    RETURN v_request.response || jsonb_build_object('idempotentReplay', true);
  END IF;

  -- Lock + resolve the project row — the ONE serialization boundary shared
  -- with save_contractor_schedule_draft.
  SELECT schedule_ownership_mode, template_id INTO v_schedule_mode, v_template_id
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id USING ERRCODE = 'P0002';
  END IF;

  -- Authorization (unchanged shape since 049), re-evaluated against the
  -- locked project row.
  SELECT lower(role), COALESCE(assigned_projects, '{}'::integer[])
    INTO v_role, v_assigned_projects
  FROM public.profiles
  WHERE id = v_uid;

  IF v_role IS DISTINCT FROM 'contractor' OR NOT (p_project_id = ANY(v_assigned_projects::bigint[])) THEN
    RAISE EXCEPTION 'Not authorized for this project schedule' USING ERRCODE = '42501';
  END IF;

  IF v_schedule_mode <> 'CONTRACTOR_MANAGED' THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_CONTRACTOR_MANAGED: project schedule is not contractor-managed'
      USING ERRCODE = '42501';
  END IF;

  v_lifecycle_status := public.contractor_schedule_lifecycle_status(p_project_id);
  IF v_lifecycle_status = 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'SCHEDULE_PENDING_REVIEW: a schedule submission is already pending review' USING ERRCODE = '55000';
  END IF;
  IF v_lifecycle_status = 'APPROVED' THEN
    RAISE EXCEPTION 'BASELINE_ALREADY_APPROVED: an approved baseline already exists for this project' USING ERRCODE = '55000';
  END IF;

  -- Completeness (document integrity only — unchanged rule since 049).
  SELECT count(*) INTO v_scope_count
  FROM public.project_gantt_tasks
  WHERE project_id = p_project_id AND NOT COALESCE(is_archived, false);

  IF v_scope_count = 0 THEN
    RAISE EXCEPTION 'EMPTY_SCOPE: no active Scope work packages exist for this project' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_incomplete_count
  FROM public.project_gantt_tasks
  WHERE project_id = p_project_id AND NOT COALESCE(is_archived, false)
    AND (planned_start IS NULL OR planned_end IS NULL OR duration_days IS NULL);

  IF v_incomplete_count > 0 THEN
    RAISE EXCEPTION 'SCHEDULE_INCOMPLETE: % of % active work packages are missing Start/Finish', v_incomplete_count, v_scope_count
      USING ERRCODE = '22023';
  END IF;

  -- Defensive re-check: save_contractor_schedule_draft already guarantees
  -- start <= finish at write time, but this RPC is the gate of record for
  -- submission, so it re-verifies rather than silently trusting upstream.
  IF EXISTS (
    SELECT 1 FROM public.project_gantt_tasks
    WHERE project_id = p_project_id AND NOT COALESCE(is_archived, false)
      AND planned_start > planned_end
  ) THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE_DATES: one or more work packages have Start after Finish' USING ERRCODE = '22023';
  END IF;

  -- Version header.
  SELECT COALESCE(max(submission_number), 0) + 1 INTO v_submission_number
  FROM public.project_schedule_versions WHERE project_id = p_project_id;

  INSERT INTO public.project_schedule_versions (
    project_id, submission_number, status, template_id,
    submitted_by, submitted_at, contractor_comment, submit_client_request_id
  ) VALUES (
    p_project_id, v_submission_number, 'PENDING_REVIEW', v_template_id,
    v_uid, now(), NULLIF(p_contractor_comment, ''), p_client_request_id
  )
  RETURNING id INTO v_version_id;

  -- Immutable snapshot — one set-based statement, every active Scope WP, no
  -- partial snapshot possible (function-level transactionality). Taken
  -- only after the project row lock is held, so it reflects exactly
  -- whatever the Draft last committed (Save-wins scenario) and cannot be
  -- followed by a later Draft mutation under the SAME snapshot (Submit-wins
  -- scenario — Save would find the row locked, then find PENDING_REVIEW
  -- once unblocked). Only schedule fields are copied — no actual_progress/
  -- status/is_critical/evidence/discrepancies/risk output (Phase 4A
  -- Section N).
  INSERT INTO public.project_schedule_version_tasks (version_id, wp_id, planned_start, planned_end, duration_days)
  SELECT v_version_id, wp_id, planned_start, planned_end, duration_days
  FROM public.project_gantt_tasks
  WHERE project_id = p_project_id AND NOT COALESCE(is_archived, false);

  v_result := jsonb_build_object(
    'submissionId', v_version_id,
    'projectId', p_project_id,
    'submissionNumber', v_submission_number,
    'status', 'PENDING_REVIEW',
    'scheduledCount', v_scope_count
  );

  UPDATE public.write_command_requests
  SET response = v_result, completed_at = now()
  WHERE id = v_request.id;

  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contractor_schedule(bigint, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contractor_schedule(bigint, uuid, text) TO authenticated;
