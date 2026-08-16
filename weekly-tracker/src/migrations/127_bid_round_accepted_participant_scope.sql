-- 127_bid_round_accepted_participant_scope.sql
-- Only accepted contractors participate in bid rounds, review and comparison.

BEGIN;

CREATE OR REPLACE FUNCTION private.require_tender_bid_reviews_before_round_close()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.status='OPEN'AND NEW.status='CLOSED'AND EXISTS(
    SELECT 1 FROM public.project_tender_bidder_access access
    LEFT JOIN public.project_tender_bid_submissions submission ON submission.bid_round_id=OLD.id AND submission.participant_id=access.participant_id
    LEFT JOIN public.project_tender_bid_reviews review ON review.bid_submission_id=submission.id
    WHERE access.tender_id=OLD.tender_id AND access.tender_setup_version_id=OLD.tender_setup_version_id
      AND access.status='ACCEPTED'AND(submission.id IS NULL OR review.status IS DISTINCT FROM'REVIEWED')
  )THEN RAISE EXCEPTION'BID_ROUND_REVIEW_REQUIRED'USING ERRCODE='55000';END IF;
  RETURN NEW;
END;$$;

DO $$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.get_tender_bid_review_workspace(uuid)'::regprocedure)INTO v_definition;
  IF v_definition NOT LIKE '%participant.tender_setup_version_id=round.tender_setup_version_id AND access.status=''ACCEPTED''%'THEN
    v_definition:=replace(v_definition,'WHERE participant.tender_setup_version_id=round.tender_setup_version_id','WHERE participant.tender_setup_version_id=round.tender_setup_version_id AND access.status=''ACCEPTED''');
    EXECUTE v_definition;
  END IF;
  SELECT pg_get_functiondef('public.get_tender_comparison_workspace(uuid)'::regprocedure)INTO v_definition;
  IF v_definition NOT LIKE '%accepted_participant_scope%'THEN
    v_definition:=replace(v_definition,
      'WHERE participant.tender_setup_version_id=round.tender_setup_version_id',
      'WHERE participant.tender_setup_version_id=round.tender_setup_version_id AND EXISTS(SELECT 1 FROM public.project_tender_bidder_access accepted_participant_scope WHERE accepted_participant_scope.tender_id=round.tender_id AND accepted_participant_scope.participant_id=participant.participant_id AND accepted_participant_scope.tender_setup_version_id=round.tender_setup_version_id AND accepted_participant_scope.status=''ACCEPTED'')');
    EXECUTE v_definition;
  END IF;
END;$$;

REVOKE ALL ON FUNCTION private.require_tender_bid_reviews_before_round_close()FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
