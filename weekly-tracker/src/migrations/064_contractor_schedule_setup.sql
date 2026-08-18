-- Phase B.8: Contractor Schedule Setup over canonical Execution Scope.
-- One Work Group may feed many Contractor activities; one activity may cover
-- many Work Groups. This is Draft setup only and does not invent dates.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS project_execution_scope_items_version_ontology_work_group_uniq
  ON public.project_execution_scope_items(
    execution_scope_version_id,
    ontology_version_id,
    work_group_id
  );

CREATE TABLE IF NOT EXISTS public.project_schedule_activities (
  id uuid PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  execution_scope_version_id bigint NOT NULL
    REFERENCES public.project_execution_scope_versions(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (btrim(title) <> ''),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, project_id)
);

CREATE INDEX IF NOT EXISTS project_schedule_activities_project_sort_idx
  ON public.project_schedule_activities(project_id, is_archived, sort_order);

CREATE TABLE IF NOT EXISTS public.project_schedule_activity_work_groups (
  activity_id uuid NOT NULL,
  project_id bigint NOT NULL,
  execution_scope_version_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  work_group_id uuid NOT NULL,
  PRIMARY KEY (activity_id, work_group_id),
  FOREIGN KEY (activity_id, project_id)
    REFERENCES public.project_schedule_activities(id, project_id)
    ON DELETE CASCADE,
  FOREIGN KEY (execution_scope_version_id, ontology_version_id, work_group_id)
    REFERENCES public.project_execution_scope_items(
      execution_scope_version_id,
      ontology_version_id,
      work_group_id
    ) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS project_schedule_activity_work_groups_scope_idx
  ON public.project_schedule_activity_work_groups(execution_scope_version_id, work_group_id);
CREATE INDEX IF NOT EXISTS project_schedule_activity_work_groups_project_idx
  ON public.project_schedule_activity_work_groups(project_id);

ALTER TABLE public.project_gantt_tasks
  ADD COLUMN IF NOT EXISTS schedule_activity_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_gantt_tasks_schedule_activity_project_fkey'
      AND conrelid = 'public.project_gantt_tasks'::regclass
  ) THEN
    ALTER TABLE public.project_gantt_tasks
      ADD CONSTRAINT project_gantt_tasks_schedule_activity_project_fkey
      FOREIGN KEY (schedule_activity_id, project_id)
      REFERENCES public.project_schedule_activities(id, project_id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION private.prevent_direct_schedule_activity_link_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF current_user <> 'postgres'
    AND NEW.schedule_activity_id IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.schedule_activity_id IS DISTINCT FROM OLD.schedule_activity_id) THEN
    RAISE EXCEPTION 'SCHEDULE_ACTIVITY_LINK_REQUIRES_ATOMIC_COMMAND'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_gantt_tasks_protect_schedule_activity_link
  ON public.project_gantt_tasks;
CREATE TRIGGER project_gantt_tasks_protect_schedule_activity_link
  BEFORE INSERT OR UPDATE OF schedule_activity_id ON public.project_gantt_tasks
  FOR EACH ROW EXECUTE FUNCTION private.prevent_direct_schedule_activity_link_change();

REVOKE ALL ON FUNCTION private.prevent_direct_schedule_activity_link_change()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_contractor_schedule_setup(
  p_project_id bigint,
  p_execution_scope_version_id bigint,
  p_activities jsonb,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_assigned_projects integer[] := '{}'::integer[];
  v_schedule_mode text;
  v_lifecycle_status text;
  v_current_scope_id bigint;
  v_ontology_version_id uuid;
  v_request public.write_command_requests%ROWTYPE;
  v_active_count integer;
  v_archived_count integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_activities IS NULL OR jsonb_typeof(p_activities) <> 'array'
    OR jsonb_array_length(p_activities) = 0 THEN
    RAISE EXCEPTION 'EMPTY_SCHEDULE_SETUP: activities must be a non-empty array'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(role), COALESCE(assigned_projects, '{}'::integer[])
    INTO v_role, v_assigned_projects
  FROM public.profiles
  WHERE id = v_uid;

  SELECT schedule_ownership_mode
    INTO v_schedule_mode
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_role IS DISTINCT FROM 'contractor'
    OR NOT (p_project_id = ANY(v_assigned_projects::bigint[])) THEN
    RAISE EXCEPTION 'Not authorized for this project schedule' USING ERRCODE = '42501';
  END IF;
  IF v_schedule_mode <> 'CONTRACTOR_MANAGED' THEN
    RAISE EXCEPTION 'SCHEDULE_NOT_CONTRACTOR_MANAGED: project schedule is not contractor-managed'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES (v_uid, 'schedule.save_setup', p_client_request_id, p_project_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;

  SELECT * INTO v_request
  FROM public.write_command_requests
  WHERE actor_id = v_uid
    AND operation = 'schedule.save_setup'
    AND client_request_id = p_client_request_id;

  IF v_request.project_id <> p_project_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE = '23505';
  END IF;
  IF v_request.response IS NOT NULL THEN
    RETURN v_request.response || jsonb_build_object('idempotentReplay', true);
  END IF;

  v_lifecycle_status := public.contractor_schedule_lifecycle_status(p_project_id);
  IF v_lifecycle_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'SCHEDULE_SETUP_LOCKED: schedule setup is locked outside Draft'
      USING ERRCODE = '55000';
  END IF;

  SELECT scope.id, scope.ontology_version_id
    INTO v_current_scope_id, v_ontology_version_id
  FROM public.project_execution_scope_versions scope
  WHERE scope.project_id = p_project_id
  ORDER BY scope.revision_number DESC
  LIMIT 1;

  IF v_current_scope_id IS NULL
    OR p_execution_scope_version_id IS DISTINCT FROM v_current_scope_id THEN
    RAISE EXCEPTION 'STALE_EXECUTION_SCOPE: reload the current Execution Scope'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_activities) item
    WHERE jsonb_typeof(item) <> 'object'
      OR COALESCE(item->>'activityId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR btrim(COALESCE(item->>'title', '')) = ''
      OR jsonb_typeof(item->'workGroupIds') IS DISTINCT FROM 'array'
      OR jsonb_array_length(item->'workGroupIds') = 0
      OR COALESCE(item->>'sortOrder', '') !~ '^[0-9]+$'
  ) THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE_ACTIVITY: every activity requires UUID, title, order, and Work Groups'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_activities) item
    GROUP BY item->>'activityId'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_SCHEDULE_ACTIVITY: activity IDs must be unique'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_activities) item
      CROSS JOIN LATERAL jsonb_array_elements_text(item->'workGroupIds') work_group(value)
      GROUP BY item->>'activityId', work_group.value
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_ACTIVITY_WORK_GROUP: Work Groups must be unique per activity'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_activities) item
      CROSS JOIN LATERAL jsonb_array_elements_text(item->'workGroupIds') work_group(value)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.project_execution_scope_items scope_item
        WHERE scope_item.execution_scope_version_id = v_current_scope_id
          AND scope_item.work_group_id = work_group.value::uuid
      )
    ) THEN
      RAISE EXCEPTION 'WORK_GROUP_OUT_OF_EXECUTION_SCOPE: every Work Group must belong to the current scope'
        USING ERRCODE = '22023';
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE_ACTIVITY: every Work Group ID must be a UUID'
      USING ERRCODE = '22023';
  END;

  IF EXISTS (
    SELECT 1
    FROM public.project_execution_scope_items scope_item
    WHERE scope_item.execution_scope_version_id = v_current_scope_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_activities) item
        CROSS JOIN LATERAL jsonb_array_elements_text(item->'workGroupIds') work_group(value)
        WHERE work_group.value::uuid = scope_item.work_group_id
      )
  ) THEN
    RAISE EXCEPTION 'INCOMPLETE_EXECUTION_SCOPE_COVERAGE: every Work Group requires an activity'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_schedule_activities activity
    JOIN jsonb_array_elements(p_activities) item
      ON activity.id = (item->>'activityId')::uuid
    WHERE activity.project_id <> p_project_id
  ) THEN
    RAISE EXCEPTION 'SCHEDULE_ACTIVITY_ID_CONFLICT: activity belongs to another project'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.project_schedule_activities (
    id, project_id, execution_scope_version_id, title, sort_order,
    is_archived, created_by, updated_at
  )
  SELECT
    (item->>'activityId')::uuid,
    p_project_id,
    v_current_scope_id,
    btrim(item->>'title'),
    (item->>'sortOrder')::integer,
    false,
    v_uid,
    now()
  FROM jsonb_array_elements(p_activities) item
  ON CONFLICT (id) DO UPDATE SET
    execution_scope_version_id = EXCLUDED.execution_scope_version_id,
    title = EXCLUDED.title,
    sort_order = EXCLUDED.sort_order,
    is_archived = false,
    updated_at = now();

  UPDATE public.project_schedule_activities activity
  SET is_archived = true, updated_at = now()
  WHERE activity.project_id = p_project_id
    AND NOT activity.is_archived
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_activities) item
      WHERE (item->>'activityId')::uuid = activity.id
    );
  GET DIAGNOSTICS v_archived_count = ROW_COUNT;

  DELETE FROM public.project_schedule_activity_work_groups link
  WHERE link.project_id = p_project_id
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_activities) item
      WHERE (item->>'activityId')::uuid = link.activity_id
    );

  INSERT INTO public.project_schedule_activity_work_groups (
    activity_id, project_id, execution_scope_version_id,
    ontology_version_id, work_group_id
  )
  SELECT
    (item->>'activityId')::uuid,
    p_project_id,
    v_current_scope_id,
    v_ontology_version_id,
    work_group.value::uuid
  FROM jsonb_array_elements(p_activities) item
  CROSS JOIN LATERAL jsonb_array_elements_text(item->'workGroupIds') work_group(value);

  -- Ontology-pinned projects switch from legacy template rows to explicitly
  -- contractor-owned activities only when Setup is saved. Historical projects
  -- never reach this command because they have no Execution Scope snapshot.
  UPDATE public.project_gantt_tasks task
  SET is_archived = true, updated_at = now()
  WHERE task.project_id = p_project_id
    AND task.schedule_activity_id IS NULL
    AND NOT COALESCE(task.is_archived, false);

  UPDATE public.project_gantt_tasks task
  SET is_archived = true, updated_at = now()
  WHERE task.project_id = p_project_id
    AND task.schedule_activity_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_activities) item
      WHERE (item->>'activityId')::uuid = task.schedule_activity_id
    );

  INSERT INTO public.project_gantt_tasks (
    project_id, wp_id, wp_label, phase_id, phase_label,
    schedule_activity_id, sort_order, is_archived, updated_at
  )
  SELECT
    p_project_id,
    'activity:' || (item->>'activityId'),
    btrim(item->>'title'),
    CASE WHEN count(DISTINCT scope_item.discipline_id) = 1
      THEN 'discipline:' || min(scope_item.discipline_id::text)
      ELSE 'cross_discipline'
    END,
    CASE WHEN count(DISTINCT scope_item.discipline_id) = 1
      THEN min(discipline.label)
      ELSE 'Cross-discipline'
    END,
    (item->>'activityId')::uuid,
    (item->>'sortOrder')::integer,
    false,
    now()
  FROM jsonb_array_elements(p_activities) item
  CROSS JOIN LATERAL jsonb_array_elements_text(item->'workGroupIds') work_group(value)
  JOIN public.project_execution_scope_items scope_item
    ON scope_item.execution_scope_version_id = v_current_scope_id
    AND scope_item.work_group_id = work_group.value::uuid
  JOIN public.work_ontology_disciplines discipline
    ON discipline.ontology_version_id = v_ontology_version_id
    AND discipline.id = scope_item.discipline_id
  GROUP BY item
  ON CONFLICT (project_id, wp_id) DO UPDATE SET
    wp_label = EXCLUDED.wp_label,
    phase_id = EXCLUDED.phase_id,
    phase_label = EXCLUDED.phase_label,
    schedule_activity_id = EXCLUDED.schedule_activity_id,
    sort_order = EXCLUDED.sort_order,
    is_archived = false,
    updated_at = now();

  SELECT count(*) INTO v_active_count
  FROM public.project_schedule_activities
  WHERE project_id = p_project_id AND NOT is_archived;

  v_result := jsonb_build_object(
    'projectId', p_project_id,
    'executionScopeVersionId', v_current_scope_id,
    'activityCount', v_active_count,
    'archivedCount', v_archived_count
  );

  UPDATE public.write_command_requests
  SET response = v_result, completed_at = now()
  WHERE id = v_request.id;

  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

ALTER TABLE public.project_schedule_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_schedule_activity_work_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_schedule_activities_select
  ON public.project_schedule_activities;
CREATE POLICY project_schedule_activities_select
  ON public.project_schedule_activities FOR SELECT TO authenticated
  USING (public.can_access_project(project_id));

DROP POLICY IF EXISTS project_schedule_activity_work_groups_select
  ON public.project_schedule_activity_work_groups;
CREATE POLICY project_schedule_activity_work_groups_select
  ON public.project_schedule_activity_work_groups FOR SELECT TO authenticated
  USING (public.can_access_project(project_id));

REVOKE ALL ON TABLE public.project_schedule_activities
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.project_schedule_activity_work_groups
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_schedule_activities TO authenticated;
GRANT SELECT ON TABLE public.project_schedule_activity_work_groups TO authenticated;

REVOKE ALL ON FUNCTION public.save_contractor_schedule_setup(bigint, bigint, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_contractor_schedule_setup(bigint, bigint, jsonb, uuid)
  TO authenticated;

COMMIT;
