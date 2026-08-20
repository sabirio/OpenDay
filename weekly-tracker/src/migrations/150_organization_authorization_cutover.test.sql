-- Local database certification for 150_organization_authorization_cutover.sql.
BEGIN;

DO $organization_authorization_structure$
DECLARE
  v_definition text;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
    WHERE migration_id = '150_organization_authorization_cutover'
      AND sequence_number = 150
      AND filename = '150_organization_authorization_cutover.sql'
      AND sha256 = '277d79499737e915b48bb37804ec89bc47309e751b78002efab6ee131120752d'
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_LEDGER_MISMATCH';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_memberships'
      AND column_name = 'is_primary'
      AND data_type = 'boolean'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_PRIMARY_MEMBERSHIP_MISSING';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'organization_memberships_one_primary_per_user_idx'
      AND indexdef ILIKE '%WHERE is_primary%'
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_PRIMARY_UNIQUENESS_MISSING';
  END IF;

  SELECT pg_get_functiondef('public.is_global_admin()'::regprocedure)
    INTO v_definition;
  IF v_definition NOT ILIKE '%private.is_platform_superadmin%'
    OR v_definition ILIKE '%profiles%company_id%' THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_PLATFORM_ROLE_NOT_CANONICAL';
  END IF;

  SELECT pg_get_functiondef('public.can_access_project(bigint)'::regprocedure)
    INTO v_definition;
  IF v_definition NOT ILIKE '%organization_id%'
    OR v_definition ILIKE '%profile.company_id%' THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_PROJECT_HELPER_NOT_CUT_OVER';
  END IF;

  IF has_function_privilege(
      'authenticated','private.sync_profile_primary_organization()','EXECUTE'
    ) OR has_function_privilege(
      'service_role','private.sync_profile_primary_organization()','EXECUTE'
    ) OR has_function_privilege(
      'anon','public.can_view_own_project_row(bigint,text,uuid)','EXECUTE'
    ) OR NOT has_function_privilege(
      'authenticated','public.can_view_own_project_row(bigint,text,uuid)','EXECUTE'
    ) THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_FUNCTION_ACL_MISMATCH';
  END IF;

  IF pg_get_expr(
      (SELECT polqual FROM pg_policy
       WHERE polrelid = 'public.projects'::regclass
         AND polname = 'projects_select'),
      'public.projects'::regclass
    ) NOT ILIKE '%organization_id%' THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_PROJECT_RLS_NOT_CANONICAL';
  END IF;
END
$organization_authorization_structure$;

DO $organization_authorization_fixtures$
DECLARE
  v_user_id uuid;
  v_org_a uuid;
  v_company_a text;
  v_org_b uuid := gen_random_uuid();
  v_company_b text := 'CERT-ORG-B-'||gen_random_uuid()::text;
  v_project_a bigint;
  v_project_b bigint;
BEGIN
  SELECT profile.id,membership.organization_id,organization_row.legacy_company_id
    INTO v_user_id,v_org_a,v_company_a
  FROM public.profiles profile
  JOIN public.organization_memberships membership
    ON membership.user_id = profile.id
    AND membership.is_primary
    AND membership.status = 'ACTIVE'
  JOIN public.organizations organization_row
    ON organization_row.id = membership.organization_id
    AND organization_row.status = 'ACTIVE'
  WHERE lower(profile.role) = 'pm'
    AND COALESCE(profile.is_active,true)
    AND NOT private.is_platform_superadmin(profile.id)
  ORDER BY profile.id
  LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_PM_FIXTURE_MISSING';
  END IF;

  UPDATE public.organization_memberships
  SET organization_role = 'ORG_ADMIN',updated_at = now()
  WHERE organization_id = v_org_a AND user_id = v_user_id;

  INSERT INTO public.organizations(id,name,legacy_company_id)
  VALUES(v_org_b,'Certification Foreign Organization',v_company_b);

  SELECT COALESCE(max(id),0) + 100000 INTO v_project_a FROM public.projects;
  v_project_b := v_project_a + 1;

  INSERT INTO public.projects(
    id,store_code,company_id,organization_id,created_by
  ) VALUES(
    v_project_a,'CERT-ORG-A-PROJECT',v_company_a,v_org_a,v_user_id
  );
  INSERT INTO public.projects(
    id,store_code,company_id,organization_id,created_by
  ) VALUES(
    v_project_b,'CERT-ORG-B-PROJECT',v_company_b,v_org_b,v_user_id
  );

  -- Project Team membership in the foreign project is deliberately present.
  -- Organization membership must still be required by the access intersection.
  INSERT INTO public.project_team_memberships(
    id,project_id,user_id,project_role,responsibility_label,starts_on,
    created_by,updated_by
  ) VALUES(
    gen_random_uuid(),v_project_a,v_user_id,'PM','Certification PM',CURRENT_DATE,
    v_user_id,v_user_id
  ),(
    gen_random_uuid(),v_project_b,v_user_id,'PM','Manipulated foreign membership',CURRENT_DATE,
    v_user_id,v_user_id
  );

  PERFORM set_config('openday.cert.user_id',v_user_id::text,true);
  PERFORM set_config('openday.cert.org_a',v_org_a::text,true);
  PERFORM set_config('openday.cert.company_a',v_company_a,true);
  PERFORM set_config('openday.cert.org_b',v_org_b::text,true);
  PERFORM set_config('openday.cert.company_b',v_company_b,true);
  PERFORM set_config('openday.cert.project_a',v_project_a::text,true);
  PERFORM set_config('openday.cert.project_b',v_project_b::text,true);
  PERFORM set_config('openday.cert.project_insert_a',(v_project_b + 1)::text,true);
  PERFORM set_config('openday.cert.project_insert_b',(v_project_b + 2)::text,true);
END
$organization_authorization_fixtures$;

-- These grants exist only inside the rolled-back certification transaction.
-- They ensure CRUD denials are proven by RLS, not merely by missing table ACL.
GRANT INSERT,UPDATE,DELETE ON public.projects TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('openday.cert.user_id'),true);

DO $organization_authorization_rls$
DECLARE
  v_project_a bigint := current_setting('openday.cert.project_a')::bigint;
  v_project_b bigint := current_setting('openday.cert.project_b')::bigint;
  v_company_a text := current_setting('openday.cert.company_a');
  v_company_b text := current_setting('openday.cert.company_b');
  v_insert_a bigint := current_setting('openday.cert.project_insert_a')::bigint;
  v_insert_b bigint := current_setting('openday.cert.project_insert_b')::bigint;
  v_visible integer;
  v_rows integer;
  v_inserted_id bigint;
  v_foreign_insert_blocked boolean := false;
BEGIN
  SELECT count(*) INTO v_visible FROM public.projects
  WHERE id IN(v_project_a,v_project_b);
  IF v_visible <> 1
    OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id = v_project_a)
    OR EXISTS(SELECT 1 FROM public.projects WHERE id = v_project_b) THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_CROSS_ORG_READ_OR_URL_ALLOWED';
  END IF;
  IF public.can_access_project(v_project_a) IS NOT TRUE
    OR public.can_access_project(v_project_b) IS NOT FALSE THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_ACCESS_INTERSECTION_FAILED';
  END IF;

  INSERT INTO public.projects(id,store_code,company_id,created_by)
  VALUES(v_insert_a,'CERT-ORG-A-INSERT',v_company_a,auth.uid())
  RETURNING id INTO v_inserted_id;
  IF v_inserted_id IS NULL THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_OWN_ORG_INSERT_FAILED';
  END IF;

  BEGIN
    INSERT INTO public.projects(id,store_code,company_id,created_by)
    VALUES(v_insert_b,'CERT-ORG-B-INSERT',v_company_b,auth.uid());
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_foreign_insert_blocked := true;
  END;
  IF NOT v_foreign_insert_blocked THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_CROSS_ORG_INSERT_ALLOWED';
  END IF;

  UPDATE public.projects SET city = 'Allowed own organization'
  WHERE id = v_project_a;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_OWN_ORG_UPDATE_FAILED';
  END IF;
  UPDATE public.projects SET city = 'Forbidden foreign organization'
  WHERE id = v_project_b;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_CROSS_ORG_UPDATE_ALLOWED';
  END IF;

  DELETE FROM public.projects WHERE id = v_project_b;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_CROSS_ORG_DELETE_ALLOWED';
  END IF;
  DELETE FROM public.projects WHERE id = v_inserted_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_OWN_ORG_DELETE_FAILED';
  END IF;
END
$organization_authorization_rls$;

RESET ROLE;

DO $organization_authorization_profile_sync$
DECLARE
  v_user_id uuid := current_setting('openday.cert.user_id')::uuid;
  v_old_org uuid := current_setting('openday.cert.org_a')::uuid;
  v_new_org uuid := gen_random_uuid();
  v_new_company text := 'CERT-ORG-C-'||gen_random_uuid()::text;
BEGIN
  INSERT INTO public.organizations(id,name,legacy_company_id)
  VALUES(v_new_org,'Certification Reassigned Organization',v_new_company);
  UPDATE public.profiles SET company_id = v_new_company WHERE id = v_user_id;

  IF NOT EXISTS(
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = v_new_org AND user_id = v_user_id
        AND is_primary AND status = 'ACTIVE'
    ) OR EXISTS(
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = v_old_org AND user_id = v_user_id
        AND is_primary
    ) OR EXISTS(
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = v_old_org AND user_id = v_user_id
        AND status = 'ACTIVE'
    ) THEN
    RAISE EXCEPTION 'ORGANIZATION_AUTH_150_PROFILE_MEMBERSHIP_SYNC_FAILED';
  END IF;
END
$organization_authorization_profile_sync$;

ROLLBACK;
