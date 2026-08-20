-- 156_tender_organization_identity.sql
-- Tender Engine identity is organization-agnostic:
-- Procuring Organization -> Tender Package -> Bidding Organizations.
-- Legacy contractor_name fields remain compatibility snapshots only.

BEGIN;

DO $tender_organization_preflight$
BEGIN
  IF EXISTS(
    SELECT 1
    FROM public.project_tenders tender
    JOIN public.projects project ON project.id=tender.project_id
    WHERE project.organization_id IS NULL
  )THEN
    RAISE EXCEPTION 'TENDER_ORGANIZATION_PROJECT_OWNER_MISSING' USING ERRCODE='23502';
  END IF;
END
$tender_organization_preflight$;

ALTER TABLE public.project_tenders
  ADD COLUMN procuring_organization_id uuid;

UPDATE public.project_tenders tender
SET procuring_organization_id=project.organization_id
FROM public.projects project
WHERE project.id=tender.project_id;

ALTER TABLE public.project_tenders
  ALTER COLUMN procuring_organization_id SET NOT NULL,
  ADD CONSTRAINT project_tenders_procuring_organization_fkey
    FOREIGN KEY(procuring_organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX project_tenders_procuring_organization_idx
  ON public.project_tenders(procuring_organization_id,created_at DESC);

ALTER TABLE public.project_tenders
  ADD CONSTRAINT project_tenders_org_identity_key
  UNIQUE(id,project_id,procuring_organization_id);

CREATE OR REPLACE FUNCTION private.set_tender_procuring_organization()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_organization_id uuid;
BEGIN
  SELECT project.organization_id INTO v_organization_id
  FROM public.projects project WHERE project.id=NEW.project_id;
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'TENDER_ORGANIZATION_PROJECT_OWNER_MISSING' USING ERRCODE='23502';
  END IF;
  IF NEW.procuring_organization_id IS NOT NULL
    AND NEW.procuring_organization_id<>v_organization_id THEN
    RAISE EXCEPTION 'TENDER_PROCURING_ORGANIZATION_MISMATCH' USING ERRCODE='23514';
  END IF;
  NEW.procuring_organization_id:=v_organization_id;
  RETURN NEW;
END;$$;

CREATE TRIGGER project_tenders_set_procuring_organization
BEFORE INSERT OR UPDATE OF project_id,procuring_organization_id ON public.project_tenders
FOR EACH ROW EXECUTE FUNCTION private.set_tender_procuring_organization();

CREATE TABLE public.project_tender_organization_participants(
  tender_setup_version_id bigint NOT NULL,
  participant_id uuid NOT NULL,
  tender_id uuid NOT NULL,
  project_id bigint NOT NULL,
  procuring_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  bidding_organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
  bidding_organization_name text NOT NULL CHECK(btrim(bidding_organization_name)<>''),
  contact_email text NOT NULL CHECK(contact_email=lower(contact_email)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tender_setup_version_id,participant_id),
  FOREIGN KEY(tender_setup_version_id,participant_id)
    REFERENCES public.project_tender_participants(tender_setup_version_id,participant_id) ON DELETE RESTRICT,
  FOREIGN KEY(tender_id,project_id,procuring_organization_id)
    REFERENCES public.project_tenders(id,project_id,procuring_organization_id) ON DELETE RESTRICT,
  CHECK(bidding_organization_id IS NULL OR bidding_organization_id<>procuring_organization_id)
);

CREATE UNIQUE INDEX project_tender_one_identity_per_bidding_org_idx
  ON public.project_tender_organization_participants(tender_setup_version_id,bidding_organization_id)
  WHERE bidding_organization_id IS NOT NULL;
CREATE INDEX project_tender_organization_participants_tender_idx
  ON public.project_tender_organization_participants(tender_id,tender_setup_version_id);
CREATE INDEX project_tender_organization_participants_bidder_idx
  ON public.project_tender_organization_participants(bidding_organization_id,tender_id)
  WHERE bidding_organization_id IS NOT NULL;

INSERT INTO public.project_tender_organization_participants(
  tender_setup_version_id,participant_id,tender_id,project_id,procuring_organization_id,
  bidding_organization_name,contact_email
)
SELECT participant.tender_setup_version_id,participant.participant_id,participant.tender_id,
  participant.project_id,tender.procuring_organization_id,participant.contractor_name,
  participant.contact_email
FROM public.project_tender_participants participant
JOIN public.project_tenders tender ON tender.id=participant.tender_id;

CREATE TABLE public.project_tender_bidding_organization_claims(
  tender_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  bidding_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  claimed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tender_id,participant_id),
  UNIQUE(tender_id,bidding_organization_id),
  FOREIGN KEY(tender_id,participant_id)
    REFERENCES public.project_tender_bidder_access(tender_id,participant_id) ON DELETE RESTRICT
);

CREATE INDEX project_tender_bidding_claims_org_idx
  ON public.project_tender_bidding_organization_claims(bidding_organization_id,tender_id);

CREATE OR REPLACE FUNCTION private.prevent_tender_organization_identity_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'TENDER_ORGANIZATION_IDENTITY_IMMUTABLE' USING ERRCODE='55000';
END;$$;

CREATE TRIGGER project_tender_organization_participants_immutable
BEFORE UPDATE OR DELETE ON public.project_tender_organization_participants
FOR EACH ROW EXECUTE FUNCTION private.prevent_tender_organization_identity_mutation();
CREATE TRIGGER project_tender_bidding_organization_claims_immutable
BEFORE UPDATE OR DELETE ON public.project_tender_bidding_organization_claims
FOR EACH ROW EXECUTE FUNCTION private.prevent_tender_organization_identity_mutation();

ALTER TABLE public.project_tender_organization_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tender_bidding_organization_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY tender_organization_participants_read
ON public.project_tender_organization_participants FOR SELECT TO authenticated USING(
  public.has_project_capability(project_id,'TENDER_MANAGE',NULL)
  OR EXISTS(
    SELECT 1 FROM public.project_tender_bidder_access access
    WHERE access.tender_id=project_tender_organization_participants.tender_id
      AND access.participant_id=project_tender_organization_participants.participant_id
      AND access.bidder_user_id=auth.uid() AND access.status<>'REVOKED'
  )
);
CREATE POLICY tender_bidding_organization_claims_read
ON public.project_tender_bidding_organization_claims FOR SELECT TO authenticated USING(
  EXISTS(
    SELECT 1 FROM public.project_tender_bidder_access access
    WHERE access.tender_id=project_tender_bidding_organization_claims.tender_id
      AND access.participant_id=project_tender_bidding_organization_claims.participant_id
      AND(
        access.bidder_user_id=auth.uid()
        OR public.has_project_capability(access.project_id,'TENDER_MANAGE',NULL)
      )
  )
);

REVOKE ALL ON TABLE public.project_tender_organization_participants,
  public.project_tender_bidding_organization_claims FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.project_tender_organization_participants,
  public.project_tender_bidding_organization_claims TO authenticated;

ALTER FUNCTION public.save_project_tender_setup(
  bigint,uuid,text,text,timestamptz,text,text,text,bigint,jsonb,jsonb,integer,uuid
) RENAME TO save_project_tender_setup_legacy_organization_identity;
REVOKE ALL ON FUNCTION public.save_project_tender_setup_legacy_organization_identity(
  bigint,uuid,text,text,timestamptz,text,text,text,bigint,jsonb,jsonb,integer,uuid
) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.save_project_tender_setup(
  p_project_id bigint,p_tender_id uuid,p_tender_number text,p_title text,p_deadline_at timestamptz,
  p_currency_code text,p_tender_rules text,p_invitation_message text,p_issued_boq_version_id bigint,
  p_work_group_ids jsonb,p_participants jsonb,p_expected_latest_revision integer,p_client_request_id uuid
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb;v_setup_version_id bigint;v_procuring_organization_id uuid;
BEGIN
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_participants) item
    WHERE NULLIF(item->>'biddingOrganizationId','') IS NOT NULL
      AND(item->>'biddingOrganizationId')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  )THEN RAISE EXCEPTION 'INVALID_BIDDING_ORGANIZATION_ID' USING ERRCODE='22023';END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_participants) item
    LEFT JOIN public.organizations organization_row
      ON organization_row.id=NULLIF(item->>'biddingOrganizationId','')::uuid
    WHERE NULLIF(item->>'biddingOrganizationId','') IS NOT NULL
      AND(organization_row.id IS NULL OR organization_row.status<>'ACTIVE')
  )THEN RAISE EXCEPTION 'BIDDING_ORGANIZATION_NOT_ACTIVE' USING ERRCODE='22023';END IF;

  v_result:=public.save_project_tender_setup_legacy_organization_identity(
    p_project_id,p_tender_id,p_tender_number,p_title,p_deadline_at,p_currency_code,
    p_tender_rules,p_invitation_message,p_issued_boq_version_id,p_work_group_ids,
    p_participants,p_expected_latest_revision,p_client_request_id
  );
  v_setup_version_id:=(v_result->>'setupVersionId')::bigint;
  SELECT tender.procuring_organization_id INTO v_procuring_organization_id
  FROM public.project_tenders tender WHERE tender.id=p_tender_id;

  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_participants) item
    WHERE NULLIF(item->>'biddingOrganizationId','')::uuid=v_procuring_organization_id
  )THEN RAISE EXCEPTION 'BIDDING_ORGANIZATION_CANNOT_BE_PROCURER' USING ERRCODE='22023';END IF;

  INSERT INTO public.project_tender_organization_participants(
    tender_setup_version_id,participant_id,tender_id,project_id,procuring_organization_id,
    bidding_organization_id,bidding_organization_name,contact_email
  )
  SELECT v_setup_version_id,(item->>'participantId')::uuid,p_tender_id,p_project_id,
    v_procuring_organization_id,organization_row.id,
    COALESCE(organization_row.name,NULLIF(btrim(item->>'biddingOrganizationName'),''),btrim(item->>'contractorName')),
    lower(btrim(item->>'contactEmail'))
  FROM jsonb_array_elements(p_participants) item
  LEFT JOIN public.organizations organization_row
    ON organization_row.id=NULLIF(item->>'biddingOrganizationId','')::uuid
  ON CONFLICT(tender_setup_version_id,participant_id) DO NOTHING;

  RETURN v_result||jsonb_build_object(
    'procuringOrganizationId',v_procuring_organization_id,
    'organizationIdentityModel','PROCURER_PACKAGE_BIDDERS'
  );
END;$$;

ALTER FUNCTION public.invite_project_tender_bidder(uuid,uuid,uuid)
  RENAME TO invite_project_tender_bidder_legacy_organization_identity;
REVOKE ALL ON FUNCTION public.invite_project_tender_bidder_legacy_organization_identity(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.invite_project_tender_bidder(
  p_tender_id uuid,p_participant_id uuid,p_client_request_id uuid
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb;v_party public.project_tender_organization_participants%ROWTYPE;
BEGIN
  v_result:=public.invite_project_tender_bidder_legacy_organization_identity(
    p_tender_id,p_participant_id,p_client_request_id
  );
  SELECT*INTO v_party FROM public.project_tender_organization_participants party
  WHERE party.tender_setup_version_id=(v_result->>'setupVersionId')::bigint
    AND party.participant_id=p_participant_id;
  RETURN v_result||jsonb_build_object(
    'procuringOrganizationId',v_party.procuring_organization_id,
    'biddingOrganizationId',v_party.bidding_organization_id,
    'biddingOrganizationName',v_party.bidding_organization_name
  );
END;$$;

CREATE OR REPLACE FUNCTION public.link_my_tender_bidding_organization(
  p_tender_id uuid,p_organization_id uuid
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_access public.project_tender_bidder_access%ROWTYPE;
  v_party public.project_tender_organization_participants%ROWTYPE;v_existing uuid;v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT*INTO v_access FROM public.project_tender_bidder_access access
  WHERE access.tender_id=p_tender_id AND access.bidder_user_id=v_uid AND access.status='ACCEPTED';
  IF v_access.tender_id IS NULL THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.organization_memberships membership
    JOIN public.organizations organization_row ON organization_row.id=membership.organization_id
    WHERE membership.organization_id=p_organization_id AND membership.user_id=v_uid
      AND membership.status='ACTIVE' AND organization_row.status='ACTIVE'
  )THEN RAISE EXCEPTION 'BIDDING_ORGANIZATION_MEMBERSHIP_REQUIRED' USING ERRCODE='42501';END IF;
  SELECT*INTO v_party FROM public.project_tender_organization_participants party
  WHERE party.tender_setup_version_id=v_access.tender_setup_version_id
    AND party.participant_id=v_access.participant_id;
  IF p_organization_id=v_party.procuring_organization_id THEN
    RAISE EXCEPTION 'BIDDING_ORGANIZATION_CANNOT_BE_PROCURER' USING ERRCODE='22023';END IF;
  IF v_party.bidding_organization_id IS NOT NULL
    AND v_party.bidding_organization_id<>p_organization_id THEN
    RAISE EXCEPTION 'BIDDING_ORGANIZATION_MISMATCH' USING ERRCODE='42501';END IF;
  SELECT claim.bidding_organization_id INTO v_existing
  FROM public.project_tender_bidding_organization_claims claim
  WHERE claim.tender_id=p_tender_id AND claim.participant_id=v_access.participant_id;
  IF v_existing IS NOT NULL AND v_existing<>p_organization_id THEN
    RAISE EXCEPTION 'BIDDING_ORGANIZATION_ALREADY_LINKED' USING ERRCODE='23505';END IF;
  INSERT INTO public.project_tender_bidding_organization_claims(
    tender_id,participant_id,bidding_organization_id,claimed_by
  )VALUES(p_tender_id,v_access.participant_id,p_organization_id,v_uid)
  ON CONFLICT(tender_id,participant_id) DO NOTHING;
  SELECT name INTO v_name FROM public.organizations WHERE id=p_organization_id;
  RETURN jsonb_build_object('tenderId',p_tender_id,'participantId',v_access.participant_id,
    'procuringOrganizationId',v_party.procuring_organization_id,
    'biddingOrganizationId',p_organization_id,'biddingOrganizationName',v_name);
END;$$;

CREATE OR REPLACE FUNCTION public.respond_to_my_tender_invitation_as_organization(
  p_tender_id uuid,p_decision text,p_bidding_organization_id uuid,p_client_request_id uuid
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb;v_identity jsonb;
BEGIN
  IF p_decision='ACCEPTED' AND p_bidding_organization_id IS NULL THEN
    RAISE EXCEPTION 'BIDDING_ORGANIZATION_REQUIRED' USING ERRCODE='22023';END IF;
  v_result:=public.respond_to_my_tender_invitation(
    p_tender_id,p_decision,p_client_request_id
  );
  IF p_decision='ACCEPTED' THEN
    v_identity:=public.link_my_tender_bidding_organization(
      p_tender_id,p_bidding_organization_id
    );
    RETURN v_result||v_identity;
  END IF;
  RETURN v_result;
END;$$;

CREATE OR REPLACE FUNCTION public.get_tender_organization_identity(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_tender public.project_tenders%ROWTYPE;v_can_manage boolean;
BEGIN
  SELECT*INTO v_tender FROM public.project_tenders WHERE id=p_tender_id;
  IF v_uid IS NULL OR v_tender.id IS NULL THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  v_can_manage:=public.has_project_capability(v_tender.project_id,'TENDER_MANAGE',NULL);
  IF NOT v_can_manage AND NOT EXISTS(
    SELECT 1 FROM public.project_tender_bidder_access access
    WHERE access.tender_id=p_tender_id AND access.bidder_user_id=v_uid AND access.status<>'REVOKED'
  )THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  RETURN jsonb_build_object(
    'tenderId',v_tender.id,'projectId',v_tender.project_id,
    'procuringOrganizationId',v_tender.procuring_organization_id,
    'procuringOrganizationName',(SELECT name FROM public.organizations WHERE id=v_tender.procuring_organization_id),
    'biddingOrganizations',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'participantId',party.participant_id,
        'biddingOrganizationId',COALESCE(claim.bidding_organization_id,party.bidding_organization_id),
        'biddingOrganizationName',COALESCE(claim_org.name,bidding_org.name,party.bidding_organization_name),
        'contactEmail',party.contact_email,'invitationStatus',access.status
      )ORDER BY party.bidding_organization_name,party.participant_id)
      FROM public.project_tender_organization_participants party
      LEFT JOIN public.project_tender_bidder_access access
        ON access.tender_id=party.tender_id AND access.participant_id=party.participant_id
      LEFT JOIN public.project_tender_bidding_organization_claims claim
        ON claim.tender_id=party.tender_id AND claim.participant_id=party.participant_id
      LEFT JOIN public.organizations bidding_org ON bidding_org.id=party.bidding_organization_id
      LEFT JOIN public.organizations claim_org ON claim_org.id=claim.bidding_organization_id
      WHERE party.tender_id=p_tender_id
        AND(v_can_manage OR access.bidder_user_id=v_uid)
        AND party.tender_setup_version_id=(
          SELECT max(setup.id) FROM public.project_tender_setup_versions setup
          WHERE setup.tender_id=p_tender_id
        )
    ),'[]'::jsonb)
  );
END;$$;

CREATE OR REPLACE FUNCTION public.list_my_tender_inbox()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION'Authentication required'USING ERRCODE='28000';END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'tenderId',access.tender_id,'participantId',access.participant_id,
    'contractorName',access.contractor_name,
    'procuringOrganizationId',tender.procuring_organization_id,
    'procuringOrganizationName',procurer.name,
    'biddingOrganizationId',COALESCE(claim.bidding_organization_id,party.bidding_organization_id),
    'biddingOrganizationName',COALESCE(claim_org.name,bidding_org.name,party.bidding_organization_name,access.contractor_name),
    'tenderNumber',tender.tender_number,'title',setup.title,'deadlineAt',setup.deadline_at,'currencyCode',setup.currency_code,
    'setupRevision',setup.revision_number,'projectStoreCode',project.store_code,'projectCity',project.city,
    'invitedAt',access.invited_at,'invitationMessage',setup.invitation_message,'invitationStatus',access.status,
    'packageAvailable',access.status='ACCEPTED','respondedAt',access.responded_at
  )ORDER BY setup.deadline_at)
  FROM public.project_tender_bidder_access access
  JOIN public.project_tenders tender ON tender.id=access.tender_id
  JOIN public.organizations procurer ON procurer.id=tender.procuring_organization_id
  JOIN public.project_tender_setup_versions setup ON setup.id=access.tender_setup_version_id
  JOIN public.projects project ON project.id=access.project_id
  LEFT JOIN public.project_tender_organization_participants party
    ON party.tender_setup_version_id=access.tender_setup_version_id AND party.participant_id=access.participant_id
  LEFT JOIN public.project_tender_bidding_organization_claims claim
    ON claim.tender_id=access.tender_id AND claim.participant_id=access.participant_id
  LEFT JOIN public.organizations bidding_org ON bidding_org.id=party.bidding_organization_id
  LEFT JOIN public.organizations claim_org ON claim_org.id=claim.bidding_organization_id
  WHERE access.bidder_user_id=v_uid AND access.status<>'REVOKED'),'[]'::jsonb);
END;$$;

-- Keep the established bidder workspace payload and add canonical party identity.
ALTER FUNCTION public.get_my_tender_workspace(uuid)
  RENAME TO get_my_tender_workspace_legacy_organization_identity;
REVOKE ALL ON FUNCTION public.get_my_tender_workspace_legacy_organization_identity(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_my_tender_workspace(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_base jsonb;v_identity jsonb;v_uid uuid:=auth.uid();v_access public.project_tender_bidder_access%ROWTYPE;
BEGIN
  v_base:=public.get_my_tender_workspace_legacy_organization_identity(p_tender_id);
  SELECT*INTO v_access FROM public.project_tender_bidder_access access
  WHERE access.tender_id=p_tender_id AND access.bidder_user_id=v_uid AND access.status='ACCEPTED';
  v_identity:=public.get_tender_organization_identity(p_tender_id);
  RETURN v_base||jsonb_build_object(
    'procuringOrganizationId',v_identity->>'procuringOrganizationId',
    'procuringOrganizationName',v_identity->>'procuringOrganizationName',
    'biddingOrganizationId',v_identity#>>'{biddingOrganizations,0,biddingOrganizationId}',
    'biddingOrganizationName',COALESCE(v_identity#>>'{biddingOrganizations,0,biddingOrganizationName}',v_access.contractor_name)
  );
END;$$;

REVOKE ALL ON FUNCTION private.set_tender_procuring_organization(),
  private.prevent_tender_organization_identity_mutation(),
  public.save_project_tender_setup(bigint,uuid,text,text,timestamptz,text,text,text,bigint,jsonb,jsonb,integer,uuid),
  public.invite_project_tender_bidder(uuid,uuid,uuid),
  public.link_my_tender_bidding_organization(uuid,uuid),
  public.respond_to_my_tender_invitation_as_organization(uuid,text,uuid,uuid),
  public.get_tender_organization_identity(uuid),public.list_my_tender_inbox(),
  public.get_my_tender_workspace(uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  public.save_project_tender_setup(bigint,uuid,text,text,timestamptz,text,text,text,bigint,jsonb,jsonb,integer,uuid),
  public.invite_project_tender_bidder(uuid,uuid,uuid),
  public.link_my_tender_bidding_organization(uuid,uuid),
  public.respond_to_my_tender_invitation_as_organization(uuid,text,uuid,uuid),
  public.get_tender_organization_identity(uuid),public.list_my_tender_inbox(),
  public.get_my_tender_workspace(uuid)
TO authenticated;

-- Kept explicit for ACL normalization tooling as these replace existing RPCs.
REVOKE ALL ON FUNCTION public.get_tender_organization_identity(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_tender_organization_identity(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_my_tender_inbox()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_my_tender_inbox() TO authenticated;

COMMIT;
