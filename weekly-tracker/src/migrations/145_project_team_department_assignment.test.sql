BEGIN;

DO $$
DECLARE
  v_admin uuid;
  v_membership public.project_team_memberships%ROWTYPE;
  v_target_department text;
  v_request uuid:=gen_random_uuid();
  v_result jsonb;
  v_replay jsonb;
  v_foundation jsonb;
  v_invalid_blocked boolean:=false;
BEGIN
  IF to_regclass('public.project_team_department_catalog')IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.project_team_department_catalog WHERE code='SECURITY'AND label='Security')THEN
    RAISE EXCEPTION 'Project Team department catalog is incomplete';END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.project_team_department_catalog'::regclass AND relrowsecurity)THEN
    RAISE EXCEPTION 'Project Team department catalog RLS is disabled';END IF;
  IF has_table_privilege('anon','public.project_team_department_catalog','SELECT')
    OR has_table_privilege('authenticated','public.project_team_department_catalog','SELECT')THEN
    RAISE EXCEPTION 'Project Team department catalog is directly exposed';END IF;
  IF has_function_privilege('anon','public.update_project_team_member_department(bigint,uuid,text,integer,uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.update_project_team_member_department(bigint,uuid,text,integer,uuid)','EXECUTE')THEN
    RAISE EXCEPTION 'Project Team department command ACL is incorrect';END IF;

  SELECT membership.* INTO v_membership
  FROM public.project_team_memberships membership
  JOIN public.projects project ON project.id=membership.project_id
  WHERE membership.removed_at IS NULL AND membership.starts_on<=CURRENT_DATE
    AND(membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE)
    AND EXISTS(SELECT 1 FROM public.profiles admin WHERE lower(admin.role)='admin'AND admin.is_active IS TRUE
      AND admin.company_id IS NOT DISTINCT FROM project.company_id)
  ORDER BY membership.project_id,membership.id LIMIT 1;
  SELECT admin.id INTO v_admin FROM public.profiles admin JOIN public.projects project
    ON project.id=v_membership.project_id WHERE lower(admin.role)='admin'AND admin.is_active IS TRUE
    AND admin.company_id IS NOT DISTINCT FROM project.company_id ORDER BY admin.id LIMIT 1;
  IF v_admin IS NULL OR v_membership.id IS NULL THEN RAISE EXCEPTION 'No active Project Team fixture is available';END IF;

  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  v_foundation:=public.get_project_team_foundation(v_membership.project_id);
  IF jsonb_array_length(COALESCE(v_foundation->'departments','[]'::jsonb))<9
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_foundation->'memberships')item
      WHERE item->>'membershipId'=v_membership.id::text AND item->>'departmentCode'=v_membership.department_code)THEN
    RAISE EXCEPTION 'Project Team department read model is stale';END IF;
  v_target_department:=CASE WHEN v_membership.department_code='SECURITY'THEN'IT'ELSE'SECURITY'END;
  v_result:=public.update_project_team_member_department(v_membership.project_id,v_membership.id,
    v_target_department,v_membership.revision,v_request);
  v_replay:=public.update_project_team_member_department(v_membership.project_id,v_membership.id,
    v_target_department,v_membership.revision,v_request);
  IF v_result->>'departmentCode'<>v_target_department
    OR COALESCE((v_result->>'idempotentReplay')::boolean,true)
    OR NOT COALESCE((v_replay->>'idempotentReplay')::boolean,false)
    OR NOT EXISTS(SELECT 1 FROM public.project_team_memberships membership WHERE membership.id=v_membership.id
      AND membership.department_code=v_target_department AND membership.project_role=v_membership.project_role
      AND membership.revision=v_membership.revision+1)THEN
    RAISE EXCEPTION 'Project Team department update, replay, or role isolation failed';END IF;

  BEGIN
    PERFORM public.update_project_team_member_department(v_membership.project_id,v_membership.id,
      'NOT_A_DEPARTMENT',v_membership.revision+1,gen_random_uuid());
  EXCEPTION WHEN SQLSTATE'22023'THEN v_invalid_blocked:=true;END;
  IF NOT v_invalid_blocked THEN RAISE EXCEPTION 'Unknown Project Team department was accepted';END IF;
END;
$$;

ROLLBACK;
