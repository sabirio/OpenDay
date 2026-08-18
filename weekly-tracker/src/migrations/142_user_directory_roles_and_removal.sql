-- 142_user_directory_roles_and_removal.sql
-- Separate business job roles from authorization roles and add audited,
-- non-destructive user removal. Historical project data remains intact.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_role text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT;

DO $$ BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.profiles'::regclass AND conname='profiles_job_role_allowed'
  )THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_job_role_allowed CHECK(
      job_role IS NULL OR job_role IN(
        'Construction Manager','Lease Manager','Project Manager','Security Manager',
        'IT Manager','HR Manager','Store Designer','Supply Manager','Facility Manager'
      )
    );
  END IF;
END $$;

ALTER TABLE public.admin_user_change_events
  ADD COLUMN IF NOT EXISTS change_type text NOT NULL DEFAULT 'UPDATED',
  ADD COLUMN IF NOT EXISTS previous_job_role text,
  ADD COLUMN IF NOT EXISTS new_job_role text;

DO $$ BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.admin_user_change_events'::regclass AND conname='admin_user_change_events_type_allowed'
  )THEN
    ALTER TABLE public.admin_user_change_events ADD CONSTRAINT admin_user_change_events_type_allowed
      CHECK(change_type IN('UPDATED','REMOVED'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path=public
AS $$
DECLARE v_uid uuid:=auth.uid();v_role text;v_active boolean;
BEGIN
  SELECT lower(role),is_active INTO v_role,v_active FROM public.profiles WHERE id=v_uid;
  IF v_uid IS NULL OR v_role<>'admin' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'ADMIN_USERS_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',profile.id,'name',profile.name,'email',profile.email,
    'role',profile.job_role,'jobRole',profile.job_role,'accessRole',profile.role,
    'companyId',profile.company_id,
    'assignedProjects',CASE WHEN lower(profile.role)='contractor'
      THEN to_jsonb(COALESCE(profile.assigned_projects,'{}'::integer[]))ELSE'[]'::jsonb END,
    'assignmentMode',CASE WHEN lower(profile.role)='contractor'
      THEN'CONTRACTOR_COMPATIBILITY'ELSE'PROJECT_TEAM'END
  )ORDER BY COALESCE(profile.job_role,''),profile.name,profile.email)
  FROM public.profiles profile
  WHERE profile.is_active IS TRUE AND public.can_admin_company(profile.company_id)),'[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_user_profile(
  p_user_id uuid,p_name text,p_job_role text,p_access_role text,
  p_assigned_project_ids integer[],p_client_request_id uuid
)RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_uid uuid:=auth.uid();v_actor_role text;v_actor_active boolean;
  v_target public.profiles%ROWTYPE;v_assignments integer[];
  v_request public.admin_user_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  SELECT lower(role),is_active INTO v_actor_role,v_actor_active FROM public.profiles WHERE id=v_uid;
  SELECT *INTO v_target FROM public.profiles WHERE id=p_user_id FOR UPDATE;
  IF v_uid IS NULL OR v_actor_role<>'admin' OR v_actor_active IS NOT TRUE OR v_target.id IS NULL
    OR v_target.is_active IS NOT TRUE OR public.can_admin_company(v_target.company_id)IS NOT TRUE THEN
    RAISE EXCEPTION 'ADMIN_USERS_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF p_client_request_id IS NULL
    OR p_access_role NOT IN('Admin','PM','Consultant','Contractor','Approver','Executive')
    OR(p_access_role<>'Contractor'AND p_job_role NOT IN(
      'Construction Manager','Lease Manager','Project Manager','Security Manager',
      'IT Manager','HR Manager','Store Designer','Supply Manager','Facility Manager'))
    OR(p_access_role='Contractor'AND p_job_role IS NOT NULL)
    OR char_length(btrim(COALESCE(p_name,'')))>200 THEN
    RAISE EXCEPTION 'INVALID_ADMIN_USER_COMMAND' USING ERRCODE='22023';END IF;
  IF p_user_id=v_uid AND p_access_role<>'Admin'THEN
    RAISE EXCEPTION 'ADMIN_CANNOT_REMOVE_OWN_ACCESS' USING ERRCODE='22023';END IF;
  v_assignments:=CASE WHEN p_access_role='Contractor'
    THEN COALESCE(p_assigned_project_ids,'{}'::integer[])ELSE'{}'::integer[]END;
  IF EXISTS(SELECT 1 FROM unnest(v_assignments)project_id
    LEFT JOIN public.projects project ON project.id=project_id::bigint
    WHERE project.id IS NULL OR public.can_admin_company(project.company_id)IS NOT TRUE)THEN
    RAISE EXCEPTION 'CONTRACTOR_PROJECT_ASSIGNMENT_FORBIDDEN' USING ERRCODE='42501';END IF;
  INSERT INTO public.admin_user_command_requests(actor_id,client_request_id)
    VALUES(v_uid,p_client_request_id)ON CONFLICT(actor_id,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.admin_user_command_requests
    WHERE actor_id=v_uid AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  UPDATE public.profiles SET name=NULLIF(btrim(COALESCE(p_name,'')),''),job_role=p_job_role,
    role=p_access_role,assigned_projects=v_assignments WHERE id=p_user_id;
  INSERT INTO public.admin_user_change_events(
    target_user_id,company_id,previous_name,new_name,previous_role,new_role,
    previous_assigned_projects,new_assigned_projects,changed_by,change_type,
    previous_job_role,new_job_role
  )VALUES(
    p_user_id,v_target.company_id,v_target.name,NULLIF(btrim(COALESCE(p_name,'')),''),
    v_target.role,p_access_role,COALESCE(v_target.assigned_projects,'{}'::integer[]),v_assignments,
    v_uid,'UPDATED',v_target.job_role,p_job_role
  );
  v_result:=jsonb_build_object('userId',p_user_id,'name',NULLIF(btrim(COALESCE(p_name,'')),''),
    'role',p_job_role,'jobRole',p_job_role,'accessRole',p_access_role,
    'assignedProjects',to_jsonb(v_assignments),
    'assignmentMode',CASE WHEN p_access_role='Contractor'THEN'CONTRACTOR_COMPATIBILITY'ELSE'PROJECT_TEAM'END);
  UPDATE public.admin_user_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_admin_user(
  p_user_id uuid,p_client_request_id uuid
)RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_uid uuid:=auth.uid();v_actor_role text;v_actor_active boolean;
  v_target public.profiles%ROWTYPE;v_request public.admin_user_command_requests%ROWTYPE;v_result jsonb;
BEGIN
  SELECT lower(role),is_active INTO v_actor_role,v_actor_active FROM public.profiles WHERE id=v_uid;
  SELECT *INTO v_target FROM public.profiles WHERE id=p_user_id FOR UPDATE;
  IF v_uid IS NULL OR v_actor_role<>'admin' OR v_actor_active IS NOT TRUE OR v_target.id IS NULL
    OR public.can_admin_company(v_target.company_id)IS NOT TRUE THEN
    RAISE EXCEPTION 'ADMIN_USERS_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_ADMIN_USER_COMMAND' USING ERRCODE='22023';END IF;
  IF p_user_id=v_uid THEN RAISE EXCEPTION 'ADMIN_CANNOT_REMOVE_SELF' USING ERRCODE='22023';END IF;
  INSERT INTO public.admin_user_command_requests(actor_id,client_request_id)
    VALUES(v_uid,p_client_request_id)ON CONFLICT(actor_id,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.admin_user_command_requests
    WHERE actor_id=v_uid AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  IF v_target.is_active IS NOT TRUE THEN RAISE EXCEPTION 'ADMIN_USER_ALREADY_REMOVED' USING ERRCODE='22023';END IF;
  UPDATE public.profiles SET is_active=false,removed_at=now(),removed_by=v_uid,
    role='Inactive',assigned_projects='{}'::integer[] WHERE id=p_user_id;
  INSERT INTO public.admin_user_change_events(
    target_user_id,company_id,previous_name,new_name,previous_role,new_role,
    previous_assigned_projects,new_assigned_projects,changed_by,change_type,
    previous_job_role,new_job_role
  )VALUES(
    p_user_id,v_target.company_id,v_target.name,v_target.name,v_target.role,'Inactive',
    COALESCE(v_target.assigned_projects,'{}'::integer[]),'{}'::integer[],v_uid,'REMOVED',
    v_target.job_role,v_target.job_role
  );
  v_result:=jsonb_build_object('userId',p_user_id,'removed',true,'removedAt',now());
  UPDATE public.admin_user_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_project_team_foundation(p_project_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid()IS NULL OR public.has_project_capability(p_project_id,'TEAM_MANAGE',NULL)IS NOT TRUE THEN
    RAISE EXCEPTION 'PROJECT_TEAM_FORBIDDEN' USING ERRCODE='42501';END IF;
  SELECT *INTO v_project FROM public.projects WHERE id=p_project_id;
  RETURN jsonb_build_object('projectId',p_project_id,
    'availableUsers',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'userId',profile.id,'name',profile.name,'email',profile.email,
      'role',COALESCE(profile.job_role,profile.role),'accessRole',profile.role
    )ORDER BY profile.name,profile.email)FROM public.profiles profile
      WHERE profile.is_active IS TRUE AND private.project_role_from_profile(profile.role)IS NOT NULL
        AND(profile.company_id IS NULL OR v_project.company_id IS NULL OR profile.company_id=v_project.company_id)
        AND NOT EXISTS(SELECT 1 FROM public.project_team_memberships membership
          WHERE membership.project_id=p_project_id AND membership.user_id=profile.id
            AND membership.removed_at IS NULL AND membership.starts_on<=CURRENT_DATE
            AND(membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE))),'[]'::jsonb),
    'memberships',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'membershipId',membership.id,'userId',profile.id,'name',profile.name,'email',profile.email,
      'role',COALESCE(profile.job_role,profile.role),'accessRole',profile.role,
      'projectRole',private.project_role_from_profile(profile.role),'revision',membership.revision
    )ORDER BY profile.name,profile.email)FROM public.project_team_memberships membership
      JOIN public.profiles profile ON profile.id=membership.user_id
      WHERE profile.is_active IS TRUE AND membership.project_id=p_project_id
        AND membership.removed_at IS NULL AND membership.starts_on<=CURRENT_DATE
        AND(membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE)),'[]'::jsonb));
END;
$$;

REVOKE UPDATE(job_role,is_active,removed_at,removed_by)ON public.profiles FROM authenticated;
REVOKE ALL ON FUNCTION public.list_admin_users(),
  public.update_admin_user_profile(uuid,text,text,text,integer[],uuid),
  public.remove_admin_user(uuid,uuid),public.get_project_team_foundation(bigint)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_admin_users(),
  public.update_admin_user_profile(uuid,text,text,text,integer[],uuid),
  public.remove_admin_user(uuid,uuid),public.get_project_team_foundation(bigint)
  TO authenticated;

COMMIT;
