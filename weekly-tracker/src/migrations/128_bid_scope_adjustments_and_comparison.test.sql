\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_round bigint;
  v_tender uuid;
  v_bidder uuid;
  v_workspace jsonb;
  v_items jsonb;
  v_first jsonb;
  v_work_group uuid;
  v_custom_line uuid:='00000000-0000-4000-8000-000000000128';
  v_saved jsonb;
  v_submitted jsonb;
  v_submission bigint;
  v_comparison jsonb;
BEGIN
  SELECT round.id,round.tender_id,access.bidder_user_id
    INTO v_round,v_tender,v_bidder
  FROM public.project_tender_bid_rounds round
  JOIN public.project_tender_bidder_access access
    ON access.tender_id=round.tender_id
   AND access.tender_setup_version_id=round.tender_setup_version_id
  WHERE round.status='OPEN' AND round.deadline_at>now()
    AND access.status='ACCEPTED'
    AND NOT EXISTS(SELECT 1 FROM public.project_tender_bid_submissions submission WHERE submission.bid_round_id=round.id AND submission.participant_id=access.participant_id)
  ORDER BY round.id DESC LIMIT 1;
  IF v_round IS NULL THEN RAISE EXCEPTION 'TEST_REQUIRES_OPEN_ACCEPTED_BIDDER_ROUND';END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_bidder,'role','authenticated')::text,true);
  v_workspace:=public.get_my_tender_bid_round_workspace(v_tender);
  v_first:=v_workspace->'items'->0;
  v_work_group:=(v_first->>'workGroupId')::uuid;
  SELECT jsonb_agg(CASE WHEN ordinal=1 THEN item||jsonb_build_object('lineAction','EXCLUDED','bidderNote','Excluded by bidder') ELSE item END ORDER BY ordinal)
    INTO v_items FROM jsonb_array_elements(v_workspace->'items')WITH ORDINALITY payload(item,ordinal);
  v_items:=v_items||jsonb_build_array(jsonb_build_object(
    'lineId',v_custom_line,'workGroupId',v_work_group,'description','Contractor proposed alternative',
    'unit','ea','lineOrigin','CONTRACTOR_ADDED','lineAction','INCLUDED','quantity','2',
    'labourRate','10','materialRate','15','bidderNote','Alternative scope'));
  v_saved:=public.save_my_tender_bid_draft(v_round,v_items,0,gen_random_uuid());
  IF (v_saved->>'contractorAddedLineCount')::integer<>1 THEN RAISE EXCEPTION 'CONTRACTOR_ADDED_LINE_NOT_SAVED';END IF;
  v_submitted:=public.submit_my_tender_bid(v_round,(v_saved->>'draftRevision')::integer,gen_random_uuid());
  v_submission:=(v_submitted->>'submissionId')::bigint;
  IF (SELECT count(*) FROM public.project_tender_bid_submission_items WHERE bid_submission_id=v_submission AND line_action='EXCLUDED')<>1 THEN RAISE EXCEPTION 'EXCLUDED_LINE_NOT_SNAPSHOTTED';END IF;
  IF (SELECT count(*) FROM public.project_tender_bid_submission_items WHERE bid_submission_id=v_submission AND line_origin='CONTRACTOR_ADDED')<>1 THEN RAISE EXCEPTION 'ADDED_LINE_NOT_SNAPSHOTTED';END IF;
  IF EXISTS(SELECT 1 FROM public.project_tender_bid_submission_items WHERE bid_submission_id=v_submission AND line_action='EXCLUDED' AND (quantity IS NOT NULL OR unit_rate IS NOT NULL OR line_total IS NOT NULL)) THEN RAISE EXCEPTION 'EXCLUDED_LINE_CONTRIBUTES_VALUE';END IF;

  BEGIN
    UPDATE public.project_tender_bid_submission_items SET description='mutated' WHERE bid_submission_id=v_submission AND line_id=v_custom_line;
    RAISE EXCEPTION 'IMMUTABILITY_TRIGGER_DID_NOT_FIRE';
  EXCEPTION WHEN sqlstate '55000' THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims','{"sub":"82b25233-9e9d-4038-8713-4682aa63b2be","role":"authenticated"}',true);
  v_comparison:=public.get_tender_comparison_workspace(v_tender);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_comparison->'rounds') round_row CROSS JOIN LATERAL jsonb_array_elements(round_row->'participants') participant CROSS JOIN LATERAL jsonb_array_elements(participant->'submission'->'items') item WHERE item->>'lineId'=v_custom_line::text AND item->>'changeType'='LINE_ADDED') THEN RAISE EXCEPTION 'ADDED_LINE_MISSING_FROM_COMPARISON';END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_comparison->'rounds') round_row CROSS JOIN LATERAL jsonb_array_elements(round_row->'participants') participant CROSS JOIN LATERAL jsonb_array_elements(participant->'submission'->'items') item WHERE item->>'lineAction'='EXCLUDED' AND item->>'changeType'='LINE_REMOVED') THEN RAISE EXCEPTION 'EXCLUDED_LINE_MISSING_FROM_COMPARISON';END IF;
END;$$;
ROLLBACK;
