BEGIN;

DO $$
DECLARE v_admin uuid;v_target public.profiles%ROWTYPE;v_update jsonb;v_update_replay jsonb;
  v_remove jsonb;v_remove_replay jsonb;v_self_forbidden boolean:=false;
  v_update_request uuid:=gen_random_uuid();v_remove_request uuid:=gen_random_uuid();
BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'AND table_name='profiles'AND column_name='job_role')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'AND table_name='profiles'AND column_name='is_active')THEN
    RAISE EXCEPTION 'User directory columns are missing';END IF;
  IF to_regprocedure('public.update_admin_user_profile(uuid,text,text,text,integer[],uuid)')IS NULL
    OR to_regprocedure('public.remove_admin_user(uuid,uuid)')IS NULL THEN
    RAISE EXCEPTION 'User directory commands are missing';END IF;
  IF has_column_privilege('authenticated','public.profiles','job_role','UPDATE')
    OR has_column_privilege('authenticated','public.profiles','is_active','UPDATE')THEN
    RAISE EXCEPTION 'User directory columns are browser-writable';END IF;

  SELECT id INTO v_admin FROM public.profiles WHERE lower(role)='admin'AND is_active IS TRUE ORDER BY id LIMIT 1;
  SELECT *INTO v_target FROM public.profiles WHERE id<>v_admin AND is_active IS TRUE
    AND(company_id IS NULL OR company_id=(SELECT company_id FROM public.profiles WHERE id=v_admin))
    ORDER BY id LIMIT 1;
  IF v_admin IS NULL OR v_target.id IS NULL THEN RETURN;END IF;
  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  v_update:=public.update_admin_user_profile(v_target.id,COALESCE(v_target.name,''),'Construction Manager',
    CASE WHEN v_target.role IN('Admin','PM','Consultant','Contractor','Approver','Executive')THEN
      CASE WHEN v_target.role='Contractor'THEN'Consultant'ELSE v_target.role END ELSE'Consultant'END,
    '{}'::integer[],v_update_request);
  v_update_replay:=public.update_admin_user_profile(v_target.id,COALESCE(v_target.name,''),'Construction Manager',
    CASE WHEN v_target.role IN('Admin','PM','Consultant','Contractor','Approver','Executive')THEN
      CASE WHEN v_target.role='Contractor'THEN'Consultant'ELSE v_target.role END ELSE'Consultant'END,
    '{}'::integer[],v_update_request);
  IF v_update->>'jobRole'<>'Construction Manager'
    OR COALESCE((v_update->>'idempotentReplay')::boolean,true)
    OR NOT COALESCE((v_update_replay->>'idempotentReplay')::boolean,false)THEN
    RAISE EXCEPTION 'User directory update or replay failed';END IF;

  v_remove:=public.remove_admin_user(v_target.id,v_remove_request);
  v_remove_replay:=public.remove_admin_user(v_target.id,v_remove_request);
  IF COALESCE((v_remove->>'removed')::boolean,false)IS NOT TRUE
    OR COALESCE((v_remove->>'idempotentReplay')::boolean,true)
    OR NOT COALESCE((v_remove_replay->>'idempotentReplay')::boolean,false)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_admin_users())item WHERE item->>'id'=v_target.id::text)
    OR EXISTS(SELECT 1 FROM public.project_team_memberships membership WHERE membership.user_id=v_target.id AND membership.removed_at IS NULL)THEN
    RAISE EXCEPTION 'User removal did not revoke active directory and project access';END IF;
  BEGIN PERFORM public.remove_admin_user(v_admin,gen_random_uuid());
  EXCEPTION WHEN SQLSTATE'22023'THEN v_self_forbidden:=true;END;
  IF NOT v_self_forbidden THEN RAISE EXCEPTION 'Admin self-removal was not blocked';END IF;
END;
$$;

ROLLBACK;
