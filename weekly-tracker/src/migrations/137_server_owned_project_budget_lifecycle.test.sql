BEGIN;

DO $$
DECLARE
  v_project_id bigint;
  v_status text;
  v_direct_update_blocked boolean := false;
  v_save_definition text;
BEGIN
  IF has_column_privilege('authenticated', 'public.projects', 'project_status', 'INSERT')
    OR has_column_privilege('authenticated', 'public.projects', 'project_status', 'UPDATE') THEN
    RAISE EXCEPTION 'Project status remains browser-writable';
  END IF;
  SELECT id, project_status INTO v_project_id, v_status FROM public.projects ORDER BY id LIMIT 1;
  IF v_project_id IS NOT NULL THEN
    BEGIN
      UPDATE public.projects
      SET project_status = CASE WHEN v_status = 'Active' THEN 'Completed' ELSE 'Active' END
      WHERE id = v_project_id;
    EXCEPTION WHEN SQLSTATE '55000' THEN
      v_direct_update_blocked := true;
    END;
    IF NOT v_direct_update_blocked THEN RAISE EXCEPTION 'Direct Project status transition was accepted'; END IF;
  END IF;
  IF to_regprocedure('public.submit_project_budget_discipline(uuid,uuid,jsonb,uuid)') IS NULL
    OR NOT has_function_privilege('authenticated', 'public.submit_project_budget_discipline(uuid,uuid,jsonb,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Budget discipline submission command is unavailable';
  END IF;
  SELECT pg_get_functiondef('public.save_project_budget_contribution(uuid,uuid,numeric,text,text,integer,uuid)'::regprocedure)
    INTO v_save_definition;
  IF position('v_next_status' IN v_save_definition) = 0
    OR position('BUDGET_SUBMIT_REQUIRES_SECTION_COMMAND' IN v_save_definition) = 0 THEN
    RAISE EXCEPTION 'Budget save still accepts a client-owned status transition';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'historical_record_complete_project' AND tgenabled <> 'D')
    OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'projects_status_transition_guard' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'Project completion trigger chain is missing';
  END IF;
END;
$$;

ROLLBACK;
