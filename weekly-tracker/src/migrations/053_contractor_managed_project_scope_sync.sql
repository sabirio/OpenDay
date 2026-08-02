-- 053_contractor_managed_project_scope_sync.sql
-- Simplification Phase 3D.2.1: Atomic Contractor-Managed Scope Synchronization.
--
-- Closes a defect confirmed live (direct DB reproduction, DRAFT and the
-- equivalent CHANGES_REQUESTED state): Projects.jsx's existing Scope-edit
-- path is a plain `projects` UPDATE (projectService.update() -> toDB()),
-- which persists projects.scope but never touches project_gantt_tasks —
-- adding a WP to Scope leaves it with no schedule row at all (invisible to
-- the Contractor Schedule Workspace), and removing a WP leaves its row
-- active/unarchived forever. One SECURITY DEFINER RPC now does both halves
-- atomically: update the Scope column AND materialize/unarchive/archive the
-- matching project_gantt_tasks rows, in one transaction, or none of it.
--
-- This is a CONTRACTOR_MANAGED-only command — AUTO_GENERATED projects keep
-- their existing Scope-edit-triggers-regenerateGantt() behavior completely
-- untouched (that path was never affected by this defect: regenerateGantt
-- already rebuilds project_gantt_tasks wholesale from the new Scope on every
-- save).
--
-- Lifecycle lock: this command is a plain `UPDATE public.projects SET
-- scope = ...`, so it is automatically covered by 051's existing
-- `projects_scope_lifecycle_lock` BEFORE UPDATE trigger
-- (prevent_scope_mutation_during_review()) — no new lock is introduced,
-- and no second lifecycle policy is invented. That trigger (and this
-- function's own early check, added only to fail fast before any
-- template/WP validation work, with the identical error codes/messages)
-- already treats 'DRAFT' as editable — and 051's own
-- contractor_schedule_lifecycle_status() deliberately collapses "never
-- submitted" and "the most recent submission was CHANGES_REQUESTED" into
-- the SAME 'DRAFT' return value (see that function's own comment: "both
-- mean the Draft (and Scope) are editable"). There is no distinct
-- CHANGES_REQUESTED state anywhere in this schema to check against — DRAFT
-- already covers it. PENDING_REVIEW and APPROVED are both rejected, exactly
-- matching the trigger's own existing, already-certified behavior.
--
-- Row locking: `SELECT ... FOR UPDATE` on the project row, the SAME shared
-- serialization boundary save_contractor_schedule_draft/submit_contractor_schedule
-- (051) already use — a concurrent Scope update, Save Draft, or Submit
-- against the same project totally orders against this command through
-- ordinary Postgres row-lock semantics, no extra locking code required.
--
-- Idempotency: unlike 052's create command, this command edits an
-- ALREADY-existing project, so the ledger row is inserted up front (ON
-- CONFLICT DO NOTHING) and its response is filled in at the end — the exact
-- same pattern 051's save_contractor_schedule_draft/submit_contractor_schedule
-- use, not 052's replay-first design (which was only necessary there because
-- no project_id existed yet at call time).
--
-- Template/WP validation always resolves against the PROJECT'S OWN pinned
-- template_id (immutable since creation — see projectService.js's own
-- "template_id is immutable after creation" comment), never a freshly
-- re-resolved "currently active" template — a project must always be
-- validated against the exact template it was created with, even if a
-- newer template version has since been activated for the company.
--
-- LOCAL_FEATURE_ONLY: same convention as 030-052 — not added to
-- canonical-security-contract.json's canonicalMigrationPath (frozen at 041),
-- applied only via the local cert reset chain.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.update_contractor_managed_project_scope(bigint, jsonb, text[], uuid);

CREATE OR REPLACE FUNCTION public.update_contractor_managed_project_scope(
  p_project_id bigint,
  p_scope jsonb,
  p_scope_wp_ids text[],
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_operation text := 'project.update_contractor_managed_scope';
  v_request public.write_command_requests%ROWTYPE;
  v_project_row public.projects%ROWTYPE;
  v_lifecycle_status text;
  v_template_data jsonb;
  v_valid_wp_ids text[];
  v_next_sort_order integer;
  v_added_count integer;
  v_unarchived_count integer;
  v_archived_count integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'p_project_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_scope_wp_ids IS NULL OR array_length(p_scope_wp_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'EMPTY_SCOPE: at least one active Scope work package is required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_scope_wp_ids) AS wp_id WHERE wp_id IS NULL) THEN
    RAISE EXCEPTION 'INVALID_WORK_PACKAGE: a Scope work package id must not be null' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT wp_id) FROM unnest(p_scope_wp_ids) AS wp_id) <> array_length(p_scope_wp_ids, 1) THEN
    RAISE EXCEPTION 'DUPLICATE_WORK_PACKAGE: each Scope work package may appear only once' USING ERRCODE = '22023';
  END IF;

  -- Idempotency FIRST, ledger row inserted up front (project already
  -- exists) — same pattern save_contractor_schedule_draft/
  -- submit_contractor_schedule (051) already use.
  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES (v_uid, v_operation, p_client_request_id, p_project_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;

  SELECT * INTO v_request
  FROM public.write_command_requests
  WHERE actor_id = v_uid AND operation = v_operation AND client_request_id = p_client_request_id;

  IF v_request.project_id <> p_project_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE = '23505';
  END IF;
  IF v_request.response IS NOT NULL THEN
    RETURN v_request.response || jsonb_build_object('idempotentReplay', true);
  END IF;

  -- Lock + resolve the project row — the ONE serialization boundary shared
  -- with Save Draft/Submit/Request Changes/Approve (all of them lock this
  -- same row before evaluating lifecycle).
  SELECT * INTO v_project_row FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_write_project(p_project_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: caller cannot edit this project' USING ERRCODE = '42501';
  END IF;

  IF v_project_row.schedule_ownership_mode <> 'CONTRACTOR_MANAGED' THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_CONTRACTOR_MANAGED: this command only edits a CONTRACTOR_MANAGED project''s Scope'
      USING ERRCODE = '42501';
  END IF;

  -- Lifecycle lock — identical error codes/messages to 051's
  -- projects_scope_lifecycle_lock trigger (which will also fire on the
  -- UPDATE below as a redundant safety net); checked explicitly here first
  -- so an already-locked project fails fast, before any template/WP
  -- validation or materialization work.
  v_lifecycle_status := public.contractor_schedule_lifecycle_status(p_project_id);
  IF v_lifecycle_status = 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'SCHEDULE_PENDING_REVIEW: Scope cannot be edited while a schedule submission is pending review'
      USING ERRCODE = '55000';
  END IF;
  IF v_lifecycle_status = 'APPROVED' THEN
    RAISE EXCEPTION 'BASELINE_ALREADY_APPROVED: Scope cannot be edited once a baseline is approved'
      USING ERRCODE = '55000';
  END IF;

  -- Template/WP validation against the project's OWN pinned template_id —
  -- never a freshly re-resolved "currently active" template.
  IF v_project_row.template_id IS NULL THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_CONFIGURED: this project has no resolvable scope template' USING ERRCODE = 'P0002';
  END IF;

  SELECT data INTO v_template_data FROM public.templates WHERE id = v_project_row.template_id;
  IF v_template_data IS NULL THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_CONFIGURED: this project''s pinned scope template no longer exists' USING ERRCODE = 'P0002';
  END IF;

  SELECT array_agg(DISTINCT wp->>'id')
    INTO v_valid_wp_ids
  FROM jsonb_array_elements(v_template_data->'zones') AS zone,
       jsonb_array_elements(zone->'categories') AS category,
       jsonb_array_elements(category->'workPackages') AS wp;

  IF EXISTS (
    SELECT 1 FROM unnest(p_scope_wp_ids) AS wp_id
    WHERE v_valid_wp_ids IS NULL OR NOT (wp_id = ANY(v_valid_wp_ids))
  ) THEN
    RAISE EXCEPTION 'WORK_PACKAGE_OUT_OF_TEMPLATE: every Scope work package must belong to the resolved template'
      USING ERRCODE = '22023';
  END IF;

  -- Persist the new Scope. Automatically re-validated by 051's
  -- projects_scope_lifecycle_lock trigger (fires because NEW.scope IS
  -- DISTINCT FROM OLD.scope) — belt-and-braces with the explicit check
  -- above, not a second independent policy.
  UPDATE public.projects SET scope = p_scope WHERE id = p_project_id
  RETURNING * INTO v_project_row;

  -- Materialize the schedule-row delta. Retained WPs (already active AND
  -- still in the new Scope) are matched by none of the three statements
  -- below and are therefore never touched at all — their planned dates
  -- persist exactly as the Contractor last saved them.
  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_next_sort_order
  FROM public.project_gantt_tasks WHERE project_id = p_project_id;

  WITH wp_meta AS (
    SELECT wp->>'id' AS wp_id, wp->>'label' AS wp_label, zone->>'id' AS phase_id, zone->>'label' AS phase_label
    FROM jsonb_array_elements(v_template_data->'zones') AS zone,
         jsonb_array_elements(zone->'categories') AS category,
         jsonb_array_elements(category->'workPackages') AS wp
  ), scoped AS (
    SELECT DISTINCT wp_id FROM unnest(p_scope_wp_ids) AS wp_id
  )
  INSERT INTO public.project_gantt_tasks (
    project_id, wp_id, wp_label, phase_id, phase_label,
    planned_start, planned_end, duration_days, status, is_archived, sort_order
  )
  SELECT p_project_id, m.wp_id, m.wp_label, m.phase_id, m.phase_label,
         NULL, NULL, NULL, 'not_started', false,
         v_next_sort_order + (row_number() OVER (ORDER BY m.wp_id))::int - 1
  FROM scoped s
  JOIN wp_meta m ON m.wp_id = s.wp_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.project_gantt_tasks t WHERE t.project_id = p_project_id AND t.wp_id = s.wp_id
  );
  GET DIAGNOSTICS v_added_count = ROW_COUNT;

  UPDATE public.project_gantt_tasks t
  SET is_archived = false
  WHERE t.project_id = p_project_id
    AND t.is_archived
    AND t.wp_id IN (SELECT wp_id FROM unnest(p_scope_wp_ids) AS wp_id);
  GET DIAGNOSTICS v_unarchived_count = ROW_COUNT;

  UPDATE public.project_gantt_tasks t
  SET is_archived = true
  WHERE t.project_id = p_project_id
    AND NOT t.is_archived
    AND t.wp_id NOT IN (SELECT wp_id FROM unnest(p_scope_wp_ids) AS wp_id);
  GET DIAGNOSTICS v_archived_count = ROW_COUNT;

  v_result := to_jsonb(v_project_row) || jsonb_build_object(
    'addedCount', v_added_count,
    'unarchivedCount', v_unarchived_count,
    'archivedCount', v_archived_count
  );

  UPDATE public.write_command_requests
  SET response = v_result, completed_at = now()
  WHERE id = v_request.id;

  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.update_contractor_managed_project_scope(bigint, jsonb, text[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_contractor_managed_project_scope(bigint, jsonb, text[], uuid) TO authenticated;
