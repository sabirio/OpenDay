-- 137_server_owned_project_budget_lifecycle.sql
-- Project completion and Budget submission are commands, not client-selected
-- status strings.

BEGIN;

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.projects WHERE project_status IS NULL OR project_status NOT IN ('Active', 'Completed')) THEN
    RAISE EXCEPTION 'PROJECT_STATUS_VALUES_REQUIRE_REPAIR';
  END IF;
END;
$$;

ALTER TABLE public.projects ALTER COLUMN project_status SET DEFAULT 'Active';
ALTER TABLE public.projects ALTER COLUMN project_status SET NOT NULL;
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_contract_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_contract_check
  CHECK(project_status IN ('Active', 'Completed'));

-- Migration 134 already converted authenticated writes to column privileges.
-- Remove lifecycle status from that allow-list; creation now uses the default.
REVOKE INSERT(project_status), UPDATE(project_status) ON public.projects FROM authenticated;

CREATE TABLE IF NOT EXISTS public.project_lifecycle_events(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK(event_type IN ('COMPLETED_FROM_SEALED_HISTORY')),
  from_status text NOT NULL CHECK(from_status IN ('Active', 'Completed')),
  to_status text NOT NULL CHECK(to_status IN ('Active', 'Completed')),
  source_record_id uuid NOT NULL REFERENCES public.historical_project_records(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, event_type)
);

CREATE OR REPLACE FUNCTION private.prevent_project_lifecycle_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'PROJECT_LIFECYCLE_EVENT_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS project_lifecycle_events_immutable ON public.project_lifecycle_events;
CREATE TRIGGER project_lifecycle_events_immutable
  BEFORE UPDATE OR DELETE ON public.project_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_project_lifecycle_event_mutation();

CREATE OR REPLACE FUNCTION private.guard_project_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.project_status IS DISTINCT FROM OLD.project_status
    AND current_setting('openday.project_status_transition', true) IS DISTINCT FROM 'HISTORY_SEALED' THEN
    RAISE EXCEPTION 'PROJECT_STATUS_REQUIRES_LIFECYCLE_COMMAND' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS projects_status_transition_guard ON public.projects;
CREATE TRIGGER projects_status_transition_guard
  BEFORE UPDATE OF project_status ON public.projects
  FOR EACH ROW EXECUTE FUNCTION private.guard_project_status_transition();

CREATE OR REPLACE FUNCTION private.complete_project_from_historical_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_status text;
BEGIN
  SELECT project_status INTO v_from_status FROM public.projects WHERE id = NEW.project_id FOR UPDATE;
  PERFORM set_config('openday.project_status_transition', 'HISTORY_SEALED', true);
  UPDATE public.projects SET project_status = 'Completed' WHERE id = NEW.project_id;
  NEW.payload := jsonb_set(NEW.payload, '{project,project_status}', to_jsonb('Completed'::text), true);
  INSERT INTO public.project_lifecycle_events(
    project_id, event_type, from_status, to_status, source_record_id, actor_id
  ) VALUES(
    NEW.project_id, 'COMPLETED_FROM_SEALED_HISTORY', v_from_status, 'Completed', NEW.id, NEW.sealed_by
  ) ON CONFLICT(project_id, event_type) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS historical_record_complete_project ON public.historical_project_records;
CREATE TRIGGER historical_record_complete_project
  BEFORE INSERT ON public.historical_project_records
  FOR EACH ROW EXECUTE FUNCTION private.complete_project_from_historical_record();

DO $$
DECLARE
  v_record record;
BEGIN
  FOR v_record IN SELECT id, project_id, sealed_by FROM public.historical_project_records LOOP
    PERFORM set_config('openday.project_status_transition', 'HISTORY_SEALED', true);
    UPDATE public.projects SET project_status = 'Completed' WHERE id = v_record.project_id;
    INSERT INTO public.project_lifecycle_events(
      project_id, event_type, from_status, to_status, source_record_id, actor_id
    ) VALUES(
      v_record.project_id, 'COMPLETED_FROM_SEALED_HISTORY', 'Active', 'Completed', v_record.id, v_record.sealed_by
    ) ON CONFLICT(project_id, event_type) DO NOTHING;
  END LOOP;
END;
$$;

ALTER TABLE public.project_lifecycle_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_lifecycle_events_read ON public.project_lifecycle_events;
CREATE POLICY project_lifecycle_events_read ON public.project_lifecycle_events
  FOR SELECT TO authenticated USING(public.can_access_project(project_id));
REVOKE ALL ON TABLE public.project_lifecycle_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_lifecycle_events TO authenticated;
REVOKE ALL ON FUNCTION private.prevent_project_lifecycle_event_mutation(),
  private.guard_project_status_transition(),
  private.complete_project_from_historical_record()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.project_budget_contribution_events(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  budget_cycle_id uuid NOT NULL,
  project_id bigint NOT NULL,
  work_group_id uuid NOT NULL,
  discipline_id uuid NOT NULL,
  event_type text NOT NULL CHECK(event_type IN ('SAVED', 'SUBMITTED')),
  from_status text NOT NULL CHECK(from_status IN ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED')),
  to_status text NOT NULL CHECK(to_status IN ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED')),
  amount numeric(24,2),
  contribution_revision integer NOT NULL CHECK(contribution_revision > 0),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(budget_cycle_id, work_group_id)
    REFERENCES public.project_budget_contributions(budget_cycle_id, work_group_id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION private.prevent_budget_contribution_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'BUDGET_CONTRIBUTION_EVENT_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS budget_contribution_events_immutable ON public.project_budget_contribution_events;
CREATE TRIGGER budget_contribution_events_immutable
  BEFORE UPDATE OR DELETE ON public.project_budget_contribution_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_budget_contribution_event_mutation();

CREATE OR REPLACE FUNCTION public.save_project_budget_contribution(
  p_budget_cycle_id uuid,
  p_work_group_id uuid,
  p_amount numeric,
  p_note text,
  p_status text,
  p_expected_revision integer,
  p_client_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_manage boolean;
  v_cycle public.project_budget_cycles%ROWTYPE;
  v_row public.project_budget_contributions%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE;
  v_next_status text;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  v_next_status := CASE WHEN p_amount IS NULL THEN 'NOT_STARTED' ELSE 'IN_PROGRESS' END;
  IF p_budget_cycle_id IS NULL OR p_work_group_id IS NULL OR p_client_request_id IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision < 0
    OR p_status = 'SUBMITTED'
    OR char_length(COALESCE(p_note, '')) > 2000 OR (p_amount IS NOT NULL AND p_amount < 0) THEN
    RAISE EXCEPTION 'BUDGET_SUBMIT_REQUIRES_SECTION_COMMAND' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE id = p_budget_cycle_id;
  IF v_cycle.id IS NULL THEN RAISE EXCEPTION 'BUDGET_CYCLE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_row FROM public.project_budget_contributions
  WHERE budget_cycle_id = p_budget_cycle_id AND work_group_id = p_work_group_id;
  IF v_row.work_group_id IS NULL THEN RAISE EXCEPTION 'BUDGET_WORK_GROUP_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  v_manage := lower((SELECT role FROM public.profiles WHERE id = v_uid)) IN ('pm', 'admin')
    AND public.can_write_project(v_cycle.project_id);
  IF NOT v_manage AND NOT EXISTS(
    SELECT 1 FROM public.project_budget_ownerships
    WHERE budget_cycle_id = p_budget_cycle_id AND discipline_id = v_row.discipline_id AND owner_user_id = v_uid
  ) THEN RAISE EXCEPTION 'BUDGET_CONTRIBUTION_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES(v_uid, 'budget.save_contribution', p_client_request_id, v_cycle.project_id)
  ON CONFLICT(actor_id, operation, client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests
  WHERE actor_id = v_uid AND operation = 'budget.save_contribution' AND client_request_id = p_client_request_id;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response || jsonb_build_object('idempotentReplay', true); END IF;
  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE id = p_budget_cycle_id FOR SHARE;
  IF v_cycle.round_state <> 'DRAFT' THEN RAISE EXCEPTION 'BUDGET_ROUND_IS_IMMUTABLE' USING ERRCODE = '55000'; END IF;
  SELECT * INTO v_row FROM public.project_budget_contributions
  WHERE budget_cycle_id = p_budget_cycle_id AND work_group_id = p_work_group_id FOR UPDATE;
  IF v_row.revision <> p_expected_revision THEN RAISE EXCEPTION 'BUDGET_CONTRIBUTION_REVISION_CONFLICT' USING ERRCODE = '40001'; END IF;
  UPDATE public.project_budget_contributions
  SET amount = p_amount, note = btrim(COALESCE(p_note, '')), status = v_next_status,
      revision = revision + 1, updated_by = v_uid, updated_at = now()
  WHERE budget_cycle_id = p_budget_cycle_id AND work_group_id = p_work_group_id;
  INSERT INTO public.project_budget_contribution_events(
    budget_cycle_id, project_id, work_group_id, discipline_id, event_type,
    from_status, to_status, amount, contribution_revision, actor_id
  ) VALUES(
    p_budget_cycle_id, v_cycle.project_id, p_work_group_id, v_row.discipline_id,
    'SAVED', v_row.status, v_next_status, p_amount, p_expected_revision + 1, v_uid
  );
  v_result := jsonb_build_object(
    'budgetCycleId', p_budget_cycle_id, 'workGroupId', p_work_group_id,
    'amount', p_amount, 'status', v_next_status, 'revision', p_expected_revision + 1
  );
  UPDATE public.write_command_requests SET response = v_result, completed_at = now() WHERE id = v_request.id;
  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_project_budget_discipline(
  p_budget_cycle_id uuid,
  p_discipline_id uuid,
  p_contributions jsonb,
  p_client_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_manage boolean;
  v_cycle public.project_budget_cycles%ROWTYPE;
  v_row public.project_budget_contributions%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE;
  v_input jsonb;
  v_work_group_id uuid;
  v_revision integer;
  v_amount numeric;
  v_note text;
  v_count integer := 0;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_budget_cycle_id IS NULL OR p_discipline_id IS NULL OR p_client_request_id IS NULL
    OR jsonb_typeof(p_contributions) <> 'array' OR jsonb_array_length(p_contributions) = 0 THEN
    RAISE EXCEPTION 'INVALID_BUDGET_DISCIPLINE_SUBMISSION' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE id = p_budget_cycle_id FOR SHARE;
  IF v_cycle.id IS NULL THEN RAISE EXCEPTION 'BUDGET_CYCLE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_cycle.round_state <> 'DRAFT' THEN RAISE EXCEPTION 'BUDGET_ROUND_IS_IMMUTABLE' USING ERRCODE = '55000'; END IF;
  v_manage := lower((SELECT role FROM public.profiles WHERE id = v_uid)) IN ('pm', 'admin')
    AND public.can_write_project(v_cycle.project_id);
  IF NOT v_manage AND NOT EXISTS(
    SELECT 1 FROM public.project_budget_ownerships
    WHERE budget_cycle_id = p_budget_cycle_id AND discipline_id = p_discipline_id AND owner_user_id = v_uid
  ) THEN RAISE EXCEPTION 'BUDGET_CONTRIBUTION_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES(v_uid, 'budget.submit_discipline', p_client_request_id, v_cycle.project_id)
  ON CONFLICT(actor_id, operation, client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests
  WHERE actor_id = v_uid AND operation = 'budget.submit_discipline' AND client_request_id = p_client_request_id;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response || jsonb_build_object('idempotentReplay', true); END IF;

  FOR v_input IN SELECT value FROM jsonb_array_elements(p_contributions) LOOP
    v_work_group_id := (v_input->>'workGroupId')::uuid;
    v_revision := (v_input->>'revision')::integer;
    v_amount := (v_input->>'amount')::numeric;
    v_note := btrim(COALESCE(v_input->>'note', ''));
    IF v_work_group_id IS NULL OR v_revision IS NULL OR v_revision < 0
      OR v_amount IS NULL OR v_amount < 0 OR char_length(v_note) > 2000 THEN
      RAISE EXCEPTION 'INVALID_BUDGET_DISCIPLINE_SUBMISSION' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_row FROM public.project_budget_contributions
    WHERE budget_cycle_id = p_budget_cycle_id AND work_group_id = v_work_group_id
      AND discipline_id = p_discipline_id FOR UPDATE;
    IF v_row.work_group_id IS NULL THEN RAISE EXCEPTION 'BUDGET_WORK_GROUP_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF v_row.revision <> v_revision THEN RAISE EXCEPTION 'BUDGET_CONTRIBUTION_REVISION_CONFLICT' USING ERRCODE = '40001'; END IF;
    UPDATE public.project_budget_contributions
    SET amount = v_amount, note = v_note, status = 'SUBMITTED', revision = revision + 1,
        updated_by = v_uid, updated_at = now()
    WHERE budget_cycle_id = p_budget_cycle_id AND work_group_id = v_work_group_id;
    INSERT INTO public.project_budget_contribution_events(
      budget_cycle_id, project_id, work_group_id, discipline_id, event_type,
      from_status, to_status, amount, contribution_revision, actor_id
    ) VALUES(
      p_budget_cycle_id, v_cycle.project_id, v_work_group_id, p_discipline_id,
      'SUBMITTED', v_row.status, 'SUBMITTED', v_amount, v_revision + 1, v_uid
    );
    v_count := v_count + 1;
  END LOOP;
  v_result := jsonb_build_object(
    'budgetCycleId', p_budget_cycle_id, 'disciplineId', p_discipline_id,
    'submittedCount', v_count
  );
  UPDATE public.write_command_requests SET response = v_result, completed_at = now() WHERE id = v_request.id;
  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

ALTER TABLE public.project_budget_contribution_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_budget_contribution_events_read ON public.project_budget_contribution_events;
CREATE POLICY project_budget_contribution_events_read ON public.project_budget_contribution_events
  FOR SELECT TO authenticated USING(public.can_access_project(project_id));
REVOKE ALL ON TABLE public.project_budget_contribution_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_budget_contribution_events TO authenticated;
REVOKE ALL ON FUNCTION private.prevent_budget_contribution_event_mutation(),
  public.save_project_budget_contribution(uuid,uuid,numeric,text,text,integer,uuid),
  public.submit_project_budget_discipline(uuid,uuid,jsonb,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_project_budget_contribution(uuid,uuid,numeric,text,text,integer,uuid),
  public.submit_project_budget_discipline(uuid,uuid,jsonb,uuid)
  TO authenticated;

COMMIT;
