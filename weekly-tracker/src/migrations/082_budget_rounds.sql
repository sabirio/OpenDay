-- 082_budget_rounds.sql
-- Roadmap E.27: immutable Budget Round snapshots and a controlled next-round draft.
-- Management decisions and the Approved Budget Baseline remain E.28.

ALTER TABLE public.project_budget_cycles
  ADD COLUMN IF NOT EXISTS current_round_number integer NOT NULL DEFAULT 1 CHECK(current_round_number > 0),
  ADD COLUMN IF NOT EXISTS round_state text NOT NULL DEFAULT 'DRAFT' CHECK(round_state IN ('DRAFT','ISSUED')),
  ADD COLUMN IF NOT EXISTS round_revision integer NOT NULL DEFAULT 0 CHECK(round_revision >= 0);

CREATE TABLE IF NOT EXISTS public.project_budget_rounds (
  id uuid PRIMARY KEY,
  budget_cycle_id uuid NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  round_number integer NOT NULL CHECK(round_number > 0),
  title text NOT NULL CHECK(btrim(title) <> ''),
  status text NOT NULL CHECK(status = 'ISSUED_FOR_REVIEW'),
  currency_code text NOT NULL CHECK(currency_code ~ '^[A-Z]{3}$'),
  total_amount numeric(24,2) NOT NULL CHECK(total_amount >= 0),
  work_group_count integer NOT NULL CHECK(work_group_count > 0),
  issued_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(budget_cycle_id,round_number),
  UNIQUE(id,budget_cycle_id,project_id,ontology_version_id),
  FOREIGN KEY(budget_cycle_id,project_id,ontology_version_id)
    REFERENCES public.project_budget_cycles(id,project_id,ontology_version_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.project_budget_round_items (
  round_id uuid NOT NULL,
  budget_cycle_id uuid NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  discipline_id uuid NOT NULL,
  work_group_id uuid NOT NULL,
  department_id uuid NOT NULL,
  department_code text NOT NULL,
  department_label text NOT NULL,
  discipline_code text NOT NULL,
  discipline_label text NOT NULL,
  work_group_code text NOT NULL,
  work_group_label text NOT NULL,
  amount numeric(24,2) NOT NULL CHECK(amount >= 0),
  note text NOT NULL CHECK(char_length(note) <= 2000),
  department_name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  PRIMARY KEY(round_id,work_group_id),
  FOREIGN KEY(round_id,budget_cycle_id,project_id,ontology_version_id)
    REFERENCES public.project_budget_rounds(id,budget_cycle_id,project_id,ontology_version_id) ON DELETE RESTRICT,
  FOREIGN KEY(ontology_version_id,discipline_id,work_group_id)
    REFERENCES public.work_ontology_work_groups(ontology_version_id,discipline_id,id) ON DELETE RESTRICT
);

-- Compatibility for local databases where E.27 was applied before the
-- canonical Department level was added to immutable Budget snapshots.
ALTER TABLE public.project_budget_round_items
  ADD COLUMN IF NOT EXISTS department_id uuid,
  ADD COLUMN IF NOT EXISTS department_code text,
  ADD COLUMN IF NOT EXISTS department_label text;
UPDATE public.project_budget_round_items item
SET department_id=department.id,department_code=department.code,department_label=department.label
FROM public.work_ontology_disciplines discipline
JOIN public.work_ontology_departments department
  ON department.ontology_version_id=discipline.ontology_version_id AND department.id=discipline.department_id
WHERE item.ontology_version_id=discipline.ontology_version_id AND item.discipline_id=discipline.id
  AND (item.department_id IS NULL OR item.department_code IS NULL OR item.department_label IS NULL);
ALTER TABLE public.project_budget_round_items
  ALTER COLUMN department_id SET NOT NULL,
  ALTER COLUMN department_code SET NOT NULL,
  ALTER COLUMN department_label SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.project_budget_round_events (
  id uuid PRIMARY KEY,
  budget_cycle_id uuid NOT NULL REFERENCES public.project_budget_cycles(id) ON DELETE RESTRICT,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  round_id uuid REFERENCES public.project_budget_rounds(id) ON DELETE RESTRICT,
  round_number integer NOT NULL CHECK(round_number > 0),
  event_type text NOT NULL CHECK(event_type IN ('ROUND_ISSUED','NEXT_ROUND_STARTED')),
  note text NOT NULL DEFAULT '' CHECK(char_length(note) <= 1000),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_budget_rounds_cycle_idx
  ON public.project_budget_rounds(budget_cycle_id,round_number DESC);
CREATE INDEX IF NOT EXISTS project_budget_round_items_cycle_idx
  ON public.project_budget_round_items(budget_cycle_id,discipline_id,round_id);
CREATE INDEX IF NOT EXISTS project_budget_round_events_cycle_idx
  ON public.project_budget_round_events(budget_cycle_id,created_at DESC);

ALTER TABLE public.project_budget_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_budget_round_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_budget_round_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_budget_rounds_select ON public.project_budget_rounds;
CREATE POLICY project_budget_rounds_select ON public.project_budget_rounds FOR SELECT TO authenticated USING (
  (lower((SELECT role FROM public.profiles WHERE id=auth.uid())) IN ('pm','admin') AND public.can_write_project(project_id))
  OR EXISTS (
    SELECT 1 FROM public.project_budget_ownerships ownership
    WHERE ownership.budget_cycle_id=project_budget_rounds.budget_cycle_id AND ownership.owner_user_id=auth.uid()
  )
);
DROP POLICY IF EXISTS project_budget_round_items_select ON public.project_budget_round_items;
CREATE POLICY project_budget_round_items_select ON public.project_budget_round_items FOR SELECT TO authenticated USING (
  (lower((SELECT role FROM public.profiles WHERE id=auth.uid())) IN ('pm','admin') AND public.can_write_project(project_id))
  OR EXISTS (
    SELECT 1 FROM public.project_budget_ownerships ownership
    WHERE ownership.budget_cycle_id=project_budget_round_items.budget_cycle_id
      AND ownership.discipline_id=project_budget_round_items.discipline_id
      AND ownership.owner_user_id=auth.uid()
  )
);
DROP POLICY IF EXISTS project_budget_round_events_select ON public.project_budget_round_events;
CREATE POLICY project_budget_round_events_select ON public.project_budget_round_events FOR SELECT TO authenticated USING (
  (lower((SELECT role FROM public.profiles WHERE id=auth.uid())) IN ('pm','admin') AND public.can_write_project(project_id))
  OR EXISTS (
    SELECT 1 FROM public.project_budget_ownerships ownership
    WHERE ownership.budget_cycle_id=project_budget_round_events.budget_cycle_id AND ownership.owner_user_id=auth.uid()
  )
);

REVOKE ALL ON TABLE public.project_budget_rounds FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.project_budget_rounds TO authenticated;
REVOKE ALL ON TABLE public.project_budget_round_items FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.project_budget_round_items TO authenticated;
REVOKE ALL ON TABLE public.project_budget_round_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.project_budget_round_events TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_project_budget_round(
  p_budget_cycle_id uuid,
  p_round_id uuid,
  p_expected_revision integer,
  p_client_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_cycle public.project_budget_cycles%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE;
  v_total numeric(24,2);
  v_count integer;
  v_incomplete integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_budget_cycle_id IS NULL OR p_round_id IS NULL OR p_client_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0
    THEN RAISE EXCEPTION 'INVALID_BUDGET_ROUND_COMMAND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE id=p_budget_cycle_id;
  IF v_cycle.id IS NULL THEN RAISE EXCEPTION 'BUDGET_CYCLE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF lower((SELECT role FROM public.profiles WHERE id=v_uid)) NOT IN ('pm','admin') OR public.can_write_project(v_cycle.project_id) IS NOT TRUE
    THEN RAISE EXCEPTION 'BUDGET_ROUND_FORBIDDEN' USING ERRCODE='42501'; END IF;

  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)
  VALUES(v_uid,'budget.issue_round',p_client_request_id,v_cycle.project_id)
  ON CONFLICT(actor_id,operation,client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests
  WHERE actor_id=v_uid AND operation='budget.issue_round' AND client_request_id=p_client_request_id;
  IF v_request.project_id IS DISTINCT FROM v_cycle.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505'; END IF;
  IF v_request.response IS NOT NULL THEN
    IF (v_request.response->>'budgetCycleId')::uuid IS DISTINCT FROM p_budget_cycle_id OR (v_request.response->>'roundId')::uuid IS DISTINCT FROM p_round_id
      THEN RAISE EXCEPTION 'Idempotency key belongs to another Budget Round' USING ERRCODE='23505'; END IF;
    RETURN v_request.response||jsonb_build_object('idempotentReplay',true);
  END IF;

  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE id=p_budget_cycle_id FOR UPDATE;
  IF v_cycle.round_revision<>p_expected_revision THEN RAISE EXCEPTION 'BUDGET_ROUND_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF v_cycle.round_state<>'DRAFT' THEN RAISE EXCEPTION 'BUDGET_ROUND_ALREADY_ISSUED' USING ERRCODE='55000'; END IF;
  SELECT count(*) FILTER(WHERE status='IN_PROGRESS'),
    count(*) FILTER(WHERE status='SUBMITTED' AND amount IS NOT NULL),
    COALESCE(sum(amount) FILTER(WHERE status='SUBMITTED' AND amount IS NOT NULL),0)
    INTO v_incomplete,v_count,v_total FROM public.project_budget_contributions WHERE budget_cycle_id=p_budget_cycle_id;
  IF v_count=0 THEN RAISE EXCEPTION 'BUDGET_ROUND_REQUIRES_SUBMITTED_CONTRIBUTION' USING ERRCODE='55000'; END IF;
  IF v_incomplete>0 THEN RAISE EXCEPTION 'BUDGET_ROUND_HAS_IN_PROGRESS_CONTRIBUTIONS' USING ERRCODE='55000'; END IF;

  INSERT INTO public.project_budget_rounds(id,budget_cycle_id,project_id,ontology_version_id,round_number,title,status,currency_code,total_amount,work_group_count,issued_by)
  VALUES(p_round_id,p_budget_cycle_id,v_cycle.project_id,v_cycle.ontology_version_id,v_cycle.current_round_number,'Budget Round '||v_cycle.current_round_number,'ISSUED_FOR_REVIEW',v_cycle.currency_code,v_total,v_count,v_uid);
  INSERT INTO public.project_budget_round_items(round_id,budget_cycle_id,project_id,ontology_version_id,discipline_id,work_group_id,department_id,department_code,department_label,discipline_code,discipline_label,work_group_code,work_group_label,amount,note,department_name,owner_user_id)
  SELECT p_round_id,c.budget_cycle_id,c.project_id,c.ontology_version_id,c.discipline_id,c.work_group_id,department.id,department.code,department.label,d.code,d.label,g.code,g.label,c.amount,c.note,COALESCE(o.department_name,department.label),COALESCE(o.owner_user_id,v_uid)
  FROM public.project_budget_contributions c
  JOIN public.work_ontology_disciplines d ON d.ontology_version_id=c.ontology_version_id AND d.id=c.discipline_id
  JOIN public.work_ontology_departments department ON department.ontology_version_id=d.ontology_version_id AND department.id=d.department_id
  JOIN public.work_ontology_work_groups g ON g.ontology_version_id=c.ontology_version_id AND g.id=c.work_group_id
  LEFT JOIN public.project_budget_ownerships o ON o.budget_cycle_id=c.budget_cycle_id AND o.discipline_id=c.discipline_id
  WHERE c.budget_cycle_id=p_budget_cycle_id AND c.status='SUBMITTED' AND c.amount IS NOT NULL ORDER BY d.display_order,g.display_order;
  INSERT INTO public.project_budget_round_events(id,budget_cycle_id,project_id,round_id,round_number,event_type,actor_id)
  VALUES(gen_random_uuid(),p_budget_cycle_id,v_cycle.project_id,p_round_id,v_cycle.current_round_number,'ROUND_ISSUED',v_uid);
  UPDATE public.project_budget_cycles SET round_state='ISSUED',round_revision=round_revision+1 WHERE id=p_budget_cycle_id;
  v_result:=jsonb_build_object('budgetCycleId',p_budget_cycle_id,'roundId',p_round_id,'roundNumber',v_cycle.current_round_number,'total',v_total,'workGroupCount',v_count,'roundRevision',v_cycle.round_revision+1);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.start_next_project_budget_round(
  p_budget_cycle_id uuid,
  p_note text,
  p_expected_revision integer,
  p_client_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_cycle public.project_budget_cycles%ROWTYPE;
  v_previous_round_id uuid;
  v_request public.write_command_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_budget_cycle_id IS NULL OR p_client_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0 OR char_length(COALESCE(p_note,''))>1000
    THEN RAISE EXCEPTION 'INVALID_NEXT_BUDGET_ROUND_COMMAND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE id=p_budget_cycle_id;
  IF v_cycle.id IS NULL THEN RAISE EXCEPTION 'BUDGET_CYCLE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF lower((SELECT role FROM public.profiles WHERE id=v_uid)) NOT IN ('pm','admin') OR public.can_write_project(v_cycle.project_id) IS NOT TRUE
    THEN RAISE EXCEPTION 'BUDGET_ROUND_FORBIDDEN' USING ERRCODE='42501'; END IF;

  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)
  VALUES(v_uid,'budget.start_next_round',p_client_request_id,v_cycle.project_id)
  ON CONFLICT(actor_id,operation,client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests
  WHERE actor_id=v_uid AND operation='budget.start_next_round' AND client_request_id=p_client_request_id;
  IF v_request.project_id IS DISTINCT FROM v_cycle.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505'; END IF;
  IF v_request.response IS NOT NULL THEN
    IF (v_request.response->>'budgetCycleId')::uuid IS DISTINCT FROM p_budget_cycle_id
      THEN RAISE EXCEPTION 'Idempotency key belongs to another Budget Cycle' USING ERRCODE='23505'; END IF;
    RETURN v_request.response||jsonb_build_object('idempotentReplay',true);
  END IF;

  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE id=p_budget_cycle_id FOR UPDATE;
  IF v_cycle.round_revision<>p_expected_revision THEN RAISE EXCEPTION 'BUDGET_ROUND_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF v_cycle.round_state<>'ISSUED' THEN RAISE EXCEPTION 'BUDGET_ROUND_NOT_ISSUED' USING ERRCODE='55000'; END IF;
  SELECT id INTO v_previous_round_id FROM public.project_budget_rounds
    WHERE budget_cycle_id=p_budget_cycle_id AND round_number=v_cycle.current_round_number;
  IF v_previous_round_id IS NULL THEN RAISE EXCEPTION 'BUDGET_ROUND_SNAPSHOT_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  UPDATE public.project_budget_contributions SET status='IN_PROGRESS',revision=revision+1,updated_by=v_uid,updated_at=now()
    WHERE budget_cycle_id=p_budget_cycle_id;
  UPDATE public.project_budget_cycles SET current_round_number=current_round_number+1,round_state='DRAFT',round_revision=round_revision+1
    WHERE id=p_budget_cycle_id;
  INSERT INTO public.project_budget_round_events(id,budget_cycle_id,project_id,round_id,round_number,event_type,note,actor_id)
  VALUES(gen_random_uuid(),p_budget_cycle_id,v_cycle.project_id,v_previous_round_id,v_cycle.current_round_number+1,'NEXT_ROUND_STARTED',btrim(COALESCE(p_note,'')),v_uid);
  v_result:=jsonb_build_object('budgetCycleId',p_budget_cycle_id,'roundNumber',v_cycle.current_round_number+1,'basedOnRoundId',v_previous_round_id,'roundRevision',v_cycle.round_revision+1);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.get_project_budget_workspace(p_project_id bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_project public.projects%ROWTYPE;
  v_cycle public.project_budget_cycles%ROWTYPE;
  v_manage boolean;
  v_total numeric;
  v_group_count integer;
  v_submitted_count integer;
  v_progress_count integer;
  v_incomplete_count integer;
  v_unowned_count integer;
  v_ownerships jsonb;
  v_contributions jsonb;
  v_rounds jsonb;
  v_unread integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id;
  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE project_id=p_project_id;
  v_manage:=lower((SELECT role FROM public.profiles WHERE id=v_uid)) IN ('pm','admin') AND public.can_write_project(p_project_id);
  IF v_project.id IS NULL OR (NOT v_manage AND (v_cycle.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.project_budget_ownerships WHERE budget_cycle_id=v_cycle.id AND owner_user_id=v_uid)))
    THEN RAISE EXCEPTION 'BUDGET_WORKSPACE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF v_project.work_ontology_version_id IS NULL THEN RAISE EXCEPTION 'PROJECT_BUDGET_REQUIRES_WORK_ONTOLOGY' USING ERRCODE='55000'; END IF;

  SELECT COALESCE(sum(c.amount),0),count(*),count(*) FILTER(WHERE c.status='SUBMITTED'),count(*) FILTER(WHERE c.status='IN_PROGRESS'),count(*) FILTER(WHERE c.status='IN_PROGRESS')
    INTO v_total,v_group_count,v_submitted_count,v_progress_count,v_incomplete_count
  FROM public.project_budget_contributions c WHERE c.budget_cycle_id=v_cycle.id
    AND (v_manage OR EXISTS(SELECT 1 FROM public.project_budget_ownerships o WHERE o.budget_cycle_id=c.budget_cycle_id AND o.discipline_id=c.discipline_id AND o.owner_user_id=v_uid));
  SELECT count(*) INTO v_unowned_count FROM (
    SELECT DISTINCT c.discipline_id FROM public.project_budget_contributions c WHERE c.budget_cycle_id=v_cycle.id
      AND NOT EXISTS(SELECT 1 FROM public.project_budget_ownerships o WHERE o.budget_cycle_id=c.budget_cycle_id AND o.discipline_id=c.discipline_id)
  ) missing;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('disciplineId',o.discipline_id,'departmentName',o.department_name,'ownerUserId',o.owner_user_id,'ownerName',profile.name,'ownerEmail',profile.email,'revision',o.revision) ORDER BY d.display_order),'[]'::jsonb)
    INTO v_ownerships FROM public.project_budget_ownerships o JOIN public.profiles profile ON profile.id=o.owner_user_id
    JOIN public.work_ontology_disciplines d ON d.ontology_version_id=o.ontology_version_id AND d.id=o.discipline_id
    WHERE o.budget_cycle_id=v_cycle.id AND (v_manage OR o.owner_user_id=v_uid);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('departmentId',department.id,'departmentCode',department.code,'departmentLabel',department.label,'disciplineId',c.discipline_id,'disciplineCode',d.code,'disciplineLabel',d.label,'workGroupId',c.work_group_id,'workGroupCode',g.code,'workGroupLabel',g.label,'amount',c.amount,'note',c.note,'status',c.status,'revision',c.revision,'updatedBy',c.updated_by,'updatedAt',c.updated_at) ORDER BY department.display_order,d.display_order,g.display_order),'[]'::jsonb)
    INTO v_contributions FROM public.project_budget_contributions c
    JOIN public.work_ontology_work_groups g ON g.ontology_version_id=c.ontology_version_id AND g.id=c.work_group_id
    JOIN public.work_ontology_disciplines d ON d.ontology_version_id=c.ontology_version_id AND d.id=c.discipline_id
    JOIN public.work_ontology_departments department ON department.ontology_version_id=d.ontology_version_id AND department.id=d.department_id
    WHERE c.budget_cycle_id=v_cycle.id AND (v_manage OR EXISTS(SELECT 1 FROM public.project_budget_ownerships o WHERE o.budget_cycle_id=c.budget_cycle_id AND o.discipline_id=c.discipline_id AND o.owner_user_id=v_uid));
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'roundId',r.id,'roundNumber',r.round_number,'title',r.title,'status',r.status,'issuedAt',r.issued_at,
      'total',CASE WHEN v_manage THEN r.total_amount ELSE (SELECT COALESCE(sum(i.amount),0) FROM public.project_budget_round_items i WHERE i.round_id=r.id AND EXISTS(SELECT 1 FROM public.project_budget_ownerships o WHERE o.budget_cycle_id=i.budget_cycle_id AND o.discipline_id=i.discipline_id AND o.owner_user_id=v_uid)) END,
      'workGroupCount',CASE WHEN v_manage THEN r.work_group_count ELSE (SELECT count(*) FROM public.project_budget_round_items i WHERE i.round_id=r.id AND EXISTS(SELECT 1 FROM public.project_budget_ownerships o WHERE o.budget_cycle_id=i.budget_cycle_id AND o.discipline_id=i.discipline_id AND o.owner_user_id=v_uid)) END,
      'changeFromPrevious',CASE WHEN r.round_number=1 THEN NULL ELSE
        (CASE WHEN v_manage THEN r.total_amount ELSE (SELECT COALESCE(sum(i.amount),0) FROM public.project_budget_round_items i WHERE i.round_id=r.id AND EXISTS(SELECT 1 FROM public.project_budget_ownerships o WHERE o.budget_cycle_id=i.budget_cycle_id AND o.discipline_id=i.discipline_id AND o.owner_user_id=v_uid)) END)
        -(SELECT COALESCE(sum(previous.amount),0) FROM public.project_budget_round_items previous JOIN public.project_budget_rounds previous_round ON previous_round.id=previous.round_id
          WHERE previous_round.budget_cycle_id=r.budget_cycle_id AND previous_round.round_number=r.round_number-1
          AND (v_manage OR EXISTS(SELECT 1 FROM public.project_budget_ownerships o WHERE o.budget_cycle_id=previous.budget_cycle_id AND o.discipline_id=previous.discipline_id AND o.owner_user_id=v_uid))) END
    ) ORDER BY r.round_number DESC),'[]'::jsonb) INTO v_rounds
  FROM public.project_budget_rounds r WHERE r.budget_cycle_id=v_cycle.id;
  SELECT count(*) INTO v_unread FROM public.project_budget_notifications WHERE budget_cycle_id=v_cycle.id AND recipient_user_id=v_uid AND read_at IS NULL;

  RETURN jsonb_build_object(
    'projectId',p_project_id,'projectCode',v_project.store_code,'projectName',v_project.shopping_mall_name,'projectCurrencyCode',v_project.currency_code,
    'ontologyVersionId',v_project.work_ontology_version_id,'canManageOwnership',v_manage,
    'cycle',CASE WHEN v_cycle.id IS NULL THEN NULL ELSE jsonb_build_object('budgetCycleId',v_cycle.id,'title',v_cycle.title,'currencyCode',v_cycle.currency_code,'status',v_cycle.status,'createdAt',v_cycle.created_at,'currentRoundNumber',v_cycle.current_round_number,'roundState',v_cycle.round_state,'roundRevision',v_cycle.round_revision) END,
    'summary',jsonb_build_object('total',v_total,'workGroupCount',v_group_count,'submittedCount',v_submitted_count,'inProgressCount',v_progress_count),
    'roundControl',jsonb_build_object('currentRoundNumber',v_cycle.current_round_number,'state',v_cycle.round_state,'revision',v_cycle.round_revision,'submittedCount',v_submitted_count,'incompleteCount',v_incomplete_count,'unownedDisciplineCount',v_unowned_count,'canIssue',v_manage AND v_cycle.round_state='DRAFT' AND v_submitted_count>0 AND v_incomplete_count=0),
    'rounds',v_rounds,'ownerships',v_ownerships,'unreadNotificationCount',v_unread,'contributions',v_contributions
  );
END;$$;

CREATE OR REPLACE FUNCTION public.save_project_budget_contribution(p_budget_cycle_id uuid,p_work_group_id uuid,p_amount numeric,p_note text,p_status text,p_expected_revision integer,p_client_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_manage boolean;v_cycle public.project_budget_cycles%ROWTYPE;v_row public.project_budget_contributions%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_budget_cycle_id IS NULL OR p_work_group_id IS NULL OR p_client_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_status NOT IN('NOT_STARTED','IN_PROGRESS','SUBMITTED') OR char_length(COALESCE(p_note,''))>2000 OR (p_status='NOT_STARTED' AND p_amount IS NOT NULL) OR (p_status<>'NOT_STARTED' AND (p_amount IS NULL OR p_amount<0)) THEN RAISE EXCEPTION 'INVALID_BUDGET_CONTRIBUTION_COMMAND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE id=p_budget_cycle_id;
  IF v_cycle.id IS NULL THEN RAISE EXCEPTION 'BUDGET_CYCLE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_row FROM public.project_budget_contributions WHERE budget_cycle_id=p_budget_cycle_id AND work_group_id=p_work_group_id;
  IF v_row.work_group_id IS NULL THEN RAISE EXCEPTION 'BUDGET_WORK_GROUP_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  v_manage:=lower((SELECT role FROM public.profiles WHERE id=v_uid)) IN ('pm','admin') AND public.can_write_project(v_cycle.project_id);
  IF NOT v_manage AND NOT EXISTS(SELECT 1 FROM public.project_budget_ownerships WHERE budget_cycle_id=p_budget_cycle_id AND discipline_id=v_row.discipline_id AND owner_user_id=v_uid) THEN RAISE EXCEPTION 'BUDGET_CONTRIBUTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id) VALUES(v_uid,'budget.save_contribution',p_client_request_id,v_cycle.project_id) ON CONFLICT(actor_id,operation,client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='budget.save_contribution' AND client_request_id=p_client_request_id;
  IF v_request.project_id IS DISTINCT FROM v_cycle.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505'; END IF;
  IF v_request.response IS NOT NULL THEN
    IF (v_request.response->>'budgetCycleId')::uuid IS DISTINCT FROM p_budget_cycle_id OR (v_request.response->>'workGroupId')::uuid IS DISTINCT FROM p_work_group_id THEN RAISE EXCEPTION 'Idempotency key belongs to another Budget contribution' USING ERRCODE='23505'; END IF;
    RETURN v_request.response||jsonb_build_object('idempotentReplay',true);
  END IF;
  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE id=p_budget_cycle_id FOR SHARE;
  IF v_cycle.round_state<>'DRAFT' THEN RAISE EXCEPTION 'BUDGET_ROUND_IS_IMMUTABLE' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_row FROM public.project_budget_contributions WHERE budget_cycle_id=p_budget_cycle_id AND work_group_id=p_work_group_id FOR UPDATE;
  IF v_row.revision<>p_expected_revision THEN RAISE EXCEPTION 'BUDGET_CONTRIBUTION_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  UPDATE public.project_budget_contributions SET amount=p_amount,note=btrim(COALESCE(p_note,'')),status=p_status,revision=revision+1,updated_by=v_uid,updated_at=now() WHERE budget_cycle_id=p_budget_cycle_id AND work_group_id=p_work_group_id;
  v_result:=jsonb_build_object('budgetCycleId',p_budget_cycle_id,'workGroupId',p_work_group_id,'amount',p_amount,'status',p_status,'revision',p_expected_revision+1);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

REVOKE ALL ON FUNCTION public.issue_project_budget_round(uuid,uuid,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.issue_project_budget_round(uuid,uuid,integer,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.start_next_project_budget_round(uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.start_next_project_budget_round(uuid,text,integer,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_project_budget_workspace(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_project_budget_workspace(bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.save_project_budget_contribution(uuid,uuid,numeric,text,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_project_budget_contribution(uuid,uuid,numeric,text,text,integer,uuid) TO authenticated;
