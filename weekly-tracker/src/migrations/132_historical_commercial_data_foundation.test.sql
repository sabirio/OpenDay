\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"82b25233-9e9d-4038-8713-4682aa63b2be","role":"authenticated"}',true);
DO $$
DECLARE v_project bigint:=900001;v_cp uuid:='a1320000-0000-4000-a000-000000000001';v_tender uuid:='a1320000-0000-4000-a000-000000000002';v_participant uuid:='a1320000-0000-4000-a000-000000000003';v_consultant_boq uuid;v_scope uuid[];v_workspace jsonb;v_items jsonb;v_saved jsonb;v_setup jsonb;v_round jsonb;v_submission jsonb;v_submission_id bigint;v_award jsonb;v_custom_line uuid:='a1320000-0000-4000-a000-000000000004';v_bidder uuid:='b0614918-634c-4a1a-b59a-09d0915f4dfa';v_commitment uuid;
BEGIN
  SELECT array_agg(id ORDER BY code)INTO v_scope FROM(SELECT id,code FROM public.work_ontology_work_groups WHERE ontology_version_id=(SELECT work_ontology_version_id FROM public.projects WHERE id=v_project)AND is_active ORDER BY code LIMIT 2)selected;
  PERFORM public.save_project_cost_package(v_project,v_cp,'HIST-CP','Historical Test Cost Package','COMPETITIVE_TENDER','KZT','ACTIVE',v_scope,NULL,0,gen_random_uuid());
  PERFORM public.create_project_tender_package(v_project,v_tender,'HIST-T01',ARRAY[v_cp],'COMPETITIVE_TENDER','CONSULTANT_MEASURED',gen_random_uuid());
  v_workspace:=public.get_consultant_boq_workspace(v_tender);v_consultant_boq:=(v_workspace->>'consultantBoqId')::uuid;
  SELECT jsonb_agg(item||jsonb_build_object('consultantQuantity','2')ORDER BY ordinal)INTO v_items FROM jsonb_array_elements(v_workspace->'items')WITH ORDINALITY source(item,ordinal);
  v_saved:=public.save_consultant_boq_revision(v_tender,v_consultant_boq,(v_workspace->>'projectBoqId')::uuid,v_items,0,'Historical capture test',gen_random_uuid());
  PERFORM public.submit_consultant_boq(v_consultant_boq,(v_saved->>'revisionNumber')::integer,gen_random_uuid());PERFORM public.review_consultant_boq(v_consultant_boq,'ACCEPT',NULL,(v_saved->>'revisionNumber')::integer,gen_random_uuid());
  v_workspace:=public.get_consultant_boq_workspace(v_tender);
  v_setup:=public.save_project_tender_setup(v_project,v_tender,'HIST-T01','Historical Test Tender',now()+interval'30 days','KZT','Test rules','Test invitation',(v_workspace->>'issuedProjectBoqVersionId')::bigint,to_jsonb(v_scope),jsonb_build_array(jsonb_build_object('participantId',v_participant,'contractorName','Historical Contractor','contactEmail','sabirx86@gmail.com')),0,gen_random_uuid());
  PERFORM public.invite_project_tender_bidder(v_tender,v_participant,gen_random_uuid());
  UPDATE public.project_tender_bidder_access SET email_sent_at=now()WHERE tender_id=v_tender AND participant_id=v_participant;
  IF NOT EXISTS(SELECT 1 FROM public.project_tender_invitation_events WHERE tender_id=v_tender AND participant_id=v_participant AND event_type='SENT')THEN RAISE EXCEPTION'INVITATION_SENT_EVENT_MISSING';END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_bidder,'role','authenticated')::text,true);PERFORM public.respond_to_my_tender_invitation(v_tender,'ACCEPTED',gen_random_uuid());
  PERFORM set_config('request.jwt.claims','{"sub":"82b25233-9e9d-4038-8713-4682aa63b2be","role":"authenticated"}',true);v_round:=public.open_next_tender_bid_round(v_tender,gen_random_uuid());
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_bidder,'role','authenticated')::text,true);v_workspace:=public.get_my_tender_bid_round_workspace(v_tender);
  SELECT jsonb_agg(item||jsonb_build_object('quantity','3','labourRate','10','materialRate','5')ORDER BY ordinal)INTO v_items FROM jsonb_array_elements(v_workspace->'items')WITH ORDINALITY source(item,ordinal);
  v_items:=v_items||jsonb_build_array(jsonb_build_object('lineId',v_custom_line,'workGroupId',v_scope[1],'description','Historical custom line','unit','ea','lineOrigin','CONTRACTOR_ADDED','lineAction','INCLUDED','quantity','2','labourRate','20','materialRate','30','bidderNote','Captured custom scope'));
  v_saved:=public.save_my_tender_bid_draft((v_round->>'bidRoundId')::bigint,v_items,0,gen_random_uuid());v_submission:=public.submit_my_tender_bid((v_round->>'bidRoundId')::bigint,(v_saved->>'draftRevision')::integer,gen_random_uuid());v_submission_id:=(v_submission->>'submissionId')::bigint;
  IF (SELECT count(*)FROM public.project_tender_historical_bid_line_facts WHERE bid_submission_id=v_submission_id)<>jsonb_array_length(v_items)THEN RAISE EXCEPTION'HISTORICAL_BID_FACT_COUNT_MISMATCH';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.project_tender_historical_bid_line_facts WHERE bid_submission_id=v_submission_id AND line_id=v_custom_line AND line_origin='CONTRACTOR_ADDED'AND contractor_quantity=2)THEN RAISE EXCEPTION'HISTORICAL_CUSTOM_LINE_MISSING';END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"82b25233-9e9d-4038-8713-4682aa63b2be","role":"authenticated"}',true);PERFORM public.set_tender_bid_review_status(v_submission_id,'REVIEWED',0,gen_random_uuid());
  v_award:=public.award_project_tender(v_submission_id,'Historical capture award',gen_random_uuid());
  IF NOT EXISTS(SELECT 1 FROM public.project_tender_historical_category_spreads WHERE bid_round_id=(v_round->>'bidRoundId')::bigint AND bidder_count=1 AND price_spread=0)THEN RAISE EXCEPTION'HISTORICAL_CATEGORY_SPREAD_MISSING';END IF;
  SELECT id INTO v_commitment FROM public.project_commercial_commitments WHERE source_award_id=(v_award->>'awardId')::uuid LIMIT 1;
  IF NOT EXISTS(SELECT 1 FROM public.project_cost_package_historical_financial_events WHERE event_kind='COMMITMENT_CREATED'AND source_id=v_commitment)THEN RAISE EXCEPTION'HISTORICAL_COMMITMENT_EVENT_MISSING';END IF;
  BEGIN UPDATE public.project_tender_historical_bid_line_facts SET line_total=0 WHERE bid_submission_id=v_submission_id;RAISE EXCEPTION'HISTORICAL_FACT_MUTATION_ALLOWED';EXCEPTION WHEN sqlstate'55000'THEN NULL;END;
END;$$;
ROLLBACK;
