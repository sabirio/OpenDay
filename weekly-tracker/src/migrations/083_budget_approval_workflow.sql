-- 083_budget_approval_workflow.sql
-- Roadmap E.28: Admin Management Review and immutable Approved Budget Baseline.
-- Budget vs Tender and the Budget Approval Report remain E.29-E.30.

ALTER TABLE public.project_budget_cycles
  ADD COLUMN IF NOT EXISTS approval_state text NOT NULL DEFAULT 'PENDING' CHECK(approval_state IN ('PENDING','APPROVED')),
  ADD COLUMN IF NOT EXISTS approval_revision integer NOT NULL DEFAULT 0 CHECK(approval_revision >= 0);

CREATE TABLE IF NOT EXISTS public.project_budget_round_reviews (
  id uuid PRIMARY KEY,
  budget_cycle_id uuid NOT NULL,
  project_id bigint NOT NULL,
  round_id uuid NOT NULL,
  round_number integer NOT NULL CHECK(round_number > 0),
  decision text NOT NULL CHECK(decision IN ('REVISION_REQUIRED','APPROVED')),
  comment text NOT NULL CHECK(char_length(comment) <= 2000 AND (decision <> 'REVISION_REQUIRED' OR btrim(comment) <> '')),
  reviewed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(round_id),
  FOREIGN KEY(round_id) REFERENCES public.project_budget_rounds(id) ON DELETE RESTRICT,
  FOREIGN KEY(budget_cycle_id) REFERENCES public.project_budget_cycles(id) ON DELETE RESTRICT,
  FOREIGN KEY(project_id) REFERENCES public.projects(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.approved_budget_baselines (
  id uuid PRIMARY KEY,
  budget_cycle_id uuid NOT NULL UNIQUE,
  project_id bigint NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE RESTRICT,
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE RESTRICT,
  source_round_id uuid NOT NULL UNIQUE,
  source_round_number integer NOT NULL CHECK(source_round_number > 0),
  currency_code text NOT NULL CHECK(currency_code ~ '^[A-Z]{3}$'),
  total_amount numeric(24,2) NOT NULL CHECK(total_amount >= 0),
  work_group_count integer NOT NULL CHECK(work_group_count > 0),
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,budget_cycle_id,project_id,ontology_version_id),
  FOREIGN KEY(source_round_id,budget_cycle_id,project_id,ontology_version_id)
    REFERENCES public.project_budget_rounds(id,budget_cycle_id,project_id,ontology_version_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.approved_budget_baseline_items (
  baseline_id uuid NOT NULL,
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
  PRIMARY KEY(baseline_id,work_group_id),
  FOREIGN KEY(baseline_id,budget_cycle_id,project_id,ontology_version_id)
    REFERENCES public.approved_budget_baselines(id,budget_cycle_id,project_id,ontology_version_id) ON DELETE RESTRICT,
  FOREIGN KEY(ontology_version_id,discipline_id,work_group_id)
    REFERENCES public.work_ontology_work_groups(ontology_version_id,discipline_id,id) ON DELETE RESTRICT
);

ALTER TABLE public.approved_budget_baseline_items
  ADD COLUMN IF NOT EXISTS department_id uuid,
  ADD COLUMN IF NOT EXISTS department_code text,
  ADD COLUMN IF NOT EXISTS department_label text;
UPDATE public.approved_budget_baseline_items item
SET department_id=discipline.department_id,department_code=department.code,department_label=department.label
FROM public.work_ontology_disciplines discipline
JOIN public.work_ontology_departments department ON department.ontology_version_id=discipline.ontology_version_id AND department.id=discipline.department_id
WHERE discipline.ontology_version_id=item.ontology_version_id AND discipline.id=item.discipline_id
  AND(item.department_id IS NULL OR item.department_code IS NULL OR item.department_label IS NULL);
ALTER TABLE public.approved_budget_baseline_items
  ALTER COLUMN department_id SET NOT NULL,
  ALTER COLUMN department_code SET NOT NULL,
  ALTER COLUMN department_label SET NOT NULL;

CREATE INDEX IF NOT EXISTS project_budget_round_reviews_cycle_idx ON public.project_budget_round_reviews(budget_cycle_id,round_number DESC);
CREATE INDEX IF NOT EXISTS approved_budget_baseline_items_scope_idx ON public.approved_budget_baseline_items(project_id,discipline_id,work_group_id);

ALTER TABLE public.project_budget_round_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approved_budget_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approved_budget_baseline_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_budget_round_reviews_select ON public.project_budget_round_reviews;
CREATE POLICY project_budget_round_reviews_select ON public.project_budget_round_reviews FOR SELECT TO authenticated USING (
  (lower((SELECT role FROM public.profiles WHERE id=auth.uid())) IN ('pm','admin') AND public.can_write_project(project_id))
  OR EXISTS(SELECT 1 FROM public.project_budget_ownerships o WHERE o.budget_cycle_id=project_budget_round_reviews.budget_cycle_id AND o.owner_user_id=auth.uid())
);
DROP POLICY IF EXISTS approved_budget_baselines_select ON public.approved_budget_baselines;
CREATE POLICY approved_budget_baselines_select ON public.approved_budget_baselines FOR SELECT TO authenticated USING (
  (lower((SELECT role FROM public.profiles WHERE id=auth.uid())) IN ('pm','admin') AND public.can_write_project(project_id))
  OR EXISTS(SELECT 1 FROM public.project_budget_ownerships o WHERE o.budget_cycle_id=approved_budget_baselines.budget_cycle_id AND o.owner_user_id=auth.uid())
);
DROP POLICY IF EXISTS approved_budget_baseline_items_select ON public.approved_budget_baseline_items;
CREATE POLICY approved_budget_baseline_items_select ON public.approved_budget_baseline_items FOR SELECT TO authenticated USING (
  (lower((SELECT role FROM public.profiles WHERE id=auth.uid())) IN ('pm','admin') AND public.can_write_project(project_id))
  OR EXISTS(SELECT 1 FROM public.project_budget_ownerships o WHERE o.budget_cycle_id=approved_budget_baseline_items.budget_cycle_id AND o.discipline_id=approved_budget_baseline_items.discipline_id AND o.owner_user_id=auth.uid())
);

REVOKE ALL ON TABLE public.project_budget_round_reviews FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.project_budget_round_reviews TO authenticated;
REVOKE ALL ON TABLE public.approved_budget_baselines FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.approved_budget_baselines TO authenticated;
REVOKE ALL ON TABLE public.approved_budget_baseline_items FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.approved_budget_baseline_items TO authenticated;

ALTER TABLE public.project_budget_notifications DROP CONSTRAINT IF EXISTS project_budget_notifications_event_type_check;
ALTER TABLE public.project_budget_notifications ADD CONSTRAINT project_budget_notifications_event_type_check CHECK(event_type IN(
  'BUDGET_OWNERSHIP_ASSIGNED','BUDGET_OWNERSHIP_REASSIGNED','BUDGET_OWNERSHIP_REMOVED','BUDGET_REVISION_REQUIRED','BUDGET_APPROVED'
));

CREATE OR REPLACE FUNCTION public.get_project_budget_approval(p_project_id bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_cycle public.project_budget_cycles%ROWTYPE;v_round public.project_budget_rounds%ROWTYPE;v_review public.project_budget_round_reviews%ROWTYPE;v_baseline public.approved_budget_baselines%ROWTYPE;v_can_access boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE project_id=p_project_id;
  v_can_access:=v_role IN('pm','admin') AND public.can_write_project(p_project_id);
  IF v_cycle.id IS NULL THEN RETURN jsonb_build_object('approvalState','NOT_STARTED','canReview',false,'currentReview',NULL,'baseline',NULL); END IF;
  IF NOT v_can_access AND NOT EXISTS(SELECT 1 FROM public.project_budget_ownerships WHERE budget_cycle_id=v_cycle.id AND owner_user_id=v_uid)
    THEN RAISE EXCEPTION 'BUDGET_APPROVAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_round FROM public.project_budget_rounds WHERE budget_cycle_id=v_cycle.id AND round_number=v_cycle.current_round_number;
  SELECT * INTO v_review FROM public.project_budget_round_reviews WHERE round_id=v_round.id;
  SELECT * INTO v_baseline FROM public.approved_budget_baselines WHERE budget_cycle_id=v_cycle.id;
  RETURN jsonb_build_object(
    'approvalState',v_cycle.approval_state,'approvalRevision',v_cycle.approval_revision,
    'canReview',v_role='admin' AND public.can_write_project(p_project_id) AND v_round.id IS NOT NULL AND v_review.id IS NULL AND v_cycle.approval_state='PENDING',
    'separationBlocked',false,
    'currentReview',CASE WHEN v_review.id IS NULL THEN NULL ELSE jsonb_build_object('reviewId',v_review.id,'roundId',v_review.round_id,'roundNumber',v_review.round_number,'decision',v_review.decision,'comment',v_review.comment,'reviewedBy',v_review.reviewed_by,'reviewedAt',v_review.reviewed_at) END,
    'baseline',CASE WHEN v_baseline.id IS NULL THEN NULL ELSE jsonb_build_object('baselineId',v_baseline.id,'sourceRoundId',v_baseline.source_round_id,'sourceRoundNumber',v_baseline.source_round_number,'currencyCode',v_baseline.currency_code,'total',v_baseline.total_amount,'workGroupCount',v_baseline.work_group_count,'approvedBy',v_baseline.approved_by,'approvedAt',v_baseline.approved_at) END
  );
END;$$;

CREATE OR REPLACE FUNCTION public.review_project_budget_round(
  p_round_id uuid,p_decision text,p_comment text,p_baseline_id uuid,p_expected_revision integer,p_client_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_round public.project_budget_rounds%ROWTYPE;v_cycle public.project_budget_cycles%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_result jsonb;v_recipient uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_round_id IS NULL OR p_client_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_decision NOT IN('REVISION_REQUIRED','APPROVED') OR char_length(COALESCE(p_comment,''))>2000 OR (p_decision='REVISION_REQUIRED' AND btrim(COALESCE(p_comment,''))='') OR (p_decision='APPROVED' AND p_baseline_id IS NULL)
    THEN RAISE EXCEPTION 'INVALID_BUDGET_REVIEW_COMMAND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_round FROM public.project_budget_rounds WHERE id=p_round_id;
  IF v_round.id IS NULL THEN RAISE EXCEPTION 'BUDGET_ROUND_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF lower((SELECT role FROM public.profiles WHERE id=v_uid))<>'admin' OR public.can_write_project(v_round.project_id) IS NOT TRUE
    THEN RAISE EXCEPTION 'BUDGET_REVIEW_FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id) VALUES(v_uid,'budget.review_round',p_client_request_id,v_round.project_id) ON CONFLICT(actor_id,operation,client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='budget.review_round' AND client_request_id=p_client_request_id;
  IF v_request.project_id IS DISTINCT FROM v_round.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505'; END IF;
  IF v_request.response IS NOT NULL THEN
    IF (v_request.response->>'roundId')::uuid IS DISTINCT FROM p_round_id OR v_request.response->>'decision' IS DISTINCT FROM p_decision THEN RAISE EXCEPTION 'Idempotency key belongs to another Budget review' USING ERRCODE='23505'; END IF;
    RETURN v_request.response||jsonb_build_object('idempotentReplay',true);
  END IF;

  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE id=v_round.budget_cycle_id FOR UPDATE;
  IF v_cycle.approval_revision<>p_expected_revision THEN RAISE EXCEPTION 'BUDGET_APPROVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF v_cycle.approval_state='APPROVED' THEN RAISE EXCEPTION 'BUDGET_ALREADY_APPROVED' USING ERRCODE='55000'; END IF;
  IF v_cycle.round_state<>'ISSUED' OR v_cycle.current_round_number<>v_round.round_number THEN RAISE EXCEPTION 'BUDGET_REVIEW_REQUIRES_CURRENT_ISSUED_ROUND' USING ERRCODE='55000'; END IF;
  IF EXISTS(SELECT 1 FROM public.project_budget_round_reviews WHERE round_id=p_round_id) THEN RAISE EXCEPTION 'BUDGET_ROUND_ALREADY_REVIEWED' USING ERRCODE='55000'; END IF;

  INSERT INTO public.project_budget_round_reviews(id,budget_cycle_id,project_id,round_id,round_number,decision,comment,reviewed_by)
  VALUES(gen_random_uuid(),v_round.budget_cycle_id,v_round.project_id,v_round.id,v_round.round_number,p_decision,btrim(COALESCE(p_comment,'')),v_uid);
  IF p_decision='APPROVED' THEN
    INSERT INTO public.approved_budget_baselines(id,budget_cycle_id,project_id,ontology_version_id,source_round_id,source_round_number,currency_code,total_amount,work_group_count,approved_by)
    VALUES(p_baseline_id,v_round.budget_cycle_id,v_round.project_id,v_round.ontology_version_id,v_round.id,v_round.round_number,v_round.currency_code,v_round.total_amount,v_round.work_group_count,v_uid);
    INSERT INTO public.approved_budget_baseline_items(baseline_id,budget_cycle_id,project_id,ontology_version_id,discipline_id,work_group_id,department_id,department_code,department_label,discipline_code,discipline_label,work_group_code,work_group_label,amount,note,department_name,owner_user_id)
    SELECT p_baseline_id,i.budget_cycle_id,i.project_id,i.ontology_version_id,i.discipline_id,i.work_group_id,i.department_id,i.department_code,i.department_label,i.discipline_code,i.discipline_label,i.work_group_code,i.work_group_label,i.amount,i.note,i.department_name,i.owner_user_id FROM public.project_budget_round_items i WHERE i.round_id=p_round_id;
    UPDATE public.project_budget_cycles SET approval_state='APPROVED',approval_revision=approval_revision+1 WHERE id=v_round.budget_cycle_id;
  ELSE
    UPDATE public.project_budget_cycles SET approval_revision=approval_revision+1 WHERE id=v_round.budget_cycle_id;
  END IF;
  FOR v_recipient IN SELECT DISTINCT recipient FROM (SELECT v_round.issued_by recipient UNION SELECT owner_user_id FROM public.project_budget_ownerships WHERE budget_cycle_id=v_round.budget_cycle_id) recipients WHERE recipient<>v_uid LOOP
    INSERT INTO public.project_budget_notifications(id,recipient_user_id,project_id,budget_cycle_id,discipline_id,event_type,message)
    VALUES(gen_random_uuid(),v_recipient,v_round.project_id,v_round.budget_cycle_id,COALESCE((SELECT discipline_id FROM public.project_budget_ownerships WHERE budget_cycle_id=v_round.budget_cycle_id AND owner_user_id=v_recipient ORDER BY discipline_id LIMIT 1),(SELECT discipline_id FROM public.project_budget_round_items WHERE round_id=p_round_id ORDER BY discipline_id LIMIT 1)),CASE WHEN p_decision='APPROVED' THEN'BUDGET_APPROVED'ELSE'BUDGET_REVISION_REQUIRED'END,'Budget Round '||v_round.round_number||CASE WHEN p_decision='APPROVED' THEN' approved.'ELSE' requires revision: '||btrim(p_comment)END);
  END LOOP;
  v_result:=jsonb_build_object('budgetCycleId',v_round.budget_cycle_id,'roundId',p_round_id,'roundNumber',v_round.round_number,'decision',p_decision,'baselineId',CASE WHEN p_decision='APPROVED' THEN p_baseline_id ELSE NULL END,'approvalRevision',v_cycle.approval_revision+1);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.start_next_project_budget_round(p_budget_cycle_id uuid,p_note text,p_expected_revision integer,p_client_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_cycle public.project_budget_cycles%ROWTYPE;v_previous_round public.project_budget_rounds%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_budget_cycle_id IS NULL OR p_client_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR char_length(COALESCE(p_note,''))>1000 THEN RAISE EXCEPTION 'INVALID_NEXT_BUDGET_ROUND_COMMAND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE id=p_budget_cycle_id;
  IF v_cycle.id IS NULL THEN RAISE EXCEPTION 'BUDGET_CYCLE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF lower((SELECT role FROM public.profiles WHERE id=v_uid)) NOT IN('pm','admin') OR public.can_write_project(v_cycle.project_id) IS NOT TRUE THEN RAISE EXCEPTION 'BUDGET_ROUND_FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id) VALUES(v_uid,'budget.start_next_round',p_client_request_id,v_cycle.project_id) ON CONFLICT(actor_id,operation,client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='budget.start_next_round' AND client_request_id=p_client_request_id;
  IF v_request.project_id IS DISTINCT FROM v_cycle.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505'; END IF;
  IF v_request.response IS NOT NULL THEN IF(v_request.response->>'budgetCycleId')::uuid IS DISTINCT FROM p_budget_cycle_id THEN RAISE EXCEPTION 'Idempotency key belongs to another Budget Cycle' USING ERRCODE='23505'; END IF;RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  SELECT * INTO v_cycle FROM public.project_budget_cycles WHERE id=p_budget_cycle_id FOR UPDATE;
  IF v_cycle.round_revision<>p_expected_revision THEN RAISE EXCEPTION 'BUDGET_ROUND_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF v_cycle.approval_state='APPROVED' THEN RAISE EXCEPTION 'APPROVED_BUDGET_IS_IMMUTABLE' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_previous_round FROM public.project_budget_rounds WHERE budget_cycle_id=p_budget_cycle_id AND round_number=v_cycle.current_round_number;
  IF v_cycle.round_state<>'ISSUED' OR v_previous_round.id IS NULL THEN RAISE EXCEPTION 'BUDGET_ROUND_NOT_ISSUED' USING ERRCODE='55000'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.project_budget_round_reviews WHERE round_id=v_previous_round.id AND decision='REVISION_REQUIRED') THEN RAISE EXCEPTION 'NEXT_BUDGET_ROUND_REQUIRES_REVISION_DECISION' USING ERRCODE='55000'; END IF;
  UPDATE public.project_budget_contributions SET status='IN_PROGRESS',revision=revision+1,updated_by=v_uid,updated_at=now() WHERE budget_cycle_id=p_budget_cycle_id AND status='SUBMITTED';
  UPDATE public.project_budget_cycles SET current_round_number=current_round_number+1,round_state='DRAFT',round_revision=round_revision+1 WHERE id=p_budget_cycle_id;
  INSERT INTO public.project_budget_round_events(id,budget_cycle_id,project_id,round_id,round_number,event_type,note,actor_id) VALUES(gen_random_uuid(),p_budget_cycle_id,v_cycle.project_id,v_previous_round.id,v_cycle.current_round_number+1,'NEXT_ROUND_STARTED',btrim(COALESCE(p_note,'')),v_uid);
  v_result:=jsonb_build_object('budgetCycleId',p_budget_cycle_id,'roundNumber',v_cycle.current_round_number+1,'basedOnRoundId',v_previous_round.id,'roundRevision',v_cycle.round_revision+1);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

REVOKE ALL ON FUNCTION public.get_project_budget_approval(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_project_budget_approval(bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.review_project_budget_round(uuid,text,text,uuid,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.review_project_budget_round(uuid,text,text,uuid,integer,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.start_next_project_budget_round(uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.start_next_project_budget_round(uuid,text,integer,uuid) TO authenticated;
