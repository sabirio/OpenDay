-- Local database certification for 156_tender_organization_identity.sql.
BEGIN;

DO $tender_organization_structure$
DECLARE v_function regprocedure;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.schema_migration_ledger
    WHERE migration_id='156_tender_organization_identity'
      AND sequence_number=156 AND filename='156_tender_organization_identity.sql')THEN
    RAISE EXCEPTION 'TENDER_ORGANIZATION_156_LEDGER_MISSING';END IF;
  IF EXISTS(
    SELECT 1 FROM public.project_tenders tender
    JOIN public.projects project ON project.id=tender.project_id
    WHERE tender.procuring_organization_id IS DISTINCT FROM project.organization_id
  )THEN RAISE EXCEPTION 'TENDER_ORGANIZATION_156_PROCURER_BACKFILL_FAILED';END IF;
  IF(SELECT count(*) FROM public.project_tender_organization_participants)<>
    (SELECT count(*) FROM public.project_tender_participants)THEN
    RAISE EXCEPTION 'TENDER_ORGANIZATION_156_PARTICIPANT_BACKFILL_FAILED';END IF;
  IF EXISTS(
    SELECT 1 FROM public.project_tender_organization_participants party
    JOIN public.project_tenders tender ON tender.id=party.tender_id
    WHERE party.procuring_organization_id<>tender.procuring_organization_id
      OR party.bidding_organization_id=party.procuring_organization_id
  )THEN RAISE EXCEPTION 'TENDER_ORGANIZATION_156_PARTY_INVARIANT_FAILED';END IF;
  FOREACH v_function IN ARRAY ARRAY[
    'public.save_project_tender_setup(bigint,uuid,text,text,timestamptz,text,text,text,bigint,jsonb,jsonb,integer,uuid)'::regprocedure,
    'public.invite_project_tender_bidder(uuid,uuid,uuid)'::regprocedure,
    'public.link_my_tender_bidding_organization(uuid,uuid)'::regprocedure,
    'public.respond_to_my_tender_invitation_as_organization(uuid,text,uuid,uuid)'::regprocedure,
    'public.get_tender_organization_identity(uuid)'::regprocedure,
    'public.list_my_tender_inbox()'::regprocedure,
    'public.get_my_tender_workspace(uuid)'::regprocedure
  ]LOOP
    IF has_function_privilege('anon',v_function,'EXECUTE')
      OR has_function_privilege('service_role',v_function,'EXECUTE')
      OR NOT has_function_privilege('authenticated',v_function,'EXECUTE')THEN
      RAISE EXCEPTION 'TENDER_ORGANIZATION_156_FUNCTION_ACL_MISMATCH: %',v_function;END IF;
  END LOOP;
  IF has_table_privilege('authenticated','public.project_tender_organization_participants','INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','public.project_tender_bidding_organization_claims','INSERT,UPDATE,DELETE')
    OR NOT has_table_privilege('authenticated','public.project_tender_organization_participants','SELECT')
    OR NOT has_table_privilege('authenticated','public.project_tender_bidding_organization_claims','SELECT')THEN
    RAISE EXCEPTION 'TENDER_ORGANIZATION_156_TABLE_ACL_MISMATCH';END IF;
END
$tender_organization_structure$;

DO $tender_organization_fixture$
DECLARE v_access public.project_tender_bidder_access%ROWTYPE;v_other_org uuid;
BEGIN
  SELECT access.* INTO v_access
  FROM public.project_tender_bidder_access access
  WHERE access.status='ACCEPTED' AND access.bidder_user_id IS NOT NULL
  ORDER BY access.tender_id,access.participant_id LIMIT 1;
  SELECT organization_row.id INTO v_other_org
  FROM public.organizations organization_row
  JOIN public.project_tenders tender ON tender.id=v_access.tender_id
  WHERE organization_row.id<>tender.procuring_organization_id
    AND organization_row.status='ACTIVE'
  ORDER BY organization_row.id LIMIT 1;
  IF v_access.tender_id IS NULL OR v_other_org IS NULL THEN
    RAISE EXCEPTION 'TENDER_ORGANIZATION_156_FIXTURE_MISSING';END IF;
  INSERT INTO public.organization_memberships(
    organization_id,user_id,organization_role,status,access_role,job_role
  )VALUES(v_other_org,v_access.bidder_user_id,'MEMBER','ACTIVE','Contractor','Construction Manager')
  ON CONFLICT(organization_id,user_id)DO UPDATE SET status='ACTIVE';
  PERFORM set_config('openday.cert.tender',v_access.tender_id::text,true);
  PERFORM set_config('openday.cert.participant',v_access.participant_id::text,true);
  PERFORM set_config('openday.cert.bidder',v_access.bidder_user_id::text,true);
  PERFORM set_config('openday.cert.bidder_org',v_other_org::text,true);
END
$tender_organization_fixture$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('openday.cert.bidder'),true);

DO $tender_organization_claim$
DECLARE v_result jsonb;v_identity jsonb;v_procurer uuid;v_rejected boolean:=false;
BEGIN
  v_result:=public.link_my_tender_bidding_organization(
    current_setting('openday.cert.tender')::uuid,
    current_setting('openday.cert.bidder_org')::uuid
  );
  IF v_result->>'biddingOrganizationId'<>current_setting('openday.cert.bidder_org')THEN
    RAISE EXCEPTION 'TENDER_ORGANIZATION_156_CLAIM_FAILED';END IF;
  v_identity:=public.get_tender_organization_identity(current_setting('openday.cert.tender')::uuid);
  IF jsonb_array_length(v_identity->'biddingOrganizations')<>1
    OR v_identity#>>'{biddingOrganizations,0,biddingOrganizationId}'<>
      current_setting('openday.cert.bidder_org')THEN
    RAISE EXCEPTION 'TENDER_ORGANIZATION_156_BIDDER_SCOPE_LEAK_OR_LINK_FAILED';END IF;
  v_procurer:=(v_identity->>'procuringOrganizationId')::uuid;
  BEGIN
    PERFORM public.link_my_tender_bidding_organization(
      current_setting('openday.cert.tender')::uuid,v_procurer
    );
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '42501' THEN
    v_rejected:=SQLERRM IN('BIDDING_ORGANIZATION_CANNOT_BE_PROCURER','BIDDING_ORGANIZATION_MEMBERSHIP_REQUIRED');END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'TENDER_ORGANIZATION_156_SELF_BID_ALLOWED';END IF;
END
$tender_organization_claim$;

DO $tender_organization_direct_write_denied$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    INSERT INTO public.project_tender_bidding_organization_claims(
      tender_id,participant_id,bidding_organization_id,claimed_by
    )VALUES(
      current_setting('openday.cert.tender')::uuid,
      current_setting('openday.cert.participant')::uuid,
      current_setting('openday.cert.bidder_org')::uuid,
      current_setting('openday.cert.bidder')::uuid
    );
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;END;
  IF NOT v_denied THEN RAISE EXCEPTION 'TENDER_ORGANIZATION_156_DIRECT_WRITE_ALLOWED';END IF;
END
$tender_organization_direct_write_denied$;

RESET ROLE;
DO $tender_organization_immutable$
DECLARE v_immutable boolean:=false;
BEGIN
  BEGIN
    UPDATE public.project_tender_organization_participants
    SET bidding_organization_name=bidding_organization_name
    WHERE tender_id=current_setting('openday.cert.tender')::uuid;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_immutable:=true;END;
  IF NOT v_immutable THEN RAISE EXCEPTION 'TENDER_ORGANIZATION_156_PARTY_MUTABLE';END IF;
END
$tender_organization_immutable$;

ROLLBACK;
