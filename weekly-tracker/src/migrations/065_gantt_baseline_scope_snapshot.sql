-- 065_gantt_baseline_scope_snapshot.sql
-- Roadmap Phase B.9: make every canonical Gantt submission a self-contained,
-- immutable snapshot of its Execution Scope, Schedule Activities, dates and
-- Activity <-> Work Group mapping. Legacy Contractor-Managed projects that do
-- not yet have an Execution Scope retain the pre-065 wp_id snapshot path.

ALTER TABLE public.project_schedule_versions
  ADD COLUMN IF NOT EXISTS execution_scope_version_id bigint
    REFERENCES public.project_execution_scope_versions(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS project_schedule_versions_id_scope_uniq
  ON public.project_schedule_versions(id, execution_scope_version_id);

ALTER TABLE public.project_schedule_version_tasks
  ADD COLUMN IF NOT EXISTS schedule_activity_id uuid,
  ADD COLUMN IF NOT EXISTS activity_title text,
  ADD COLUMN IF NOT EXISTS activity_phase_id text,
  ADD COLUMN IF NOT EXISTS activity_phase_label text;

ALTER TABLE public.project_schedule_version_tasks
  DROP CONSTRAINT IF EXISTS project_schedule_version_tasks_activity_snapshot_check;
ALTER TABLE public.project_schedule_version_tasks
  ADD CONSTRAINT project_schedule_version_tasks_activity_snapshot_check
  CHECK (
    (schedule_activity_id IS NULL AND activity_title IS NULL)
    OR
    (schedule_activity_id IS NOT NULL AND NULLIF(btrim(activity_title), '') IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS project_schedule_version_tasks_version_activity_uniq
  ON public.project_schedule_version_tasks(version_id, schedule_activity_id);

CREATE TABLE IF NOT EXISTS public.project_schedule_version_activity_work_groups (
  version_id bigint NOT NULL,
  schedule_activity_id uuid NOT NULL,
  execution_scope_version_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  work_group_id uuid NOT NULL,
  PRIMARY KEY (version_id, schedule_activity_id, work_group_id),
  FOREIGN KEY (version_id, schedule_activity_id)
    REFERENCES public.project_schedule_version_tasks(version_id, schedule_activity_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (version_id, execution_scope_version_id)
    REFERENCES public.project_schedule_versions(id, execution_scope_version_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (execution_scope_version_id, ontology_version_id, work_group_id)
    REFERENCES public.project_execution_scope_items(
      execution_scope_version_id,
      ontology_version_id,
      work_group_id
    )
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS project_schedule_version_activity_work_groups_version_idx
  ON public.project_schedule_version_activity_work_groups(version_id);

CREATE OR REPLACE FUNCTION private.prevent_schedule_scope_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'SCHEDULE_SCOPE_SNAPSHOT_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS project_schedule_versions_scope_snapshot_immutable
  ON public.project_schedule_versions;
CREATE TRIGGER project_schedule_versions_scope_snapshot_immutable
  BEFORE UPDATE OF execution_scope_version_id ON public.project_schedule_versions
  FOR EACH ROW
  WHEN (OLD.execution_scope_version_id IS DISTINCT FROM NEW.execution_scope_version_id)
  EXECUTE FUNCTION private.prevent_schedule_scope_snapshot_mutation();

DROP TRIGGER IF EXISTS project_schedule_version_activity_work_groups_immutable
  ON public.project_schedule_version_activity_work_groups;
CREATE TRIGGER project_schedule_version_activity_work_groups_immutable
  BEFORE UPDATE OR DELETE ON public.project_schedule_version_activity_work_groups
  FOR EACH ROW EXECUTE FUNCTION private.prevent_schedule_scope_snapshot_mutation();

REVOKE ALL ON FUNCTION private.prevent_schedule_scope_snapshot_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.project_schedule_version_activity_work_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_schedule_version_activity_work_groups_select"
  ON public.project_schedule_version_activity_work_groups;
CREATE POLICY "project_schedule_version_activity_work_groups_select"
  ON public.project_schedule_version_activity_work_groups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_schedule_versions version
      WHERE version.id = project_schedule_version_activity_work_groups.version_id
        AND public.can_access_schedule_submissions(version.project_id)
    )
  );

REVOKE ALL ON TABLE public.project_schedule_version_activity_work_groups
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_schedule_version_activity_work_groups
  TO authenticated;

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
  v_execution_scope_version_id bigint;
  v_ontology_version_id uuid;
  v_execution_scope_work_group_count integer;
  v_snapshot_work_group_count integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES (v_uid, 'schedule.submit', p_client_request_id, p_project_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;

  SELECT * INTO v_request
  FROM public.write_command_requests
  WHERE actor_id = v_uid
    AND operation = 'schedule.submit'
    AND client_request_id = p_client_request_id;

  IF v_request.project_id <> p_project_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE = '23505';
  END IF;
  IF v_request.response IS NOT NULL THEN
    RETURN v_request.response || jsonb_build_object('idempotentReplay', true);
  END IF;

  SELECT schedule_ownership_mode, template_id
    INTO v_schedule_mode, v_template_id
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id USING ERRCODE = 'P0002';
  END IF;

  SELECT lower(role), COALESCE(assigned_projects, '{}'::integer[])
    INTO v_role, v_assigned_projects
  FROM public.profiles
  WHERE id = v_uid;

  IF v_role IS DISTINCT FROM 'contractor'
    OR NOT (p_project_id = ANY(v_assigned_projects::bigint[])) THEN
    RAISE EXCEPTION 'Not authorized for this project schedule' USING ERRCODE = '42501';
  END IF;

  IF v_schedule_mode <> 'CONTRACTOR_MANAGED' THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_CONTRACTOR_MANAGED: project schedule is not contractor-managed'
      USING ERRCODE = '42501';
  END IF;

  v_lifecycle_status := public.contractor_schedule_lifecycle_status(p_project_id);
  IF v_lifecycle_status = 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'SCHEDULE_PENDING_REVIEW: a schedule submission is already pending review'
      USING ERRCODE = '55000';
  END IF;
  IF v_lifecycle_status = 'APPROVED' THEN
    RAISE EXCEPTION 'BASELINE_ALREADY_APPROVED: an approved baseline already exists for this project'
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO v_scope_count
  FROM public.project_gantt_tasks
  WHERE project_id = p_project_id AND NOT COALESCE(is_archived, false);

  IF v_scope_count = 0 THEN
    RAISE EXCEPTION 'EMPTY_SCOPE: no active Scope work packages exist for this project'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_incomplete_count
  FROM public.project_gantt_tasks
  WHERE project_id = p_project_id
    AND NOT COALESCE(is_archived, false)
    AND (planned_start IS NULL OR planned_end IS NULL OR duration_days IS NULL);

  IF v_incomplete_count > 0 THEN
    RAISE EXCEPTION 'SCHEDULE_INCOMPLETE: % of % active work packages are missing Start/Finish',
      v_incomplete_count, v_scope_count USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.project_gantt_tasks
    WHERE project_id = p_project_id
      AND NOT COALESCE(is_archived, false)
      AND planned_start > planned_end
  ) THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE_DATES: one or more work packages have Start after Finish'
      USING ERRCODE = '22023';
  END IF;

  SELECT scope.id, scope.ontology_version_id
    INTO v_execution_scope_version_id, v_ontology_version_id
  FROM public.project_execution_scope_versions scope
  WHERE scope.project_id = p_project_id
  ORDER BY scope.revision_number DESC
  LIMIT 1;

  -- Canonical projects must submit the current complete Activity model. A
  -- partially linked or stale Gantt is never silently accepted as baseline.
  IF v_execution_scope_version_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.project_gantt_tasks task
      LEFT JOIN public.project_schedule_activities activity
        ON activity.id = task.schedule_activity_id
       AND activity.project_id = task.project_id
       AND activity.execution_scope_version_id = v_execution_scope_version_id
       AND NOT activity.is_archived
      WHERE task.project_id = p_project_id
        AND NOT COALESCE(task.is_archived, false)
        AND activity.id IS NULL
    ) THEN
      RAISE EXCEPTION 'SCHEDULE_SETUP_STALE: every active Gantt row must reference an active Schedule Activity in the current Execution Scope'
        USING ERRCODE = '55000';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.project_schedule_activities activity
      LEFT JOIN public.project_gantt_tasks task
        ON task.project_id = activity.project_id
       AND task.schedule_activity_id = activity.id
       AND NOT COALESCE(task.is_archived, false)
      WHERE activity.project_id = p_project_id
        AND activity.execution_scope_version_id = v_execution_scope_version_id
        AND NOT activity.is_archived
        AND task.id IS NULL
    ) THEN
      RAISE EXCEPTION 'SCHEDULE_SETUP_INCOMPLETE: every active Schedule Activity must have one active Gantt row'
        USING ERRCODE = '55000';
    END IF;

    SELECT count(*) INTO v_execution_scope_work_group_count
    FROM public.project_execution_scope_items item
    WHERE item.execution_scope_version_id = v_execution_scope_version_id;

    SELECT count(DISTINCT mapping.work_group_id) INTO v_snapshot_work_group_count
    FROM public.project_schedule_activity_work_groups mapping
    JOIN public.project_schedule_activities activity
      ON activity.id = mapping.activity_id
     AND activity.project_id = mapping.project_id
     AND NOT activity.is_archived
    WHERE mapping.project_id = p_project_id
      AND mapping.execution_scope_version_id = v_execution_scope_version_id;

    IF v_snapshot_work_group_count IS DISTINCT FROM v_execution_scope_work_group_count THEN
      RAISE EXCEPTION 'INCOMPLETE_EXECUTION_SCOPE_COVERAGE: Schedule Activities do not cover the current Execution Scope'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT COALESCE(max(submission_number), 0) + 1 INTO v_submission_number
  FROM public.project_schedule_versions
  WHERE project_id = p_project_id;

  INSERT INTO public.project_schedule_versions (
    project_id, submission_number, status, template_id,
    submitted_by, submitted_at, contractor_comment, submit_client_request_id,
    execution_scope_version_id
  ) VALUES (
    p_project_id, v_submission_number, 'PENDING_REVIEW', v_template_id,
    v_uid, now(), NULLIF(p_contractor_comment, ''), p_client_request_id,
    v_execution_scope_version_id
  )
  RETURNING id INTO v_version_id;

  IF v_execution_scope_version_id IS NULL THEN
    INSERT INTO public.project_schedule_version_tasks (
      version_id, wp_id, planned_start, planned_end, duration_days
    )
    SELECT v_version_id, wp_id, planned_start, planned_end, duration_days
    FROM public.project_gantt_tasks
    WHERE project_id = p_project_id AND NOT COALESCE(is_archived, false);
  ELSE
    INSERT INTO public.project_schedule_version_tasks (
      version_id, wp_id, planned_start, planned_end, duration_days,
      schedule_activity_id, activity_title, activity_phase_id,
      activity_phase_label
    )
    SELECT
      v_version_id,
      task.wp_id,
      task.planned_start,
      task.planned_end,
      task.duration_days,
      activity.id,
      activity.title,
      task.phase_id,
      task.phase_label
    FROM public.project_gantt_tasks task
    JOIN public.project_schedule_activities activity
      ON activity.id = task.schedule_activity_id
     AND activity.project_id = task.project_id
     AND activity.execution_scope_version_id = v_execution_scope_version_id
     AND NOT activity.is_archived
    WHERE task.project_id = p_project_id AND NOT COALESCE(task.is_archived, false);

    INSERT INTO public.project_schedule_version_activity_work_groups (
      version_id, schedule_activity_id, execution_scope_version_id,
      ontology_version_id, work_group_id
    )
    SELECT
      v_version_id,
      mapping.activity_id,
      mapping.execution_scope_version_id,
      mapping.ontology_version_id,
      mapping.work_group_id
    FROM public.project_schedule_activity_work_groups mapping
    JOIN public.project_schedule_activities activity
      ON activity.id = mapping.activity_id
     AND activity.project_id = mapping.project_id
     AND activity.execution_scope_version_id = mapping.execution_scope_version_id
     AND NOT activity.is_archived
    WHERE mapping.project_id = p_project_id
      AND mapping.execution_scope_version_id = v_execution_scope_version_id;
  END IF;

  v_result := jsonb_build_object(
    'submissionId', v_version_id,
    'projectId', p_project_id,
    'submissionNumber', v_submission_number,
    'status', 'PENDING_REVIEW',
    'scheduledCount', v_scope_count,
    'executionScopeVersionId', v_execution_scope_version_id
  );

  UPDATE public.write_command_requests
  SET response = v_result, completed_at = now()
  WHERE id = v_request.id;

  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contractor_schedule(bigint, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_contractor_schedule(bigint, uuid, text)
  TO authenticated;
