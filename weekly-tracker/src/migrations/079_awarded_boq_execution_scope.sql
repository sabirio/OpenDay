-- 079_awarded_boq_execution_scope.sql
-- Roadmap Phase D.24: immutable Awarded BOQ -> ready-to-schedule Execution Scope.
-- Detailed commercial lines collapse to canonical Work Groups. No Gantt activity,
-- dates, durations, dependencies, sequencing or progress are created here.

ALTER TABLE public.project_execution_scope_versions
  DROP CONSTRAINT IF EXISTS project_execution_scope_versions_source_kind_check;
ALTER TABLE public.project_execution_scope_versions
  DROP CONSTRAINT IF EXISTS project_execution_scope_versions_source_shape_check;
ALTER TABLE public.project_execution_scope_versions
  ADD COLUMN IF NOT EXISTS source_award_id uuid;
ALTER TABLE public.project_execution_scope_versions
  ADD CONSTRAINT project_execution_scope_versions_source_award_fk
  FOREIGN KEY (source_award_id) REFERENCES public.project_tender_awards(id) ON DELETE RESTRICT;
ALTER TABLE public.project_execution_scope_versions
  ADD CONSTRAINT project_execution_scope_versions_source_kind_check
  CHECK (source_kind IN ('PM_DISCIPLINE_SCOPE','BOQ_REVISION','AWARDED_BOQ'));
ALTER TABLE public.project_execution_scope_versions
  ADD CONSTRAINT project_execution_scope_versions_source_shape_check CHECK (
    (source_kind='PM_DISCIPLINE_SCOPE' AND source_boq_version_id IS NULL AND source_award_id IS NULL)
    OR (source_kind='BOQ_REVISION' AND source_boq_version_id IS NOT NULL AND source_award_id IS NULL)
    OR (source_kind='AWARDED_BOQ' AND source_boq_version_id IS NULL AND source_award_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS project_execution_scope_versions_award_source_uniq
  ON public.project_execution_scope_versions(project_id,source_award_id)
  WHERE source_award_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_awarded_execution_scope_status(p_award_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_award public.project_tender_awards%ROWTYPE;v_scope public.project_execution_scope_versions%ROWTYPE;v_latest_revision integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT * INTO v_award FROM public.project_tender_awards WHERE id=p_award_id;
  IF v_award.id IS NULL THEN RAISE EXCEPTION 'TENDER_AWARD_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_award.project_id) IS NOT TRUE THEN RAISE EXCEPTION 'AWARDED_SCOPE_FORBIDDEN' USING ERRCODE='42501';END IF;
  SELECT COALESCE(max(revision_number),0) INTO v_latest_revision FROM public.project_execution_scope_versions WHERE project_id=v_award.project_id;
  SELECT * INTO v_scope FROM public.project_execution_scope_versions WHERE project_id=v_award.project_id AND source_award_id=v_award.id;
  RETURN jsonb_build_object(
    'awardId',v_award.id,'projectId',v_award.project_id,'expectedLatestScopeRevision',v_latest_revision,
    'materialized',v_scope.id IS NOT NULL,
    'executionScopeVersionId',v_scope.id,'revisionNumber',v_scope.revision_number,'sourceKind',v_scope.source_kind,
    'boqLineCount',(SELECT count(*) FROM public.project_tender_awarded_boq_items WHERE award_id=v_award.id),
    'workGroupCount',(SELECT count(*) FROM public.project_tender_awarded_work_groups WHERE award_id=v_award.id),
    'collapsedLineCount',(SELECT count(*) FROM public.project_tender_awarded_boq_items WHERE award_id=v_award.id)-(SELECT count(*) FROM public.project_tender_awarded_work_groups WHERE award_id=v_award.id)
  );
END;$$;

CREATE OR REPLACE FUNCTION public.materialize_execution_scope_from_awarded_boq(
  p_award_id uuid,p_expected_latest_scope_revision integer,p_client_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_award public.project_tender_awards%ROWTYPE;v_project public.projects%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_existing public.project_execution_scope_versions%ROWTYPE;v_current_revision integer;v_scope_id bigint;v_line_count integer;v_group_count integer;v_item_total numeric(24,2);v_group_total numeric(24,2);v_discipline_ids uuid[];v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_award_id IS NULL OR p_client_request_id IS NULL OR p_expected_latest_scope_revision IS NULL OR p_expected_latest_scope_revision<0 THEN RAISE EXCEPTION 'INVALID_AWARDED_SCOPE_COMMAND' USING ERRCODE='22023';END IF;
  SELECT * INTO v_award FROM public.project_tender_awards WHERE id=p_award_id;
  IF v_award.id IS NULL THEN RAISE EXCEPTION 'TENDER_AWARD_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_award.project_id) IS NOT TRUE THEN RAISE EXCEPTION 'AWARDED_SCOPE_FORBIDDEN' USING ERRCODE='42501';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.materialize_awarded_scope',p_client_request_id,v_award.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.materialize_awarded_scope' AND client_request_id=p_client_request_id;
  IF v_request.project_id IS DISTINCT FROM v_award.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN
    IF (v_request.response->>'awardId')::uuid IS DISTINCT FROM p_award_id THEN RAISE EXCEPTION 'Idempotency key belongs to another award' USING ERRCODE='23505';END IF;
    RETURN v_request.response||jsonb_build_object('idempotentReplay',true);
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id=v_award.project_id FOR UPDATE;
  IF v_project.work_ontology_version_id IS DISTINCT FROM v_award.ontology_version_id THEN RAISE EXCEPTION 'AWARDED_SCOPE_ONTOLOGY_MISMATCH' USING ERRCODE='23514';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.project_tenders WHERE id=v_award.tender_id AND status='AWARDED') THEN RAISE EXCEPTION 'AWARDED_SCOPE_REQUIRES_AWARDED_TENDER' USING ERRCODE='55000';END IF;
  SELECT * INTO v_existing FROM public.project_execution_scope_versions WHERE project_id=v_award.project_id AND source_award_id=v_award.id;
  SELECT count(*),COALESCE(sum(line_total),0) INTO v_line_count,v_item_total FROM public.project_tender_awarded_boq_items WHERE award_id=v_award.id;
  SELECT count(*),COALESCE(sum(awarded_total),0) INTO v_group_count,v_group_total FROM public.project_tender_awarded_work_groups WHERE award_id=v_award.id;
  IF v_line_count=0 OR v_group_count=0 OR v_item_total IS DISTINCT FROM v_award.contract_value OR v_group_total IS DISTINCT FROM v_award.contract_value THEN RAISE EXCEPTION 'AWARDED_SCOPE_SOURCE_RECONCILIATION_FAILED' USING ERRCODE='23514';END IF;
  IF v_existing.id IS NOT NULL THEN
    v_result:=jsonb_build_object('awardId',v_award.id,'projectId',v_award.project_id,'executionScopeVersionId',v_existing.id,'revisionNumber',v_existing.revision_number,'sourceKind','AWARDED_BOQ','boqLineCount',v_line_count,'workGroupCount',v_group_count,'collapsedLineCount',v_line_count-v_group_count,'alreadyMaterialized',true);
    UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.project_tender_awarded_work_groups snapshot
    JOIN public.work_ontology_work_groups work_group ON work_group.ontology_version_id=snapshot.ontology_version_id AND work_group.id=snapshot.work_group_id
    WHERE snapshot.award_id=v_award.id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_project.scope->'disciplineIds') selected(value) WHERE selected.value::uuid=work_group.discipline_id)
  ) THEN RAISE EXCEPTION 'AWARDED_WORK_GROUP_OUTSIDE_PROJECT_DISCIPLINE_SCOPE' USING ERRCODE='23514';END IF;
  SELECT COALESCE(max(revision_number),0) INTO v_current_revision FROM public.project_execution_scope_versions WHERE project_id=v_award.project_id;
  IF v_current_revision IS DISTINCT FROM p_expected_latest_scope_revision THEN RAISE EXCEPTION 'EXECUTION_SCOPE_REVISION_CONFLICT: expected %, current %',p_expected_latest_scope_revision,v_current_revision USING ERRCODE='40001';END IF;
  SELECT array_agg(x.discipline_id ORDER BY x.display_order,x.discipline_id) INTO v_discipline_ids FROM(
    SELECT DISTINCT discipline.id discipline_id,discipline.display_order FROM public.project_tender_awarded_work_groups snapshot
    JOIN public.work_ontology_work_groups work_group ON work_group.ontology_version_id=snapshot.ontology_version_id AND work_group.id=snapshot.work_group_id
    JOIN public.work_ontology_disciplines discipline ON discipline.ontology_version_id=work_group.ontology_version_id AND discipline.id=work_group.discipline_id
    WHERE snapshot.award_id=v_award.id
  )x;
  INSERT INTO public.project_execution_scope_versions(project_id,ontology_version_id,revision_number,source_kind,source_fingerprint,selected_discipline_ids,source_award_id,created_by)
    VALUES(v_award.project_id,v_award.ontology_version_id,v_current_revision+1,'AWARDED_BOQ','AWARDED_BOQ:'||v_award.id::text,v_discipline_ids,v_award.id,v_uid) RETURNING id INTO v_scope_id;
  INSERT INTO public.project_execution_scope_items(execution_scope_version_id,ontology_version_id,discipline_id,work_group_id)
    SELECT v_scope_id,snapshot.ontology_version_id,work_group.discipline_id,snapshot.work_group_id FROM public.project_tender_awarded_work_groups snapshot
    JOIN public.work_ontology_work_groups work_group ON work_group.ontology_version_id=snapshot.ontology_version_id AND work_group.id=snapshot.work_group_id
    WHERE snapshot.award_id=v_award.id ORDER BY work_group.discipline_id,snapshot.work_group_id;
  IF (SELECT count(*) FROM public.project_execution_scope_items WHERE execution_scope_version_id=v_scope_id)<>v_group_count THEN RAISE EXCEPTION 'AWARDED_SCOPE_WORK_GROUP_RECONCILIATION_FAILED' USING ERRCODE='23514';END IF;
  v_result:=jsonb_build_object('awardId',v_award.id,'projectId',v_award.project_id,'executionScopeVersionId',v_scope_id,'revisionNumber',v_current_revision+1,'sourceKind','AWARDED_BOQ','boqLineCount',v_line_count,'workGroupCount',v_group_count,'collapsedLineCount',v_line_count-v_group_count,'alreadyMaterialized',false);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

REVOKE ALL ON FUNCTION public.get_awarded_execution_scope_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.materialize_execution_scope_from_awarded_boq(uuid,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_awarded_execution_scope_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_execution_scope_from_awarded_boq(uuid,integer,uuid) TO authenticated;
