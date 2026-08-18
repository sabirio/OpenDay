-- 145_project_team_department_assignment.sql
-- Project Team owns project-specific department responsibility. Users remains
-- the only source of organization access roles and authorization capabilities.

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_team_department_catalog(
  code text PRIMARY KEY,
  label text NOT NULL UNIQUE,
  sort_order integer NOT NULL UNIQUE CHECK(sort_order>0)
);

INSERT INTO public.project_team_department_catalog(code,label,sort_order) VALUES
  ('PROJECT_MANAGEMENT','Project Management',10),
  ('CONSTRUCTION','Construction',20),
  ('LEASING_LEGAL','Leasing / Legal',30),
  ('SECURITY','Security',40),
  ('IT','IT',50),
  ('HR','HR',60),
  ('STORE_DESIGN','Store Design',70),
  ('SUPPLY','Supply',80),
  ('FACILITY','Facility',90)
ON CONFLICT(code)DO UPDATE SET label=EXCLUDED.label,sort_order=EXCLUDED.sort_order;

ALTER TABLE public.project_team_memberships ADD COLUMN IF NOT EXISTS department_code text;

DO $$BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.project_team_memberships'::regclass
    AND conname='project_team_memberships_department_fkey')THEN
    ALTER TABLE public.project_team_memberships ADD CONSTRAINT project_team_memberships_department_fkey
      FOREIGN KEY(department_code)REFERENCES public.project_team_department_catalog(code)ON DELETE RESTRICT;
  END IF;
END$$;

UPDATE public.project_team_memberships membership SET department_code=CASE profile.job_role
  WHEN 'Construction Manager'THEN'CONSTRUCTION'
  WHEN 'Lease Manager'THEN'LEASING_LEGAL'
  WHEN 'Project Manager'THEN'PROJECT_MANAGEMENT'
  WHEN 'Security Manager'THEN'SECURITY'
  WHEN 'IT Manager'THEN'IT'
  WHEN 'HR Manager'THEN'HR'
  WHEN 'Store Designer'THEN'STORE_DESIGN'
  WHEN 'Supply Manager'THEN'SUPPLY'
  WHEN 'Facility Manager'THEN'FACILITY'
  ELSE'PROJECT_MANAGEMENT'END
FROM public.profiles profile WHERE profile.id=membership.user_id AND membership.department_code IS NULL;

UPDATE public.project_team_memberships membership SET responsibility_label=catalog.label
FROM public.project_team_department_catalog catalog WHERE catalog.code=membership.department_code;

CREATE INDEX IF NOT EXISTS project_team_membership_department_idx
  ON public.project_team_memberships(project_id,department_code)WHERE removed_at IS NULL;

ALTER TABLE public.project_team_department_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_team_department_catalog FROM PUBLIC,anon,authenticated,service_role;

DROP FUNCTION IF EXISTS public.add_project_team_member(bigint,uuid,uuid);

CREATE OR REPLACE FUNCTION public.add_project_team_member(
  p_project_id bigint,p_user_id uuid,p_department_code text,p_client_request_id uuid
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid();v_project public.projects%ROWTYPE;v_profile public.profiles%ROWTYPE;
  v_membership public.project_team_memberships%ROWTYPE;v_request public.write_command_requests%ROWTYPE;
  v_project_role text;v_department_label text;v_result jsonb;
BEGIN
  IF v_actor IS NULL OR public.has_project_capability(p_project_id,'TEAM_MANAGE',NULL)IS NOT TRUE THEN
    RAISE EXCEPTION 'PROJECT_TEAM_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF p_user_id IS NULL OR p_client_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_PROJECT_TEAM_COMMAND' USING ERRCODE='22023';END IF;
  SELECT label INTO v_department_label FROM public.project_team_department_catalog WHERE code=p_department_code;
  IF v_department_label IS NULL THEN RAISE EXCEPTION 'PROJECT_TEAM_DEPARTMENT_REQUIRED' USING ERRCODE='22023';END IF;
  SELECT *INTO v_project FROM public.projects WHERE id=p_project_id;
  SELECT *INTO v_profile FROM public.profiles WHERE id=p_user_id;
  v_project_role:=private.project_role_from_profile(v_profile.role);
  IF v_project.id IS NULL OR v_profile.id IS NULL OR v_profile.is_active IS NOT TRUE OR v_project_role IS NULL
    OR(v_project.company_id IS NOT NULL AND v_profile.company_id IS NOT NULL AND v_project.company_id<>v_profile.company_id)THEN
    RAISE EXCEPTION 'PROJECT_TEAM_USER_NOT_ELIGIBLE' USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)
    VALUES(v_actor,'project_team.member.add',p_client_request_id,p_project_id)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.write_command_requests WHERE actor_id=v_actor AND operation='project_team.member.add'
    AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.project_id IS DISTINCT FROM p_project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  PERFORM pg_advisory_xact_lock(p_project_id);
  SELECT *INTO v_membership FROM public.project_team_memberships WHERE project_id=p_project_id AND user_id=p_user_id
    AND removed_at IS NULL AND starts_on<=CURRENT_DATE AND(ends_on IS NULL OR ends_on>=CURRENT_DATE)FOR UPDATE;
  IF v_membership.id IS NULL THEN
    INSERT INTO public.project_team_memberships(id,project_id,user_id,project_role,responsibility_label,department_code,
      starts_on,notifications_enabled,revision,created_by,updated_by)
    VALUES(gen_random_uuid(),p_project_id,p_user_id,v_project_role,v_department_label,p_department_code,CURRENT_DATE,true,1,v_actor,v_actor)
    RETURNING *INTO v_membership;
    INSERT INTO public.project_team_membership_capabilities(membership_id,project_id,capability_code)
      SELECT v_membership.id,p_project_id,catalog.code FROM public.project_capability_catalog catalog
      WHERE v_project_role=ANY(catalog.allowed_project_roles);
    INSERT INTO public.project_team_membership_events(membership_id,project_id,revision,event_type,snapshot,actor_id)
      VALUES(v_membership.id,p_project_id,1,'ASSIGNED',jsonb_build_object(
        'membershipId',v_membership.id,'projectId',p_project_id,'userId',p_user_id,'role',v_profile.role,
        'projectRole',v_project_role,'departmentCode',p_department_code,'departmentLabel',v_department_label,
        'startsOn',v_membership.starts_on,'revision',1,'roleSource','USERS','departmentSource','PROJECT_TEAM'),v_actor);
  END IF;
  v_result:=jsonb_build_object('membershipId',v_membership.id,'projectId',p_project_id,'userId',p_user_id,
    'role',v_profile.role,'projectRole',v_project_role,'departmentCode',v_membership.department_code,
    'departmentLabel',v_membership.responsibility_label,'revision',v_membership.revision);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_project_team_member_department(
  p_project_id bigint,p_membership_id uuid,p_department_code text,p_expected_revision integer,p_client_request_id uuid
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid();v_membership public.project_team_memberships%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE;v_department_label text;v_result jsonb;
BEGIN
  IF v_actor IS NULL OR public.has_project_capability(p_project_id,'TEAM_MANAGE',NULL)IS NOT TRUE THEN
    RAISE EXCEPTION 'PROJECT_TEAM_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF p_membership_id IS NULL OR p_client_request_id IS NULL OR COALESCE(p_expected_revision,0)<1 THEN
    RAISE EXCEPTION 'INVALID_PROJECT_TEAM_COMMAND' USING ERRCODE='22023';END IF;
  SELECT label INTO v_department_label FROM public.project_team_department_catalog WHERE code=p_department_code;
  IF v_department_label IS NULL THEN RAISE EXCEPTION 'PROJECT_TEAM_DEPARTMENT_REQUIRED' USING ERRCODE='22023';END IF;
  INSERT INTO public.write_command_requests(actor_id,operation,client_request_id,project_id)
    VALUES(v_actor,'project_team.member.department.update',p_client_request_id,p_project_id)
    ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT *INTO v_request FROM public.write_command_requests WHERE actor_id=v_actor
    AND operation='project_team.member.department.update'AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.project_id IS DISTINCT FROM p_project_id THEN RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE='23505';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  SELECT *INTO v_membership FROM public.project_team_memberships WHERE id=p_membership_id AND project_id=p_project_id FOR UPDATE;
  IF v_membership.id IS NULL OR v_membership.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'PROJECT_TEAM_MEMBERSHIP_NOT_FOUND' USING ERRCODE='P0002';END IF;
  IF v_membership.revision<>p_expected_revision THEN RAISE EXCEPTION 'PROJECT_TEAM_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
  UPDATE public.project_team_memberships SET department_code=p_department_code,responsibility_label=v_department_label,
    revision=revision+1,updated_by=v_actor,updated_at=now()WHERE id=p_membership_id RETURNING *INTO v_membership;
  v_result:=jsonb_build_object('membershipId',v_membership.id,'projectId',p_project_id,'userId',v_membership.user_id,
    'projectRole',v_membership.project_role,'departmentCode',v_membership.department_code,
    'departmentLabel',v_membership.responsibility_label,'revision',v_membership.revision);
  INSERT INTO public.project_team_membership_events(membership_id,project_id,revision,event_type,snapshot,actor_id)
    VALUES(v_membership.id,p_project_id,v_membership.revision,'UPDATED',v_result||jsonb_build_object(
      'roleSource','USERS','departmentSource','PROJECT_TEAM'),v_actor);
  UPDATE public.write_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
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
    'departments',COALESCE((SELECT jsonb_agg(jsonb_build_object('code',code,'label',label)ORDER BY sort_order)
      FROM public.project_team_department_catalog),'[]'::jsonb),
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
      'projectRole',private.project_role_from_profile(profile.role),'departmentCode',membership.department_code,
      'departmentLabel',catalog.label,'revision',membership.revision
    )ORDER BY catalog.sort_order,profile.name,profile.email)FROM public.project_team_memberships membership
      JOIN public.profiles profile ON profile.id=membership.user_id
      LEFT JOIN public.project_team_department_catalog catalog ON catalog.code=membership.department_code
      WHERE profile.is_active IS TRUE AND membership.project_id=p_project_id
        AND membership.removed_at IS NULL AND membership.starts_on<=CURRENT_DATE
        AND(membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE)),'[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.add_project_team_member(bigint,uuid,text,uuid),
  public.update_project_team_member_department(bigint,uuid,text,integer,uuid),
  public.get_project_team_foundation(bigint)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.add_project_team_member(bigint,uuid,text,uuid),
  public.update_project_team_member_department(bigint,uuid,text,integer,uuid),
  public.get_project_team_foundation(bigint)TO authenticated;

COMMIT;
