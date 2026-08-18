-- 076_tender_clarification_register.sql
-- Roadmap Phase D.21: issued clarification sets, bidder responses and PM resolution.
-- Cross-bidder comparison and award remain D.22/D.23 concerns.

CREATE TABLE IF NOT EXISTS public.project_tender_clarification_sets (
  id uuid PRIMARY KEY,
  tender_id uuid NOT NULL,
  bid_round_id bigint NOT NULL,
  bid_submission_id bigint NOT NULL,
  project_id bigint NOT NULL,
  participant_id uuid NOT NULL,
  set_number integer NOT NULL CHECK (set_number>0),
  status text NOT NULL CHECK (status='ISSUED'),
  issued_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bid_submission_id,set_number),
  UNIQUE (id,bid_submission_id,tender_id,participant_id),
  FOREIGN KEY (bid_submission_id,bid_round_id,tender_id,participant_id)
    REFERENCES public.project_tender_bid_submissions(id,bid_round_id,tender_id,participant_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.project_tender_clarifications (
  id uuid PRIMARY KEY,
  clarification_set_id uuid,
  bid_submission_id bigint NOT NULL,
  bid_round_id bigint NOT NULL,
  tender_id uuid NOT NULL,
  project_id bigint NOT NULL,
  participant_id uuid NOT NULL,
  line_id uuid NOT NULL,
  work_group_id uuid NOT NULL,
  clarification_type text NOT NULL CHECK (clarification_type IN ('COMMERCIAL','TECHNICAL','SCOPE','QUANTITY','MISSING_INFORMATION','OTHER')),
  pm_comment text NOT NULL CHECK (btrim(pm_comment)<>'' AND char_length(pm_comment)<=4000),
  status text NOT NULL CHECK (status IN ('DRAFT','OPEN','RESPONDED','REVISION_REQUIRED','RESOLVED','CLOSED')),
  revision integer NOT NULL CHECK (revision>0),
  contractor_response text,
  resolution_note text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  issued_at timestamptz,
  responded_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  responded_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,bid_submission_id,tender_id,participant_id),
  FOREIGN KEY (bid_submission_id,bid_round_id,tender_id,participant_id)
    REFERENCES public.project_tender_bid_submissions(id,bid_round_id,tender_id,participant_id) ON DELETE RESTRICT,
  FOREIGN KEY (bid_submission_id,line_id)
    REFERENCES public.project_tender_bid_submission_items(bid_submission_id,line_id) ON DELETE RESTRICT,
  FOREIGN KEY (clarification_set_id,bid_submission_id,tender_id,participant_id)
    REFERENCES public.project_tender_clarification_sets(id,bid_submission_id,tender_id,participant_id) ON DELETE RESTRICT,
  CHECK ((status='DRAFT' AND clarification_set_id IS NULL AND issued_at IS NULL) OR (status<>'DRAFT' AND clarification_set_id IS NOT NULL AND issued_at IS NOT NULL)),
  CHECK (contractor_response IS NULL OR (btrim(contractor_response)<>'' AND char_length(contractor_response)<=4000)),
  CHECK (resolution_note IS NULL OR (btrim(resolution_note)<>'' AND char_length(resolution_note)<=4000))
);

CREATE TABLE IF NOT EXISTS public.project_tender_clarification_events (
  id bigserial PRIMARY KEY,
  clarification_id uuid NOT NULL REFERENCES public.project_tender_clarifications(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('CREATED','ISSUED','RESPONDED','REVISION_REQUIRED','RESOLVED','CLOSED')),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  message text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_tender_clarifications_submission_idx ON public.project_tender_clarifications(bid_submission_id,status,created_at);
CREATE INDEX IF NOT EXISTS project_tender_clarifications_bidder_idx ON public.project_tender_clarifications(tender_id,participant_id,status,created_at);
CREATE INDEX IF NOT EXISTS project_tender_clarification_events_idx ON public.project_tender_clarification_events(clarification_id,id);

CREATE OR REPLACE FUNCTION private.prevent_tender_clarification_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN RAISE EXCEPTION 'TENDER_CLARIFICATION_AUDIT_IMMUTABLE' USING ERRCODE='55000';END;$$;
DROP TRIGGER IF EXISTS project_tender_clarification_sets_immutable ON public.project_tender_clarification_sets;
CREATE TRIGGER project_tender_clarification_sets_immutable BEFORE UPDATE OR DELETE ON public.project_tender_clarification_sets FOR EACH ROW EXECUTE FUNCTION private.prevent_tender_clarification_audit_mutation();
DROP TRIGGER IF EXISTS project_tender_clarification_events_immutable ON public.project_tender_clarification_events;
CREATE TRIGGER project_tender_clarification_events_immutable BEFORE UPDATE OR DELETE ON public.project_tender_clarification_events FOR EACH ROW EXECUTE FUNCTION private.prevent_tender_clarification_audit_mutation();
REVOKE ALL ON FUNCTION private.prevent_tender_clarification_audit_mutation() FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.project_tender_clarification_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tender_clarifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tender_clarification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_tender_clarification_sets,public.project_tender_clarifications,public.project_tender_clarification_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.project_tender_clarification_events_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.require_closed_tender_clarifications_before_round_close()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.status='OPEN' AND NEW.status='CLOSED' AND EXISTS(
    SELECT 1 FROM public.project_tender_clarifications clarification
    WHERE clarification.bid_round_id=OLD.id AND clarification.status NOT IN('RESOLVED','CLOSED')
  ) THEN RAISE EXCEPTION 'BID_ROUND_CLARIFICATIONS_OPEN' USING ERRCODE='55000';END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS project_tender_bid_rounds_require_closed_clarifications ON public.project_tender_bid_rounds;
CREATE TRIGGER project_tender_bid_rounds_require_closed_clarifications BEFORE UPDATE OF status ON public.project_tender_bid_rounds
  FOR EACH ROW EXECUTE FUNCTION private.require_closed_tender_clarifications_before_round_close();
REVOKE ALL ON FUNCTION private.require_closed_tender_clarifications_before_round_close() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_tender_clarification_workspace(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_project_id bigint;v_role text;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT project_id INTO v_project_id FROM public.project_tenders WHERE id=p_tender_id;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'TENDER_NOT_FOUND' USING ERRCODE='P0002';END IF;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_project_id) IS NOT TRUE THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_FORBIDDEN' USING ERRCODE='42501';END IF;
  SELECT jsonb_build_object('tenderId',p_tender_id,'clarifications',COALESCE(jsonb_agg(jsonb_build_object(
    'clarificationId',clarification.id,'clarificationSetId',clarification.clarification_set_id,
    'setNumber',clarification_set.set_number,'bidSubmissionId',clarification.bid_submission_id,
    'bidRoundId',clarification.bid_round_id,'roundNumber',round.round_number,
    'participantId',clarification.participant_id,'contractorName',participant.contractor_name,
    'lineId',clarification.line_id,'workGroupId',clarification.work_group_id,
    'workGroupCode',work_group.code,'workGroupLabel',work_group.label,'description',item_source.description,
    'unitRate',submission_item.unit_rate,'lineTotal',submission_item.line_total,
    'type',clarification.clarification_type,'comment',clarification.pm_comment,'status',clarification.status,
    'revision',clarification.revision,'contractorResponse',clarification.contractor_response,
    'resolutionNote',clarification.resolution_note,'createdAt',clarification.created_at,
    'issuedAt',clarification.issued_at,'respondedAt',clarification.responded_at,'resolvedAt',clarification.resolved_at
  ) ORDER BY round.round_number,participant.contractor_name,clarification.created_at,clarification.id),'[]'::jsonb)) INTO v_result
  FROM public.project_tender_clarifications clarification
  JOIN public.project_tender_bid_submissions submission ON submission.id=clarification.bid_submission_id
  JOIN public.project_tender_bid_rounds round ON round.id=clarification.bid_round_id
  JOIN public.project_tender_setup_versions setup ON setup.id=submission.tender_setup_version_id
  JOIN public.project_tender_participants participant ON participant.tender_setup_version_id=submission.tender_setup_version_id AND participant.participant_id=clarification.participant_id
  JOIN public.project_tender_bid_submission_items submission_item ON submission_item.bid_submission_id=clarification.bid_submission_id AND submission_item.line_id=clarification.line_id
  JOIN public.project_boq_items item_source ON item_source.boq_version_id=setup.issued_boq_version_id AND item_source.line_id=clarification.line_id
  JOIN public.work_ontology_work_groups work_group ON work_group.ontology_version_id=submission.ontology_version_id AND work_group.id=clarification.work_group_id
  LEFT JOIN public.project_tender_clarification_sets clarification_set ON clarification_set.id=clarification.clarification_set_id
  WHERE clarification.tender_id=p_tender_id;
  RETURN v_result;
END;$$;

CREATE OR REPLACE FUNCTION public.get_my_tender_clarifications(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_access public.project_tender_bidder_access%ROWTYPE;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT * INTO v_access FROM public.project_tender_bidder_access WHERE tender_id=p_tender_id AND bidder_user_id=v_uid AND status='ACTIVE';
  IF v_access.tender_id IS NULL THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  SELECT jsonb_build_object('tenderId',p_tender_id,'clarifications',COALESCE(jsonb_agg(jsonb_build_object(
    'clarificationId',clarification.id,'setNumber',clarification_set.set_number,
    'roundNumber',round.round_number,'lineId',clarification.line_id,'workGroupId',clarification.work_group_id,
    'workGroupCode',work_group.code,'workGroupLabel',work_group.label,'description',item_source.description,
    'unitRate',submission_item.unit_rate,'lineTotal',submission_item.line_total,
    'type',clarification.clarification_type,'comment',clarification.pm_comment,'status',clarification.status,
    'revision',clarification.revision,'contractorResponse',clarification.contractor_response,
    'resolutionNote',clarification.resolution_note,'issuedAt',clarification.issued_at,
    'respondedAt',clarification.responded_at,'resolvedAt',clarification.resolved_at
  ) ORDER BY round.round_number,clarification_set.set_number,clarification.created_at),'[]'::jsonb)) INTO v_result
  FROM public.project_tender_clarifications clarification
  JOIN public.project_tender_bid_submissions submission ON submission.id=clarification.bid_submission_id
  JOIN public.project_tender_bid_rounds round ON round.id=clarification.bid_round_id
  JOIN public.project_tender_setup_versions setup ON setup.id=submission.tender_setup_version_id
  JOIN public.project_tender_bid_submission_items submission_item ON submission_item.bid_submission_id=clarification.bid_submission_id AND submission_item.line_id=clarification.line_id
  JOIN public.project_boq_items item_source ON item_source.boq_version_id=setup.issued_boq_version_id AND item_source.line_id=clarification.line_id
  JOIN public.work_ontology_work_groups work_group ON work_group.ontology_version_id=submission.ontology_version_id AND work_group.id=clarification.work_group_id
  JOIN public.project_tender_clarification_sets clarification_set ON clarification_set.id=clarification.clarification_set_id
  WHERE clarification.tender_id=p_tender_id AND clarification.participant_id=v_access.participant_id AND clarification.status<>'DRAFT';
  RETURN v_result;
END;$$;

CREATE OR REPLACE FUNCTION public.create_tender_line_clarification(p_bid_submission_id bigint,p_line_id uuid,p_type text,p_comment text,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_submission public.project_tender_bid_submissions%ROWTYPE;v_item public.project_tender_bid_submission_items%ROWTYPE;v_work_group_id uuid;v_id uuid:=gen_random_uuid();v_request public.write_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_bid_submission_id IS NULL OR p_line_id IS NULL OR p_type NOT IN('COMMERCIAL','TECHNICAL','SCOPE','QUANTITY','MISSING_INFORMATION','OTHER') OR p_comment IS NULL OR btrim(p_comment)='' OR char_length(btrim(p_comment))>4000 OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_TENDER_CLARIFICATION_COMMAND' USING ERRCODE='22023';END IF;
  SELECT * INTO v_submission FROM public.project_tender_bid_submissions WHERE id=p_bid_submission_id;
  SELECT * INTO v_item FROM public.project_tender_bid_submission_items WHERE bid_submission_id=p_bid_submission_id AND line_id=p_line_id;
  IF v_submission.id IS NULL OR v_item.line_id IS NULL THEN RAISE EXCEPTION 'BID_SUBMISSION_LINE_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_submission.project_id) IS NOT TRUE THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_FORBIDDEN' USING ERRCODE='42501';END IF;
  SELECT source.work_group_id INTO v_work_group_id FROM public.project_tender_setup_versions setup JOIN public.project_boq_items source ON source.boq_version_id=setup.issued_boq_version_id AND source.line_id=p_line_id WHERE setup.id=v_submission.tender_setup_version_id;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.create_clarification',p_client_request_id,v_submission.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.create_clarification' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_submission.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  INSERT INTO public.project_tender_clarifications(id,bid_submission_id,bid_round_id,tender_id,project_id,participant_id,line_id,work_group_id,clarification_type,pm_comment,status,revision,created_by)
    VALUES(v_id,v_submission.id,v_submission.bid_round_id,v_submission.tender_id,v_submission.project_id,v_submission.participant_id,p_line_id,v_work_group_id,p_type,btrim(p_comment),'DRAFT',1,v_uid);
  INSERT INTO public.project_tender_clarification_events(clarification_id,event_type,actor_id,message)VALUES(v_id,'CREATED',v_uid,btrim(p_comment));
  v_result:=jsonb_build_object('clarificationId',v_id,'submissionId',v_submission.id,'status','DRAFT','revision',1);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.issue_tender_clarification_set(p_bid_submission_id bigint,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_submission public.project_tender_bid_submissions%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_set_id uuid:=gen_random_uuid();v_set_number integer;v_count integer;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_bid_submission_id IS NULL OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_TENDER_CLARIFICATION_SET_COMMAND' USING ERRCODE='22023';END IF;
  SELECT * INTO v_submission FROM public.project_tender_bid_submissions WHERE id=p_bid_submission_id FOR UPDATE;
  IF v_submission.id IS NULL THEN RAISE EXCEPTION 'BID_SUBMISSION_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_submission.project_id) IS NOT TRUE THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_FORBIDDEN' USING ERRCODE='42501';END IF;
  SELECT count(*) INTO v_count FROM public.project_tender_clarifications WHERE bid_submission_id=v_submission.id AND status='DRAFT';
  IF v_count=0 THEN RAISE EXCEPTION 'CLARIFICATION_SET_REQUIRES_DRAFTS' USING ERRCODE='55000';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.issue_clarification_set',p_client_request_id,v_submission.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.issue_clarification_set' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_submission.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  SELECT COALESCE(max(set_number),0)+1 INTO v_set_number FROM public.project_tender_clarification_sets WHERE bid_submission_id=v_submission.id;
  INSERT INTO public.project_tender_clarification_sets(id,tender_id,bid_round_id,bid_submission_id,project_id,participant_id,set_number,status,issued_by)
    VALUES(v_set_id,v_submission.tender_id,v_submission.bid_round_id,v_submission.id,v_submission.project_id,v_submission.participant_id,v_set_number,'ISSUED',v_uid);
  UPDATE public.project_tender_clarifications SET clarification_set_id=v_set_id,status='OPEN',revision=revision+1,issued_at=now(),updated_at=now() WHERE bid_submission_id=v_submission.id AND status='DRAFT';
  INSERT INTO public.project_tender_clarification_events(clarification_id,event_type,actor_id)
    SELECT id,'ISSUED',v_uid FROM public.project_tender_clarifications WHERE clarification_set_id=v_set_id;
  v_result:=jsonb_build_object('clarificationSetId',v_set_id,'submissionId',v_submission.id,'setNumber',v_set_number,'clarificationCount',v_count,'status','ISSUED');
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.respond_to_tender_clarification(p_clarification_id uuid,p_response text,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_clarification public.project_tender_clarifications%ROWTYPE;v_access public.project_tender_bidder_access%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_next integer;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_response IS NULL OR btrim(p_response)='' OR char_length(btrim(p_response))>4000 OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_TENDER_CLARIFICATION_RESPONSE' USING ERRCODE='22023';END IF;
  SELECT * INTO v_clarification FROM public.project_tender_clarifications WHERE id=p_clarification_id FOR UPDATE;
  IF v_clarification.id IS NULL THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT * INTO v_access FROM public.project_tender_bidder_access WHERE tender_id=v_clarification.tender_id AND participant_id=v_clarification.participant_id AND bidder_user_id=v_uid AND status='ACTIVE';
  IF v_access.tender_id IS NULL THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  IF v_clarification.status NOT IN('OPEN','REVISION_REQUIRED') THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_NOT_RESPONSEABLE' USING ERRCODE='55000';END IF;
  IF v_clarification.revision<>p_expected_revision THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.respond_clarification',p_client_request_id,v_clarification.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.respond_clarification' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_clarification.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  v_next:=v_clarification.revision+1;
  UPDATE public.project_tender_clarifications SET status='RESPONDED',revision=v_next,contractor_response=btrim(p_response),responded_by=v_uid,responded_at=now(),resolution_note=NULL,resolved_by=NULL,resolved_at=NULL,updated_at=now()WHERE id=v_clarification.id;
  INSERT INTO public.project_tender_clarification_events(clarification_id,event_type,actor_id,message)VALUES(v_clarification.id,'RESPONDED',v_uid,btrim(p_response));
  v_result:=jsonb_build_object('clarificationId',v_clarification.id,'status','RESPONDED','revision',v_next);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.resolve_tender_clarification(p_clarification_id uuid,p_decision text,p_note text,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_clarification public.project_tender_clarifications%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_next integer;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_decision NOT IN('REVISION_REQUIRED','RESOLVED','CLOSED') OR p_note IS NULL OR btrim(p_note)='' OR char_length(btrim(p_note))>4000 OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_TENDER_CLARIFICATION_RESOLUTION' USING ERRCODE='22023';END IF;
  SELECT * INTO v_clarification FROM public.project_tender_clarifications WHERE id=p_clarification_id FOR UPDATE;
  IF v_clarification.id IS NULL THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_clarification.project_id) IS NOT TRUE THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF v_clarification.status<>'RESPONDED' THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_NOT_RESOLVABLE' USING ERRCODE='55000';END IF;
  IF v_clarification.revision<>p_expected_revision THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.resolve_clarification',p_client_request_id,v_clarification.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.resolve_clarification' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_clarification.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  v_next:=v_clarification.revision+1;
  UPDATE public.project_tender_clarifications SET status=p_decision,revision=v_next,resolution_note=btrim(p_note),resolved_by=v_uid,resolved_at=CASE WHEN p_decision IN('RESOLVED','CLOSED')THEN now()ELSE NULL END,updated_at=now()WHERE id=v_clarification.id;
  INSERT INTO public.project_tender_clarification_events(clarification_id,event_type,actor_id,message)VALUES(v_clarification.id,p_decision,v_uid,btrim(p_note));
  v_result:=jsonb_build_object('clarificationId',v_clarification.id,'status',p_decision,'revision',v_next);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

REVOKE ALL ON FUNCTION public.get_tender_clarification_workspace(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_my_tender_clarifications(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_tender_line_clarification(bigint,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.issue_tender_clarification_set(bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.respond_to_tender_clarification(uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.resolve_tender_clarification(uuid,text,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_tender_clarification_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tender_clarifications(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_tender_line_clarification(bigint,uuid,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_tender_clarification_set(bigint,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_tender_clarification(uuid,text,integer,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_tender_clarification(uuid,text,text,integer,uuid) TO authenticated;
