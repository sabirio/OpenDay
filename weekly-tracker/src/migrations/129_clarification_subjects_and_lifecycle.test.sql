\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_round bigint;v_tender uuid;v_bidder uuid;v_workspace jsonb;v_items jsonb;v_saved jsonb;v_submitted jsonb;v_submission bigint;v_line uuid;v_work_group uuid;v_tender_clarification jsonb;v_category_clarification jsonb;v_line_clarification jsonb;v_set jsonb;v_response jsonb;v_accepted jsonb;v_closed jsonb;v_pm_workspace jsonb;
BEGIN
  SELECT round.id,round.tender_id,access.bidder_user_id INTO v_round,v_tender,v_bidder
  FROM public.project_tender_bid_rounds round JOIN public.project_tender_bidder_access access ON access.tender_id=round.tender_id AND access.tender_setup_version_id=round.tender_setup_version_id
  WHERE round.status='OPEN' AND round.deadline_at>now() AND access.status='ACCEPTED' AND NOT EXISTS(SELECT 1 FROM public.project_tender_bid_submissions submission WHERE submission.bid_round_id=round.id AND submission.participant_id=access.participant_id)
  ORDER BY round.id DESC LIMIT 1;
  IF v_round IS NULL THEN RAISE EXCEPTION 'TEST_REQUIRES_OPEN_ACCEPTED_BIDDER_ROUND';END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_bidder,'role','authenticated')::text,true);
  v_workspace:=public.get_my_tender_bid_round_workspace(v_tender);v_items:=v_workspace->'items';v_line:=(v_items->0->>'lineId')::uuid;v_work_group:=(v_items->0->>'workGroupId')::uuid;
  v_saved:=public.save_my_tender_bid_draft(v_round,v_items,0,gen_random_uuid());v_submitted:=public.submit_my_tender_bid(v_round,(v_saved->>'draftRevision')::integer,gen_random_uuid());v_submission:=(v_submitted->>'submissionId')::bigint;

  PERFORM set_config('request.jwt.claims','{"sub":"82b25233-9e9d-4038-8713-4682aa63b2be","role":"authenticated"}',true);
  v_tender_clarification:=public.create_tender_clarification(v_submission,'TENDER',NULL,NULL,'COMMERCIAL','Confirm all tender exclusions',gen_random_uuid());
  v_category_clarification:=public.create_tender_clarification(v_submission,'CATEGORY',NULL,v_work_group,'SCOPE','Confirm category scope',gen_random_uuid());
  v_line_clarification:=public.create_tender_clarification(v_submission,'LINE',v_line,NULL,'QUANTITY','Confirm submitted quantity',gen_random_uuid());
  v_set:=public.issue_tender_clarification_set(v_submission,gen_random_uuid());
  IF (v_set->>'clarificationCount')::integer<>3 THEN RAISE EXCEPTION 'CLARIFICATION_SUBJECTS_NOT_ISSUED';END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_bidder,'role','authenticated')::text,true);
  v_response:=public.respond_to_tender_clarification((v_tender_clarification->>'clarificationId')::uuid,'Confirmed with listed exclusions',(SELECT revision FROM public.project_tender_clarifications WHERE id=(v_tender_clarification->>'clarificationId')::uuid),gen_random_uuid());
  PERFORM set_config('request.jwt.claims','{"sub":"82b25233-9e9d-4038-8713-4682aa63b2be","role":"authenticated"}',true);
  v_accepted:=public.resolve_tender_clarification((v_tender_clarification->>'clarificationId')::uuid,'ACCEPTED','Response accepted',(v_response->>'revision')::integer,gen_random_uuid());
  v_closed:=public.close_tender_clarification((v_tender_clarification->>'clarificationId')::uuid,'Clarification closed',(v_accepted->>'revision')::integer,gen_random_uuid());
  IF v_closed->>'status'<>'CLOSED' THEN RAISE EXCEPTION 'CLARIFICATION_NOT_CLOSED';END IF;
  IF (SELECT string_agg(event_type,',' ORDER BY id) FROM public.project_tender_clarification_events WHERE clarification_id=(v_tender_clarification->>'clarificationId')::uuid)<>'CREATED,ISSUED,RESPONDED,ACCEPTED,CLOSED' THEN RAISE EXCEPTION 'CLARIFICATION_HISTORY_INCOMPLETE';END IF;
  v_pm_workspace:=public.get_tender_clarification_workspace(v_tender);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_pm_workspace->'clarifications') item WHERE item->>'subjectType'='TENDER' AND item->>'description'='Whole Tender') THEN RAISE EXCEPTION 'TENDER_SUBJECT_NOT_READABLE';END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_pm_workspace->'clarifications') item WHERE item->>'subjectType'='CATEGORY' AND item->>'workGroupId'=v_work_group::text) THEN RAISE EXCEPTION 'CATEGORY_SUBJECT_NOT_READABLE';END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_pm_workspace->'clarifications') item WHERE item->>'subjectType'='LINE' AND item->>'lineId'=v_line::text) THEN RAISE EXCEPTION 'LINE_SUBJECT_NOT_READABLE';END IF;
END;$$;
ROLLBACK;
