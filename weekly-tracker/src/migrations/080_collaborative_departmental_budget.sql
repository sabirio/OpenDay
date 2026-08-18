-- 080_collaborative_departmental_budget.sql
-- Roadmap E.25: one collaborative project Budget Cycle at canonical Work Group level.
-- Ownership/notifications, rounds, approval, tender variance and reporting remain E.26-E.30.

CREATE TABLE IF NOT EXISTS public.project_budget_cycles(
  id uuid PRIMARY KEY,project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK(btrim(title)<>''),currency_code text NOT NULL CHECK(currency_code~'^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status='DRAFT'),created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(project_id),UNIQUE(id,project_id,ontology_version_id)
);
CREATE TABLE IF NOT EXISTS public.project_budget_contributions(
  budget_cycle_id uuid NOT NULL,project_id bigint NOT NULL,ontology_version_id uuid NOT NULL,
  discipline_id uuid NOT NULL,work_group_id uuid NOT NULL,amount numeric(24,2),note text NOT NULL DEFAULT '' CHECK(char_length(note)<=2000),
  status text NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN('NOT_STARTED','IN_PROGRESS','SUBMITTED')),
  revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,updated_at timestamptz,
  PRIMARY KEY(budget_cycle_id,work_group_id),
  FOREIGN KEY(budget_cycle_id,project_id,ontology_version_id)REFERENCES public.project_budget_cycles(id,project_id,ontology_version_id)ON DELETE RESTRICT,
  FOREIGN KEY(ontology_version_id,discipline_id,work_group_id)REFERENCES public.work_ontology_work_groups(ontology_version_id,discipline_id,id)ON DELETE RESTRICT,
  CHECK((status='NOT_STARTED' AND amount IS NULL)OR(status IN('IN_PROGRESS','SUBMITTED')AND amount IS NOT NULL AND amount>=0))
);
CREATE INDEX IF NOT EXISTS project_budget_contributions_project_idx ON public.project_budget_contributions(project_id,budget_cycle_id);
ALTER TABLE public.project_budget_cycles ENABLE ROW LEVEL SECURITY;ALTER TABLE public.project_budget_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_budget_cycles_select ON public.project_budget_cycles;
CREATE POLICY project_budget_cycles_select ON public.project_budget_cycles FOR SELECT TO authenticated USING(lower((SELECT role FROM public.profiles WHERE id=auth.uid()))IN('pm','admin')AND public.can_write_project(project_id));
DROP POLICY IF EXISTS project_budget_contributions_select ON public.project_budget_contributions;
CREATE POLICY project_budget_contributions_select ON public.project_budget_contributions FOR SELECT TO authenticated USING(lower((SELECT role FROM public.profiles WHERE id=auth.uid()))IN('pm','admin')AND public.can_write_project(project_id));
REVOKE ALL ON TABLE public.project_budget_cycles,public.project_budget_contributions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.project_budget_cycles,public.project_budget_contributions TO authenticated;

CREATE OR REPLACE FUNCTION public.get_project_budget_workspace(p_project_id bigint)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_project public.projects%ROWTYPE;v_cycle public.project_budget_cycles%ROWTYPE;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
 SELECT * INTO v_project FROM public.projects WHERE id=p_project_id;
 IF v_project.id IS NULL OR lower((SELECT role FROM public.profiles WHERE id=v_uid))NOT IN('pm','admin')OR public.can_write_project(p_project_id) IS NOT TRUE THEN RAISE EXCEPTION 'BUDGET_WORKSPACE_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF v_project.work_ontology_version_id IS NULL THEN RAISE EXCEPTION 'PROJECT_BUDGET_REQUIRES_WORK_ONTOLOGY' USING ERRCODE='55000';END IF;
 SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE project_id=p_project_id;
 RETURN jsonb_build_object('projectId',p_project_id,'ontologyVersionId',v_project.work_ontology_version_id,
  'cycle',CASE WHEN v_cycle.id IS NULL THEN NULL ELSE jsonb_build_object('budgetCycleId',v_cycle.id,'title',v_cycle.title,'currencyCode',v_cycle.currency_code,'status',v_cycle.status,'createdAt',v_cycle.created_at)END,
  'summary',jsonb_build_object('total',COALESCE((SELECT sum(amount)FROM public.project_budget_contributions WHERE budget_cycle_id=v_cycle.id),0),'workGroupCount',(SELECT count(*)FROM public.project_budget_contributions WHERE budget_cycle_id=v_cycle.id),'submittedCount',(SELECT count(*)FROM public.project_budget_contributions WHERE budget_cycle_id=v_cycle.id AND status='SUBMITTED'),'inProgressCount',(SELECT count(*)FROM public.project_budget_contributions WHERE budget_cycle_id=v_cycle.id AND status='IN_PROGRESS')),
  'contributions',COALESCE((SELECT jsonb_agg(jsonb_build_object('departmentId',department.id,'departmentCode',department.code,'departmentLabel',department.label,'disciplineId',c.discipline_id,'disciplineCode',d.code,'disciplineLabel',d.label,'workGroupId',c.work_group_id,'workGroupCode',g.code,'workGroupLabel',g.label,'amount',c.amount,'note',c.note,'status',c.status,'revision',c.revision,'updatedBy',c.updated_by,'updatedAt',c.updated_at)ORDER BY department.display_order,d.display_order,g.display_order)FROM public.project_budget_contributions c JOIN public.work_ontology_work_groups g ON g.ontology_version_id=c.ontology_version_id AND g.id=c.work_group_id JOIN public.work_ontology_disciplines d ON d.ontology_version_id=c.ontology_version_id AND d.id=c.discipline_id JOIN public.work_ontology_departments department ON department.ontology_version_id=d.ontology_version_id AND department.id=d.department_id WHERE c.budget_cycle_id=v_cycle.id AND g.is_active),'[]'::jsonb));
END;$$;

CREATE OR REPLACE FUNCTION public.create_project_budget_cycle(p_project_id bigint,p_budget_cycle_id uuid,p_title text,p_currency_code text,p_client_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_project public.projects%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_count integer;v_result jsonb;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
 IF p_budget_cycle_id IS NULL OR p_client_request_id IS NULL OR btrim(COALESCE(p_title,''))='' OR COALESCE(p_currency_code,'')!~'^[A-Z]{3}$' THEN RAISE EXCEPTION 'INVALID_BUDGET_CYCLE_COMMAND' USING ERRCODE='22023';END IF;
 SELECT lower(role)INTO v_role FROM public.profiles WHERE id=v_uid;IF v_role NOT IN('pm','admin')OR public.can_write_project(p_project_id)IS NOT TRUE THEN RAISE EXCEPTION 'BUDGET_WORKSPACE_FORBIDDEN' USING ERRCODE='42501';END IF;
 INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'budget.create_cycle',p_client_request_id,p_project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
 SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='budget.create_cycle'AND client_request_id=p_client_request_id;
 IF v_request.project_id IS DISTINCT FROM p_project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
 IF v_request.response IS NOT NULL THEN IF (v_request.response->>'budgetCycleId')::uuid IS DISTINCT FROM p_budget_cycle_id THEN RAISE EXCEPTION 'Idempotency key belongs to another Budget Cycle' USING ERRCODE='23505';END IF;RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
 SELECT * INTO v_project FROM public.projects WHERE id=p_project_id FOR UPDATE;IF v_project.work_ontology_version_id IS NULL THEN RAISE EXCEPTION 'PROJECT_BUDGET_REQUIRES_WORK_ONTOLOGY' USING ERRCODE='55000';END IF;
 IF COALESCE(v_project.currency_code,'') NOT IN('KZT','USD','EUR') THEN RAISE EXCEPTION 'PROJECT_CURRENCY_REQUIRED' USING ERRCODE='55000';END IF;
 IF p_currency_code IS DISTINCT FROM v_project.currency_code THEN RAISE EXCEPTION 'BUDGET_CURRENCY_MUST_MATCH_PROJECT' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.project_budget_cycles WHERE project_id=p_project_id)THEN RAISE EXCEPTION 'BUDGET_CYCLE_ALREADY_EXISTS' USING ERRCODE='55000';END IF;
 INSERT INTO public.project_budget_cycles(id,project_id,ontology_version_id,title,currency_code,created_by)VALUES(p_budget_cycle_id,p_project_id,v_project.work_ontology_version_id,btrim(p_title),v_project.currency_code,v_uid);
 INSERT INTO public.project_budget_contributions(budget_cycle_id,project_id,ontology_version_id,discipline_id,work_group_id)
 SELECT p_budget_cycle_id,p_project_id,g.ontology_version_id,g.discipline_id,g.id FROM public.work_ontology_work_groups g JOIN public.work_ontology_disciplines d ON d.ontology_version_id=g.ontology_version_id AND d.id=g.discipline_id WHERE g.ontology_version_id=v_project.work_ontology_version_id AND g.is_active AND d.budget_selectable AND(NOT d.scope_selectable OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_project.scope->'disciplineIds')x(value)WHERE x.value::uuid=g.discipline_id))ORDER BY d.display_order,g.display_order;
 GET DIAGNOSTICS v_count=ROW_COUNT;IF v_count=0 THEN RAISE EXCEPTION 'EMPTY_PROJECT_BUDGET_SCOPE' USING ERRCODE='55000';END IF;
 v_result:=jsonb_build_object('budgetCycleId',p_budget_cycle_id,'projectId',p_project_id,'workGroupCount',v_count,'currencyCode',v_project.currency_code);
 UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.save_project_budget_contribution(p_budget_cycle_id uuid,p_work_group_id uuid,p_amount numeric,p_note text,p_status text,p_expected_revision integer,p_client_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_cycle public.project_budget_cycles%ROWTYPE;v_row public.project_budget_contributions%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_result jsonb;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
 IF p_budget_cycle_id IS NULL OR p_work_group_id IS NULL OR p_client_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_status NOT IN('NOT_STARTED','IN_PROGRESS','SUBMITTED')OR char_length(COALESCE(p_note,''))>2000 OR(p_status='NOT_STARTED'AND p_amount IS NOT NULL)OR(p_status<>'NOT_STARTED'AND(p_amount IS NULL OR p_amount<0))THEN RAISE EXCEPTION 'INVALID_BUDGET_CONTRIBUTION_COMMAND' USING ERRCODE='22023';END IF;
 SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE id=p_budget_cycle_id;IF v_cycle.id IS NULL THEN RAISE EXCEPTION 'BUDGET_CYCLE_NOT_FOUND' USING ERRCODE='P0002';END IF;
 SELECT lower(role)INTO v_role FROM public.profiles WHERE id=v_uid;IF v_role NOT IN('pm','admin')OR public.can_write_project(v_cycle.project_id)IS NOT TRUE THEN RAISE EXCEPTION 'BUDGET_WORKSPACE_FORBIDDEN' USING ERRCODE='42501';END IF;
 INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'budget.save_contribution',p_client_request_id,v_cycle.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
 SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='budget.save_contribution'AND client_request_id=p_client_request_id;
 IF v_request.project_id IS DISTINCT FROM v_cycle.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
 IF v_request.response IS NOT NULL THEN IF (v_request.response->>'budgetCycleId')::uuid IS DISTINCT FROM p_budget_cycle_id OR (v_request.response->>'workGroupId')::uuid IS DISTINCT FROM p_work_group_id THEN RAISE EXCEPTION 'Idempotency key belongs to another Budget contribution' USING ERRCODE='23505';END IF;RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
 SELECT * INTO v_row FROM public.project_budget_contributions WHERE budget_cycle_id=p_budget_cycle_id AND work_group_id=p_work_group_id FOR UPDATE;IF v_row.work_group_id IS NULL THEN RAISE EXCEPTION 'BUDGET_WORK_GROUP_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF v_row.revision<>p_expected_revision THEN RAISE EXCEPTION 'BUDGET_CONTRIBUTION_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
 UPDATE public.project_budget_contributions SET amount=p_amount,note=btrim(COALESCE(p_note,'')),status=p_status,revision=revision+1,updated_by=v_uid,updated_at=now()WHERE budget_cycle_id=p_budget_cycle_id AND work_group_id=p_work_group_id;
 v_result:=jsonb_build_object('budgetCycleId',p_budget_cycle_id,'workGroupId',p_work_group_id,'amount',p_amount,'status',p_status,'revision',p_expected_revision+1);
 UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

REVOKE ALL ON FUNCTION public.get_project_budget_workspace(bigint),public.create_project_budget_cycle(bigint,uuid,text,text,uuid),public.save_project_budget_contribution(uuid,uuid,numeric,text,text,integer,uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_project_budget_workspace(bigint),public.create_project_budget_cycle(bigint,uuid,text,text,uuid),public.save_project_budget_contribution(uuid,uuid,numeric,text,text,integer,uuid)TO authenticated;
