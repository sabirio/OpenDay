-- 084_budget_vs_tender.sql
-- Roadmap E.29: deterministic, scope-aligned Approved Budget vs Tender read model.
-- No FX conversion, recommendation, approval report or mutable comparison state.

CREATE OR REPLACE FUNCTION public.get_tender_budget_comparison(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_role text;
  v_tender public.project_tenders%ROWTYPE;
  v_baseline public.approved_budget_baselines%ROWTYPE;
  v_rounds jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO v_tender FROM public.project_tenders WHERE id=p_tender_id;
  IF v_tender.id IS NULL THEN RAISE EXCEPTION 'TENDER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_tender.project_id) IS NOT TRUE
    THEN RAISE EXCEPTION 'TENDER_BUDGET_COMPARISON_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_baseline FROM public.approved_budget_baselines WHERE project_id=v_tender.project_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'bidRoundId',round.id,
    'baselineId',v_baseline.id,
    'sourceBudgetRoundNumber',v_baseline.source_round_number,
    'budgetCurrencyCode',v_baseline.currency_code,
    'tenderCurrencyCode',setup.currency_code,
    'currencyMatch',v_baseline.id IS NOT NULL AND v_baseline.currency_code=setup.currency_code,
    'ontologyMatch',v_baseline.id IS NOT NULL AND v_baseline.ontology_version_id=round.ontology_version_id,
    'tenderScopeWorkGroupCount',(SELECT count(*) FROM public.project_tender_scope_work_groups scope WHERE scope.tender_setup_version_id=round.tender_setup_version_id),
    'budgetedWorkGroupCount',(SELECT count(*) FROM public.project_tender_scope_work_groups scope JOIN public.approved_budget_baseline_items item ON item.baseline_id=v_baseline.id AND item.work_group_id=scope.work_group_id WHERE scope.tender_setup_version_id=round.tender_setup_version_id),
    'missingBudgetWorkGroupCount',(SELECT count(*) FROM public.project_tender_scope_work_groups scope LEFT JOIN public.approved_budget_baseline_items item ON item.baseline_id=v_baseline.id AND item.work_group_id=scope.work_group_id WHERE scope.tender_setup_version_id=round.tender_setup_version_id AND item.work_group_id IS NULL),
    'baselineOutsideTenderCount',CASE WHEN v_baseline.id IS NULL THEN 0 ELSE (SELECT count(*) FROM public.approved_budget_baseline_items item WHERE item.baseline_id=v_baseline.id AND NOT EXISTS(SELECT 1 FROM public.project_tender_scope_work_groups scope WHERE scope.tender_setup_version_id=round.tender_setup_version_id AND scope.work_group_id=item.work_group_id)) END,
    'scopeBudgetTotal',CASE WHEN v_baseline.id IS NULL THEN NULL ELSE (SELECT COALESCE(sum(item.amount),0) FROM public.project_tender_scope_work_groups scope JOIN public.approved_budget_baseline_items item ON item.baseline_id=v_baseline.id AND item.work_group_id=scope.work_group_id WHERE scope.tender_setup_version_id=round.tender_setup_version_id) END,
    'available',v_baseline.id IS NOT NULL
      AND v_baseline.currency_code=setup.currency_code
      AND v_baseline.ontology_version_id=round.ontology_version_id
      AND NOT EXISTS(SELECT 1 FROM public.project_tender_scope_work_groups scope LEFT JOIN public.approved_budget_baseline_items item ON item.baseline_id=v_baseline.id AND item.work_group_id=scope.work_group_id WHERE scope.tender_setup_version_id=round.tender_setup_version_id AND item.work_group_id IS NULL),
    'unavailableReason',CASE
      WHEN v_baseline.id IS NULL THEN 'APPROVED_BUDGET_BASELINE_REQUIRED'
      WHEN v_baseline.ontology_version_id<>round.ontology_version_id THEN 'BUDGET_TENDER_ONTOLOGY_MISMATCH'
      WHEN v_baseline.currency_code<>setup.currency_code THEN 'BUDGET_TENDER_CURRENCY_MISMATCH'
      WHEN EXISTS(SELECT 1 FROM public.project_tender_scope_work_groups scope LEFT JOIN public.approved_budget_baseline_items item ON item.baseline_id=v_baseline.id AND item.work_group_id=scope.work_group_id WHERE scope.tender_setup_version_id=round.tender_setup_version_id AND item.work_group_id IS NULL) THEN 'BUDGET_TENDER_SCOPE_GAP'
      ELSE NULL END,
    'workGroups',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'disciplineId',discipline.id,'disciplineCode',discipline.code,'disciplineLabel',discipline.label,
      'workGroupId',work_group.id,'workGroupCode',work_group.code,'workGroupLabel',work_group.label,
      'budgetAmount',item.amount
    )ORDER BY discipline.display_order,work_group.display_order)
    FROM public.project_tender_scope_work_groups scope
    JOIN public.work_ontology_work_groups work_group ON work_group.ontology_version_id=round.ontology_version_id AND work_group.id=scope.work_group_id
    JOIN public.work_ontology_disciplines discipline ON discipline.ontology_version_id=round.ontology_version_id AND discipline.id=work_group.discipline_id
    LEFT JOIN public.approved_budget_baseline_items item ON item.baseline_id=v_baseline.id AND item.work_group_id=scope.work_group_id
    WHERE scope.tender_setup_version_id=round.tender_setup_version_id),'[]'::jsonb)
  )ORDER BY round.round_number),'[]'::jsonb) INTO v_rounds
  FROM public.project_tender_bid_rounds round
  JOIN public.project_tender_setup_versions setup ON setup.id=round.tender_setup_version_id
  WHERE round.tender_id=p_tender_id;

  RETURN jsonb_build_object(
    'tenderId',p_tender_id,
    'projectId',v_tender.project_id,
    'calculationContract','EXACT_DECIMAL_BUDGET_VARIANCE_V1',
    'baselineStatus',CASE WHEN v_baseline.id IS NULL THEN 'NOT_APPROVED' ELSE 'APPROVED' END,
    'rounds',v_rounds
  );
END;$$;

REVOKE ALL ON FUNCTION public.get_tender_budget_comparison(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_tender_budget_comparison(uuid) TO authenticated;
