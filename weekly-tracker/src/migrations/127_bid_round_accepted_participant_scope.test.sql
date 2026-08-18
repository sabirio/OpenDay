\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"82b25233-9e9d-4038-8713-4682aa63b2be","role":"authenticated"}',true);
DO $$
DECLARE v_tender uuid;v_participant uuid;v_review jsonb;v_comparison jsonb;
BEGIN
  SELECT access.tender_id,access.participant_id INTO v_tender,v_participant FROM public.project_tender_bidder_access access JOIN public.project_tender_bid_rounds round ON round.tender_id=access.tender_id WHERE access.status='ACCEPTED'ORDER BY access.invited_at LIMIT 1;
  UPDATE public.project_tender_bidder_access SET status='DECLINED',responded_at=now(),activated_at=NULL WHERE tender_id=v_tender AND participant_id=v_participant;
  v_review:=public.get_tender_bid_review_workspace(v_tender);v_comparison:=public.get_tender_comparison_workspace(v_tender);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_review->'rounds')round_row CROSS JOIN LATERAL jsonb_array_elements(round_row->'participants')participant WHERE participant->>'participantId'=v_participant::text)THEN RAISE EXCEPTION'Declined participant leaked into Bid Review';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_comparison->'rounds')round_row CROSS JOIN LATERAL jsonb_array_elements(round_row->'participants')participant WHERE participant->>'participantId'=v_participant::text)THEN RAISE EXCEPTION'Declined participant leaked into Comparison';END IF;
END;$$;
ROLLBACK;
