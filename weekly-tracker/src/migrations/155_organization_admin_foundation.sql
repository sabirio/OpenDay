-- 155_organization_admin_foundation.sql
-- Phase 6A: organization-scoped employee administration and invitations.
-- Organization membership is the tenant boundary; Platform Superadmin and
-- commercial entitlement authority remain separate.

BEGIN;

ALTER TABLE public.organization_memberships
  ADD COLUMN access_role text,
  ADD COLUMN job_role text,
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision > 0);

UPDATE public.organization_memberships membership
SET access_role = profile.role,
    job_role = profile.job_role
FROM public.profiles profile
WHERE profile.id = membership.user_id;

ALTER TABLE public.organization_memberships
  ALTER COLUMN access_role SET NOT NULL,
  ADD CONSTRAINT organization_memberships_access_role_check
    CHECK(access_role IN('Admin','PM','Consultant','Contractor','Approver','Executive','Viewer','Inactive')),
  ADD CONSTRAINT organization_memberships_job_role_check
    CHECK(job_role IS NULL OR job_role IN(
      'Construction Manager','Lease Manager','Project Manager','Security Manager',
      'IT Manager','HR Manager','Store Designer','Supply Manager','Facility Manager'
    ));

CREATE TABLE public.organization_user_invitations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  email text NOT NULL CHECK(email = lower(btrim(email)) AND email LIKE '%@%'),
  name text CHECK(name IS NULL OR btrim(name) <> ''),
  organization_role text NOT NULL CHECK(organization_role IN('ORG_ADMIN','MEMBER')),
  access_role text NOT NULL CHECK(access_role IN('Admin','PM','Consultant','Approver','Executive')),
  job_role text CHECK(job_role IS NULL OR job_role IN(
    'Construction Manager','Lease Manager','Project Manager','Security Manager',
    'IT Manager','HR Manager','Store Designer','Supply Manager','Facility Manager'
  )),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK(status IN('PENDING','SENT','ACCEPTED','REVOKED','EXPIRED')),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT(now() + interval '7 days'),
  CHECK(expires_at > created_at)
);

CREATE UNIQUE INDEX organization_user_invitations_open_idx
  ON public.organization_user_invitations(organization_id,email)
  WHERE status IN('PENDING','SENT');
CREATE INDEX organization_user_invitations_email_status_idx
  ON public.organization_user_invitations(email,status,expires_at);

CREATE TABLE public.organization_user_change_events(
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  invitation_id uuid REFERENCES public.organization_user_invitations(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK(event_type IN(
    'INVITED','INVITATION_SENT','INVITATION_ACCEPTED','MEMBER_UPDATED','MEMBER_DEACTIVATED'
  )),
  previous_data jsonb,
  new_data jsonb NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  client_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organization_user_change_events_org_idx
  ON public.organization_user_change_events(organization_id,created_at DESC,id DESC);

CREATE TABLE public.organization_user_command_requests(
  id bigserial PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation text NOT NULL,
  client_request_id uuid NOT NULL,
  request_payload jsonb NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(actor_id,operation,client_request_id)
);

CREATE OR REPLACE FUNCTION private.organization_user_events_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  RAISE EXCEPTION 'ORGANIZATION_USER_EVENTS_IMMUTABLE' USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER organization_user_events_immutable
BEFORE UPDATE OR DELETE ON public.organization_user_change_events
FOR EACH ROW EXECUTE FUNCTION private.organization_user_events_immutable();

CREATE OR REPLACE FUNCTION private.require_organization_admin(
  p_organization_id uuid,p_actor_id uuid
)RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
BEGIN
  IF p_actor_id IS NULL OR p_organization_id IS NULL
    OR private.has_active_organization_membership(
      p_organization_id,p_actor_id,'ORG_ADMIN'
    ) IS NOT TRUE THEN
    RAISE EXCEPTION 'ORGANIZATION_ADMIN_FORBIDDEN' USING ERRCODE='42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_organization_users(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  PERFORM private.require_organization_admin(p_organization_id,v_actor);
  RETURN jsonb_build_object(
    'organizationId',p_organization_id,
    'users',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',profile.id,'name',profile.name,'email',profile.email,
      'organizationRole',membership.organization_role,
      'accessRole',membership.access_role,'role',membership.job_role,
      'jobRole',membership.job_role,'status',membership.status,
      'revision',membership.revision,'isPrimary',membership.is_primary
    )ORDER BY membership.status,profile.name,profile.email)
    FROM public.organization_memberships membership
    JOIN public.profiles profile ON profile.id=membership.user_id
    WHERE membership.organization_id=p_organization_id
      AND membership.access_role<>'Contractor'),'[]'::jsonb),
    'invitations',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',invitation.id,'email',invitation.email,'name',invitation.name,
      'organizationRole',invitation.organization_role,
      'accessRole',invitation.access_role,'role',invitation.job_role,
      'status',invitation.status,'createdAt',invitation.created_at,
      'sentAt',invitation.sent_at,'expiresAt',invitation.expires_at
    )ORDER BY invitation.created_at DESC)
    FROM public.organization_user_invitations invitation
    WHERE invitation.organization_id=p_organization_id
      AND invitation.status IN('PENDING','SENT')),'[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_organization_user_invitation(
  p_organization_id uuid,p_email text,p_name text,p_organization_role text,
  p_access_role text,p_job_role text,p_client_request_id uuid
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
  v_actor uuid:=auth.uid();v_email text:=lower(btrim(COALESCE(p_email,'')));
  v_request public.organization_user_command_requests%ROWTYPE;
  v_payload jsonb;v_invitation public.organization_user_invitations%ROWTYPE;
  v_organization public.organizations%ROWTYPE;v_result jsonb;
BEGIN
  PERFORM private.require_organization_admin(p_organization_id,v_actor);
  IF p_client_request_id IS NULL OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    OR p_organization_role NOT IN('ORG_ADMIN','MEMBER')
    OR p_access_role NOT IN('Admin','PM','Consultant','Approver','Executive')
    OR(p_job_role IS NOT NULL AND p_job_role NOT IN(
      'Construction Manager','Lease Manager','Project Manager','Security Manager',
      'IT Manager','HR Manager','Store Designer','Supply Manager','Facility Manager'))
    OR char_length(btrim(COALESCE(p_name,'')))>200 THEN
    RAISE EXCEPTION 'INVALID_ORGANIZATION_INVITATION' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM auth.users user_row
    JOIN public.organization_memberships membership ON membership.user_id=user_row.id
    WHERE lower(user_row.email)=v_email AND membership.organization_id=p_organization_id
      AND membership.status='ACTIVE')THEN
    RAISE EXCEPTION 'ORGANIZATION_USER_ALREADY_ACTIVE' USING ERRCODE='23505';
  END IF;
  v_payload:=jsonb_build_object('organizationId',p_organization_id,'email',v_email,
    'name',NULLIF(btrim(COALESCE(p_name,'')),''),'organizationRole',p_organization_role,
    'accessRole',p_access_role,'jobRole',p_job_role);
  INSERT INTO public.organization_user_command_requests(actor_id,operation,client_request_id,request_payload)
  VALUES(v_actor,'organization.user.invite',p_client_request_id,v_payload)
  ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.organization_user_command_requests
  WHERE actor_id=v_actor AND operation='organization.user.invite'
    AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.request_payload IS DISTINCT FROM v_payload THEN
    RAISE EXCEPTION 'ORGANIZATION_COMMAND_IDEMPOTENCY_CONFLICT' USING ERRCODE='22023';
  END IF;
  IF v_request.response IS NOT NULL THEN
    RETURN v_request.response||jsonb_build_object('idempotentReplay',true);
  END IF;
  UPDATE public.organization_user_invitations SET status='EXPIRED'
  WHERE organization_id=p_organization_id AND email=v_email
    AND status IN('PENDING','SENT') AND expires_at<=now();
  INSERT INTO public.organization_user_invitations(
    organization_id,email,name,organization_role,access_role,job_role,invited_by
  )VALUES(p_organization_id,v_email,NULLIF(btrim(COALESCE(p_name,'')),''),
    p_organization_role,p_access_role,p_job_role,v_actor)
  ON CONFLICT(organization_id,email)WHERE status IN('PENDING','SENT') DO UPDATE SET
    name=EXCLUDED.name,organization_role=EXCLUDED.organization_role,
    access_role=EXCLUDED.access_role,job_role=EXCLUDED.job_role,
    invited_by=EXCLUDED.invited_by,created_at=now(),sent_at=NULL,
    expires_at=now()+interval '7 days',status='PENDING'
  RETURNING * INTO v_invitation;
  SELECT *INTO v_organization FROM public.organizations WHERE id=p_organization_id;
  v_result:=jsonb_build_object('invitationId',v_invitation.id,
    'organizationId',p_organization_id,'organizationName',v_organization.name,
    'email',v_invitation.email,'name',v_invitation.name,
    'organizationRole',v_invitation.organization_role,
    'accessRole',v_invitation.access_role,'jobRole',v_invitation.job_role,
    'expiresAt',v_invitation.expires_at);
  INSERT INTO public.organization_user_change_events(
    organization_id,invitation_id,event_type,new_data,actor_id,client_request_id
  )VALUES(p_organization_id,v_invitation.id,'INVITED',v_result,v_actor,p_client_request_id);
  UPDATE public.organization_user_command_requests SET response=v_result,completed_at=now()
  WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_organization_user_invitation_sent(p_invitation_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_invitation public.organization_user_invitations%ROWTYPE;v_now timestamptz:=now();
BEGIN
  SELECT *INTO v_invitation FROM public.organization_user_invitations
  WHERE id=p_invitation_id FOR UPDATE;
  IF v_invitation.id IS NULL OR v_invitation.status NOT IN('PENDING','SENT')
    OR v_invitation.expires_at<=v_now THEN
    RAISE EXCEPTION 'ORGANIZATION_INVITATION_NOT_SENDABLE' USING ERRCODE='55000';
  END IF;
  UPDATE public.organization_user_invitations SET status='SENT',sent_at=v_now
  WHERE id=p_invitation_id;
  INSERT INTO public.organization_user_change_events(
    organization_id,invitation_id,event_type,new_data,actor_id
  )VALUES(v_invitation.organization_id,v_invitation.id,'INVITATION_SENT',
    jsonb_build_object('sentAt',v_now),v_invitation.invited_by);
  RETURN v_now;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_my_organization_invitations()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
  v_user uuid:=auth.uid();v_email text;v_invitation public.organization_user_invitations%ROWTYPE;
  v_primary boolean;v_company text;v_accepted jsonb:='[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT lower(email)INTO v_email FROM auth.users WHERE id=v_user;
  FOR v_invitation IN SELECT * FROM public.organization_user_invitations
    WHERE email=v_email AND status IN('PENDING','SENT') AND expires_at>now()
    ORDER BY created_at,id FOR UPDATE
  LOOP
    v_primary:=NOT EXISTS(SELECT 1 FROM public.organization_memberships
      WHERE user_id=v_user AND is_primary);
    IF v_primary THEN
      SELECT legacy_company_id INTO v_company FROM public.organizations
      WHERE id=v_invitation.organization_id;
      UPDATE public.profiles SET company_id=v_company,
        name=COALESCE(v_invitation.name,name),role=v_invitation.access_role,
        job_role=v_invitation.job_role,is_active=true,removed_at=NULL,removed_by=NULL
      WHERE id=v_user;
    END IF;
    INSERT INTO public.organization_memberships(
      organization_id,user_id,organization_role,status,is_primary,access_role,job_role
    )VALUES(v_invitation.organization_id,v_user,v_invitation.organization_role,'ACTIVE',
      v_primary,v_invitation.access_role,v_invitation.job_role)
    ON CONFLICT(organization_id,user_id)DO UPDATE SET
      organization_role=EXCLUDED.organization_role,status='ACTIVE',
      access_role=EXCLUDED.access_role,job_role=EXCLUDED.job_role,
      is_primary=public.organization_memberships.is_primary OR EXCLUDED.is_primary,
      revision=public.organization_memberships.revision+1,updated_at=now();
    UPDATE public.organization_user_invitations SET status='ACCEPTED',accepted_at=now()
    WHERE id=v_invitation.id;
    INSERT INTO public.organization_user_change_events(
      organization_id,target_user_id,invitation_id,event_type,new_data,actor_id
    )VALUES(v_invitation.organization_id,v_user,v_invitation.id,'INVITATION_ACCEPTED',
      jsonb_build_object('userId',v_user,'organizationRole',v_invitation.organization_role,
        'accessRole',v_invitation.access_role,'jobRole',v_invitation.job_role),v_user);
    v_accepted:=v_accepted||jsonb_build_array(v_invitation.organization_id);
  END LOOP;
  RETURN jsonb_build_object('acceptedOrganizationIds',v_accepted);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_organization_user(
  p_organization_id uuid,p_user_id uuid,p_name text,p_organization_role text,
  p_access_role text,p_job_role text,p_expected_revision integer,p_client_request_id uuid
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
  v_actor uuid:=auth.uid();v_membership public.organization_memberships%ROWTYPE;
  v_request public.organization_user_command_requests%ROWTYPE;v_payload jsonb;v_result jsonb;
BEGIN
  PERFORM private.require_organization_admin(p_organization_id,v_actor);
  IF p_client_request_id IS NULL OR p_expected_revision IS NULL
    OR p_organization_role NOT IN('ORG_ADMIN','MEMBER')
    OR p_access_role NOT IN('Admin','PM','Consultant','Approver','Executive')
    OR(p_job_role IS NOT NULL AND p_job_role NOT IN(
      'Construction Manager','Lease Manager','Project Manager','Security Manager',
      'IT Manager','HR Manager','Store Designer','Supply Manager','Facility Manager'))
    OR char_length(btrim(COALESCE(p_name,'')))>200 THEN
    RAISE EXCEPTION 'INVALID_ORGANIZATION_USER_COMMAND' USING ERRCODE='22023';
  END IF;
  SELECT *INTO v_membership FROM public.organization_memberships
  WHERE organization_id=p_organization_id AND user_id=p_user_id FOR UPDATE;
  IF v_membership.user_id IS NULL OR v_membership.status<>'ACTIVE'THEN
    RAISE EXCEPTION 'ORGANIZATION_USER_NOT_ACTIVE' USING ERRCODE='55000';END IF;
  IF v_membership.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'ORGANIZATION_USER_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
  IF p_user_id=v_actor AND p_organization_role<>'ORG_ADMIN'THEN
    RAISE EXCEPTION 'ORGANIZATION_ADMIN_CANNOT_REMOVE_OWN_ROLE' USING ERRCODE='22023';END IF;
  v_payload:=jsonb_build_object('organizationId',p_organization_id,'userId',p_user_id,
    'name',NULLIF(btrim(COALESCE(p_name,'')),''),'organizationRole',p_organization_role,
    'accessRole',p_access_role,'jobRole',p_job_role,'expectedRevision',p_expected_revision);
  INSERT INTO public.organization_user_command_requests(actor_id,operation,client_request_id,request_payload)
  VALUES(v_actor,'organization.user.update',p_client_request_id,v_payload)
  ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.organization_user_command_requests
  WHERE actor_id=v_actor AND operation='organization.user.update'
    AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.request_payload IS DISTINCT FROM v_payload THEN
    RAISE EXCEPTION 'ORGANIZATION_COMMAND_IDEMPOTENCY_CONFLICT' USING ERRCODE='22023';END IF;
  IF v_request.response IS NOT NULL THEN
    RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  IF v_membership.is_primary THEN
    UPDATE public.profiles SET name=NULLIF(btrim(COALESCE(p_name,'')),''),
      role=p_access_role,job_role=p_job_role WHERE id=p_user_id;
  END IF;
  UPDATE public.organization_memberships SET organization_role=p_organization_role,
    access_role=p_access_role,job_role=p_job_role,revision=revision+1,updated_at=now()
  WHERE organization_id=p_organization_id AND user_id=p_user_id;
  v_result:=jsonb_build_object('userId',p_user_id,'name',NULLIF(btrim(COALESCE(p_name,'')),''),
    'organizationRole',p_organization_role,'accessRole',p_access_role,'jobRole',p_job_role,
    'status','ACTIVE','revision',p_expected_revision+1);
  INSERT INTO public.organization_user_change_events(
    organization_id,target_user_id,event_type,previous_data,new_data,actor_id,client_request_id
  )VALUES(p_organization_id,p_user_id,'MEMBER_UPDATED',to_jsonb(v_membership),v_result,v_actor,p_client_request_id);
  UPDATE public.organization_user_command_requests SET response=v_result,completed_at=now()
  WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_organization_user(
  p_organization_id uuid,p_user_id uuid,p_expected_revision integer,p_client_request_id uuid
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
  v_actor uuid:=auth.uid();v_membership public.organization_memberships%ROWTYPE;
  v_request public.organization_user_command_requests%ROWTYPE;v_payload jsonb;v_result jsonb;
BEGIN
  PERFORM private.require_organization_admin(p_organization_id,v_actor);
  IF p_client_request_id IS NULL OR p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'INVALID_ORGANIZATION_USER_COMMAND' USING ERRCODE='22023';END IF;
  IF p_user_id=v_actor THEN
    RAISE EXCEPTION 'ORGANIZATION_ADMIN_CANNOT_DEACTIVATE_SELF' USING ERRCODE='22023';END IF;
  SELECT *INTO v_membership FROM public.organization_memberships
  WHERE organization_id=p_organization_id AND user_id=p_user_id FOR UPDATE;
  IF v_membership.user_id IS NULL OR v_membership.status<>'ACTIVE'THEN
    RAISE EXCEPTION 'ORGANIZATION_USER_NOT_ACTIVE' USING ERRCODE='55000';END IF;
  IF v_membership.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'ORGANIZATION_USER_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
  IF v_membership.organization_role='ORG_ADMIN' AND NOT EXISTS(
    SELECT 1 FROM public.organization_memberships other
    WHERE other.organization_id=p_organization_id AND other.organization_role='ORG_ADMIN'
      AND other.status='ACTIVE' AND other.user_id<>p_user_id
  )THEN RAISE EXCEPTION 'ORGANIZATION_REQUIRES_ACTIVE_ADMIN' USING ERRCODE='55000';END IF;
  v_payload:=jsonb_build_object('organizationId',p_organization_id,'userId',p_user_id,
    'expectedRevision',p_expected_revision);
  INSERT INTO public.organization_user_command_requests(actor_id,operation,client_request_id,request_payload)
  VALUES(v_actor,'organization.user.deactivate',p_client_request_id,v_payload)
  ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.organization_user_command_requests
  WHERE actor_id=v_actor AND operation='organization.user.deactivate'
    AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.request_payload IS DISTINCT FROM v_payload THEN
    RAISE EXCEPTION 'ORGANIZATION_COMMAND_IDEMPOTENCY_CONFLICT' USING ERRCODE='22023';END IF;
  IF v_request.response IS NOT NULL THEN
    RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  UPDATE public.organization_memberships SET status='INACTIVE',is_primary=false,
    revision=revision+1,updated_at=now()
  WHERE organization_id=p_organization_id AND user_id=p_user_id;
  UPDATE public.project_team_memberships membership SET ends_on=CURRENT_DATE,
    revision=revision+1,updated_by=v_actor,updated_at=now()
  FROM public.projects project
  WHERE membership.project_id=project.id AND project.organization_id=p_organization_id
    AND membership.user_id=p_user_id AND membership.removed_at IS NULL
    AND membership.starts_on<=CURRENT_DATE
    AND(membership.ends_on IS NULL OR membership.ends_on>CURRENT_DATE);
  IF v_membership.is_primary THEN
    UPDATE public.profiles SET is_active=false,removed_at=now(),removed_by=v_actor,
      assigned_projects='{}'::integer[] WHERE id=p_user_id;
  END IF;
  v_result:=jsonb_build_object('userId',p_user_id,'status','INACTIVE',
    'revision',p_expected_revision+1);
  INSERT INTO public.organization_user_change_events(
    organization_id,target_user_id,event_type,previous_data,new_data,actor_id,client_request_id
  )VALUES(p_organization_id,p_user_id,'MEMBER_DEACTIVATED',to_jsonb(v_membership),v_result,v_actor,p_client_request_id);
  UPDATE public.organization_user_command_requests SET response=v_result,completed_at=now()
  WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_project_team_foundation(p_project_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid()IS NULL OR public.has_project_capability(p_project_id,'TEAM_MANAGE',NULL)IS NOT TRUE THEN
    RAISE EXCEPTION 'PROJECT_TEAM_FORBIDDEN' USING ERRCODE='42501';END IF;
  SELECT *INTO v_project FROM public.projects WHERE id=p_project_id;
  IF v_project.id IS NULL THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('projectId',p_project_id,
    'availableUsers',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'userId',profile.id,'name',profile.name,'email',profile.email,
      'role',COALESCE(org_member.job_role,org_member.access_role),
      'accessRole',org_member.access_role
    )ORDER BY profile.name,profile.email)
    FROM public.organization_memberships org_member
    JOIN public.profiles profile ON profile.id=org_member.user_id
    WHERE org_member.organization_id=v_project.organization_id
      AND org_member.status='ACTIVE' AND org_member.access_role<>'Contractor'
      AND profile.is_active IS TRUE
      AND private.project_role_from_profile(org_member.access_role)IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM public.project_team_memberships project_member
        WHERE project_member.project_id=p_project_id AND project_member.user_id=profile.id
          AND project_member.removed_at IS NULL AND project_member.starts_on<=CURRENT_DATE
          AND(project_member.ends_on IS NULL OR project_member.ends_on>=CURRENT_DATE))),'[]'::jsonb),
    'memberships',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'membershipId',project_member.id,'userId',profile.id,'name',profile.name,'email',profile.email,
      'role',COALESCE(org_member.job_role,org_member.access_role),
      'accessRole',org_member.access_role,'projectRole',project_member.project_role,
      'revision',project_member.revision
    )ORDER BY profile.name,profile.email)
    FROM public.project_team_memberships project_member
    JOIN public.profiles profile ON profile.id=project_member.user_id
    JOIN public.organization_memberships org_member
      ON org_member.organization_id=v_project.organization_id
      AND org_member.user_id=project_member.user_id AND org_member.status='ACTIVE'
    WHERE profile.is_active IS TRUE AND project_member.project_id=p_project_id
      AND project_member.removed_at IS NULL AND project_member.starts_on<=CURRENT_DATE
      AND(project_member.ends_on IS NULL OR project_member.ends_on>=CURRENT_DATE)),'[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.get_project_team_foundation(bigint)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_project_team_foundation(bigint) TO authenticated;

ALTER TABLE public.organization_user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_user_change_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_user_command_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_user_invitations_admin_read ON public.organization_user_invitations
FOR SELECT TO authenticated USING(private.has_active_organization_membership(
  organization_id,(SELECT auth.uid()),'ORG_ADMIN'));
CREATE POLICY organization_user_events_admin_read ON public.organization_user_change_events
FOR SELECT TO authenticated USING(private.has_active_organization_membership(
  organization_id,(SELECT auth.uid()),'ORG_ADMIN'));

REVOKE ALL ON TABLE public.organization_user_invitations,
  public.organization_user_change_events,public.organization_user_command_requests
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.organization_user_change_events_id_seq,
  public.organization_user_command_requests_id_seq
  FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.organization_user_invitations,
  public.organization_user_change_events TO authenticated;

REVOKE ALL ON FUNCTION private.organization_user_events_immutable(),
  private.require_organization_admin(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.list_organization_users(uuid),
  public.prepare_organization_user_invitation(uuid,text,text,text,text,text,uuid),
  public.mark_organization_user_invitation_sent(uuid),
  public.activate_my_organization_invitations(),
  public.update_organization_user(uuid,uuid,text,text,text,text,integer,uuid),
  public.deactivate_organization_user(uuid,uuid,integer,uuid),
  public.get_project_team_foundation(bigint)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_organization_users(uuid),
  public.prepare_organization_user_invitation(uuid,text,text,text,text,text,uuid),
  public.activate_my_organization_invitations(),
  public.update_organization_user(uuid,uuid,text,text,text,text,integer,uuid),
  public.deactivate_organization_user(uuid,uuid,integer,uuid),
  public.get_project_team_foundation(bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_organization_user_invitation_sent(uuid) TO service_role;

COMMIT;
