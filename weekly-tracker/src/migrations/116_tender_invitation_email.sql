-- 116_tender_invitation_email.sql
-- Branded, versioned Tender invitation content with auditable delivery state.

ALTER TABLE public.project_tender_setup_versions
  ADD COLUMN IF NOT EXISTS invitation_message text NOT NULL
  DEFAULT 'You are invited to participate in this tender. Please review the issued BOQ and tender requirements, then submit your commercial offer before the deadline.'
  CHECK (btrim(invitation_message) <> '' AND char_length(invitation_message) <= 4000);

ALTER TABLE public.project_tender_bidder_access
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_opened_at timestamptz;

REVOKE ALL ON FUNCTION public.save_project_tender_setup(bigint,uuid,text,text,timestamptz,text,text,bigint,jsonb,jsonb,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_project_tender_setup(
  p_project_id bigint, p_tender_id uuid, p_tender_number text, p_title text,
  p_deadline_at timestamptz, p_currency_code text, p_tender_rules text,
  p_invitation_message text,
  p_issued_boq_version_id bigint, p_work_group_ids jsonb, p_participants jsonb,
  p_expected_latest_revision integer, p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_ontology_version_id uuid;
  v_existing public.project_tenders%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE;
  v_current_revision integer;
  v_next_revision integer;
  v_version_id bigint;
  v_boq_id uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_tender_id IS NULL OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'TENDER_ID_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF NULLIF(btrim(COALESCE(p_tender_number, '')), '') IS NULL THEN RAISE EXCEPTION 'TENDER_NUMBER_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF NULLIF(btrim(COALESCE(p_title, '')), '') IS NULL THEN RAISE EXCEPTION 'TENDER_TITLE_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF p_deadline_at IS NULL THEN RAISE EXCEPTION 'TENDER_DEADLINE_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF COALESCE(p_currency_code, '') !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'INVALID_CURRENCY_CODE' USING ERRCODE = '22023'; END IF;
  IF NULLIF(btrim(COALESCE(p_tender_rules, '')), '') IS NULL THEN RAISE EXCEPTION 'TENDER_RULES_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF NULLIF(btrim(COALESCE(p_invitation_message, '')), '') IS NULL OR char_length(p_invitation_message) > 4000 THEN
    RAISE EXCEPTION 'INVALID_TENDER_INVITATION_MESSAGE' USING ERRCODE = '22023';
  END IF;
  IF p_expected_latest_revision IS NULL OR p_expected_latest_revision < 0 THEN RAISE EXCEPTION 'INVALID_EXPECTED_REVISION' USING ERRCODE = '22023'; END IF;
  IF p_work_group_ids IS NULL OR jsonb_typeof(p_work_group_ids) <> 'array' OR jsonb_array_length(p_work_group_ids) = 0 THEN RAISE EXCEPTION 'TENDER_SCOPE_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF p_participants IS NULL OR jsonb_typeof(p_participants) <> 'array' OR jsonb_array_length(p_participants) = 0 THEN RAISE EXCEPTION 'TENDER_PARTICIPANT_REQUIRED' USING ERRCODE = '22023'; END IF;

  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('pm', 'admin') OR public.can_write_project(p_project_id) IS NOT TRUE THEN RAISE EXCEPTION 'Not authorized to manage tender setup' USING ERRCODE = '42501'; END IF;
  SELECT work_ontology_version_id INTO v_ontology_version_id FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002'; END IF;
  IF v_ontology_version_id IS NULL THEN RAISE EXCEPTION 'TENDER_REQUIRES_WORK_ONTOLOGY' USING ERRCODE = '55000'; END IF;
  SELECT v.boq_id INTO v_boq_id FROM public.project_boq_versions v WHERE v.id=p_issued_boq_version_id AND v.project_id=p_project_id AND v.ontology_version_id=v_ontology_version_id;
  IF v_boq_id IS NULL THEN RAISE EXCEPTION 'TENDER_BOQ_VERSION_MISMATCH' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_work_group_ids) value LEFT JOIN public.work_ontology_work_groups g ON g.ontology_version_id=v_ontology_version_id AND g.id=value::uuid WHERE g.id IS NULL) THEN RAISE EXCEPTION 'INVALID_TENDER_WORK_GROUP' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_work_group_ids) value GROUP BY value HAVING count(*) > 1) THEN RAISE EXCEPTION 'DUPLICATE_TENDER_WORK_GROUP' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item WHERE jsonb_typeof(item) <> 'object'
    OR COALESCE(item->>'participantId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR btrim(COALESCE(item->>'contractorName',''))='' OR lower(btrim(COALESCE(item->>'contactEmail',''))) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') THEN RAISE EXCEPTION 'INVALID_TENDER_PARTICIPANT' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participants) item GROUP BY lower(btrim(item->>'contactEmail')) HAVING count(*) > 1) THEN RAISE EXCEPTION 'DUPLICATE_TENDER_PARTICIPANT' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES (v_uid, 'tender.save_setup', p_client_request_id, p_project_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.save_setup' AND client_request_id=p_client_request_id;
  IF v_request.project_id <> p_project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505'; END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response || jsonb_build_object('idempotentReplay', true); END IF;

  SELECT * INTO v_existing FROM public.project_tenders WHERE id=p_tender_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.project_id <> p_project_id OR v_existing.ontology_version_id <> v_ontology_version_id OR v_existing.tender_number <> btrim(p_tender_number) THEN RAISE EXCEPTION 'TENDER_IDENTITY_CONFLICT' USING ERRCODE='23505'; END IF;
  ELSE
    IF p_expected_latest_revision <> 0 THEN RAISE EXCEPTION 'TENDER_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
    INSERT INTO public.project_tenders(id, project_id, ontology_version_id, tender_number, created_by) VALUES (p_tender_id, p_project_id, v_ontology_version_id, btrim(p_tender_number), v_uid);
  END IF;
  SELECT COALESCE(max(revision_number),0) INTO v_current_revision FROM public.project_tender_setup_versions WHERE tender_id=p_tender_id;
  IF v_current_revision <> p_expected_latest_revision THEN RAISE EXCEPTION 'TENDER_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  v_next_revision := v_current_revision + 1;
  INSERT INTO public.project_tender_setup_versions(tender_id,project_id,ontology_version_id,revision_number,title,deadline_at,currency_code,tender_rules,invitation_message,issued_boq_id,issued_boq_version_id,created_by)
    VALUES (p_tender_id,p_project_id,v_ontology_version_id,v_next_revision,btrim(p_title),p_deadline_at,p_currency_code,btrim(p_tender_rules),btrim(p_invitation_message),v_boq_id,p_issued_boq_version_id,v_uid)
    RETURNING id INTO v_version_id;
  INSERT INTO public.project_tender_scope_work_groups(tender_setup_version_id,tender_id,project_id,ontology_version_id,work_group_id)
    SELECT v_version_id,p_tender_id,p_project_id,v_ontology_version_id,value::uuid FROM jsonb_array_elements_text(p_work_group_ids);
  INSERT INTO public.project_tender_participants(tender_setup_version_id,tender_id,project_id,ontology_version_id,participant_id,contractor_name,contact_email)
    SELECT v_version_id,p_tender_id,p_project_id,v_ontology_version_id,(item->>'participantId')::uuid,btrim(item->>'contractorName'),lower(btrim(item->>'contactEmail')) FROM jsonb_array_elements(p_participants) item;
  v_result := jsonb_build_object('tenderId',p_tender_id,'projectId',p_project_id,'setupVersionId',v_version_id,'revisionNumber',v_next_revision,'status','DRAFT');
  UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;
  RETURN v_result || jsonb_build_object('idempotentReplay',false);
END;
$$;

REVOKE ALL ON FUNCTION public.save_project_tender_setup(bigint,uuid,text,text,timestamptz,text,text,text,bigint,jsonb,jsonb,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_project_tender_setup(bigint,uuid,text,text,timestamptz,text,text,text,bigint,jsonb,jsonb,integer,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_project_tender_bidder(p_tender_id uuid,p_participant_id uuid,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid:=auth.uid();v_role text;v_project_id bigint;v_ontology_version_id uuid;v_setup public.project_tender_setup_versions%ROWTYPE;
  v_email text;v_name text;v_bidder_user_id uuid;v_invite_result jsonb;v_request public.write_command_requests%ROWTYPE;v_result jsonb;v_tender_number text;v_store_code text;v_city text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  IF p_tender_id IS NULL OR p_participant_id IS NULL OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'TENDER_INVITATION_ID_REQUIRED' USING ERRCODE='22023';END IF;
  SELECT lower(profile.role) INTO v_role FROM public.profiles profile WHERE profile.id=v_uid;
  SELECT tender.project_id,tender.ontology_version_id,tender.tender_number,project.store_code,project.city INTO v_project_id,v_ontology_version_id,v_tender_number,v_store_code,v_city FROM public.project_tenders tender JOIN public.projects project ON project.id=tender.project_id WHERE tender.id=p_tender_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'TENDER_NOT_FOUND' USING ERRCODE='P0002';END IF;
  IF v_role NOT IN('pm','admin') OR public.can_write_project(v_project_id) IS NOT TRUE THEN RAISE EXCEPTION 'TENDER_INVITATION_FORBIDDEN' USING ERRCODE='42501';END IF;
  SELECT * INTO v_setup FROM public.project_tender_setup_versions version WHERE version.tender_id=p_tender_id ORDER BY version.revision_number DESC LIMIT 1;
  SELECT lower(participant.contact_email),participant.contractor_name INTO v_email,v_name FROM public.project_tender_participants participant WHERE participant.tender_setup_version_id=v_setup.id AND participant.participant_id=p_participant_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'TENDER_PARTICIPANT_NOT_IN_LATEST_SETUP' USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id) VALUES(v_uid,'tender.invite_bidder',p_client_request_id,v_project_id) ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests WHERE actor_id=v_uid AND operation='tender.invite_bidder' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  v_invite_result:=public.invite_contractor(v_email);IF v_invite_result?'error' THEN RAISE EXCEPTION 'TENDER_INVITATION_IDENTITY_REJECTED' USING ERRCODE='42501';END IF;
  SELECT user_row.id INTO v_bidder_user_id FROM auth.users user_row WHERE lower(user_row.email)=v_email LIMIT 1;
  INSERT INTO public.project_tender_bidder_access(tender_id,participant_id,tender_setup_version_id,project_id,ontology_version_id,invited_email,contractor_name,bidder_user_id,status,invited_by,activated_at,revoked_at,email_sent_at,email_opened_at)
    VALUES(p_tender_id,p_participant_id,v_setup.id,v_project_id,v_ontology_version_id,v_email,v_name,v_bidder_user_id,CASE WHEN v_bidder_user_id IS NULL THEN'INVITED'ELSE'ACTIVE'END,v_uid,CASE WHEN v_bidder_user_id IS NULL THEN NULL ELSE now()END,NULL,NULL,NULL)
    ON CONFLICT(tender_id,participant_id)DO UPDATE SET tender_setup_version_id=EXCLUDED.tender_setup_version_id,invited_email=EXCLUDED.invited_email,contractor_name=EXCLUDED.contractor_name,bidder_user_id=EXCLUDED.bidder_user_id,status=EXCLUDED.status,invited_by=EXCLUDED.invited_by,invited_at=now(),activated_at=EXCLUDED.activated_at,revoked_at=NULL,email_sent_at=NULL,email_opened_at=NULL;
  v_result:=jsonb_build_object('tenderId',p_tender_id,'participantId',p_participant_id,'setupVersionId',v_setup.id,'email',v_email,'contractorName',v_name,'status',CASE WHEN v_bidder_user_id IS NULL THEN'INVITED'ELSE'ACTIVE'END,'projectStoreCode',v_store_code,'projectCity',v_city,'tenderNumber',v_tender_number,'title',v_setup.title,'deadlineAt',v_setup.deadline_at,'currencyCode',v_setup.currency_code,'invitationMessage',v_setup.invitation_message);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;$$;

REVOKE ALL ON FUNCTION public.invite_project_tender_bidder(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.invite_project_tender_bidder(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_project_tender_invitation_sent(p_tender_id uuid,p_participant_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sent_at timestamptz:=now();
BEGIN
  UPDATE public.project_tender_bidder_access SET email_sent_at=v_sent_at WHERE tender_id=p_tender_id AND participant_id=p_participant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENDER_INVITATION_NOT_FOUND' USING ERRCODE='P0002';END IF;
  RETURN v_sent_at;
END;$$;
REVOKE ALL ON FUNCTION public.mark_project_tender_invitation_sent(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mark_project_tender_invitation_sent(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.activate_my_tender_invitations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_email text;v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT lower(email)INTO v_email FROM auth.users WHERE id=v_uid;
  UPDATE public.project_tender_bidder_access SET bidder_user_id=v_uid,status='ACTIVE',activated_at=COALESCE(activated_at,now()),email_opened_at=COALESCE(email_opened_at,now()) WHERE invited_email=v_email AND status<>'REVOKED'AND(bidder_user_id IS NULL OR bidder_user_id=v_uid);
  GET DIAGNOSTICS v_count=ROW_COUNT;RETURN v_count;
END;$$;
REVOKE ALL ON FUNCTION public.activate_my_tender_invitations() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.activate_my_tender_invitations() TO authenticated;
