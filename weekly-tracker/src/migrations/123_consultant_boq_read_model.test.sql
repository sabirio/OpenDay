\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"82b25233-9e9d-4038-8713-4682aa63b2be","role":"authenticated"}', true);

DO $$
DECLARE
  v_project_id bigint := 900001;
  v_cost_package_id uuid := 'a1230000-0000-4000-a000-000000000001';
  v_tender_id uuid := 'a1230000-0000-4000-a000-000000000002';
  v_consultant_boq_id uuid;
  v_scope uuid[];
  v_workspace jsonb;
  v_items jsonb;
  v_saved jsonb;
BEGIN
  SELECT array_agg(id ORDER BY code) INTO v_scope
  FROM (SELECT id, code FROM public.work_ontology_work_groups
    WHERE ontology_version_id=(SELECT work_ontology_version_id FROM public.projects WHERE id=v_project_id)
      AND is_active ORDER BY code LIMIT 2) selected;

  PERFORM public.save_project_cost_package(
    v_project_id, v_cost_package_id, 'TEST-CP', 'Test Cost Package', 'COMPETITIVE_TENDER', 'KZT',
    'ACTIVE', v_scope, NULL, 0, 'a1230000-0000-4000-a000-000000000003'
  );
  PERFORM public.create_project_tender_package(
    v_project_id, v_tender_id, 'TEST-T01', ARRAY[v_cost_package_id], 'COMPETITIVE_TENDER',
    'CONSULTANT_MEASURED', 'a1230000-0000-4000-a000-000000000004'
  );

  v_workspace := public.get_consultant_boq_workspace(v_tender_id);
  IF jsonb_array_length(v_workspace->'items') = 0 OR v_workspace->>'status' <> 'NOT_STARTED' THEN
    RAISE EXCEPTION 'Consultant BOQ read model did not seed scoped standard lines';
  END IF;
  v_consultant_boq_id := (v_workspace->>'consultantBoqId')::uuid;
  SELECT jsonb_agg(item || jsonb_build_object('consultantQuantity','1') ORDER BY ordinal)
    INTO v_items FROM jsonb_array_elements(v_workspace->'items') WITH ORDINALITY source(item,ordinal);
  v_saved := public.save_consultant_boq_revision(
    v_tender_id, v_consultant_boq_id, (v_workspace->>'projectBoqId')::uuid, v_items, 0,
    'Integration test', 'a1230000-0000-4000-a000-000000000005'
  );
  PERFORM public.submit_consultant_boq(v_consultant_boq_id, (v_saved->>'revisionNumber')::integer,
    'a1230000-0000-4000-a000-000000000006');
  PERFORM public.review_consultant_boq(v_consultant_boq_id, 'ACCEPT', NULL,
    (v_saved->>'revisionNumber')::integer, 'a1230000-0000-4000-a000-000000000007');

  v_workspace := public.get_consultant_boq_workspace(v_tender_id);
  IF v_workspace->>'status' <> 'FROZEN' OR v_workspace->>'issuedProjectBoqVersionId' IS NULL THEN
    RAISE EXCEPTION 'Accepted Consultant BOQ was not frozen into an issued BOQ snapshot';
  END IF;
  v_saved:=public.save_project_tender_setup(
    v_project_id,v_tender_id,'TEST-T01','Test Consultant Tender',now()+interval'30 days','KZT',
    'Test rules','Test invitation',(v_workspace->>'issuedProjectBoqVersionId')::bigint,to_jsonb(v_scope),
    jsonb_build_array(jsonb_build_object('participantId','a1230000-0000-4000-a000-000000000008','contractorName','Test Contractor','contactEmail','test-contractor@example.com')),
    0,'a1230000-0000-4000-a000-000000000009'
  );
  IF(v_saved->>'revisionNumber')::integer<>1 THEN RAISE EXCEPTION'Tender Setup did not accept the frozen Consultant BOQ';END IF;
END;
$$;

ROLLBACK;
