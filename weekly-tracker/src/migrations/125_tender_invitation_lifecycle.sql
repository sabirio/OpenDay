-- 125_tender_invitation_lifecycle.sql
-- Invitation and Tender Package access are separate audited events.

BEGIN;

ALTER TABLE public.project_tender_bidder_access
  DROP CONSTRAINT project_tender_bidder_access_status_check;
UPDATE public.project_tender_bidder_access SET status='ACCEPTED' WHERE status='ACTIVE';
ALTER TABLE public.project_tender_bidder_access
  ADD CONSTRAINT project_tender_bidder_access_status_check
  CHECK(status IN('INVITED','ACCEPTED','DECLINED','NO_RESPONSE','REVOKED'));
ALTER TABLE public.project_tender_bidder_access
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

CREATE OR REPLACE FUNCTION private.normalize_legacy_tender_invitation_status()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.status='ACTIVE'THEN NEW.status:='INVITED';NEW.activated_at:=NULL;END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER normalize_legacy_tender_invitation_status
BEFORE INSERT OR UPDATE ON public.project_tender_bidder_access
FOR EACH ROW EXECUTE FUNCTION private.normalize_legacy_tender_invitation_status();

CREATE TABLE IF NOT EXISTS public.project_tender_invitation_events(
  id bigserial PRIMARY KEY,
  tender_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  project_id bigint NOT NULL,
  event_type text NOT NULL CHECK(event_type IN('INVITED','RESENT','OPENED','ACCEPTED','DECLINED','NO_RESPONSE','REVOKED')),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  actor_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tender_id,participant_id) REFERENCES public.project_tender_bidder_access(tender_id,participant_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS project_tender_invitation_events_lookup_idx
  ON public.project_tender_invitation_events(tender_id,participant_id,occurred_at DESC);

CREATE OR REPLACE FUNCTION private.prevent_tender_invitation_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'TENDER_INVITATION_EVENT_IMMUTABLE' USING ERRCODE='55000';END;$$;
CREATE TRIGGER project_tender_invitation_events_immutable
BEFORE UPDATE OR DELETE ON public.project_tender_invitation_events
FOR EACH ROW EXECUTE FUNCTION private.prevent_tender_invitation_event_mutation();

CREATE OR REPLACE FUNCTION private.audit_tender_invitation_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_event text;
BEGIN
  IF TG_OP='INSERT' THEN v_event:='INVITED';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN v_event:=NEW.status;
  ELSIF OLD.email_opened_at IS NULL AND NEW.email_opened_at IS NOT NULL THEN v_event:='OPENED';
  ELSIF NEW.invited_at IS DISTINCT FROM OLD.invited_at THEN v_event:='RESENT';
  END IF;
  IF v_event IS NOT NULL THEN
    INSERT INTO public.project_tender_invitation_events(tender_id,participant_id,project_id,event_type,snapshot,actor_id)
    VALUES(NEW.tender_id,NEW.participant_id,NEW.project_id,v_event,jsonb_build_object(
      'status',NEW.status,'invitedEmail',NEW.invited_email,'setupVersionId',NEW.tender_setup_version_id,
      'invitedAt',NEW.invited_at,'openedAt',NEW.email_opened_at,'respondedAt',NEW.responded_at
    ),auth.uid());
  END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER project_tender_invitation_lifecycle_audit
AFTER INSERT OR UPDATE ON public.project_tender_bidder_access
FOR EACH ROW EXECUTE FUNCTION private.audit_tender_invitation_lifecycle();

INSERT INTO public.project_tender_invitation_events(tender_id,participant_id,project_id,event_type,snapshot,actor_id,occurred_at)
SELECT access.tender_id,access.participant_id,access.project_id,
  CASE WHEN access.status='ACCEPTED'THEN'ACCEPTED'ELSE access.status END,
  jsonb_build_object('status',access.status,'invitedEmail',access.invited_email,'setupVersionId',access.tender_setup_version_id,'migrated',true),
  access.invited_by,COALESCE(access.activated_at,access.invited_at)
FROM public.project_tender_bidder_access access
WHERE NOT EXISTS(SELECT 1 FROM public.project_tender_invitation_events event WHERE event.tender_id=access.tender_id AND event.participant_id=access.participant_id);

ALTER TABLE public.project_tender_invitation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tender_invitation_events_read ON public.project_tender_invitation_events FOR SELECT TO authenticated USING(
  EXISTS(SELECT 1 FROM public.project_tender_bidder_access access WHERE access.tender_id=tender_id AND access.participant_id=participant_id AND access.bidder_user_id=auth.uid())
  OR public.has_project_capability(project_id,'TENDER_MANAGE',NULL)
);
DROP POLICY IF EXISTS tender_bidder_access_select ON public.project_tender_bidder_access;
CREATE POLICY tender_bidder_access_select ON public.project_tender_bidder_access FOR SELECT TO authenticated USING(
  (bidder_user_id=auth.uid()AND status<>'REVOKED')OR public.has_project_capability(project_id,'TENDER_MANAGE',NULL)
);
REVOKE ALL ON TABLE public.project_tender_invitation_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.project_tender_invitation_events TO authenticated;
REVOKE ALL ON SEQUENCE public.project_tender_invitation_events_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.activate_my_tender_invitations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_email text;v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION'Authentication required'USING ERRCODE='28000';END IF;
  SELECT lower(email)INTO v_email FROM auth.users WHERE id=v_uid;
  UPDATE public.project_tender_bidder_access SET bidder_user_id=v_uid,email_opened_at=COALESCE(email_opened_at,now())
  WHERE invited_email=v_email AND status<>'REVOKED'AND(bidder_user_id IS NULL OR bidder_user_id=v_uid);
  GET DIAGNOSTICS v_count=ROW_COUNT;RETURN v_count;
END;$$;

CREATE OR REPLACE FUNCTION public.respond_to_my_tender_invitation(p_tender_id uuid,p_decision text,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_access public.project_tender_bidder_access%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  SELECT*INTO v_access FROM public.project_tender_bidder_access WHERE tender_id=p_tender_id AND bidder_user_id=v_uid FOR UPDATE;
  IF v_uid IS NULL OR v_access.tender_id IS NULL THEN RAISE EXCEPTION'TENDER_INVITATION_FORBIDDEN'USING ERRCODE='42501';END IF;
  IF p_decision NOT IN('ACCEPTED','DECLINED')OR v_access.status NOT IN('INVITED','NO_RESPONSE')OR p_client_request_id IS NULL THEN RAISE EXCEPTION'INVALID_TENDER_INVITATION_RESPONSE'USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.invitation.respond',p_client_request_id,v_access.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT*INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.invitation.respond'AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_access.project_id THEN RAISE EXCEPTION'Idempotency key belongs to another project'USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  UPDATE public.project_tender_bidder_access SET status=p_decision,responded_at=now(),activated_at=CASE WHEN p_decision='ACCEPTED'THEN now()ELSE NULL END WHERE tender_id=p_tender_id AND participant_id=v_access.participant_id;
  v_result:=jsonb_build_object('tenderId',p_tender_id,'participantId',v_access.participant_id,'status',p_decision,'packageAvailable',p_decision='ACCEPTED');
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result;
END;$$;

CREATE OR REPLACE FUNCTION public.mark_tender_invitation_no_response(p_tender_id uuid,p_participant_id uuid,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_access public.project_tender_bidder_access%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  SELECT*INTO v_access FROM public.project_tender_bidder_access WHERE tender_id=p_tender_id AND participant_id=p_participant_id FOR UPDATE;
  IF v_uid IS NULL OR v_access.tender_id IS NULL OR public.has_project_capability(v_access.project_id,'TENDER_MANAGE',NULL)IS NOT TRUE THEN RAISE EXCEPTION'TENDER_INVITATION_MANAGE_FORBIDDEN'USING ERRCODE='42501';END IF;
  IF v_access.status<>'INVITED'OR p_client_request_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.project_tender_setup_versions setup WHERE setup.id=v_access.tender_setup_version_id AND setup.deadline_at<now())THEN RAISE EXCEPTION'TENDER_INVITATION_NOT_ELIGIBLE_FOR_NO_RESPONSE'USING ERRCODE='55000';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.invitation.no_response',p_client_request_id,v_access.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT*INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.invitation.no_response'AND client_request_id=p_client_request_id;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  UPDATE public.project_tender_bidder_access SET status='NO_RESPONSE',responded_at=now()WHERE tender_id=p_tender_id AND participant_id=p_participant_id;
  v_result:=jsonb_build_object('tenderId',p_tender_id,'participantId',p_participant_id,'status','NO_RESPONSE');UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result;
END;$$;

CREATE OR REPLACE FUNCTION public.list_my_tender_inbox()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION'Authentication required'USING ERRCODE='28000';END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'tenderId',access.tender_id,'participantId',access.participant_id,'contractorName',access.contractor_name,
    'tenderNumber',tender.tender_number,'title',setup.title,'deadlineAt',setup.deadline_at,'currencyCode',setup.currency_code,
    'setupRevision',setup.revision_number,'projectStoreCode',project.store_code,'projectCity',project.city,
    'invitedAt',access.invited_at,'invitationMessage',setup.invitation_message,'invitationStatus',access.status,
    'packageAvailable',access.status='ACCEPTED','respondedAt',access.responded_at
  )ORDER BY setup.deadline_at)FROM public.project_tender_bidder_access access JOIN public.project_tenders tender ON tender.id=access.tender_id JOIN public.project_tender_setup_versions setup ON setup.id=access.tender_setup_version_id JOIN public.projects project ON project.id=access.project_id WHERE access.bidder_user_id=v_uid AND access.status<>'REVOKED'),'[]'::jsonb);
END;$$;

-- Existing Tender Package and Bid RPCs now authorize only an explicit acceptance.
DO $$
DECLARE v_signature regprocedure;v_definition text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_my_tender_workspace(uuid)'::regprocedure,
    'public.get_my_tender_commercial_identity(uuid)'::regprocedure,
    'public.get_my_tender_bid_round_workspace(uuid)'::regprocedure,
    'public.get_my_tender_clarifications(uuid)'::regprocedure,
    'public.respond_to_tender_clarification(uuid,text,integer,uuid)'::regprocedure,
    'public.save_my_tender_bid_draft_unit_rate_legacy(bigint,jsonb,integer,uuid)'::regprocedure,
    'public.submit_my_tender_bid(bigint,integer,uuid)'::regprocedure,
    'public.award_project_tender(bigint,text,uuid)'::regprocedure,
    'public.open_next_tender_bid_round(uuid,uuid)'::regprocedure,
    'public.get_tender_bid_review_workspace(uuid)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_signature)INTO v_definition;
    v_definition:=replace(replace(replace(replace(v_definition,
      'status = ''ACTIVE''','status = ''ACCEPTED'''),'status=''ACTIVE''','status=''ACCEPTED'''),
      'status <> ''REVOKED''','status = ''ACCEPTED'''),'status<>''REVOKED''','status=''ACCEPTED''');
    EXECUTE v_definition;
  END LOOP;
END;$$;

ALTER FUNCTION public.invite_project_tender_bidder(uuid,uuid,uuid) RENAME TO invite_project_tender_bidder_legacy_auto_accept;
REVOKE ALL ON FUNCTION public.invite_project_tender_bidder_legacy_auto_accept(uuid,uuid,uuid)FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.invite_project_tender_bidder(p_tender_id uuid,p_participant_id uuid,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.invite_project_tender_bidder_legacy_auto_accept(p_tender_id,p_participant_id,p_client_request_id);
  UPDATE public.project_tender_bidder_access SET status='INVITED',activated_at=NULL,responded_at=NULL WHERE tender_id=p_tender_id AND participant_id=p_participant_id;
  RETURN v_result||jsonb_build_object('status','INVITED','packageAvailable',false);
END;$$;

REVOKE ALL ON FUNCTION private.normalize_legacy_tender_invitation_status(),private.prevent_tender_invitation_event_mutation(),private.audit_tender_invitation_lifecycle(),
  public.activate_my_tender_invitations(),public.respond_to_my_tender_invitation(uuid,text,uuid),
  public.mark_tender_invitation_no_response(uuid,uuid,uuid),public.list_my_tender_inbox(),
  public.invite_project_tender_bidder(uuid,uuid,uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.activate_my_tender_invitations(),public.respond_to_my_tender_invitation(uuid,text,uuid),
  public.list_my_tender_inbox(),public.invite_project_tender_bidder(uuid,uuid,uuid)TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_tender_invitation_no_response(uuid,uuid,uuid)TO authenticated;

COMMIT;
