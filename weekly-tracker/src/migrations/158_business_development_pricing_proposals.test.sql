BEGIN;

DO $structure$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.schema_migration_ledger WHERE migration_id='158_business_development_pricing_proposals'
    AND sequence_number=158 AND sha256='d3dacd3a730b3e80d70f7593822051797aa9edcc40d346ce3173a9e9186a1e0c')THEN
    RAISE EXCEPTION'BUSINESS_DEVELOPMENT_158_LEDGER_MISMATCH';END IF;
  IF has_table_privilege('authenticated','public.estimate_pricings','SELECT')
    OR has_table_privilege('authenticated','public.commercial_proposal_revisions','UPDATE')
    OR has_function_privilege('anon','public.save_estimate_pricing(uuid,uuid,uuid,text,numeric,numeric,numeric,numeric,text,integer,uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.save_commercial_proposal_revision(uuid,uuid,uuid,text,text,text,integer,text,text,jsonb,integer,uuid)','EXECUTE')THEN
    RAISE EXCEPTION'BUSINESS_DEVELOPMENT_158_ACL_MISMATCH';END IF;
END$structure$;

DO $fixtures$
DECLARE v_user uuid;v_org uuid;
BEGIN
  SELECT m.user_id,m.organization_id INTO v_user,v_org FROM public.organization_memberships m
  JOIN public.organizations o ON o.id=m.organization_id AND o.status='ACTIVE'
  WHERE m.status='ACTIVE'AND m.access_role IN('Admin','PM','Consultant')ORDER BY m.created_at LIMIT 1;
  IF v_user IS NULL OR v_org IS NULL THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_158_FIXTURE_MISSING';END IF;
  INSERT INTO public.organization_entitlements(organization_id,capability_id,enabled,source,config,starts_at)
  VALUES(v_org,'opportunities.pipeline',true,'manual_override','{}','2026-01-01'),
    (v_org,'estimating.delivery',true,'manual_override','{}','2026-01-01'),
    (v_org,'pricing.commercial',true,'manual_override','{}','2026-01-01'),
    (v_org,'proposals.issue',true,'manual_override','{}','2026-01-01'),
    (v_org,'proposals.revisions',true,'manual_override','{}','2026-01-01');
  PERFORM set_config('openday.cert.user',v_user::text,true);PERFORM set_config('openday.cert.org',v_org::text,true);
END$fixtures$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('openday.cert.user'),true);

DO $commands$
DECLARE v_org uuid:=current_setting('openday.cert.org')::uuid;v_opportunity uuid:=gen_random_uuid();v_estimate uuid:=gen_random_uuid();
  v_rate uuid:=gen_random_uuid();v_pricing uuid:=gen_random_uuid();v_proposal uuid:=gen_random_uuid();v_result jsonb;v_workspace jsonb;
BEGIN
  PERFORM public.save_commercial_opportunity(v_org,v_opportunity,'OPP-158','Pricing certification','Example Client','EUR','ESTIMATING',0,gen_random_uuid());
  PERFORM public.save_delivery_estimate(v_org,v_estimate,v_opportunity,'EST-158','Approved delivery cost','EUR','APPROVED',jsonb_build_array(
    jsonb_build_object('itemId',gen_random_uuid(),'category','INTERNAL_LABOUR','description','Design services','discipline','Architecture','employeeGrade','Senior Architect','quantity','25','unit','hours','unitCostRate','40.00')
  ),0,gen_random_uuid());
  v_result:=public.save_organization_rate_card_entry(v_org,v_rate,'Senior Architect','Architecture',40,75,'EUR','2026-01-01',NULL,'ACTIVE',0,gen_random_uuid());
  IF v_result->>'revision'<>'1'THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_158_RATE_CARD_FAILED';END IF;
  v_result:=public.save_estimate_pricing(v_org,v_pricing,v_estimate,'TARGET_MARGIN',25,NULL,NULL,NULL,'APPROVED',0,gen_random_uuid());
  IF v_result->>'sellingPrice'<>'1333.33'THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_158_PRICING_FAILED';END IF;
  v_result:=public.save_commercial_proposal_revision(v_org,v_proposal,v_pricing,'Q-158','Customer proposal','EUR',30,'Payment within 30 days',
    'Initial issue',jsonb_build_array(jsonb_build_object('sectionId',gen_random_uuid(),'title','Design services','description','Customer-facing scope','amount','1333.33')),0,gen_random_uuid());
  IF v_result->>'totalAmount'<>'1333.33'THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_158_PROPOSAL_FAILED';END IF;
  v_result:=public.transition_commercial_proposal(v_org,v_proposal,'INTERNAL_REVIEW',1,gen_random_uuid());
  IF v_result->>'status'<>'INTERNAL_REVIEW'THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_158_TRANSITION_FAILED';END IF;
  v_workspace:=public.get_business_development_workspace(v_org);
  IF jsonb_array_length(v_workspace->'rateCards')<>1 OR jsonb_array_length(v_workspace->'pricings')<>1
    OR jsonb_array_length(v_workspace->'proposals')<>1 OR v_workspace->'proposals'->0->>'totalAmount'<>'1333.33'THEN
    RAISE EXCEPTION'BUSINESS_DEVELOPMENT_158_READ_MODEL_FAILED';END IF;
END$commands$;

RESET ROLE;

DO $immutability$
DECLARE v_blocked boolean:=false;
BEGIN
  BEGIN UPDATE public.commercial_proposal_revisions SET revision_reason='Changed';EXCEPTION WHEN SQLSTATE'55000'THEN v_blocked:=true;END;
  IF NOT v_blocked THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_158_REVISION_MUTABLE';END IF;
END$immutability$;

ROLLBACK;
