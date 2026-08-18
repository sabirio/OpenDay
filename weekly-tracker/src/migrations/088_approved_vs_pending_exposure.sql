-- 088_approved_vs_pending_exposure.sql
-- Roadmap F.33: keep committed cost separate from unapproved commercial exposure.

CREATE OR REPLACE FUNCTION public.get_project_variation_exposure(p_project_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path=public
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_role text;
  v_project public.projects%ROWTYPE;
  v_award public.project_tender_awards%ROWTYPE;
  v_currency text;
  v_approved numeric(24,2):=0;
  v_pending numeric(24,2):=0;
  v_mismatch integer:=0;
  v_ready boolean;
  v_breakdown jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id;
  IF v_project.id IS NULL THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE='P0002';END IF;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(p_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'VARIATION_EXPOSURE_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_award FROM public.project_tender_awards
  WHERE project_id=p_project_id ORDER BY awarded_at DESC LIMIT 1;
  v_currency:=COALESCE(v_award.currency_code,v_project.currency_code,'USD');

  SELECT
    COALESCE(sum(approved_amount) FILTER(WHERE status='APPROVED' AND currency_code=v_currency),0),
    COALESCE(sum(proposed_amount) FILTER(WHERE status IN('SUBMITTED','UNDER_REVIEW','REVISION_REQUIRED') AND currency_code=v_currency),0),
    count(*) FILTER(WHERE status IN('SUBMITTED','UNDER_REVIEW','REVISION_REQUIRED','APPROVED') AND currency_code<>v_currency)
  INTO v_approved,v_pending,v_mismatch
  FROM public.project_variations WHERE project_id=p_project_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'workGroupId',x.work_group_id,'workGroupCode',x.work_group_code,'workGroupLabel',x.work_group_label,
    'approvedVariations',x.approved_amount,'pendingExposure',x.pending_amount,
    'approvedCount',x.approved_count,'pendingCount',x.pending_count
  ) ORDER BY x.work_group_code),'[]'::jsonb) INTO v_breakdown
  FROM(
    SELECT v.work_group_id,g.code work_group_code,g.label work_group_label,
      COALESCE(sum(v.approved_amount)FILTER(WHERE v.status='APPROVED'),0)approved_amount,
      COALESCE(sum(v.proposed_amount)FILTER(WHERE v.status IN('SUBMITTED','UNDER_REVIEW','REVISION_REQUIRED')),0)pending_amount,
      count(*)FILTER(WHERE v.status='APPROVED')approved_count,
      count(*)FILTER(WHERE v.status IN('SUBMITTED','UNDER_REVIEW','REVISION_REQUIRED'))pending_count
    FROM public.project_variations v
    JOIN public.work_ontology_work_groups g ON g.ontology_version_id=v.ontology_version_id AND g.id=v.work_group_id
    WHERE v.project_id=p_project_id AND v.currency_code=v_currency
      AND v.status IN('SUBMITTED','UNDER_REVIEW','REVISION_REQUIRED','APPROVED')
    GROUP BY v.work_group_id,g.code,g.label
  )x;

  v_ready:=v_award.id IS NOT NULL AND v_mismatch=0;
  RETURN jsonb_build_object(
    'projectId',p_project_id,'currencyCode',v_currency,'hasAward',v_award.id IS NOT NULL,
    'currencyAligned',v_mismatch=0,'currencyMismatchCount',v_mismatch,'exposureReady',v_ready,
    'awardedContractValue',CASE WHEN v_award.id IS NULL THEN NULL ELSE v_award.contract_value END,
    'approvedVariations',v_approved,'pendingExposure',v_pending,
    'currentCommittedCost',CASE WHEN v_ready THEN v_award.contract_value+v_approved ELSE NULL END,
    'potentialCommittedCost',CASE WHEN v_ready THEN v_award.contract_value+v_approved+v_pending ELSE NULL END,
    'breakdown',v_breakdown,
    'rule','Only approved variations are included in Current Committed Cost; pending variations remain Potential Exposure.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_variation_exposure(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_project_variation_exposure(bigint) TO authenticated;
