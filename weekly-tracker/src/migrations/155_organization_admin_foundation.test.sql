-- Local database certification for 155_organization_admin_foundation.sql.
BEGIN;

DO $organization_admin_structure$
DECLARE v_function regprocedure;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.schema_migration_ledger
    WHERE migration_id='155_organization_admin_foundation'
      AND sequence_number=155 AND filename='155_organization_admin_foundation.sql')THEN
    RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_LEDGER_MISSING';END IF;
  FOREACH v_function IN ARRAY ARRAY[
    'public.list_organization_users(uuid)'::regprocedure,
    'public.prepare_organization_user_invitation(uuid,text,text,text,text,text,uuid)'::regprocedure,
    'public.activate_my_organization_invitations()'::regprocedure,
    'public.update_organization_user(uuid,uuid,text,text,text,text,integer,uuid)'::regprocedure,
    'public.deactivate_organization_user(uuid,uuid,integer,uuid)'::regprocedure,
    'public.get_project_team_foundation(bigint)'::regprocedure
  ]LOOP
    IF has_function_privilege('anon',v_function,'EXECUTE')
      OR has_function_privilege('service_role',v_function,'EXECUTE')
      OR NOT has_function_privilege('authenticated',v_function,'EXECUTE')THEN
      RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_FUNCTION_ACL_MISMATCH: %',v_function;END IF;
  END LOOP;
  IF has_function_privilege('authenticated',
      'public.mark_organization_user_invitation_sent(uuid)'::regprocedure,'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.mark_organization_user_invitation_sent(uuid)'::regprocedure,'EXECUTE')
    OR has_table_privilege('authenticated','public.organization_user_invitations','INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','public.organization_memberships','INSERT,UPDATE,DELETE')THEN
    RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_WRITE_BOUNDARY_EXPOSED';END IF;
END
$organization_admin_structure$;

DO $organization_admin_fixtures$
DECLARE v_org_a uuid;v_admin_a uuid;v_org_b uuid;v_user_b uuid;v_member_a uuid;v_user_b_email text;
BEGIN
  SELECT organization_row.id,membership.user_id INTO v_org_a,v_admin_a
  FROM public.organizations organization_row
  JOIN public.organization_memberships membership ON membership.organization_id=organization_row.id
  WHERE membership.organization_role='ORG_ADMIN' AND membership.status='ACTIVE'
  ORDER BY organization_row.legacy_company_id LIMIT 1;
  SELECT membership.organization_id,membership.user_id INTO v_org_b,v_user_b
  FROM public.organization_memberships membership
  WHERE membership.organization_id<>v_org_a AND membership.status='ACTIVE'
  ORDER BY membership.organization_id,membership.user_id LIMIT 1;
  SELECT lower(email)INTO v_user_b_email FROM auth.users WHERE id=v_user_b;
  SELECT membership.user_id INTO v_member_a FROM public.organization_memberships membership
  WHERE membership.organization_id=v_org_a AND membership.organization_role='MEMBER'
    AND membership.status='ACTIVE' AND membership.access_role<>'Contractor'
  ORDER BY membership.user_id LIMIT 1;
  IF v_org_a IS NULL OR v_admin_a IS NULL OR v_org_b IS NULL OR v_user_b IS NULL OR v_member_a IS NULL THEN
    RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_FIXTURE_MISSING';END IF;
  PERFORM set_config('openday.cert.org_a',v_org_a::text,true);
  PERFORM set_config('openday.cert.admin_a',v_admin_a::text,true);
  PERFORM set_config('openday.cert.org_b',v_org_b::text,true);
  PERFORM set_config('openday.cert.user_b',v_user_b::text,true);
  PERFORM set_config('openday.cert.user_b_email',v_user_b_email,true);
  PERFORM set_config('openday.cert.member_a',v_member_a::text,true);
END
$organization_admin_fixtures$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('openday.cert.user_b'),true);
DO $organization_admin_cross_tenant_denied$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN PERFORM public.list_organization_users(current_setting('openday.cert.org_a')::uuid);
  EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=SQLERRM='ORGANIZATION_ADMIN_FORBIDDEN';END;
  IF NOT v_denied THEN RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_CROSS_TENANT_ALLOWED';END IF;
END
$organization_admin_cross_tenant_denied$;

SELECT set_config('request.jwt.claim.sub',current_setting('openday.cert.admin_a'),true);
DO $organization_admin_invite$
DECLARE v_email text:=current_setting('openday.cert.user_b_email');v_request uuid:=gen_random_uuid();v_result jsonb;v_invitation uuid;
BEGIN
  v_result:=public.prepare_organization_user_invitation(
    current_setting('openday.cert.org_a')::uuid,v_email,'Cross Tenant Colleague',
    'MEMBER','PM','Project Manager',v_request
  );
  v_invitation:=(v_result->>'invitationId')::uuid;
  IF(v_result->>'idempotentReplay')::boolean OR v_invitation IS NULL THEN
    RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_INVITE_FAILED';END IF;
  v_result:=public.prepare_organization_user_invitation(
    current_setting('openday.cert.org_a')::uuid,v_email,'Cross Tenant Colleague',
    'MEMBER','PM','Project Manager',v_request
  );
  IF(v_result->>'idempotentReplay')::boolean IS NOT TRUE OR
    (SELECT count(*) FROM public.organization_user_change_events
      WHERE client_request_id=v_request)<>1 THEN
    RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_IDEMPOTENCY_FAILED';END IF;
  PERFORM set_config('openday.cert.invitation',v_invitation::text,true);
END
$organization_admin_invite$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.mark_organization_user_invitation_sent(
  current_setting('openday.cert.invitation')::uuid
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('openday.cert.user_b'),true);
DO $organization_admin_accept$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.activate_my_organization_invitations();
  IF NOT EXISTS(SELECT 1 FROM public.organization_memberships
    WHERE organization_id=current_setting('openday.cert.org_a')::uuid
      AND user_id=current_setting('openday.cert.user_b')::uuid
      AND status='ACTIVE' AND organization_role='MEMBER'
      AND access_role='PM' AND job_role='Project Manager')THEN
    RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_ACCEPT_FAILED';END IF;
  IF jsonb_array_length(v_result->'acceptedOrganizationIds')<>1 THEN
    RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_ACCEPT_RESULT_FAILED';END IF;
END
$organization_admin_accept$;

SELECT set_config('request.jwt.claim.sub',current_setting('openday.cert.admin_a'),true);
DO $organization_admin_update_and_deactivate$
DECLARE v_user uuid:=current_setting('openday.cert.user_b')::uuid;
  v_org uuid:=current_setting('openday.cert.org_a')::uuid;v_revision integer;v_result jsonb;v_project bigint;
  v_conflict boolean:=false;
BEGIN
  SELECT revision INTO v_revision FROM public.organization_memberships
  WHERE organization_id=v_org AND user_id=v_user;
  v_result:=public.update_organization_user(v_org,v_user,'Updated Colleague','MEMBER',
    'Consultant','Store Designer',v_revision,gen_random_uuid());
  IF(v_result->>'revision')::integer<>v_revision+1 THEN
    RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_UPDATE_FAILED';END IF;
  SELECT id INTO v_project FROM public.projects WHERE organization_id=v_org ORDER BY id LIMIT 1;
  IF v_project IS NULL OR NOT jsonb_path_exists(public.get_project_team_foundation(v_project),
    '$.availableUsers[*] ? (@.userId == $user)',jsonb_build_object('user',v_user::text))THEN
    RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_MULTI_ORG_TEAM_CANDIDATE_MISSING';END IF;
  BEGIN
    PERFORM public.update_organization_user(v_org,v_user,'Stale','MEMBER',
      'PM','Project Manager',v_revision,gen_random_uuid());
  EXCEPTION WHEN SQLSTATE '40001' THEN v_conflict:=true;END;
  IF NOT v_conflict THEN RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_REVISION_NOT_ENFORCED';END IF;
  v_revision:=v_revision+1;
  v_result:=public.deactivate_organization_user(v_org,v_user,v_revision,gen_random_uuid());
  IF v_result->>'status'<>'INACTIVE' OR EXISTS(SELECT 1 FROM public.organization_memberships
    WHERE organization_id=v_org AND user_id=v_user AND status='ACTIVE')THEN
    RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_DEACTIVATE_FAILED';END IF;
  IF jsonb_array_length(public.list_organization_users(v_org)->'users')<1 THEN
    RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_LIST_FAILED';END IF;
END
$organization_admin_update_and_deactivate$;

DO $organization_admin_self_denied$
DECLARE v_revision integer;v_denied boolean:=false;
BEGIN
  SELECT revision INTO v_revision FROM public.organization_memberships
  WHERE organization_id=current_setting('openday.cert.org_a')::uuid
    AND user_id=current_setting('openday.cert.admin_a')::uuid;
  BEGIN PERFORM public.deactivate_organization_user(
    current_setting('openday.cert.org_a')::uuid,current_setting('openday.cert.admin_a')::uuid,
    v_revision,gen_random_uuid());
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_denied:=SQLERRM='ORGANIZATION_ADMIN_CANNOT_DEACTIVATE_SELF';END;
  IF NOT v_denied THEN RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_SELF_DEACTIVATE_ALLOWED';END IF;
END
$organization_admin_self_denied$;

RESET ROLE;
DO $organization_admin_audit_immutable$
DECLARE v_immutable boolean:=false;
BEGIN
  BEGIN UPDATE public.organization_user_change_events SET new_data='{}';
  EXCEPTION WHEN SQLSTATE '55000' THEN v_immutable:=true;END;
  IF NOT v_immutable THEN RAISE EXCEPTION 'ORGANIZATION_ADMIN_155_AUDIT_MUTABLE';END IF;
END
$organization_admin_audit_immutable$;

ROLLBACK;
