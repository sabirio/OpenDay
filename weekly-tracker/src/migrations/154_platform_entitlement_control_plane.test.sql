-- Local database certification for 154_platform_entitlement_control_plane.sql.
BEGIN;

DO $platform_control_plane_structure$
DECLARE v_function regprocedure;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.schema_migration_ledger
    WHERE migration_id='154_platform_entitlement_control_plane'
      AND sequence_number=154 AND filename='154_platform_entitlement_control_plane.sql')THEN
    RAISE EXCEPTION 'PLATFORM_CONTROL_PLANE_154_LEDGER_MISSING';END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='platform_entitlement_change_events'
    AND policyname='platform_entitlement_events_superadmin_read')THEN
    RAISE EXCEPTION 'PLATFORM_CONTROL_PLANE_154_RLS_MISSING';END IF;
  FOREACH v_function IN ARRAY ARRAY[
    'public.list_platform_organizations()'::regprocedure,
    'public.get_platform_organization(uuid)'::regprocedure,
    'public.set_platform_organization_status(uuid,text,text,uuid)'::regprocedure,
    'public.set_platform_organization_subscription(uuid,text,text,timestamptz,timestamptz,integer,uuid)'::regprocedure,
    'public.set_platform_organization_entitlement(uuid,text,text,boolean,jsonb,timestamptz,timestamptz,integer,uuid)'::regprocedure
  ]LOOP
    IF has_function_privilege('anon',v_function,'EXECUTE')
      OR has_function_privilege('service_role',v_function,'EXECUTE')
      OR NOT has_function_privilege('authenticated',v_function,'EXECUTE')THEN
      RAISE EXCEPTION 'PLATFORM_CONTROL_PLANE_154_FUNCTION_ACL_MISMATCH: %',v_function;END IF;
  END LOOP;
  IF has_table_privilege('authenticated','public.platform_entitlement_command_requests','SELECT')
    OR has_table_privilege('authenticated','public.organization_subscriptions','UPDATE')
    OR has_table_privilege('authenticated','public.organization_entitlements','INSERT')THEN
    RAISE EXCEPTION 'PLATFORM_CONTROL_PLANE_154_DIRECT_WRITE_EXPOSED';END IF;
END
$platform_control_plane_structure$;

DO $platform_control_plane_fixtures$
DECLARE v_superadmin uuid;v_member uuid;v_org uuid;
BEGIN
  SELECT assignment.user_id INTO v_superadmin FROM public.platform_user_roles assignment
  WHERE assignment.platform_role='PLATFORM_SUPERADMIN' AND assignment.status='ACTIVE'
  ORDER BY assignment.user_id LIMIT 1;
  SELECT membership.user_id,membership.organization_id INTO v_member,v_org
  FROM public.organization_memberships membership
  WHERE membership.status='ACTIVE' AND NOT private.is_platform_superadmin(membership.user_id)
  ORDER BY membership.user_id LIMIT 1;
  IF v_superadmin IS NULL OR v_member IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'PLATFORM_CONTROL_PLANE_154_FIXTURE_MISSING';END IF;
  DELETE FROM public.organization_entitlements WHERE organization_id=v_org;
  DELETE FROM public.organization_subscriptions WHERE organization_id=v_org;
  PERFORM set_config('openday.cert.superadmin',v_superadmin::text,true);
  PERFORM set_config('openday.cert.member',v_member::text,true);
  PERFORM set_config('openday.cert.org',v_org::text,true);
END
$platform_control_plane_fixtures$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('openday.cert.member'),true);
DO $platform_control_plane_member_denied$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN PERFORM public.list_platform_organizations();
  EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=SQLERRM='PLATFORM_ADMIN_FORBIDDEN';END;
  IF NOT v_denied THEN RAISE EXCEPTION 'PLATFORM_CONTROL_PLANE_154_MEMBER_ALLOWED';END IF;
END
$platform_control_plane_member_denied$;

SELECT set_config('request.jwt.claim.sub',current_setting('openday.cert.superadmin'),true);
DO $platform_control_plane_commands$
DECLARE
  v_org uuid:=current_setting('openday.cert.org')::uuid;
  v_subscription_request uuid:=gen_random_uuid();
  v_entitlement_request uuid:=gen_random_uuid();
  v_status_request uuid:=gen_random_uuid();
  v_result jsonb;
  v_conflict boolean:=false;
BEGIN
  IF jsonb_array_length(public.list_platform_organizations())<1 THEN
    RAISE EXCEPTION 'PLATFORM_CONTROL_PLANE_154_LIST_EMPTY';END IF;
  v_result:=public.set_platform_organization_subscription(
    v_org,'owner','ACTIVE','2026-01-01',NULL,0,v_subscription_request
  );
  IF(v_result->>'revision')::integer<>1 OR(v_result->>'idempotentReplay')::boolean THEN
    RAISE EXCEPTION 'PLATFORM_CONTROL_PLANE_154_SUBSCRIPTION_CREATE_FAILED';END IF;
  v_result:=public.set_platform_organization_subscription(
    v_org,'owner','ACTIVE','2026-01-01',NULL,0,v_subscription_request
  );
  IF(v_result->>'idempotentReplay')::boolean IS NOT TRUE
    OR(SELECT count(*) FROM public.platform_entitlement_change_events
      WHERE client_request_id=v_subscription_request)<>1 THEN
    RAISE EXCEPTION 'PLATFORM_CONTROL_PLANE_154_IDEMPOTENCY_FAILED';END IF;
  BEGIN
    PERFORM public.set_platform_organization_subscription(
      v_org,'design','ACTIVE','2026-01-01',NULL,0,gen_random_uuid()
    );
  EXCEPTION WHEN SQLSTATE '40001' THEN v_conflict:=true;END;
  IF NOT v_conflict THEN RAISE EXCEPTION 'PLATFORM_CONTROL_PLANE_154_REVISION_NOT_ENFORCED';END IF;

  v_result:=public.set_platform_organization_entitlement(
    v_org,'ai.intelligence','manual_override',true,'{"limits":{"monthlyActions":25}}',
    '2026-01-01',NULL,0,v_entitlement_request
  );
  IF(v_result->>'revision')::integer<>1 OR v_result->>'source'<>'manual_override' THEN
    RAISE EXCEPTION 'PLATFORM_CONTROL_PLANE_154_ENTITLEMENT_CREATE_FAILED';END IF;
  IF public.get_platform_organization(v_org)#>>'{effective,subscription,planId}'<>'owner'
    OR NOT jsonb_path_exists(public.get_platform_organization(v_org),
      '$.effective.capabilities[*] ? (@.capabilityId == "ai.intelligence" && @.enabled == true)')THEN
    RAISE EXCEPTION 'PLATFORM_CONTROL_PLANE_154_DETAIL_FAILED';END IF;

  v_result:=public.set_platform_organization_status(v_org,'SUSPENDED','ACTIVE',v_status_request);
  IF v_result->>'status'<>'SUSPENDED' THEN
    RAISE EXCEPTION 'PLATFORM_CONTROL_PLANE_154_STATUS_FAILED';END IF;
  PERFORM set_config('openday.cert.status_request',v_status_request::text,true);
END
$platform_control_plane_commands$;

RESET ROLE;
DO $platform_control_plane_immutable_audit$
DECLARE v_immutable boolean:=false;
BEGIN
  BEGIN
    UPDATE public.platform_entitlement_change_events SET new_data='{}'
    WHERE client_request_id=current_setting('openday.cert.status_request')::uuid;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_immutable:=true;END;
  IF NOT v_immutable THEN RAISE EXCEPTION 'PLATFORM_CONTROL_PLANE_154_AUDIT_MUTABLE';END IF;
END
$platform_control_plane_immutable_audit$;
ROLLBACK;
