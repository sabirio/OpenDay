-- Local database certification for 153_effective_entitlement_resolver.sql.
BEGIN;

DO $effective_entitlement_structure$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
    WHERE migration_id='153_effective_entitlement_resolver'
      AND sequence_number=153
      AND filename='153_effective_entitlement_resolver.sql'
      AND sha256='bac815419b0ae0c3f680907cef041767dc066f4d3c416af0cc109bbd37a676b9'
  ) THEN RAISE EXCEPTION 'EFFECTIVE_ENTITLEMENT_153_LEDGER_MISMATCH';END IF;
  IF has_function_privilege(
      'authenticated','private.resolve_effective_organization_entitlements(uuid,timestamptz)','EXECUTE'
    ) OR has_function_privilege(
      'anon','public.get_effective_organization_entitlements(uuid,timestamptz)','EXECUTE'
    ) OR has_function_privilege(
      'service_role','public.require_organization_capability(uuid,text,timestamptz)','EXECUTE'
    ) OR NOT has_function_privilege(
      'authenticated','public.has_organization_capability(uuid,text,timestamptz)','EXECUTE'
    ) THEN RAISE EXCEPTION 'EFFECTIVE_ENTITLEMENT_153_ACL_MISMATCH';END IF;
END
$effective_entitlement_structure$;

DO $effective_entitlement_fixtures$
DECLARE
  v_user_id uuid;
  v_org_a uuid;
  v_org_b uuid;
BEGIN
  SELECT membership.user_id,membership.organization_id
    INTO v_user_id,v_org_a
  FROM public.organization_memberships membership
  JOIN public.organizations organization_row
    ON organization_row.id=membership.organization_id AND organization_row.status='ACTIVE'
  WHERE membership.status='ACTIVE'
    AND NOT private.is_platform_superadmin(membership.user_id)
  ORDER BY membership.user_id,membership.organization_id LIMIT 1;
  SELECT organization_row.id INTO v_org_b FROM public.organizations organization_row
  WHERE organization_row.status='ACTIVE' AND organization_row.id<>v_org_a
    AND NOT EXISTS(
      SELECT 1 FROM public.organization_memberships membership
      WHERE membership.organization_id=organization_row.id
        AND membership.user_id=v_user_id AND membership.status='ACTIVE'
    ) ORDER BY organization_row.id LIMIT 1;
  IF v_user_id IS NULL OR v_org_a IS NULL OR v_org_b IS NULL THEN
    RAISE EXCEPTION 'EFFECTIVE_ENTITLEMENT_153_FIXTURE_MISSING';
  END IF;

  INSERT INTO public.organization_subscriptions(
    organization_id,plan_id,status,starts_at
  ) VALUES
    (v_org_a,'owner','ACTIVE','2026-01-01'),
    (v_org_b,'enterprise','ACTIVE','2026-01-01');
  INSERT INTO public.organization_entitlements(
    organization_id,capability_id,source,enabled,config,starts_at,expires_at
  ) VALUES
    (v_org_a,'construction.control','manual_override',false,'{}','2026-01-01',NULL),
    (v_org_a,'ai.intelligence','manual_override',true,'{"limits":{"monthlyActions":50}}','2026-01-01',NULL),
    (v_org_a,'core.projects','trial',false,'{}','2026-01-01','2026-08-01'),
    (v_org_a,'commercial.cost','enterprise_contract',false,'{}','2026-01-01',NULL),
    (v_org_a,'commercial.cost','manual_override',true,'{"reviewThreshold":5}','2026-01-01',NULL);

  PERFORM set_config('openday.cert.user_id',v_user_id::text,true);
  PERFORM set_config('openday.cert.org_a',v_org_a::text,true);
  PERFORM set_config('openday.cert.org_b',v_org_b::text,true);
END
$effective_entitlement_fixtures$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('openday.cert.user_id'),true);

DO $effective_entitlement_resolution$
DECLARE
  v_org_a uuid:=current_setting('openday.cert.org_a')::uuid;
  v_org_b uuid:=current_setting('openday.cert.org_b')::uuid;
  v_context jsonb;
  v_forbidden boolean:=false;
  v_not_entitled boolean:=false;
BEGIN
  v_context:=public.get_effective_organization_entitlements(v_org_a,'2026-08-19');
  IF NOT jsonb_path_exists(
      v_context,'$.capabilities[*] ? (@.capabilityId == "core.projects" && @.enabled == true && @.source == "plan")'
    ) OR NOT jsonb_path_exists(
      v_context,'$.capabilities[*] ? (@.capabilityId == "construction.control" && @.enabled == false && @.source == "manual_override" && @.disabledReason == "EXPLICITLY_DISABLED")'
    ) OR NOT jsonb_path_exists(
      v_context,'$.capabilities[*] ? (@.capabilityId == "weekly.reports" && @.enabled == false && @.disabledReason == "DEPENDENCY_NOT_ENTITLED")'
    ) OR NOT jsonb_path_exists(
      v_context,'$.capabilities[*] ? (@.capabilityId == "ai.intelligence" && @.enabled == true && @.source == "manual_override" && @.config.limits.monthlyActions == 50)'
    ) OR NOT jsonb_path_exists(
      v_context,'$.capabilities[*] ? (@.capabilityId == "commercial.cost" && @.enabled == true && @.source == "manual_override" && @.config.reviewThreshold == 5)'
    ) THEN RAISE EXCEPTION 'EFFECTIVE_ENTITLEMENT_153_RESOLUTION_FAILED';END IF;

  IF public.has_organization_capability(v_org_a,'core.projects','2026-08-19')IS NOT TRUE
    OR public.has_organization_capability(v_org_a,'weekly.reports','2026-08-19')IS NOT FALSE
    OR public.has_organization_capability(v_org_b,'core.projects','2026-08-19')IS NOT FALSE THEN
    RAISE EXCEPTION 'EFFECTIVE_ENTITLEMENT_153_HAS_GUARD_FAILED';
  END IF;

  PERFORM public.require_organization_capability(v_org_a,'core.projects','2026-08-19');
  BEGIN
    PERFORM public.require_organization_capability(v_org_a,'weekly.reports','2026-08-19');
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM='FEATURE_NOT_ENTITLED' THEN v_not_entitled:=true;END IF;
  END;
  IF NOT v_not_entitled THEN RAISE EXCEPTION 'EFFECTIVE_ENTITLEMENT_153_REQUIRE_DID_NOT_FAIL_CLOSED';END IF;

  IF v_context->'subscription'->>'planId'<>'owner'
    OR jsonb_array_length(v_context->'capabilities')<17 THEN
    RAISE EXCEPTION 'EFFECTIVE_ENTITLEMENT_153_CONTEXT_FAILED';
  END IF;
  BEGIN
    PERFORM public.get_effective_organization_entitlements(v_org_b,'2026-08-19');
  EXCEPTION WHEN SQLSTATE '42501' THEN v_forbidden:=true;
  END;
  IF NOT v_forbidden THEN RAISE EXCEPTION 'EFFECTIVE_ENTITLEMENT_153_CROSS_ORG_CONTEXT_ALLOWED';END IF;
END
$effective_entitlement_resolution$;

RESET ROLE;

DO $effective_entitlement_inactive_subscription$
DECLARE v_org_b uuid:=current_setting('openday.cert.org_b')::uuid;
BEGIN
  UPDATE public.organization_subscriptions SET status='SUSPENDED' WHERE organization_id=v_org_b;
  IF EXISTS(
    SELECT 1 FROM private.resolve_effective_organization_entitlements(v_org_b,'2026-08-19')
  ) THEN RAISE EXCEPTION 'EFFECTIVE_ENTITLEMENT_153_SUSPENDED_SUBSCRIPTION_ACTIVE';END IF;
END
$effective_entitlement_inactive_subscription$;

ROLLBACK;
