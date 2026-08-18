BEGIN;

DO $$
DECLARE
  v_admin uuid;
  v_target public.profiles%ROWTYPE;
  v_other_company text;
  v_result jsonb;
  v_replay jsonb;
  v_forbidden boolean := false;
  v_request uuid := gen_random_uuid();
BEGIN
  IF has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.profiles', 'assigned_projects', 'UPDATE')
    OR NOT has_column_privilege('authenticated', 'public.profiles', 'name', 'UPDATE') THEN
    RAISE EXCEPTION 'Profile column privilege boundary is incorrect';
  END IF;
  IF to_regprocedure('public.list_admin_users()') IS NULL
    OR to_regprocedure('public.update_admin_user(uuid,text,text,integer[],uuid)') IS NULL THEN
    RAISE EXCEPTION 'Admin user commands are unavailable';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'admin_user_change_events_immutable' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'Admin user audit events are mutable';
  END IF;

  SELECT id INTO v_admin FROM public.profiles
  WHERE lower(role) = 'admin' AND company_id IS NOT NULL ORDER BY id LIMIT 1;
  SELECT * INTO v_target FROM public.profiles
  WHERE lower(role) = 'contractor' AND company_id = (SELECT company_id FROM public.profiles WHERE id = v_admin)
  ORDER BY id LIMIT 1;
  IF v_admin IS NOT NULL AND v_target.id IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
    v_result := public.update_admin_user(
      v_target.id, COALESCE(v_target.name, ''), v_target.role,
      COALESCE(v_target.assigned_projects, '{}'::integer[]), v_request
    );
    v_replay := public.update_admin_user(
      v_target.id, COALESCE(v_target.name, ''), v_target.role,
      COALESCE(v_target.assigned_projects, '{}'::integer[]), v_request
    );
    IF COALESCE((v_result->>'idempotentReplay')::boolean, true)
      OR NOT COALESCE((v_replay->>'idempotentReplay')::boolean, false) THEN
      RAISE EXCEPTION 'Admin command idempotency failed';
    END IF;
    IF jsonb_array_length(public.list_admin_users()) = 0 THEN
      RAISE EXCEPTION 'Admin user list unexpectedly empty';
    END IF;
  END IF;

  SELECT company_id INTO v_other_company FROM public.profiles
  WHERE company_id IS NOT NULL AND company_id IS DISTINCT FROM (SELECT company_id FROM public.profiles WHERE id = v_admin)
  LIMIT 1;
  IF v_other_company IS NOT NULL AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(public.list_admin_users()) item
    WHERE item->>'companyId' = v_other_company
  ) THEN
    RAISE EXCEPTION 'Admin user list leaked another company';
  END IF;

  SELECT id INTO v_admin FROM public.profiles WHERE lower(role) <> 'admin' ORDER BY id LIMIT 1;
  IF v_admin IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
    BEGIN
      PERFORM public.list_admin_users();
    EXCEPTION WHEN SQLSTATE '42501' THEN
      v_forbidden := true;
    END;
    IF NOT v_forbidden THEN RAISE EXCEPTION 'Non-admin could list users'; END IF;
  END IF;
END;
$$;

ROLLBACK;
