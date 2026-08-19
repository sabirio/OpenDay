-- AUTO-GENERATED. DO NOT EDIT.

-- OpenDay production security package

-- Package: security-148

-- Approved Supabase project ref: szgbkeqornkdngoegyso

-- Migration count: 1

BEGIN;

SET LOCAL lock_timeout = '10s';

SET LOCAL statement_timeout = '10min';

DO $openday_security_148_preflight$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_148_REQUIRES_POSTGRES';
  END IF;
  IF to_regclass('public.schema_migration_ledger') IS NULL THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_148_LEDGER_MISSING';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
     WHERE migration_id='147_security_advisor_hardening'
       AND sequence_number=147
       AND filename='147_security_advisor_hardening.sql'
       AND sha256='a3dcd7a577a2035b2863bc73a1a50711e2c93a705e3a201a0e6f8d31ca6a60c8'
  ) THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_148_PREVIOUS_MIGRATION_MISMATCH';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
     WHERE migration_id='148_authenticated_security_definer_boundary' OR sequence_number=148
  ) THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_148_ALREADY_OR_PARTIALLY_APPLIED';
  END IF;

  IF to_regprocedure('public.next_snag_number(bigint)') IS NULL
     OR to_regprocedure('public.contractor_schedule_lifecycle_status(bigint)') IS NULL
     OR to_regprocedure('public.is_active_project_member(bigint,uuid)') IS NULL
     OR to_regprocedure('public.can_access_schedule_submissions(bigint)') IS NULL THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_148_PREFLIGHT_REQUIRED_FUNCTION_MISSING';
  END IF;
END
$openday_security_148_preflight$;

-- MIGRATION 148_authenticated_security_definer_boundary.sql SHA256 3b6b20382f02c39bd7664143d92313c61b4a1a13ef3045d8f6c54369d8a5dc29
CREATE OR REPLACE FUNCTION public.get_contractor_schedule_lifecycle_status(
  p_project_id bigint
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF public.can_access_schedule_submissions(p_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized to view this project schedule'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.contractor_schedule_lifecycle_status(p_project_id);
END;
$$;

-- These functions remain available to owner-executed triggers and nested
-- SECURITY DEFINER commands, but they are not standalone client RPCs.
REVOKE ALL ON FUNCTION
  public.next_snag_number(bigint),
  public.contractor_schedule_lifecycle_status(bigint),
  public.is_active_project_member(bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_contractor_schedule_lifecycle_status(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_contractor_schedule_lifecycle_status(bigint)
  TO authenticated;

DO $openday_security_148$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.next_snag_number(bigint)',
    'public.contractor_schedule_lifecycle_status(bigint)',
    'public.is_active_project_member(bigint,uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
       OR has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'SECURITY_148_INTERNAL_HELPER_ACL_FAILED: %', v_signature;
    END IF;
  END LOOP;

  IF has_function_privilege('anon',
       'public.get_contractor_schedule_lifecycle_status(bigint)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'public.get_contractor_schedule_lifecycle_status(bigint)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.get_contractor_schedule_lifecycle_status(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY_148_SCHEDULE_RPC_ACL_FAILED';
  END IF;
END
$openday_security_148$;

SELECT private.register_schema_migration('148_authenticated_security_definer_boundary', 148, '148_authenticated_security_definer_boundary.sql', '3b6b20382f02c39bd7664143d92313c61b4a1a13ef3045d8f6c54369d8a5dc29');

DO $openday_security_148_postflight$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
     WHERE migration_id='148_authenticated_security_definer_boundary'
       AND sequence_number=148
       AND filename='148_authenticated_security_definer_boundary.sql'
       AND sha256='3b6b20382f02c39bd7664143d92313c61b4a1a13ef3045d8f6c54369d8a5dc29'
  ) THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_148_LEDGER_MISMATCH';
  END IF;

  IF to_regprocedure('public.get_contractor_schedule_lifecycle_status(bigint)') IS NULL THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_148_POSTFLIGHT_SAFE_RPC_MISSING';
  END IF;
  IF has_function_privilege('authenticated', 'public.next_snag_number(bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.contractor_schedule_lifecycle_status(bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.is_active_project_member(bigint,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_contractor_schedule_lifecycle_status(bigint)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_contractor_schedule_lifecycle_status(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_148_POSTFLIGHT_ACL_MISMATCH';
  END IF;
END
$openday_security_148_postflight$;

COMMIT;
