-- 073_tender_bidder_access.sql
-- Roadmap Phase D.18: tender-scoped bidder invitations and read-only workspace.
-- Does not assign bidders to projects and does not create bid rounds/submissions (D.19).

CREATE TABLE IF NOT EXISTS public.project_tender_bidder_access (
  tender_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  tender_setup_version_id bigint NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  invited_email text NOT NULL CHECK (invited_email = lower(invited_email)),
  contractor_name text NOT NULL CHECK (btrim(contractor_name) <> ''),
  bidder_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'REVOKED')),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invited_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  PRIMARY KEY (tender_id, participant_id),
  UNIQUE (tender_id, invited_email),
  FOREIGN KEY (tender_id, project_id, ontology_version_id)
    REFERENCES public.project_tenders(id, project_id, ontology_version_id) ON DELETE RESTRICT,
  FOREIGN KEY (tender_setup_version_id, tender_id, project_id, ontology_version_id)
    REFERENCES public.project_tender_setup_versions(id, tender_id, project_id, ontology_version_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS project_tender_bidder_user_idx
  ON public.project_tender_bidder_access(bidder_user_id, status, invited_at DESC);

ALTER TABLE public.project_tender_bidder_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tender_bidder_access_select" ON public.project_tender_bidder_access;
CREATE POLICY "tender_bidder_access_select" ON public.project_tender_bidder_access
  FOR SELECT TO authenticated USING (
    (bidder_user_id = auth.uid() AND status = 'ACTIVE')
    OR (lower((SELECT role FROM public.profiles WHERE id=auth.uid())) IN ('pm','admin') AND public.can_write_project(project_id))
  );

REVOKE ALL ON TABLE public.project_tender_bidder_access FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_tender_bidder_access TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_project_tender_bidder(
  p_tender_id uuid,
  p_participant_id uuid,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_project_id bigint;
  v_ontology_version_id uuid;
  v_setup_version_id bigint;
  v_email text;
  v_name text;
  v_bidder_user_id uuid;
  v_invite_result jsonb;
  v_request public.write_command_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_tender_id IS NULL OR p_participant_id IS NULL OR p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'TENDER_INVITATION_ID_REQUIRED' USING ERRCODE='22023';
  END IF;
  SELECT lower(profile.role) INTO v_role FROM public.profiles profile WHERE profile.id=v_uid;
  SELECT tender.project_id,tender.ontology_version_id INTO v_project_id,v_ontology_version_id
    FROM public.project_tenders tender WHERE tender.id=p_tender_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'TENDER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_role NOT IN ('pm','admin') OR public.can_write_project(v_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'TENDER_INVITATION_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT version.id INTO v_setup_version_id FROM public.project_tender_setup_versions version
    WHERE version.tender_id=p_tender_id ORDER BY version.revision_number DESC LIMIT 1;
  SELECT lower(participant.contact_email),participant.contractor_name INTO v_email,v_name
    FROM public.project_tender_participants participant
    WHERE participant.tender_setup_version_id=v_setup_version_id AND participant.participant_id=p_participant_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'TENDER_PARTICIPANT_NOT_IN_LATEST_SETUP' USING ERRCODE='22023'; END IF;

  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)
    VALUES(v_uid,'tender.invite_bidder',p_client_request_id,v_project_id)
    ON CONFLICT(actor_id,operation,client_request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.write_command_requests
    WHERE actor_id=v_uid AND operation='tender.invite_bidder' AND client_request_id=p_client_request_id;
  IF v_request.project_id<>v_project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505'; END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true); END IF;

  v_invite_result := public.invite_contractor(v_email);
  IF v_invite_result ? 'error' THEN RAISE EXCEPTION 'TENDER_INVITATION_IDENTITY_REJECTED' USING ERRCODE='42501'; END IF;
  SELECT user_row.id INTO v_bidder_user_id FROM auth.users user_row WHERE lower(user_row.email)=v_email LIMIT 1;

  INSERT INTO public.project_tender_bidder_access(
    tender_id,participant_id,tender_setup_version_id,project_id,ontology_version_id,
    invited_email,contractor_name,bidder_user_id,status,invited_by,activated_at,revoked_at
  ) VALUES (
    p_tender_id,p_participant_id,v_setup_version_id,v_project_id,v_ontology_version_id,
    v_email,v_name,v_bidder_user_id,CASE WHEN v_bidder_user_id IS NULL THEN 'INVITED' ELSE 'ACTIVE' END,
    v_uid,CASE WHEN v_bidder_user_id IS NULL THEN NULL ELSE now() END,NULL
  ) ON CONFLICT(tender_id,participant_id) DO UPDATE SET
    tender_setup_version_id=EXCLUDED.tender_setup_version_id,
    invited_email=EXCLUDED.invited_email,
    contractor_name=EXCLUDED.contractor_name,
    bidder_user_id=EXCLUDED.bidder_user_id,
    status=EXCLUDED.status,
    invited_by=EXCLUDED.invited_by,
    invited_at=now(),
    activated_at=EXCLUDED.activated_at,
    revoked_at=NULL;

  v_result:=jsonb_build_object('tenderId',p_tender_id,'participantId',p_participant_id,
    'setupVersionId',v_setup_version_id,'email',v_email,
    'status',CASE WHEN v_bidder_user_id IS NULL THEN 'INVITED' ELSE 'ACTIVE' END);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now() WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_my_tender_invitations()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid:=auth.uid();v_email text;v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id=v_uid;
  UPDATE public.project_tender_bidder_access SET bidder_user_id=v_uid,status='ACTIVE',activated_at=COALESCE(activated_at,now())
    WHERE invited_email=v_email AND status<>'REVOKED' AND (bidder_user_id IS NULL OR bidder_user_id=v_uid);
  GET DIAGNOSTICS v_count=ROW_COUNT;RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_tender_inbox()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_uid uuid:=auth.uid();v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'tenderId',access.tender_id,'participantId',access.participant_id,'contractorName',access.contractor_name,
    'tenderNumber',tender.tender_number,'title',setup.title,'deadlineAt',setup.deadline_at,
    'currencyCode',setup.currency_code,'setupRevision',setup.revision_number,
    'projectStoreCode',project.store_code,'projectCity',project.city,'invitedAt',access.invited_at
  ) ORDER BY setup.deadline_at), '[]'::jsonb) INTO v_result
  FROM public.project_tender_bidder_access access
  JOIN public.project_tenders tender ON tender.id=access.tender_id
  JOIN public.project_tender_setup_versions setup ON setup.id=access.tender_setup_version_id
  JOIN public.projects project ON project.id=access.project_id
  WHERE access.bidder_user_id=v_uid AND access.status='ACTIVE';
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_tender_workspace(p_tender_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_uid uuid:=auth.uid();v_access public.project_tender_bidder_access%ROWTYPE;v_setup public.project_tender_setup_versions%ROWTYPE;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO v_access FROM public.project_tender_bidder_access
    WHERE tender_id=p_tender_id AND bidder_user_id=v_uid AND status='ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_setup FROM public.project_tender_setup_versions WHERE id=v_access.tender_setup_version_id;
  SELECT jsonb_build_object(
    'tenderId',v_access.tender_id,'participantId',v_access.participant_id,'contractorName',v_access.contractor_name,
    'tenderNumber',tender.tender_number,'projectStoreCode',project.store_code,'projectCity',project.city,
    'title',v_setup.title,'deadlineAt',v_setup.deadline_at,'currencyCode',v_setup.currency_code,
    'tenderRules',v_setup.tender_rules,'setupRevision',v_setup.revision_number,
    'boqRevision',(SELECT revision_number FROM public.project_boq_versions WHERE id=v_setup.issued_boq_version_id),
    'workGroups',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',groups.id,'code',groups.code,'label',groups.label,'discipline',discipline.label) ORDER BY discipline.display_order,groups.display_order)
      FROM public.project_tender_scope_work_groups scope
      JOIN public.work_ontology_work_groups groups ON groups.ontology_version_id=scope.ontology_version_id AND groups.id=scope.work_group_id
      JOIN public.work_ontology_disciplines discipline ON discipline.ontology_version_id=groups.ontology_version_id AND discipline.id=groups.discipline_id
      WHERE scope.tender_setup_version_id=v_setup.id),'[]'::jsonb),
    'boqItems',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'lineId',item.line_id,'workGroupId',item.work_group_id,'itemKind',item.item_kind,
      'description',item.description,'unit',item.unit,'quantity',item.quantity,
      'reference',item.reference,'specification',item.specification,'sortOrder',item.sort_order
    ) ORDER BY item.sort_order,item.line_id)
      FROM public.project_boq_items item
      JOIN public.project_tender_scope_work_groups scope ON scope.tender_setup_version_id=v_setup.id AND scope.work_group_id=item.work_group_id
      WHERE item.boq_version_id=v_setup.issued_boq_version_id),'[]'::jsonb)
  ) INTO v_result
  FROM public.project_tenders tender JOIN public.projects project ON project.id=tender.project_id
  WHERE tender.id=v_access.tender_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_project_tender_bidder(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.activate_my_tender_invitations() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.list_my_tender_inbox() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_my_tender_workspace(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.invite_project_tender_bidder(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_my_tender_invitations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_tender_inbox() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tender_workspace(uuid) TO authenticated;
