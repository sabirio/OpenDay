\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claims',jsonb_build_object(
  'sub',(SELECT bidder_user_id FROM public.project_tender_bidder_access WHERE bidder_user_id IS NOT NULL ORDER BY invited_at LIMIT 1),
  'role','authenticated')::text,true);

DO $$
DECLARE v_tender uuid;v_participant uuid;v_inbox jsonb;v_result jsonb;v_denied boolean:=false;
BEGIN
  SELECT tender_id,participant_id INTO v_tender,v_participant FROM public.project_tender_bidder_access WHERE bidder_user_id=auth.uid()ORDER BY invited_at LIMIT 1;
  UPDATE public.project_tender_bidder_access SET status='INVITED',responded_at=NULL,activated_at=NULL WHERE tender_id=v_tender AND participant_id=v_participant;
  v_inbox:=public.list_my_tender_inbox();
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_inbox)item WHERE(item->>'tenderId')::uuid=v_tender AND item->>'invitationStatus'='INVITED'AND(item->>'packageAvailable')::boolean=false)THEN RAISE EXCEPTION'Invited tender missing from invitation inbox';END IF;
  BEGIN PERFORM public.get_my_tender_workspace(v_tender);EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;END;
  IF NOT v_denied THEN RAISE EXCEPTION'Tender Package was exposed before acceptance';END IF;
  v_result:=public.respond_to_my_tender_invitation(v_tender,'ACCEPTED','a1250000-0000-4000-a000-000000000001');
  IF v_result->>'status'<>'ACCEPTED'OR public.get_my_tender_workspace(v_tender)IS NULL THEN RAISE EXCEPTION'Accepted Tender Package did not become available';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.project_tender_invitation_events WHERE tender_id=v_tender AND participant_id=v_participant AND event_type='ACCEPTED')THEN RAISE EXCEPTION'Acceptance audit event missing';END IF;
END;$$;

ROLLBACK;
