-- 129_clarification_subjects_and_lifecycle.sql
-- Roadmap phase 12: clarification subjects are explicit and lifecycle uses
-- Open -> Responded -> Revision Required / Accepted -> Closed.

BEGIN;

ALTER TABLE public.project_tender_clarifications
  ADD COLUMN IF NOT EXISTS subject_type text NOT NULL DEFAULT 'LINE';
ALTER TABLE public.project_tender_clarifications
  ALTER COLUMN line_id DROP NOT NULL,
  ALTER COLUMN work_group_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS project_tender_clarifications_subject_type_check,
  DROP CONSTRAINT IF EXISTS project_tender_clarifications_subject_shape_check,
  DROP CONSTRAINT IF EXISTS project_tender_clarifications_status_check;
ALTER TABLE public.project_tender_clarifications
  ADD CONSTRAINT project_tender_clarifications_subject_type_check CHECK (subject_type IN ('TENDER','CATEGORY','LINE','CONTRACTOR','BID_ROUND')),
  ADD CONSTRAINT project_tender_clarifications_subject_shape_check CHECK (
    (subject_type='LINE' AND line_id IS NOT NULL AND work_group_id IS NOT NULL)
    OR (subject_type='CATEGORY' AND line_id IS NULL AND work_group_id IS NOT NULL)
    OR (subject_type IN ('TENDER','CONTRACTOR','BID_ROUND') AND line_id IS NULL AND work_group_id IS NULL)
  ),
  ADD CONSTRAINT project_tender_clarifications_status_check CHECK (status IN ('DRAFT','OPEN','RESPONDED','REVISION_REQUIRED','ACCEPTED','RESOLVED','CLOSED'));

ALTER TABLE public.project_tender_clarification_events
  DROP CONSTRAINT IF EXISTS project_tender_clarification_events_event_type_check;
ALTER TABLE public.project_tender_clarification_events
  ADD CONSTRAINT project_tender_clarification_events_event_type_check CHECK (event_type IN ('CREATED','ISSUED','RESPONDED','REVISION_REQUIRED','ACCEPTED','RESOLVED','CLOSED'));

CREATE OR REPLACE FUNCTION public.create_tender_clarification(
  p_bid_submission_id bigint,p_subject_type text,p_line_id uuid,p_work_group_id uuid,
  p_type text,p_comment text,p_client_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_submission public.project_tender_bid_submissions%ROWTYPE;v_item public.project_tender_bid_submission_items%ROWTYPE;v_subject text:=upper(COALESCE(p_subject_type,''));v_work_group_id uuid;v_id uuid:=gen_random_uuid();v_request public.write_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_bid_submission_id IS NULL OR v_subject NOT IN('TENDER','CATEGORY','LINE','CONTRACTOR','BID_ROUND') OR p_type NOT IN('COMMERCIAL','TECHNICAL','SCOPE','QUANTITY','MISSING_INFORMATION','OTHER') OR p_comment IS NULL OR btrim(p_comment)='' OR char_length(btrim(p_comment))>4000 OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_TENDER_CLARIFICATION_COMMAND' USING ERRCODE='22023';END IF;
  SELECT * INTO v_submission FROM public.project_tender_bid_submissions WHERE id=p_bid_submission_id;
  IF v_submission.id IS NULL THEN RAISE EXCEPTION 'BID_SUBMISSION_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_submission.project_id) IS NOT TRUE THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_FORBIDDEN' USING ERRCODE='42501';END IF;

  IF v_subject='LINE' THEN
    SELECT * INTO v_item FROM public.project_tender_bid_submission_items WHERE bid_submission_id=p_bid_submission_id AND line_id=p_line_id;
    IF v_item.line_id IS NULL THEN RAISE EXCEPTION 'BID_SUBMISSION_LINE_NOT_FOUND' USING ERRCODE='P0002';END IF;
    v_work_group_id:=v_item.work_group_id;
    IF v_work_group_id IS NULL THEN SELECT source.work_group_id INTO v_work_group_id FROM public.project_tender_setup_versions setup JOIN public.project_boq_items source ON source.boq_version_id=setup.issued_boq_version_id AND source.line_id=p_line_id WHERE setup.id=v_submission.tender_setup_version_id;END IF;
  ELSIF v_subject='CATEGORY' THEN
    IF p_work_group_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.project_tender_scope_work_groups scope WHERE scope.tender_setup_version_id=v_submission.tender_setup_version_id AND scope.work_group_id=p_work_group_id) THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_CATEGORY_OUT_OF_SCOPE' USING ERRCODE='22023';END IF;
    v_work_group_id:=p_work_group_id;
  ELSIF p_line_id IS NOT NULL OR p_work_group_id IS NOT NULL THEN
    RAISE EXCEPTION 'TENDER_CLARIFICATION_SUBJECT_SHAPE_INVALID' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.create_clarification',p_client_request_id,v_submission.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.create_clarification' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_submission.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  INSERT INTO public.project_tender_clarifications(id,bid_submission_id,bid_round_id,tender_id,project_id,participant_id,line_id,work_group_id,subject_type,clarification_type,pm_comment,status,revision,created_by)
    VALUES(v_id,v_submission.id,v_submission.bid_round_id,v_submission.tender_id,v_submission.project_id,v_submission.participant_id,CASE WHEN v_subject='LINE'THEN p_line_id END,v_work_group_id,v_subject,p_type,btrim(p_comment),'DRAFT',1,v_uid);
  INSERT INTO public.project_tender_clarification_events(clarification_id,event_type,actor_id,message)VALUES(v_id,'CREATED',v_uid,btrim(p_comment));
  v_result:=jsonb_build_object('clarificationId',v_id,'submissionId',v_submission.id,'subjectType',v_subject,'status','DRAFT','revision',1);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.create_tender_line_clarification(p_bid_submission_id bigint,p_line_id uuid,p_type text,p_comment text,p_client_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT public.create_tender_clarification(p_bid_submission_id,'LINE',p_line_id,NULL,p_type,p_comment,p_client_request_id)
$$;

CREATE OR REPLACE FUNCTION public.resolve_tender_clarification(p_clarification_id uuid,p_decision text,p_note text,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_clarification public.project_tender_clarifications%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_next integer;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_decision NOT IN('REVISION_REQUIRED','ACCEPTED') OR p_note IS NULL OR btrim(p_note)='' OR char_length(btrim(p_note))>4000 OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_TENDER_CLARIFICATION_RESOLUTION' USING ERRCODE='22023';END IF;
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
  UPDATE public.project_tender_clarifications SET status=p_decision,revision=v_next,resolution_note=btrim(p_note),resolved_by=CASE WHEN p_decision='ACCEPTED'THEN v_uid END,resolved_at=CASE WHEN p_decision='ACCEPTED'THEN now()END,updated_at=now()WHERE id=v_clarification.id;
  INSERT INTO public.project_tender_clarification_events(clarification_id,event_type,actor_id,message)VALUES(v_clarification.id,p_decision,v_uid,btrim(p_note));
  v_result:=jsonb_build_object('clarificationId',v_clarification.id,'status',p_decision,'revision',v_next);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.close_tender_clarification(p_clarification_id uuid,p_note text,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_clarification public.project_tender_clarifications%ROWTYPE;v_request public.write_command_requests%ROWTYPE;v_next integer;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_note IS NULL OR btrim(p_note)='' OR char_length(btrim(p_note))>4000 OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_TENDER_CLARIFICATION_CLOSE' USING ERRCODE='22023';END IF;
  SELECT * INTO v_clarification FROM public.project_tender_clarifications WHERE id=p_clarification_id FOR UPDATE;
  IF v_clarification.id IS NULL THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_NOT_FOUND' USING ERRCODE='P0002';END IF;
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_clarification.project_id) IS NOT TRUE THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF v_clarification.status NOT IN('ACCEPTED','RESOLVED') THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_NOT_CLOSEABLE' USING ERRCODE='55000';END IF;
  IF v_clarification.revision<>p_expected_revision THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)VALUES(v_uid,'tender.close_clarification',p_client_request_id,v_clarification.project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.close_clarification' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_clarification.project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  v_next:=v_clarification.revision+1;
  UPDATE public.project_tender_clarifications SET status='CLOSED',revision=v_next,resolution_note=concat_ws(E'\n',resolution_note,btrim(p_note)),resolved_by=v_uid,resolved_at=COALESCE(resolved_at,now()),updated_at=now()WHERE id=v_clarification.id;
  INSERT INTO public.project_tender_clarification_events(clarification_id,event_type,actor_id,message)VALUES(v_clarification.id,'CLOSED',v_uid,btrim(p_note));
  v_result:=jsonb_build_object('clarificationId',v_clarification.id,'status','CLOSED','revision',v_next);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

CREATE OR REPLACE FUNCTION public.get_tender_clarification_workspace(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_project_id bigint;v_role text;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT project_id INTO v_project_id FROM public.project_tenders WHERE id=p_tender_id;SELECT lower(role) INTO v_role FROM public.profiles WHERE id=v_uid;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'TENDER_NOT_FOUND' USING ERRCODE='P0002';END IF;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_project_id) IS NOT TRUE THEN RAISE EXCEPTION 'TENDER_CLARIFICATION_FORBIDDEN' USING ERRCODE='42501';END IF;
  SELECT jsonb_build_object('tenderId',p_tender_id,'clarifications',COALESCE(jsonb_agg(jsonb_build_object(
    'clarificationId',clarification.id,'clarificationSetId',clarification.clarification_set_id,'setNumber',clarification_set.set_number,
    'bidSubmissionId',clarification.bid_submission_id,'bidRoundId',clarification.bid_round_id,'roundNumber',round.round_number,
    'participantId',clarification.participant_id,'contractorName',participant.contractor_name,'subjectType',clarification.subject_type,
    'lineId',clarification.line_id,'workGroupId',clarification.work_group_id,'workGroupCode',work_group.code,'workGroupLabel',work_group.label,
    'description',CASE clarification.subject_type WHEN 'TENDER'THEN'Whole Tender' WHEN 'CONTRACTOR'THEN participant.contractor_name WHEN 'BID_ROUND'THEN concat('Bid Round ',round.round_number) WHEN 'CATEGORY'THEN work_group.label ELSE COALESCE(submission_item.description,item_source.description)END,
    'unitRate',submission_item.unit_rate,'lineTotal',submission_item.line_total,'type',clarification.clarification_type,'comment',clarification.pm_comment,'status',clarification.status,'revision',clarification.revision,'contractorResponse',clarification.contractor_response,'resolutionNote',clarification.resolution_note,'createdAt',clarification.created_at,'issuedAt',clarification.issued_at,'respondedAt',clarification.responded_at,'resolvedAt',clarification.resolved_at
  )ORDER BY round.round_number,participant.contractor_name,clarification.created_at,clarification.id),'[]'::jsonb)) INTO v_result
  FROM public.project_tender_clarifications clarification
  JOIN public.project_tender_bid_submissions submission ON submission.id=clarification.bid_submission_id JOIN public.project_tender_bid_rounds round ON round.id=clarification.bid_round_id JOIN public.project_tender_setup_versions setup ON setup.id=submission.tender_setup_version_id JOIN public.project_tender_participants participant ON participant.tender_setup_version_id=submission.tender_setup_version_id AND participant.participant_id=clarification.participant_id
  LEFT JOIN public.project_tender_bid_submission_items submission_item ON submission_item.bid_submission_id=clarification.bid_submission_id AND submission_item.line_id=clarification.line_id LEFT JOIN public.project_boq_items item_source ON item_source.boq_version_id=setup.issued_boq_version_id AND item_source.line_id=clarification.line_id LEFT JOIN public.work_ontology_work_groups work_group ON work_group.ontology_version_id=submission.ontology_version_id AND work_group.id=clarification.work_group_id LEFT JOIN public.project_tender_clarification_sets clarification_set ON clarification_set.id=clarification.clarification_set_id
  WHERE clarification.tender_id=p_tender_id;RETURN v_result;
END;$$;

CREATE OR REPLACE FUNCTION public.get_my_tender_clarifications(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_access public.project_tender_bidder_access%ROWTYPE;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT * INTO v_access FROM public.project_tender_bidder_access WHERE tender_id=p_tender_id AND bidder_user_id=v_uid AND status='ACCEPTED';
  IF v_access.tender_id IS NULL THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  SELECT jsonb_build_object('tenderId',p_tender_id,'clarifications',COALESCE(jsonb_agg(jsonb_build_object(
    'clarificationId',clarification.id,'setNumber',clarification_set.set_number,'roundNumber',round.round_number,'subjectType',clarification.subject_type,
    'lineId',clarification.line_id,'workGroupId',clarification.work_group_id,'workGroupCode',work_group.code,'workGroupLabel',work_group.label,
    'description',CASE clarification.subject_type WHEN 'TENDER'THEN'Whole Tender' WHEN 'CONTRACTOR'THEN participant.contractor_name WHEN 'BID_ROUND'THEN concat('Bid Round ',round.round_number) WHEN 'CATEGORY'THEN work_group.label ELSE COALESCE(submission_item.description,item_source.description)END,
    'unitRate',submission_item.unit_rate,'lineTotal',submission_item.line_total,'type',clarification.clarification_type,'comment',clarification.pm_comment,'status',clarification.status,'revision',clarification.revision,'contractorResponse',clarification.contractor_response,'resolutionNote',clarification.resolution_note,'issuedAt',clarification.issued_at,'respondedAt',clarification.responded_at,'resolvedAt',clarification.resolved_at
  )ORDER BY round.round_number,clarification_set.set_number,clarification.created_at),'[]'::jsonb)) INTO v_result
  FROM public.project_tender_clarifications clarification JOIN public.project_tender_bid_submissions submission ON submission.id=clarification.bid_submission_id JOIN public.project_tender_bid_rounds round ON round.id=clarification.bid_round_id JOIN public.project_tender_setup_versions setup ON setup.id=submission.tender_setup_version_id JOIN public.project_tender_participants participant ON participant.tender_setup_version_id=submission.tender_setup_version_id AND participant.participant_id=clarification.participant_id
  LEFT JOIN public.project_tender_bid_submission_items submission_item ON submission_item.bid_submission_id=clarification.bid_submission_id AND submission_item.line_id=clarification.line_id LEFT JOIN public.project_boq_items item_source ON item_source.boq_version_id=setup.issued_boq_version_id AND item_source.line_id=clarification.line_id LEFT JOIN public.work_ontology_work_groups work_group ON work_group.ontology_version_id=submission.ontology_version_id AND work_group.id=clarification.work_group_id JOIN public.project_tender_clarification_sets clarification_set ON clarification_set.id=clarification.clarification_set_id
  WHERE clarification.tender_id=p_tender_id AND clarification.participant_id=v_access.participant_id AND clarification.status<>'DRAFT';RETURN v_result;
END;$$;

REVOKE ALL ON FUNCTION public.create_tender_clarification(bigint,text,uuid,uuid,text,text,uuid),public.create_tender_line_clarification(bigint,uuid,text,text,uuid),public.resolve_tender_clarification(uuid,text,text,integer,uuid),public.close_tender_clarification(uuid,text,integer,uuid),public.get_tender_clarification_workspace(uuid),public.get_my_tender_clarifications(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_tender_clarification(bigint,text,uuid,uuid,text,text,uuid),public.create_tender_line_clarification(bigint,uuid,text,text,uuid),public.resolve_tender_clarification(uuid,text,text,integer,uuid),public.close_tender_clarification(uuid,text,integer,uuid),public.get_tender_clarification_workspace(uuid),public.get_my_tender_clarifications(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_tender_clarifications(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_tender_clarifications(uuid) TO authenticated;

COMMIT;
