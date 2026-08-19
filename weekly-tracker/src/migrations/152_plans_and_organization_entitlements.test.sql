-- Local database certification for 152_plans_and_organization_entitlements.sql.
BEGIN;

DO $plans_entitlements_structure$
DECLARE
  v_table text;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
    WHERE migration_id = '152_plans_and_organization_entitlements'
      AND sequence_number = 152
      AND filename = '152_plans_and_organization_entitlements.sql'
      AND sha256 = 'cbbaa400c9d97938ce53b062e533e98a603df697f971572bbde76af1f97fab32'
  ) THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_LEDGER_MISMATCH';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'subscription_plans','plan_capabilities','organization_subscriptions',
    'organization_entitlements'
  ] LOOP
    IF to_regclass('public.'||v_table) IS NULL THEN
      RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_TABLE_MISSING: %',v_table;
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM pg_class
      WHERE oid = ('public.'||v_table)::regclass AND relrowsecurity
    ) THEN
      RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_RLS_DISABLED: %',v_table;
    END IF;
    IF has_table_privilege('anon','public.'||v_table,'SELECT')
      OR has_table_privilege('service_role','public.'||v_table,'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated','public.'||v_table,'INSERT,UPDATE,DELETE')
      OR NOT has_table_privilege('authenticated','public.'||v_table,'SELECT') THEN
      RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_TABLE_ACL_MISMATCH: %',v_table;
    END IF;
  END LOOP;

  IF has_function_privilege(
      'authenticated','private.prevent_subscription_plan_identity_change()','EXECUTE'
    ) OR has_function_privilege(
      'authenticated','private.assert_plan_capability_dependencies()','EXECUTE'
    ) THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_PRIVATE_FUNCTION_EXPOSED';
  END IF;
END
$plans_entitlements_structure$;

DO $plans_entitlements_content$
BEGIN
  IF (SELECT count(*) FROM public.subscription_plans) <> 4
    OR (SELECT count(*) FROM public.plan_capabilities WHERE plan_id='owner' AND enabled) <> 17
    OR (SELECT count(*) FROM public.plan_capabilities WHERE plan_id='design' AND enabled) <> 18
    OR (SELECT count(*) FROM public.plan_capabilities WHERE plan_id='contractor' AND enabled) <> 25
    OR (SELECT count(*) FROM public.plan_capabilities WHERE plan_id='enterprise' AND enabled) <> 33 THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_DEFAULT_COUNT_MISMATCH';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM public.plan_capabilities plan_capability
    JOIN public.product_capability_dependencies dependency
      ON dependency.capability_id = plan_capability.capability_id
    WHERE plan_capability.enabled
      AND NOT EXISTS(
        SELECT 1 FROM public.plan_capabilities required
        WHERE required.plan_id = plan_capability.plan_id
          AND required.capability_id = dependency.required_capability_id
          AND required.enabled
      )
  ) THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_DEPENDENCY_MISSING';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='organization_entitlements'
      AND column_name='source_priority' AND is_generated='ALWAYS'
  ) THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_SOURCE_PRIORITY_NOT_GENERATED';
  END IF;
END
$plans_entitlements_content$;

DO $plans_entitlements_guards$
DECLARE
  v_identity_blocked boolean := false;
  v_dependency_blocked boolean := false;
  v_expiry_blocked boolean := false;
  v_org uuid;
BEGIN
  BEGIN
    UPDATE public.subscription_plans SET id='owner_changed' WHERE id='owner';
  EXCEPTION WHEN SQLSTATE '23514' THEN v_identity_blocked := true;
  END;
  IF NOT v_identity_blocked THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_PLAN_ID_CHANGE_ALLOWED';
  END IF;

  BEGIN
    SET CONSTRAINTS plan_capability_dependencies_valid DEFERRED;
    INSERT INTO public.subscription_plans(id,name,description,sort_order)
    VALUES('invalid_plan','Invalid Plan','Dependency certification fixture',999);
    INSERT INTO public.plan_capabilities(plan_id,capability_id)
    VALUES('invalid_plan','commercial.margin');
    SET CONSTRAINTS plan_capability_dependencies_valid IMMEDIATE;
  EXCEPTION WHEN SQLSTATE '23514' THEN v_dependency_blocked := true;
  END;
  IF NOT v_dependency_blocked THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_INVALID_PLAN_ALLOWED';
  END IF;

  SELECT id INTO v_org FROM public.organizations ORDER BY id LIMIT 1;
  BEGIN
    INSERT INTO public.organization_entitlements(
      organization_id,capability_id,source,enabled,starts_at,expires_at
    ) VALUES(
      v_org,'core.projects','trial',true,'2026-09-01','2026-08-01'
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN v_expiry_blocked := true;
  END;
  IF NOT v_expiry_blocked THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_INVALID_EXPIRY_ALLOWED';
  END IF;
END
$plans_entitlements_guards$;

DO $plans_entitlements_fixtures$
DECLARE
  v_user_id uuid;
  v_org_a uuid;
  v_org_b uuid;
  v_platform_user_id uuid;
BEGIN
  SELECT membership.user_id,membership.organization_id
    INTO v_user_id,v_org_a
  FROM public.organization_memberships membership
  JOIN public.organizations organization_row
    ON organization_row.id=membership.organization_id AND organization_row.status='ACTIVE'
  WHERE membership.status='ACTIVE'
    AND NOT private.is_platform_superadmin(membership.user_id)
  ORDER BY membership.user_id,membership.organization_id LIMIT 1;
  SELECT organization_row.id INTO v_org_b
  FROM public.organizations organization_row
  WHERE organization_row.status='ACTIVE' AND organization_row.id<>v_org_a
    AND NOT EXISTS(
      SELECT 1 FROM public.organization_memberships membership
      WHERE membership.organization_id=organization_row.id
        AND membership.user_id=v_user_id AND membership.status='ACTIVE'
    )
  ORDER BY organization_row.id LIMIT 1;
  SELECT user_id INTO v_platform_user_id FROM public.platform_user_roles
  WHERE platform_role='PLATFORM_SUPERADMIN' AND status='ACTIVE'
  ORDER BY user_id LIMIT 1;
  IF v_user_id IS NULL OR v_org_a IS NULL OR v_org_b IS NULL OR v_platform_user_id IS NULL THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_RLS_FIXTURE_MISSING';
  END IF;

  INSERT INTO public.organization_subscriptions(
    organization_id,plan_id,status,starts_at
  ) VALUES(v_org_a,'owner','ACTIVE',now()),(v_org_b,'design','ACTIVE',now());
  INSERT INTO public.organization_entitlements(
    organization_id,capability_id,source,enabled,config,starts_at
  ) VALUES
    (v_org_a,'core.projects','plan',true,'{"limits":{"maxActiveProjects":25}}',now()),
    (v_org_b,'core.projects','plan',true,'{"limits":{"maxActiveProjects":25}}',now()),
    (v_org_b,'ai.intelligence','manual_override',true,'{"limits":{"monthlyActions":50}}',now());

  PERFORM set_config('openday.cert.user_id',v_user_id::text,true);
  PERFORM set_config('openday.cert.org_a',v_org_a::text,true);
  PERFORM set_config('openday.cert.org_b',v_org_b::text,true);
  PERFORM set_config('openday.cert.platform_user_id',v_platform_user_id::text,true);
END
$plans_entitlements_fixtures$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('openday.cert.user_id'),true);

DO $plans_entitlements_member_rls$
DECLARE
  v_org_a uuid:=current_setting('openday.cert.org_a')::uuid;
  v_org_b uuid:=current_setting('openday.cert.org_b')::uuid;
BEGIN
  IF (SELECT count(*) FROM public.organization_subscriptions
      WHERE organization_id IN(v_org_a,v_org_b)) <> 1
    OR NOT EXISTS(SELECT 1 FROM public.organization_subscriptions WHERE organization_id=v_org_a)
    OR EXISTS(SELECT 1 FROM public.organization_subscriptions WHERE organization_id=v_org_b)
    OR (SELECT count(*) FROM public.organization_entitlements
        WHERE organization_id IN(v_org_a,v_org_b)) <> 1 THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_CROSS_ORG_READ_ALLOWED';
  END IF;
  IF (SELECT count(*) FROM public.subscription_plans)<>4
    OR (SELECT count(*) FROM public.plan_capabilities WHERE plan_id='enterprise')<>33 THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_CATALOG_READ_FAILED';
  END IF;
END
$plans_entitlements_member_rls$;

SELECT set_config('request.jwt.claim.sub',current_setting('openday.cert.platform_user_id'),true);

DO $plans_entitlements_platform_rls$
DECLARE
  v_org_a uuid:=current_setting('openday.cert.org_a')::uuid;
  v_org_b uuid:=current_setting('openday.cert.org_b')::uuid;
BEGIN
  IF (SELECT count(*) FROM public.organization_subscriptions
      WHERE organization_id IN(v_org_a,v_org_b))<>2
    OR (SELECT count(*) FROM public.organization_entitlements
        WHERE organization_id IN(v_org_a,v_org_b))<>3 THEN
    RAISE EXCEPTION 'PLANS_ENTITLEMENTS_152_PLATFORM_READ_FAILED';
  END IF;
END
$plans_entitlements_platform_rls$;

RESET ROLE;
ROLLBACK;
