-- Local database certification for 149_organization_tenant_foundation.sql.
BEGIN;

DO $organization_tenant_structure$
DECLARE
  v_table text;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
    WHERE migration_id = '149_organization_tenant_foundation'
      AND sequence_number = 149
      AND filename = '149_organization_tenant_foundation.sql'
      AND sha256 = 'b687811a2bc39456e09d71e5867aed1bf567e1bc0a497ad51ae2477fbc1995f3'
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_149_LEDGER_MISMATCH';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'organizations','organization_memberships','platform_user_roles'
  ] LOOP
    IF to_regclass('public.'||v_table) IS NULL THEN
      RAISE EXCEPTION 'ORGANIZATION_TENANT_149_TABLE_MISSING: %',v_table;
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM pg_class
      WHERE oid = ('public.'||v_table)::regclass AND relrowsecurity
    ) THEN
      RAISE EXCEPTION 'ORGANIZATION_TENANT_149_RLS_DISABLED: %',v_table;
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'projects','templates','work_ontology_versions','import_jobs','admin_user_change_events'
  ] LOOP
    IF NOT EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_table
        AND column_name = 'organization_id' AND data_type = 'uuid'
    ) THEN
      RAISE EXCEPTION 'ORGANIZATION_TENANT_149_BRIDGE_MISSING: %',v_table;
    END IF;
  END LOOP;

  IF has_table_privilege('anon','public.organizations','SELECT')
    OR has_table_privilege('anon','public.organization_memberships','SELECT')
    OR has_table_privilege('authenticated','public.organizations','INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','public.organization_memberships','INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','public.platform_user_roles','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_149_TABLE_ACL_MISMATCH';
  END IF;
  IF NOT has_table_privilege('authenticated','public.organizations','SELECT')
    OR NOT has_table_privilege('authenticated','public.organization_memberships','SELECT') THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_149_MEMBER_READ_GRANT_MISSING';
  END IF;

  IF has_function_privilege('anon','public.get_my_organization_context()','EXECUTE')
    OR has_function_privilege('service_role','public.get_my_organization_context()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.get_my_organization_context()','EXECUTE') THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_149_RPC_ACL_MISMATCH';
  END IF;
  IF has_function_privilege('anon','private.is_platform_superadmin(uuid)','EXECUTE')
    OR has_function_privilege('service_role','private.is_platform_superadmin(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','private.is_platform_superadmin(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','private.has_active_organization_membership(uuid,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_149_INTERNAL_HELPER_EXPOSED';
  END IF;

  BEGIN
    PERFORM public.get_my_organization_context();
    RAISE EXCEPTION 'ORGANIZATION_TENANT_149_UNAUTHENTICATED_RPC_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '28000' THEN NULL;
  END;
END
$organization_tenant_structure$;

DO $organization_tenant_fixtures$
DECLARE
  v_user_id uuid;
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_company_a text := 'CERT-ORG-A-'||gen_random_uuid()::text;
  v_company_b text := 'CERT-ORG-B-'||gen_random_uuid()::text;
  v_event_id bigint;
  v_mismatch_blocked boolean := false;
BEGIN
  SELECT profile.id INTO v_user_id
  FROM public.profiles profile
  WHERE COALESCE(profile.is_active,true)
    AND NOT private.is_platform_superadmin(profile.id)
  ORDER BY profile.id LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_149_NON_PLATFORM_FIXTURE_MISSING';
  END IF;

  INSERT INTO public.organizations(id,name,legacy_company_id)
  VALUES(v_org_a,'Certification Organization A',v_company_a),
        (v_org_b,'Certification Organization B',v_company_b);
  INSERT INTO public.organization_memberships(organization_id,user_id,organization_role)
  VALUES(v_org_a,v_user_id,'MEMBER');

  INSERT INTO public.admin_user_change_events(
    target_user_id,company_id,previous_name,new_name,previous_role,new_role,
    previous_assigned_projects,new_assigned_projects,changed_by
  ) VALUES(
    v_user_id,v_company_a,'Before','After','Executive','Executive','{}','{}',v_user_id
  ) RETURNING id INTO v_event_id;
  IF NOT EXISTS(
    SELECT 1 FROM public.admin_user_change_events event
    WHERE event.id = v_event_id AND event.company_id = v_company_a
      AND event.organization_id = v_org_a
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_149_COMPANY_TO_ORG_SYNC_FAILED';
  END IF;

  BEGIN
    INSERT INTO public.admin_user_change_events(
      target_user_id,company_id,organization_id,previous_name,new_name,
      previous_role,new_role,previous_assigned_projects,new_assigned_projects,changed_by
    ) VALUES(
      v_user_id,v_company_b,v_org_a,'Before','After','Executive','Executive','{}','{}',v_user_id
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN v_mismatch_blocked := true;
  END;
  IF NOT v_mismatch_blocked THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_149_IDENTITY_MISMATCH_ACCEPTED';
  END IF;

  PERFORM set_config('openday.cert.user_id',v_user_id::text,true);
  PERFORM set_config('openday.cert.org_a',v_org_a::text,true);
  PERFORM set_config('openday.cert.org_b',v_org_b::text,true);
END
$organization_tenant_fixtures$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('openday.cert.user_id'),true);

DO $organization_tenant_rls$
DECLARE
  v_org_a uuid := current_setting('openday.cert.org_a')::uuid;
  v_org_b uuid := current_setting('openday.cert.org_b')::uuid;
  v_visible_count integer;
  v_context jsonb;
BEGIN
  SELECT count(*) INTO v_visible_count FROM public.organizations
  WHERE id IN(v_org_a,v_org_b);
  IF v_visible_count <> 1 OR NOT EXISTS(
    SELECT 1 FROM public.organizations WHERE id = v_org_a
  ) OR EXISTS(
    SELECT 1 FROM public.organizations WHERE id = v_org_b
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_149_CROSS_ORG_READ_ALLOWED';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.organization_memberships WHERE organization_id = v_org_b
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_149_CROSS_ORG_MEMBERSHIP_READ_ALLOWED';
  END IF;

  v_context := public.get_my_organization_context();
  IF NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(v_context->'organizations') item
      WHERE item->>'organizationId' = v_org_a::text
    )
    OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(v_context->'organizations') item
      WHERE item->>'organizationId' = v_org_b::text
    )
    OR COALESCE((v_context->>'platformSuperadmin')::boolean,true) THEN
    RAISE EXCEPTION 'ORGANIZATION_TENANT_149_CONTEXT_SCOPE_FAILED';
  END IF;
END
$organization_tenant_rls$;

RESET ROLE;
ROLLBACK;
