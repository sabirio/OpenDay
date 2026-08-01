-- 049_contractor_schedule_submission_lifecycle.sql
-- Simplification Phase 4B.1: Versioned Schedule Lifecycle Backend
-- Foundation — Submit + Request Changes + Approve + Immutable Baseline.
--
-- Backend/domain foundation only. No UI in this migration. Adds two new
-- tables and three new SECURITY DEFINER commands on top of the existing
-- Contractor Draft foundation (046-048, untouched by this migration).
--
-- ─── Storage model (Phase 4A audit, Option A) ──────────────────────────────
--
-- public.project_gantt_tasks remains the ONE mutable Contractor working
-- Draft — nothing about its schema, RLS, or the existing
-- save_contractor_schedule_draft RPC changes here (its lifecycle-lock
-- extension is migration 050, a separate CREATE OR REPLACE, not this file).
--
-- public.project_schedule_versions is the submission/review/baseline
-- HEADER — one row per Contractor submission attempt. Allowed MVP statuses
-- are exactly PENDING_REVIEW, CHANGES_REQUESTED, APPROVED — DRAFT is
-- deliberately never stored as a version row; the current mutable
-- project_gantt_tasks row set *is* the Draft, by construction (Phase 4A
-- Section D/E).
--
-- public.project_schedule_version_tasks is the IMMUTABLE per-WP snapshot
-- taken at submit time — wp_id/planned_start/planned_end/duration_days
-- only. No actual progress, no site-visit evidence, no discrepancies, no
-- critical/float values, no Risk/Readiness output — the snapshot represents
-- only the Contractor's schedule commitment (Phase 4A Section N).
--
-- ─── submission_number vs. baseline_revision_number ────────────────────────
--
-- submission_number counts every submit attempt for a project (1, 2, 3, ...
-- including ones later CHANGES_REQUESTED) — assigned at submit time.
-- baseline_revision_number is a SEPARATE counter, assigned only at approval
-- time, so "Approved Baseline v1" means the first row that ever reached
-- APPROVED, not necessarily submission_number = 1 (an earlier submission
-- may have been returned via Request Changes first). These are never the
-- same column and never derived from one another (Phase 4A Section I).
--
-- ─── Scope-membership boundary (known, accepted limitation) ────────────────
--
-- "Current active Scope" for both this migration's submit RPC and the
-- existing save_contractor_schedule_draft RPC means the same thing: the
-- set of non-archived public.project_gantt_tasks rows for the project.
-- Neither RPC re-derives scope from projects.scope (a JSONB column with its
-- own zone/category/versioned-template resolution logic, getScopeWPIds() in
-- the JS layer) — reimplementing that resolution in PL/pgSQL would
-- duplicate a second, divergence-prone copy of "what is Scope" outside the
-- one JS source of truth. This exactly matches save_contractor_schedule_draft's
-- own established WORK_PACKAGE_OUT_OF_SCOPE convention (046-048) — this
-- migration does not introduce a new inconsistency, it inherits an existing,
-- already-accepted one. Wiring live Scope -> project_gantt_tasks
-- materialization (materializeUnscheduledScheduleFromScope, already built,
-- still not called from any live path) is Create-Project/Scope-edit
-- orchestration work, explicitly out of scope for this backend slice.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.approve_schedule_submission(bigint, text, uuid);
--   DROP FUNCTION IF EXISTS public.request_schedule_changes(bigint, text, uuid);
--   DROP FUNCTION IF EXISTS public.submit_contractor_schedule(bigint, uuid, text);
--   DROP FUNCTION IF EXISTS public.contractor_schedule_lifecycle_status(bigint);
--   DROP FUNCTION IF EXISTS public.can_access_schedule_submissions(bigint);
--   DROP TABLE IF EXISTS public.project_schedule_version_tasks;
--   DROP TABLE IF EXISTS public.project_schedule_versions;

-- ─── 1. Version header ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_schedule_versions (
  id                        bigserial PRIMARY KEY,
  project_id                bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  submission_number         integer NOT NULL,
  baseline_revision_number  integer,
  status                    text NOT NULL CHECK (status IN ('PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED')),
  template_id               uuid,
  submitted_by              uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_at              timestamptz NOT NULL DEFAULT now(),
  reviewed_by               uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at               timestamptz,
  contractor_comment        text,
  pm_comment                text,
  submit_client_request_id  uuid NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, submission_number)
);

-- At most one PENDING_REVIEW submission per project — the hard backstop
-- behind the row-locking in submit_contractor_schedule below; even without
-- the lock, a genuine race can never produce two pending rows.
CREATE UNIQUE INDEX IF NOT EXISTS project_schedule_versions_one_pending_per_project
  ON public.project_schedule_versions (project_id)
  WHERE status = 'PENDING_REVIEW';

-- baseline_revision_number is unique per project whenever assigned (never
-- overloaded with submission_number — see header comment).
CREATE UNIQUE INDEX IF NOT EXISTS project_schedule_versions_baseline_revision_unique
  ON public.project_schedule_versions (project_id, baseline_revision_number)
  WHERE baseline_revision_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_schedule_versions_project_id_idx
  ON public.project_schedule_versions (project_id);

-- ─── 2. Immutable task snapshot ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_schedule_version_tasks (
  id             bigserial PRIMARY KEY,
  version_id     bigint NOT NULL REFERENCES public.project_schedule_versions(id) ON DELETE CASCADE,
  wp_id          text NOT NULL,
  planned_start  date NOT NULL,
  planned_end    date NOT NULL,
  duration_days  integer NOT NULL,
  UNIQUE (version_id, wp_id)
);

CREATE INDEX IF NOT EXISTS project_schedule_version_tasks_version_id_idx
  ON public.project_schedule_version_tasks (version_id);

-- Immutability: once a snapshot row exists, it can never be changed or
-- removed by anyone, including the owning RPCs — mirrors
-- prevent_snag_event_mutation() (030_snag_list_foundation.sql), the one
-- proven immutable-append-only pattern already in this codebase.
CREATE OR REPLACE FUNCTION public.prevent_schedule_version_task_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'SCHEDULE_VERSION_TASK_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS project_schedule_version_tasks_immutable ON public.project_schedule_version_tasks;
CREATE TRIGGER project_schedule_version_tasks_immutable
  BEFORE UPDATE OR DELETE ON public.project_schedule_version_tasks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_schedule_version_task_mutation();

REVOKE ALL ON FUNCTION public.prevent_schedule_version_task_mutation() FROM PUBLIC, anon, authenticated;

-- ─── 3. RLS: SELECT-only for authorized roles, zero client write policies ──
-- All writes happen exclusively through the SECURITY DEFINER RPCs below —
-- matching write_command_requests' own REVOKE-ALL-from-anon-and-authenticated
-- posture. Viewer is explicitly excluded (Phase 4B.1 product decision — not
-- a copy of can_access_project(), which does include Viewer for other
-- tables).

CREATE OR REPLACE FUNCTION public.can_access_schedule_submissions(p_project_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_profile_company text;
  v_assigned_projects integer[] := '{}'::integer[];
  v_project_company text;
BEGIN
  IF auth.uid() IS NULL OR p_project_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT lower(role), company_id, COALESCE(assigned_projects, '{}'::integer[])
    INTO v_role, v_profile_company, v_assigned_projects
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- Viewer: no access to Contractor schedule submissions/baselines in this
  -- MVP (explicit product decision, not an oversight — see rolePermissions.js
  -- precedent of Viewer's already-minimal scope).
  IF v_role = 'viewer' THEN
    RETURN false;
  END IF;

  SELECT company_id INTO v_project_company FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_role = 'admin' AND v_profile_company IS NULL THEN
    RETURN true;
  END IF;

  IF v_role IN ('admin', 'pm') THEN
    RETURN v_project_company IS NULL OR v_profile_company = v_project_company;
  END IF;

  IF v_role = 'contractor' THEN
    RETURN p_project_id = ANY(v_assigned_projects::bigint[])
      AND (v_project_company IS NULL OR v_profile_company IS NULL OR v_profile_company = v_project_company);
  END IF;

  RETURN false;
END;
$$;

ALTER TABLE public.project_schedule_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_schedule_versions FROM anon, authenticated;
GRANT SELECT ON public.project_schedule_versions TO authenticated;

CREATE POLICY "project_schedule_versions_select"
  ON public.project_schedule_versions FOR SELECT TO authenticated
  USING (public.can_access_schedule_submissions(project_id));

ALTER TABLE public.project_schedule_version_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_schedule_version_tasks FROM anon, authenticated;
GRANT SELECT ON public.project_schedule_version_tasks TO authenticated;

CREATE POLICY "project_schedule_version_tasks_select"
  ON public.project_schedule_version_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_schedule_versions v
      WHERE v.id = project_schedule_version_tasks.version_id
        AND public.can_access_schedule_submissions(v.project_id)
    )
  );

-- Production has broad platform default ACLs; explicitly close them on every new object.
REVOKE ALL ON SEQUENCE public.project_schedule_versions_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.project_schedule_version_tasks_id_seq FROM anon, authenticated;

-- ─── 4. Canonical lifecycle helper ──────────────────────────────────────────
-- ONE source of truth for "what stage is this project's Contractor schedule
-- at" — used internally by every RPC below (submit, save_draft's
-- lifecycle-lock in migration 050) so the same rule is never duplicated,
-- and exposed for a future Scope-edit orchestration / JS presentation layer
-- to query directly instead of re-deriving the same EXISTS checks
-- (Phase 4A Section J — "avoid duplicated status checks across UI").
CREATE OR REPLACE FUNCTION public.contractor_schedule_lifecycle_status(p_project_id bigint)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.project_schedule_versions
    WHERE project_id = p_project_id AND status = 'APPROVED'
  ) THEN
    RETURN 'APPROVED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.project_schedule_versions
    WHERE project_id = p_project_id AND status = 'PENDING_REVIEW'
  ) THEN
    RETURN 'PENDING_REVIEW';
  END IF;

  -- No pending, no approved: either never submitted, or the most recent
  -- submission was CHANGES_REQUESTED — both mean the Draft (and Scope) are
  -- editable, so both collapse to the same 'DRAFT' status (Phase 4A
  -- Section J: "Scope edits allowed ... after CHANGES_REQUESTED").
  RETURN 'DRAFT';
END;
$$;

REVOKE ALL ON FUNCTION public.contractor_schedule_lifecycle_status(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contractor_schedule_lifecycle_status(bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.can_access_schedule_submissions(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_schedule_submissions(bigint) TO authenticated;

-- ─── 5. submit_contractor_schedule ──────────────────────────────────────────
-- Contractor-only (same shape as save_contractor_schedule_draft, 046-048:
-- role = contractor AND project_id ∈ assigned_projects, no can_write_project()
-- branch, no contractor_email fallback). Completeness is document integrity,
-- not professional planning judgement (Phase 4B.1 Section E): every active
-- Scope WP must have a complete, valid Start/Finish/duration — nothing about
-- realism, sequence, resources, achievability, dependencies, CPM, or
-- Reference Duration is ever evaluated here.
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

  SELECT lower(role), COALESCE(assigned_projects, '{}'::integer[])
    INTO v_role, v_assigned_projects
  FROM public.profiles
  WHERE id = v_uid;

  IF v_role IS DISTINCT FROM 'contractor' OR NOT (p_project_id = ANY(v_assigned_projects::bigint[])) THEN
    RAISE EXCEPTION 'Not authorized for this project schedule' USING ERRCODE = '42501';
  END IF;

  SELECT schedule_ownership_mode, template_id INTO v_schedule_mode, v_template_id
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id USING ERRCODE = 'P0002';
  END IF;

  IF v_schedule_mode <> 'CONTRACTOR_MANAGED' THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_CONTRACTOR_MANAGED: project schedule is not contractor-managed'
      USING ERRCODE = '42501';
  END IF;

  -- Idempotency FIRST — reuse the generic ledger (025_atomic_write_commands.sql).
  -- This must run BEFORE the lifecycle-status guard below: a genuine replay
  -- of an ALREADY-successful submit necessarily finds the project in
  -- PENDING_REVIEW (that is what the original call produced), so checking
  -- lifecycle status before idempotency would make every replay fail with
  -- SCHEDULE_PENDING_REVIEW instead of returning the cached result — the
  -- ledger lookup must always get first refusal on a request it already
  -- knows about, exactly as save_contractor_schedule_draft's own ordering
  -- (idempotency check precedes any state that a successful call itself
  -- changes).
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

  -- Serialize concurrent Submit attempts for the SAME project: lock the
  -- project row first, so two simultaneous callers cannot both pass the
  -- "no PENDING_REVIEW exists" check before either has inserted its header
  -- row. The partial unique index on project_schedule_versions remains as
  -- a hard backstop even if this lock were ever bypassed.
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;

  v_lifecycle_status := public.contractor_schedule_lifecycle_status(p_project_id);
  IF v_lifecycle_status = 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'SCHEDULE_PENDING_REVIEW: a schedule submission is already pending review' USING ERRCODE = '55000';
  END IF;
  IF v_lifecycle_status = 'APPROVED' THEN
    RAISE EXCEPTION 'BASELINE_ALREADY_APPROVED: an approved baseline already exists for this project' USING ERRCODE = '55000';
  END IF;

  -- Completeness (document integrity only — see this function's header
  -- comment and the "Scope-membership boundary" note at the top of this
  -- migration file for what "active Scope WP" means here).
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
  -- partial snapshot possible (function-level transactionality). Only
  -- schedule fields are copied — no actual_progress/status/is_critical/
  -- evidence/discrepancies/risk output (Phase 4A Section N).
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

-- ─── 6. request_schedule_changes ────────────────────────────────────────────
-- PM-only (role = 'pm' explicitly required, NOT the broader can_write_project()
-- role set — Admin is deliberately NOT implicitly allowed here, an explicit
-- owner decision for this command, distinct from the generic admin/pm
-- write pattern used elsewhere in this schema). can_write_project() is still
-- used, but only for its company-scoping/cross-company-rejection logic,
-- ANDed with the explicit role check so Admin never passes despite
-- can_write_project() itself returning true for Admin.
CREATE OR REPLACE FUNCTION public.request_schedule_changes(
  p_submission_id bigint,
  p_comment text,
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
  v_version public.project_schedule_versions%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_comment IS NULL OR btrim(p_comment) = '' THEN
    RAISE EXCEPTION 'COMMENT_REQUIRED: a comment is required to request changes' USING ERRCODE = '22023';
  END IF;

  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = v_uid;

  -- project_id is resolved server-side from submission_id — never trusted
  -- from a client-supplied parameter (IDOR/BOLA defense). Row-locked here so
  -- a concurrent Approve/Request-Changes attempt against the same
  -- submission serializes rather than races.
  SELECT * INTO v_version FROM public.project_schedule_versions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND OR v_role IS DISTINCT FROM 'pm' OR NOT public.can_write_project(v_version.project_id) THEN
    -- Identical failure whether the submission doesn't exist, belongs to an
    -- inaccessible project, or the caller's role is wrong — no existence leak.
    RAISE EXCEPTION 'Not authorized for this project schedule' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id, source_record_id)
  VALUES (v_uid, 'schedule.request_changes', p_client_request_id, v_version.project_id, p_submission_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;

  SELECT * INTO v_request
  FROM public.write_command_requests
  WHERE actor_id = v_uid AND operation = 'schedule.request_changes' AND client_request_id = p_client_request_id;

  IF v_request.source_record_id IS DISTINCT FROM p_submission_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another submission' USING ERRCODE = '23505';
  END IF;
  IF v_request.response IS NOT NULL THEN
    RETURN v_request.response || jsonb_build_object('idempotentReplay', true);
  END IF;

  IF v_version.status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'SUBMISSION_NOT_PENDING: this submission is not awaiting review' USING ERRCODE = '55000';
  END IF;

  -- The one permitted mutation of a project_schedule_versions header row: a
  -- single, one-way PENDING_REVIEW -> CHANGES_REQUESTED transition. The
  -- immutable task snapshot (project_schedule_version_tasks) and the
  -- Contractor's working Draft (project_gantt_tasks) are both left
  -- completely untouched — reopening the Draft is a lifecycle-status
  -- consequence (contractor_schedule_lifecycle_status now returns 'DRAFT'
  -- again), not a data operation.
  UPDATE public.project_schedule_versions
  SET status = 'CHANGES_REQUESTED', reviewed_by = v_uid, reviewed_at = now(), pm_comment = p_comment
  WHERE id = p_submission_id;

  v_result := jsonb_build_object(
    'submissionId', p_submission_id,
    'projectId', v_version.project_id,
    'status', 'CHANGES_REQUESTED'
  );

  UPDATE public.write_command_requests
  SET response = v_result, completed_at = now()
  WHERE id = v_request.id;

  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.request_schedule_changes(bigint, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_schedule_changes(bigint, text, uuid) TO authenticated;

-- ─── 7. approve_schedule_submission ─────────────────────────────────────────
-- Same PM-only authorization shape as request_schedule_changes (role='pm'
-- explicit, Admin not implicitly allowed). The approved
-- project_schedule_versions row plus its immutable task rows IS the
-- Approved Baseline — no separate baseline table, no copy (Phase 4A
-- Section K).
CREATE OR REPLACE FUNCTION public.approve_schedule_submission(
  p_submission_id bigint,
  p_comment text,
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
  v_version public.project_schedule_versions%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE;
  v_next_revision integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = v_uid;

  SELECT * INTO v_version FROM public.project_schedule_versions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND OR v_role IS DISTINCT FROM 'pm' OR NOT public.can_write_project(v_version.project_id) THEN
    RAISE EXCEPTION 'Not authorized for this project schedule' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id, source_record_id)
  VALUES (v_uid, 'schedule.approve', p_client_request_id, v_version.project_id, p_submission_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;

  SELECT * INTO v_request
  FROM public.write_command_requests
  WHERE actor_id = v_uid AND operation = 'schedule.approve' AND client_request_id = p_client_request_id;

  IF v_request.source_record_id IS DISTINCT FROM p_submission_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another submission' USING ERRCODE = '23505';
  END IF;
  IF v_request.response IS NOT NULL THEN
    RETURN v_request.response || jsonb_build_object('idempotentReplay', true);
  END IF;

  IF v_version.status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'SUBMISSION_NOT_PENDING: this submission is not awaiting review' USING ERRCODE = '55000';
  END IF;

  -- baseline_revision_number is its own counter, assigned only here, at
  -- approval time — never overloaded with submission_number. First
  -- approval for a project always yields 1.
  SELECT COALESCE(max(baseline_revision_number), 0) + 1 INTO v_next_revision
  FROM public.project_schedule_versions
  WHERE project_id = v_version.project_id;

  UPDATE public.project_schedule_versions
  SET status = 'APPROVED',
      reviewed_by = v_uid,
      reviewed_at = now(),
      pm_comment = NULLIF(p_comment, ''),
      baseline_revision_number = v_next_revision
  WHERE id = p_submission_id;

  v_result := jsonb_build_object(
    'submissionId', p_submission_id,
    'projectId', v_version.project_id,
    'status', 'APPROVED',
    'baselineRevisionNumber', v_next_revision
  );

  UPDATE public.write_command_requests
  SET response = v_result, completed_at = now()
  WHERE id = v_request.id;

  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_schedule_submission(bigint, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_schedule_submission(bigint, text, uuid) TO authenticated;
