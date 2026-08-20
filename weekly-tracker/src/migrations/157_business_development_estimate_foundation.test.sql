BEGIN;

DO $structure$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.schema_migration_ledger WHERE migration_id='157_business_development_estimate_foundation'
    AND sequence_number=157 AND sha256='9f459d5366ea081c47b989231ed996357fda4d17a5a572465135b269df170836')THEN
    RAISE EXCEPTION'BUSINESS_DEVELOPMENT_157_LEDGER_MISMATCH';END IF;
  IF has_table_privilege('authenticated','public.delivery_estimates','SELECT')
    OR has_table_privilege('authenticated','public.delivery_estimate_items','INSERT')
    OR has_function_privilege('anon','public.get_business_development_workspace(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.save_delivery_estimate(uuid,uuid,uuid,text,text,text,text,jsonb,integer,uuid)','EXECUTE')THEN
    RAISE EXCEPTION'BUSINESS_DEVELOPMENT_157_ACL_MISMATCH';END IF;
END$structure$;

DO $fixtures$
DECLARE v_user uuid;v_org uuid;v_plan text;
BEGIN
  SELECT membership.user_id,membership.organization_id INTO v_user,v_org FROM public.organization_memberships membership
  JOIN public.organizations organization_row ON organization_row.id=membership.organization_id AND organization_row.status='ACTIVE'
  WHERE membership.status='ACTIVE'AND membership.access_role IN('Admin','PM','Consultant')
  ORDER BY membership.created_at LIMIT 1;
  SELECT id INTO v_plan FROM public.subscription_plans WHERE status='ACTIVE'AND id IN('design','enterprise')ORDER BY id LIMIT 1;
  IF v_user IS NULL OR v_org IS NULL OR v_plan IS NULL THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_157_FIXTURE_MISSING';END IF;
  INSERT INTO public.organization_subscriptions(organization_id,plan_id,status,starts_at)
    VALUES(v_org,v_plan,'ACTIVE','2026-01-01')ON CONFLICT(organization_id)DO UPDATE SET plan_id=EXCLUDED.plan_id,status='ACTIVE',starts_at=EXCLUDED.starts_at,ends_at=NULL;
  INSERT INTO public.organization_entitlements(organization_id,capability_id,enabled,source,config,starts_at)
    VALUES(v_org,'opportunities.pipeline',true,'manual_override','{}','2026-01-01'),(v_org,'estimating.delivery',true,'manual_override','{}','2026-01-01');
  PERFORM set_config('openday.cert.user',v_user::text,true);PERFORM set_config('openday.cert.org',v_org::text,true);
END$fixtures$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('openday.cert.user'),true);

DO $commands$
DECLARE v_org uuid:=current_setting('openday.cert.org')::uuid;v_opportunity uuid:=gen_random_uuid();v_estimate uuid:=gen_random_uuid();v_result jsonb;v_workspace jsonb;v_denied boolean:=false;
BEGIN
  v_result:=public.save_commercial_opportunity(v_org,v_opportunity,'OPP-157','Retail design','Example Client','EUR','ESTIMATING',0,gen_random_uuid());
  IF v_result->>'revision'<>'1'THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_157_OPPORTUNITY_SAVE_FAILED';END IF;
  v_result:=public.save_delivery_estimate(v_org,v_estimate,v_opportunity,'EST-157','Delivery estimate','EUR','DRAFT',jsonb_build_array(
    jsonb_build_object('itemId',gen_random_uuid(),'category','INTERNAL_LABOUR','description','Detailed design','discipline','Architecture','employeeGrade','Senior Architect','quantity','12.5','unit','hours','unitCostRate','40.25'),
    jsonb_build_object('itemId',gen_random_uuid(),'category','EXTERNAL_COST','description','Survey','quantity','1','unit','service','unitCostRate','1500.10')
  ),0,gen_random_uuid());
  IF v_result->>'estimatedDeliveryCost'<>'2003.23'THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_157_SERVER_TOTAL_FAILED';END IF;
  v_workspace:=public.get_business_development_workspace(v_org);
  IF jsonb_array_length(v_workspace->'opportunities')<>1 OR jsonb_array_length(v_workspace->'estimates')<>1
    OR v_workspace->'estimates'->0->>'internalLabourCost'<>'503.13'THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_157_READ_MODEL_FAILED';END IF;
  BEGIN PERFORM public.save_delivery_estimate(gen_random_uuid(),gen_random_uuid(),v_opportunity,'EST-X','Denied','EUR','DRAFT','[]',0,gen_random_uuid());
  EXCEPTION WHEN SQLSTATE'42501'THEN v_denied:=true;END;
  IF NOT v_denied THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_157_CROSS_ORG_ALLOWED';END IF;
END$commands$;

RESET ROLE;

DO $immutability$
DECLARE v_blocked boolean:=false;
BEGIN
  BEGIN UPDATE public.business_development_events SET snapshot='{}';EXCEPTION WHEN SQLSTATE'55000'THEN v_blocked:=true;END;
  IF NOT v_blocked THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_157_EVENT_MUTABLE';END IF;
END$immutability$;

ROLLBACK;
