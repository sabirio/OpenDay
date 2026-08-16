\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"82b25233-9e9d-4038-8713-4682aa63b2be","role":"authenticated"}',true);
DO $$
DECLARE v_project bigint:=900001;v_cp uuid:='a1300000-0000-4000-a000-000000000001';v_tender uuid:='a1300000-0000-4000-a000-000000000002';v_participant uuid:='a1300000-0000-4000-a000-000000000003';v_consultant_boq uuid;v_scope uuid[];v_workspace jsonb;v_items jsonb;v_saved jsonb;v_setup jsonb;v_round jsonb;v_submission jsonb;v_submission_id bigint;v_award jsonb;v_award_id uuid;v_baseline uuid;v_first_line uuid;v_custom_line uuid:='a1300000-0000-4000-a000-000000000004';v_bidder uuid:='b0614918-634c-4a1a-b59a-09d0915f4dfa';
BEGIN
  SELECT array_agg(id ORDER BY code)INTO v_scope FROM(SELECT id,code FROM public.work_ontology_work_groups WHERE ontology_version_id=(SELECT work_ontology_version_id FROM public.projects WHERE id=v_project)AND is_active ORDER BY code LIMIT 2)selected;
  PERFORM public.save_project_cost_package(v_project,v_cp,'AWARD-CP','Award Test Cost Package','COMPETITIVE_TENDER','KZT','ACTIVE',v_scope,NULL,0,gen_random_uuid());
  PERFORM public.create_project_tender_package(v_project,v_tender,'AWARD-T01',ARRAY[v_cp],'COMPETITIVE_TENDER','CONSULTANT_MEASURED',gen_random_uuid());
  v_workspace:=public.get_consultant_boq_workspace(v_tender);v_consultant_boq:=(v_workspace->>'consultantBoqId')::uuid;
  SELECT jsonb_agg(item||jsonb_build_object('consultantQuantity','1')ORDER BY ordinal)INTO v_items FROM jsonb_array_elements(v_workspace->'items')WITH ORDINALITY source(item,ordinal);
  v_saved:=public.save_consultant_boq_revision(v_tender,v_consultant_boq,(v_workspace->>'projectBoqId')::uuid,v_items,0,'Award baseline test',gen_random_uuid());
  PERFORM public.submit_consultant_boq(v_consultant_boq,(v_saved->>'revisionNumber')::integer,gen_random_uuid());PERFORM public.review_consultant_boq(v_consultant_boq,'ACCEPT',NULL,(v_saved->>'revisionNumber')::integer,gen_random_uuid());
  v_workspace:=public.get_consultant_boq_workspace(v_tender);
  v_setup:=public.save_project_tender_setup(v_project,v_tender,'AWARD-T01','Award Test Tender',now()+interval'30 days','KZT','Test rules','Test invitation',(v_workspace->>'issuedProjectBoqVersionId')::bigint,to_jsonb(v_scope),jsonb_build_array(jsonb_build_object('participantId',v_participant,'contractorName','Test Contractor','contactEmail','sabirx86@gmail.com')),0,gen_random_uuid());
  PERFORM public.invite_project_tender_bidder(v_tender,v_participant,gen_random_uuid());
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_bidder,'role','authenticated')::text,true);PERFORM public.respond_to_my_tender_invitation(v_tender,'ACCEPTED',gen_random_uuid());
  PERFORM set_config('request.jwt.claims','{"sub":"82b25233-9e9d-4038-8713-4682aa63b2be","role":"authenticated"}',true);v_round:=public.open_next_tender_bid_round(v_tender,gen_random_uuid());
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_bidder,'role','authenticated')::text,true);v_workspace:=public.get_my_tender_bid_round_workspace(v_tender);v_first_line:=(v_workspace->'items'->0->>'lineId')::uuid;
  SELECT jsonb_agg((item||jsonb_build_object('quantity','1','labourRate','10','materialRate','5'))||CASE WHEN ordinal=1 THEN jsonb_build_object('lineAction','EXCLUDED')ELSE'{}'::jsonb END ORDER BY ordinal)INTO v_items FROM jsonb_array_elements(v_workspace->'items')WITH ORDINALITY source(item,ordinal);
  v_items:=v_items||jsonb_build_array(jsonb_build_object('lineId',v_custom_line,'workGroupId',v_scope[1],'description','Contractor agreed alternative','unit','ea','lineOrigin','CONTRACTOR_ADDED','lineAction','INCLUDED','quantity','2','labourRate','20','materialRate','30','bidderNote','Agreed custom line'));
  v_saved:=public.save_my_tender_bid_draft((v_round->>'bidRoundId')::bigint,v_items,0,gen_random_uuid());v_submission:=public.submit_my_tender_bid((v_round->>'bidRoundId')::bigint,(v_saved->>'draftRevision')::integer,gen_random_uuid());v_submission_id:=(v_submission->>'submissionId')::bigint;
  PERFORM set_config('request.jwt.claims','{"sub":"82b25233-9e9d-4038-8713-4682aa63b2be","role":"authenticated"}',true);PERFORM public.set_tender_bid_review_status(v_submission_id,'REVIEWED',0,gen_random_uuid());
  v_award:=public.award_project_tender(v_submission_id,'Approved after commercial review',gen_random_uuid());v_award_id:=(v_award->>'awardId')::uuid;v_baseline:=(v_award->>'commercialBaselineId')::uuid;
  IF EXISTS(SELECT 1 FROM public.project_tender_awarded_boq_items WHERE award_id=v_award_id AND line_id=v_first_line)THEN RAISE EXCEPTION'EXCLUDED_LINE_ENTERED_AWARD';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.project_tender_awarded_boq_items WHERE award_id=v_award_id AND line_id=v_custom_line AND item_kind='CUSTOM'AND line_origin='CONTRACTOR_ADDED')THEN RAISE EXCEPTION'CUSTOM_LINE_MISSING_FROM_AWARD';END IF;
  IF(SELECT baseline_value FROM public.project_commercial_baselines WHERE id=v_baseline)<>(SELECT contract_value FROM public.project_tender_awards WHERE id=v_award_id)THEN RAISE EXCEPTION'BASELINE_VALUE_MISMATCH';END IF;
  IF(SELECT sum(baseline_value)FROM public.project_commercial_baseline_cost_packages WHERE baseline_id=v_baseline)<>(SELECT baseline_value FROM public.project_commercial_baselines WHERE id=v_baseline)THEN RAISE EXCEPTION'COST_PACKAGE_BASELINE_MISMATCH';END IF;
  IF(SELECT status FROM public.project_consultant_boqs WHERE id=v_consultant_boq)<>'FROZEN'THEN RAISE EXCEPTION'CONSULTANT_BOQ_WAS_CHANGED';END IF;
  BEGIN UPDATE public.project_commercial_baselines SET baseline_value=0 WHERE id=v_baseline;RAISE EXCEPTION'BASELINE_MUTATION_ALLOWED';EXCEPTION WHEN sqlstate'55000'THEN NULL;END;
  BEGIN UPDATE public.project_tender_bid_submissions SET total=0 WHERE id=v_submission_id;RAISE EXCEPTION'BID_SNAPSHOT_MUTATION_ALLOWED';EXCEPTION WHEN sqlstate'55000'THEN NULL;END;
END;$$;
ROLLBACK;
