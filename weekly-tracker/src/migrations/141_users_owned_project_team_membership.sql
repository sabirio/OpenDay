-- 141_users_owned_project_team_membership.sql
-- Users owns organization role and access rights. Project Team owns membership only.

BEGIN;

ALTER TABLE public.project_team_memberships
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS project_team_current_membership_idx
  ON public.project_team_memberships(project_id,user_id) WHERE removed_at IS NULL;

UPDATE public.project_capability_catalog SET allowed_project_roles='{PM}'
  WHERE code IN('BUDGET_EDIT','PROCUREMENT_MANAGE','TENDER_MANAGE','FORECAST_MANAGE');
UPDATE public.project_capability_catalog SET allowed_project_roles='{PM,CONSULTANT}'
  WHERE code IN('BOQ_PREPARE','BID_REVIEW');

CREATE OR REPLACE FUNCTION private.project_role_from_profile(p_role text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE lower(btrim(COALESCE(p_role,'')))
    WHEN 'pm' THEN 'PM'
    WHEN 'consultant' THEN 'CONSULTANT'
    WHEN 'approver' THEN 'APPROVER'
    WHEN 'executive' THEN 'EXECUTIVE'
    ELSE NULL
  END;
$$;

-- Remove the legacy Function Owner projection. Existing memberships inherit
-- the current Users role without losing their immutable assignment history.
DO $$
DECLARE v_membership public.project_team_memberships%ROWTYPE;v_row record;
BEGIN
  FOR v_row IN SELECT membership.id,private.project_role_from_profile(profile.role)project_role,profile.role profile_role
    FROM public.project_team_memberships membership JOIN public.profiles profile ON profile.id=membership.user_id
    WHERE private.project_role_from_profile(profile.role)IS NOT NULL
      AND membership.project_role IS DISTINCT FROM private.project_role_from_profile(profile.role)
  LOOP
    UPDATE public.project_team_memberships SET project_role=v_row.project_role,responsibility_label=initcap(v_row.profile_role),
      revision=revision+1,updated_at=now()WHERE id=v_row.id RETURNING *INTO v_membership;
    INSERT INTO public.project_team_membership_events(membership_id,project_id,revision,event_type,snapshot,actor_id)
    VALUES(v_membership.id,v_membership.project_id,v_membership.revision,'UPDATED',jsonb_build_object(
      'membershipId',v_membership.id,'projectId',v_membership.project_id,'userId',v_membership.user_id,
      'role',v_row.profile_role,'projectRole',v_row.project_role,'startsOn',v_membership.starts_on,'endsOn',v_membership.ends_on,
      'revision',v_membership.revision,'roleSource','USERS','migration','141_users_owned_project_team_membership'),v_membership.created_by);
  END LOOP;
END;
$$;

DELETE FROM public.project_team_membership_capabilities;
INSERT INTO public.project_team_membership_capabilities(membership_id,project_id,capability_code)
SELECT membership.id,membership.project_id,catalog.code
FROM public.project_team_memberships membership
JOIN public.project_capability_catalog catalog ON membership.project_role=ANY(catalog.allowed_project_roles)
WHERE membership.removed_at IS NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_active_project_member(p_project_id bigint,p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.project_team_memberships membership
    WHERE membership.project_id=p_project_id AND membership.user_id=p_user_id
      AND membership.removed_at IS NULL AND membership.starts_on<=CURRENT_DATE
      AND(membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE));
$$;

CREATE OR REPLACE FUNCTION public.has_project_capability(p_project_id bigint,p_capability_code text,p_cost_package_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_company text;v_project_company text;v_project_role text;
BEGIN
  IF v_uid IS NULL THEN RETURN false;END IF;
  SELECT lower(profile.role),profile.company_id,private.project_role_from_profile(profile.role)
    INTO v_role,v_company,v_project_role FROM public.profiles profile WHERE profile.id=v_uid;
  SELECT project.company_id INTO v_project_company FROM public.projects project WHERE project.id=p_project_id;
  IF NOT FOUND THEN RETURN false;END IF;
  IF v_role='admin' AND(v_company IS NULL OR v_project_company IS NULL OR v_company=v_project_company)THEN RETURN true;END IF;
  IF v_project_role IS NULL OR NOT(v_company IS NULL OR v_project_company IS NULL OR v_company=v_project_company)THEN RETURN false;END IF;
  RETURN EXISTS(SELECT 1 FROM public.project_team_memberships membership
    JOIN public.project_capability_catalog catalog ON catalog.code=p_capability_code AND v_project_role=ANY(catalog.allowed_project_roles)
    WHERE membership.project_id=p_project_id AND membership.user_id=v_uid AND membership.removed_at IS NULL
      AND membership.starts_on<=CURRENT_DATE AND(membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE));
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_project_team_profile_role()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_project_role text;
BEGIN
  SELECT private.project_role_from_profile(profile.role) INTO v_project_role FROM public.profiles profile WHERE profile.id=NEW.user_id;
  IF v_project_role IS NULL THEN RAISE EXCEPTION 'PROJECT_TEAM_USER_ROLE_NOT_ELIGIBLE' USING ERRCODE='23514';END IF;
  IF NEW.project_role<>v_project_role THEN RAISE EXCEPTION 'PROJECT_TEAM_PROFILE_ROLE_MISMATCH' USING ERRCODE='23514';END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_project_team_role_from_profile()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_membership public.project_team_memberships%ROWTYPE;v_role text;v_actor uuid:=COALESCE(auth.uid(),NEW.id);v_event text;
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NEW;END IF;
  v_role:=private.project_role_from_profile(NEW.role);
  FOR v_membership IN SELECT * FROM public.project_team_memberships
    WHERE user_id=NEW.id AND removed_at IS NULL AND starts_on<=CURRENT_DATE
      AND(ends_on IS NULL OR ends_on>=CURRENT_DATE) FOR UPDATE
  LOOP
    IF v_role IS NULL THEN
      UPDATE public.project_team_memberships SET removed_at=now(),removed_by=v_actor,
        ends_on=COALESCE(ends_on,CURRENT_DATE),revision=revision+1,updated_by=v_actor,updated_at=now()
      WHERE id=v_membership.id RETURNING * INTO v_membership;
      v_event:='ENDED';
    ELSE
      UPDATE public.project_team_memberships SET project_role=v_role,responsibility_label=initcap(NEW.role),
        revision=revision+1,updated_by=v_actor,updated_at=now()
      WHERE id=v_membership.id RETURNING * INTO v_membership;
      DELETE FROM public.project_team_membership_capabilities WHERE membership_id=v_membership.id;
      INSERT INTO public.project_team_membership_capabilities(membership_id,project_id,capability_code)
        SELECT v_membership.id,v_membership.project_id,catalog.code FROM public.project_capability_catalog catalog
        WHERE v_role=ANY(catalog.allowed_project_roles);
      v_event:='UPDATED';
    END IF;
    INSERT INTO public.project_team_membership_events(membership_id,project_id,revision,event_type,snapshot,actor_id)
    VALUES(v_membership.id,v_membership.project_id,v_membership.revision,v_event,jsonb_build_object(
      'membershipId',v_membership.id,'projectId',v_membership.project_id,'userId',v_membership.user_id,
      'role',NEW.role,'projectRole',v_membership.project_role,'startsOn',v_membership.starts_on,
      'endsOn',v_membership.ends_on,'removedAt',v_membership.removed_at,'revision',v_membership.revision,
      'roleSource','USERS'),v_actor);
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_sync_project_team_role ON public.profiles;
CREATE TRIGGER profiles_sync_project_team_role AFTER UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.sync_project_team_role_from_profile();

CREATE OR REPLACE FUNCTION public.add_project_team_member(
  p_project_id bigint,p_user_id uuid,p_client_request_id uuid
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid();v_project public.projects%ROWTYPE;v_profile public.profiles%ROWTYPE;
  v_membership public.project_team_memberships%ROWTYPE;v_request public.write_command_requests%ROWTYPE;
  v_project_role text;v_result jsonb;
BEGIN
  IF v_actor IS NULL OR public.has_project_capability(p_project_id,'TEAM_MANAGE',NULL)IS NOT TRUE THEN
    RAISE EXCEPTION 'PROJECT_TEAM_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF p_user_id IS NULL OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_PROJECT_TEAM_COMMAND' USING ERRCODE='22023';END IF;
  SELECT *INTO v_project FROM public.projects WHERE id=p_project_id;
  SELECT *INTO v_profile FROM public.profiles WHERE id=p_user_id;
  v_project_role:=private.project_role_from_profile(v_profile.role);
  IF v_project.id IS NULL OR v_profile.id IS NULL OR v_project_role IS NULL
    OR(v_project.company_id IS NOT NULL AND v_profile.company_id IS NOT NULL AND v_project.company_id<>v_profile.company_id)THEN
    RAISE EXCEPTION 'PROJECT_TEAM_USER_NOT_ELIGIBLE' USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)
    VALUES(v_actor,'project_team.member.add',p_client_request_id,p_project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.write_command_requests WHERE actor_id=v_actor AND operation='project_team.member.add'AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.project_id IS DISTINCT FROM p_project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  PERFORM pg_advisory_xact_lock(p_project_id);
  SELECT *INTO v_membership FROM public.project_team_memberships WHERE project_id=p_project_id AND user_id=p_user_id
    AND removed_at IS NULL AND starts_on<=CURRENT_DATE AND(ends_on IS NULL OR ends_on>=CURRENT_DATE) FOR UPDATE;
  IF v_membership.id IS NULL THEN
    INSERT INTO public.project_team_memberships(id,project_id,user_id,project_role,responsibility_label,starts_on,notifications_enabled,revision,created_by,updated_by)
    VALUES(gen_random_uuid(),p_project_id,p_user_id,v_project_role,initcap(v_profile.role),CURRENT_DATE,true,1,v_actor,v_actor)
    RETURNING *INTO v_membership;
    INSERT INTO public.project_team_membership_capabilities(membership_id,project_id,capability_code)
      SELECT v_membership.id,p_project_id,catalog.code FROM public.project_capability_catalog catalog
      WHERE v_project_role=ANY(catalog.allowed_project_roles);
    INSERT INTO public.project_team_membership_events(membership_id,project_id,revision,event_type,snapshot,actor_id)
      VALUES(v_membership.id,p_project_id,1,'ASSIGNED',jsonb_build_object(
        'membershipId',v_membership.id,'projectId',p_project_id,'userId',p_user_id,'role',v_profile.role,
        'projectRole',v_project_role,'startsOn',v_membership.starts_on,'revision',1,'roleSource','USERS'),v_actor);
  END IF;
  v_result:=jsonb_build_object('membershipId',v_membership.id,'projectId',p_project_id,'userId',p_user_id,
    'role',v_profile.role,'projectRole',v_project_role,'revision',v_membership.revision);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_project_team_member(
  p_project_id bigint,p_membership_id uuid,p_expected_revision integer,p_client_request_id uuid
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid();v_membership public.project_team_memberships%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  IF v_actor IS NULL OR public.has_project_capability(p_project_id,'TEAM_MANAGE',NULL)IS NOT TRUE THEN
    RAISE EXCEPTION 'PROJECT_TEAM_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF p_membership_id IS NULL OR p_client_request_id IS NULL OR COALESCE(p_expected_revision,0)<1 THEN
    RAISE EXCEPTION 'INVALID_PROJECT_TEAM_COMMAND' USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)
    VALUES(v_actor,'project_team.member.remove',p_client_request_id,p_project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.write_command_requests WHERE actor_id=v_actor AND operation='project_team.member.remove'AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.project_id IS DISTINCT FROM p_project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  SELECT *INTO v_membership FROM public.project_team_memberships WHERE id=p_membership_id AND project_id=p_project_id FOR UPDATE;
  IF v_membership.id IS NULL THEN RAISE EXCEPTION 'PROJECT_TEAM_MEMBERSHIP_NOT_FOUND' USING ERRCODE='P0002';END IF;
  IF v_membership.removed_at IS NOT NULL OR v_membership.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'PROJECT_TEAM_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
  UPDATE public.project_team_memberships SET removed_at=now(),removed_by=v_actor,ends_on=COALESCE(ends_on,CURRENT_DATE),
    revision=revision+1,updated_by=v_actor,updated_at=now() WHERE id=p_membership_id RETURNING *INTO v_membership;
  v_result:=jsonb_build_object('membershipId',v_membership.id,'projectId',p_project_id,'userId',v_membership.user_id,
    'projectRole',v_membership.project_role,'removedAt',v_membership.removed_at,'revision',v_membership.revision);
  INSERT INTO public.project_team_membership_events(membership_id,project_id,revision,event_type,snapshot,actor_id)
    VALUES(v_membership.id,p_project_id,v_membership.revision,'ENDED',v_result||jsonb_build_object('roleSource','USERS'),v_actor);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_project_team_foundation(p_project_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR public.has_project_capability(p_project_id,'TEAM_MANAGE',NULL)IS NOT TRUE THEN
    RAISE EXCEPTION 'PROJECT_TEAM_FORBIDDEN' USING ERRCODE='42501';END IF;
  SELECT *INTO v_project FROM public.projects WHERE id=p_project_id;
  RETURN jsonb_build_object(
    'projectId',p_project_id,
    'availableUsers',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'userId',profile.id,'name',profile.name,'email',profile.email,'role',profile.role)ORDER BY profile.name,profile.email)
      FROM public.profiles profile WHERE private.project_role_from_profile(profile.role)IS NOT NULL
        AND(profile.company_id IS NULL OR v_project.company_id IS NULL OR profile.company_id=v_project.company_id)
        AND NOT EXISTS(SELECT 1 FROM public.project_team_memberships membership WHERE membership.project_id=p_project_id
          AND membership.user_id=profile.id AND membership.removed_at IS NULL AND membership.starts_on<=CURRENT_DATE
          AND(membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE))),'[]'::jsonb),
    'memberships',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'membershipId',membership.id,'userId',profile.id,'name',profile.name,'email',profile.email,
      'role',profile.role,'projectRole',private.project_role_from_profile(profile.role),'revision',membership.revision
    )ORDER BY profile.name,profile.email)FROM public.project_team_memberships membership
      JOIN public.profiles profile ON profile.id=membership.user_id
      WHERE membership.project_id=p_project_id AND membership.removed_at IS NULL AND membership.starts_on<=CURRENT_DATE
        AND(membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE)),'[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.assert_active_project_membership(p_project_id bigint,p_membership_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.project_team_memberships membership
    WHERE membership.id=p_membership_id AND membership.project_id=p_project_id AND membership.removed_at IS NULL
      AND membership.starts_on<=CURRENT_DATE AND(membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE))THEN
    RAISE EXCEPTION 'ACTIVE_PROJECT_TEAM_OWNER_REQUIRED' USING ERRCODE='22023';END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_budget_owner_candidates(p_project_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_project public.projects%ROWTYPE;
BEGIN
  SELECT *INTO v_project FROM public.projects WHERE id=p_project_id;
  IF v_uid IS NULL OR v_project.id IS NULL OR lower((SELECT role FROM public.profiles WHERE id=v_uid))NOT IN('pm','admin')
    OR public.can_write_project(p_project_id)IS NOT TRUE THEN RAISE EXCEPTION 'BUDGET_OWNERSHIP_FORBIDDEN' USING ERRCODE='42501';END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'userId',profile.id,'name',profile.name,'email',profile.email,'role',profile.role,
    'projectRole',private.project_role_from_profile(profile.role),'responsibilityLabel',profile.role
  )ORDER BY profile.name,profile.email)FROM public.project_team_memberships membership
    JOIN public.profiles profile ON profile.id=membership.user_id
    WHERE membership.project_id=p_project_id AND membership.removed_at IS NULL AND membership.starts_on<=CURRENT_DATE
      AND(membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE)AND lower(profile.role)IN('pm','executive')
      AND(profile.company_id IS NULL OR v_project.company_id IS NULL OR profile.company_id=v_project.company_id)),'[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_active_budget_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NOT public.is_active_project_member(NEW.project_id,NEW.owner_user_id)THEN
    RAISE EXCEPTION 'INVALID_BUDGET_OWNER' USING ERRCODE='22023';END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS project_budget_ownership_active_owner ON public.project_budget_ownerships;
CREATE TRIGGER project_budget_ownership_active_owner BEFORE INSERT OR UPDATE OF owner_user_id,project_id ON public.project_budget_ownerships
FOR EACH ROW EXECUTE FUNCTION private.enforce_active_budget_owner();

REVOKE ALL ON FUNCTION private.project_role_from_profile(text),private.sync_project_team_role_from_profile(),
  private.enforce_active_budget_owner()FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.is_active_project_member(bigint,uuid),
  public.has_project_capability(bigint,text,uuid),public.list_budget_owner_candidates(bigint)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.add_project_team_member(bigint,uuid,uuid),
  public.remove_project_team_member(bigint,uuid,integer,uuid),public.get_project_team_foundation(bigint),
  public.save_project_team_membership(bigint,uuid,uuid,text,text,date,date,boolean,text[],uuid[],text,integer,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.add_project_team_member(bigint,uuid,uuid),
  public.remove_project_team_member(bigint,uuid,integer,uuid),public.get_project_team_foundation(bigint),
  public.is_active_project_member(bigint,uuid),public.has_project_capability(bigint,text,uuid),
  public.list_budget_owner_candidates(bigint)
  TO authenticated;

COMMIT;
