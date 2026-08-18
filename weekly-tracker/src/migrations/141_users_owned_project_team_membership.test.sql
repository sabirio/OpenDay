BEGIN;

DO $$
DECLARE v_admin uuid;v_project_id bigint;v_target uuid;v_membership uuid;v_revision integer;
  v_remove jsonb;v_remove_replay jsonb;v_add jsonb;v_add_replay jsonb;v_expected_role text;v_department text;
BEGIN
  IF to_regprocedure('public.add_project_team_member(bigint,uuid,text,uuid)')IS NULL
    OR to_regprocedure('public.remove_project_team_member(bigint,uuid,integer,uuid)')IS NULL THEN
    RAISE EXCEPTION 'Project Team membership commands are missing';END IF;
  IF has_function_privilege('authenticated','public.save_project_team_membership(bigint,uuid,uuid,text,text,date,date,boolean,text[],uuid[],text,integer,uuid)','EXECUTE')THEN
    RAISE EXCEPTION 'Legacy role/capability command remains callable';END IF;
  IF has_table_privilege('authenticated','public.project_team_memberships','INSERT,UPDATE,DELETE')THEN
    RAISE EXCEPTION 'Project Team table remains browser-writable';END IF;

  SELECT admin.id,membership.project_id,membership.user_id,membership.id,membership.revision
    INTO v_admin,v_project_id,v_target,v_membership,v_revision
  FROM public.project_team_memberships membership
  JOIN public.projects project ON project.id=membership.project_id
  JOIN public.profiles admin ON lower(admin.role)='admin'
    AND(admin.company_id IS NULL OR project.company_id IS NULL OR admin.company_id=project.company_id)
  WHERE membership.removed_at IS NULL AND membership.starts_on<=CURRENT_DATE
    AND(membership.ends_on IS NULL OR membership.ends_on>=CURRENT_DATE)
  ORDER BY membership.project_id LIMIT 1;
  IF v_admin IS NULL THEN RETURN;END IF;
  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  SELECT code INTO v_department FROM public.project_team_department_catalog ORDER BY sort_order LIMIT 1;
  IF v_department IS NULL THEN RAISE EXCEPTION 'Project Team department catalog is empty';END IF;

  v_remove:=public.remove_project_team_member(v_project_id,v_membership,v_revision,'11111111-1111-4111-8111-111111111141');
  v_remove_replay:=public.remove_project_team_member(v_project_id,v_membership,v_revision,'11111111-1111-4111-8111-111111111141');
  IF COALESCE((v_remove->>'idempotentReplay')::boolean,true)
    OR NOT COALESCE((v_remove_replay->>'idempotentReplay')::boolean,false)
    OR public.is_active_project_member(v_project_id,v_target)THEN
    RAISE EXCEPTION 'Project Team removal or idempotency failed';END IF;

  v_add:=public.add_project_team_member(v_project_id,v_target,v_department,'22222222-2222-4222-8222-222222222141');
  v_add_replay:=public.add_project_team_member(v_project_id,v_target,v_department,'22222222-2222-4222-8222-222222222141');
  SELECT private.project_role_from_profile(role)INTO v_expected_role FROM public.profiles WHERE id=v_target;
  IF COALESCE((v_add->>'idempotentReplay')::boolean,true)
    OR NOT COALESCE((v_add_replay->>'idempotentReplay')::boolean,false)
    OR(v_add->>'projectRole')IS DISTINCT FROM v_expected_role
    OR(v_add->>'departmentCode')IS DISTINCT FROM v_department
    OR NOT public.is_active_project_member(v_project_id,v_target)THEN
    RAISE EXCEPTION 'Project Team add did not derive its role from Users';END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_project_team_foundation(v_project_id)->'memberships')item
    WHERE item->>'userId'=v_target::text AND item->>'role'IS NOT NULL)THEN
    RAISE EXCEPTION 'Simplified Project Team read model is incomplete';END IF;
END;
$$;

ROLLBACK;
