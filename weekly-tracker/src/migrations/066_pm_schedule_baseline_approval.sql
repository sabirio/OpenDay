-- 066_pm_schedule_baseline_approval.sql
-- Roadmap Phase B.10: PM approval creates an explicit, immutable official
-- baseline reference after validating the complete submitted Scope snapshot.

CREATE UNIQUE INDEX IF NOT EXISTS project_schedule_versions_id_project_uniq
  ON public.project_schedule_versions(id, project_id);

CREATE TABLE IF NOT EXISTS public.project_schedule_baselines (
  id bigserial PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  schedule_version_id bigint NOT NULL UNIQUE,
  baseline_revision_number integer NOT NULL CHECK (baseline_revision_number > 0),
  execution_scope_version_id bigint,
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT now(),
  pm_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, baseline_revision_number),
  FOREIGN KEY (schedule_version_id, project_id)
    REFERENCES public.project_schedule_versions(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (schedule_version_id, execution_scope_version_id)
    REFERENCES public.project_schedule_versions(id, execution_scope_version_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS project_schedule_baselines_project_idx
  ON public.project_schedule_baselines(project_id, baseline_revision_number DESC);

-- Preserve pre-066 approvals as official references without changing their
-- submitted or reviewed state. Canonical 065 rows carry their Scope pin;
-- older legacy rows remain explicitly scope-less.
INSERT INTO public.project_schedule_baselines (
  project_id, schedule_version_id, baseline_revision_number,
  execution_scope_version_id, approved_by, approved_at, pm_comment
)
SELECT
  version.project_id,
  version.id,
  version.baseline_revision_number,
  version.execution_scope_version_id,
  version.reviewed_by,
  version.reviewed_at,
  version.pm_comment
FROM public.project_schedule_versions version
WHERE version.status = 'APPROVED'
  AND version.baseline_revision_number IS NOT NULL
  AND version.reviewed_by IS NOT NULL
  AND version.reviewed_at IS NOT NULL
ON CONFLICT (schedule_version_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.prevent_schedule_baseline_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'SCHEDULE_BASELINE_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS project_schedule_baselines_immutable
  ON public.project_schedule_baselines;
CREATE TRIGGER project_schedule_baselines_immutable
  BEFORE UPDATE OR DELETE ON public.project_schedule_baselines
  FOR EACH ROW EXECUTE FUNCTION private.prevent_schedule_baseline_mutation();

REVOKE ALL ON FUNCTION private.prevent_schedule_baseline_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.project_schedule_baselines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_schedule_baselines_select"
  ON public.project_schedule_baselines;
CREATE POLICY "project_schedule_baselines_select"
  ON public.project_schedule_baselines
  FOR SELECT TO authenticated
  USING (public.can_access_schedule_submissions(project_id));

REVOKE ALL ON TABLE public.project_schedule_baselines
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_schedule_baselines TO authenticated;
REVOKE ALL ON SEQUENCE public.project_schedule_baselines_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

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
  v_task_count integer;
  v_activity_count integer := 0;
  v_scope_work_group_count integer := 0;
  v_snapshot_work_group_count integer := 0;
  v_baseline_id bigint;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = v_uid;

  SELECT * INTO v_version
  FROM public.project_schedule_versions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_role IS DISTINCT FROM 'pm'
    OR NOT public.can_write_project(v_version.project_id) THEN
    RAISE EXCEPTION 'Not authorized for this project schedule' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.write_command_requests(
    actor_id, operation, client_request_id, project_id, source_record_id
  ) VALUES (
    v_uid, 'schedule.approve', p_client_request_id,
    v_version.project_id, p_submission_id
  )
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;

  SELECT * INTO v_request
  FROM public.write_command_requests
  WHERE actor_id = v_uid
    AND operation = 'schedule.approve'
    AND client_request_id = p_client_request_id;

  IF v_request.source_record_id IS DISTINCT FROM p_submission_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another submission' USING ERRCODE = '23505';
  END IF;
  IF v_request.response IS NOT NULL THEN
    RETURN v_request.response || jsonb_build_object('idempotentReplay', true);
  END IF;

  IF v_version.status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'SUBMISSION_NOT_PENDING: this submission is not awaiting review'
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO v_task_count
  FROM public.project_schedule_version_tasks task
  WHERE task.version_id = p_submission_id;

  IF v_task_count = 0 THEN
    RAISE EXCEPTION 'BASELINE_SNAPSHOT_INCOMPLETE: submission has no immutable schedule rows'
      USING ERRCODE = '55000';
  END IF;

  IF v_version.execution_scope_version_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.project_execution_scope_versions scope
      WHERE scope.id = v_version.execution_scope_version_id
        AND scope.project_id = v_version.project_id
    ) THEN
      RAISE EXCEPTION 'BASELINE_SCOPE_INVALID: pinned Execution Scope does not belong to this project'
        USING ERRCODE = '55000';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.project_schedule_version_tasks task
      WHERE task.version_id = p_submission_id
        AND (
          task.schedule_activity_id IS NULL
          OR NULLIF(btrim(task.activity_title), '') IS NULL
          OR NULLIF(btrim(task.activity_phase_id), '') IS NULL
          OR NULLIF(btrim(task.activity_phase_label), '') IS NULL
        )
    ) THEN
      RAISE EXCEPTION 'BASELINE_ACTIVITY_SNAPSHOT_INCOMPLETE: canonical Activities require frozen identity, title and phase'
        USING ERRCODE = '55000';
    END IF;

    SELECT count(DISTINCT task.schedule_activity_id) INTO v_activity_count
    FROM public.project_schedule_version_tasks task
    WHERE task.version_id = p_submission_id;

    IF v_activity_count IS DISTINCT FROM v_task_count THEN
      RAISE EXCEPTION 'BASELINE_ACTIVITY_SNAPSHOT_INVALID: every schedule row requires one unique Activity UUID'
        USING ERRCODE = '55000';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.project_schedule_version_tasks task
      WHERE task.version_id = p_submission_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.project_schedule_version_activity_work_groups mapping
          WHERE mapping.version_id = task.version_id
            AND mapping.schedule_activity_id = task.schedule_activity_id
        )
    ) THEN
      RAISE EXCEPTION 'BASELINE_WORK_GROUP_SNAPSHOT_INCOMPLETE: every Activity requires at least one Work Group'
        USING ERRCODE = '55000';
    END IF;

    SELECT count(*) INTO v_scope_work_group_count
    FROM public.project_execution_scope_items item
    WHERE item.execution_scope_version_id = v_version.execution_scope_version_id;

    SELECT count(DISTINCT mapping.work_group_id) INTO v_snapshot_work_group_count
    FROM public.project_schedule_version_activity_work_groups mapping
    WHERE mapping.version_id = p_submission_id
      AND mapping.execution_scope_version_id = v_version.execution_scope_version_id;

    IF v_scope_work_group_count = 0
      OR v_snapshot_work_group_count IS DISTINCT FROM v_scope_work_group_count THEN
      RAISE EXCEPTION 'BASELINE_SCOPE_COVERAGE_INCOMPLETE: submitted Activities must cover the pinned Execution Scope'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.project_schedule_baselines baseline
    WHERE baseline.project_id = v_version.project_id
  ) THEN
    RAISE EXCEPTION 'BASELINE_ALREADY_APPROVED: an official baseline already exists for this project'
      USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(max(baseline_revision_number), 0) + 1 INTO v_next_revision
  FROM public.project_schedule_baselines
  WHERE project_id = v_version.project_id;

  UPDATE public.project_schedule_versions
  SET status = 'APPROVED',
      reviewed_by = v_uid,
      reviewed_at = now(),
      pm_comment = NULLIF(p_comment, ''),
      baseline_revision_number = v_next_revision
  WHERE id = p_submission_id;

  INSERT INTO public.project_schedule_baselines (
    project_id, schedule_version_id, baseline_revision_number,
    execution_scope_version_id, approved_by, approved_at, pm_comment
  )
  SELECT
    version.project_id,
    version.id,
    version.baseline_revision_number,
    version.execution_scope_version_id,
    version.reviewed_by,
    version.reviewed_at,
    version.pm_comment
  FROM public.project_schedule_versions version
  WHERE version.id = p_submission_id
  RETURNING id INTO v_baseline_id;

  v_result := jsonb_build_object(
    'baselineId', v_baseline_id,
    'submissionId', p_submission_id,
    'projectId', v_version.project_id,
    'status', 'APPROVED',
    'baselineRevisionNumber', v_next_revision,
    'executionScopeVersionId', v_version.execution_scope_version_id,
    'activityCount', CASE WHEN v_version.execution_scope_version_id IS NULL THEN NULL ELSE v_activity_count END,
    'workGroupCount', CASE WHEN v_version.execution_scope_version_id IS NULL THEN NULL ELSE v_snapshot_work_group_count END
  );

  UPDATE public.write_command_requests
  SET response = v_result, completed_at = now()
  WHERE id = v_request.id;

  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_schedule_submission(bigint, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_schedule_submission(bigint, text, uuid)
  TO authenticated;
