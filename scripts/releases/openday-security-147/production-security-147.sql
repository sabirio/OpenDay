-- AUTO-GENERATED. DO NOT EDIT.

-- OpenDay production security package

-- Package: security-147

-- Approved Supabase project ref: szgbkeqornkdngoegyso

-- Migration count: 1

BEGIN;

SET LOCAL lock_timeout = '10s';

SET LOCAL statement_timeout = '10min';

DO $openday_security_147_preflight$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_147_REQUIRES_POSTGRES';
  END IF;
  IF to_regclass('public.schema_migration_ledger') IS NULL THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_147_LEDGER_MISSING';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
     WHERE migration_id='146_security_definer_execute_hardening'
       AND sequence_number=146
       AND filename='146_security_definer_execute_hardening.sql'
       AND sha256='4d368ed91cc69df977226152724beb80288623c35dfb0bc7f99e5f3fb37bf5eb'
  ) THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_147_PREVIOUS_MIGRATION_MISMATCH';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
     WHERE migration_id='147_security_advisor_hardening' OR sequence_number=147
  ) THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_147_ALREADY_OR_PARTIALLY_APPLIED';
  END IF;

  IF to_regprocedure('public.fn_audit_log()') IS NULL
     OR to_regprocedure('public.fn_set_updated_at()') IS NULL
     OR to_regprocedure('public.prevent_snag_event_mutation()') IS NULL
     OR to_regprocedure('public.prevent_scope_mutation_during_review()') IS NULL
     OR to_regprocedure('public.prevent_schedule_version_task_mutation()') IS NULL THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_147_PREFLIGHT_REQUIRED_FUNCTION_MISSING';
  END IF;
END
$openday_security_147_preflight$;

-- MIGRATION 147_security_advisor_hardening.sql SHA256 a3dcd7a577a2035b2863bc73a1a50711e2c93a705e3a201a0e6f8d31ca6a60c8
-- fn_audit_log is trigger-only and SECURITY DEFINER. Pin its lookup path and
-- remove every Data API role's direct RPC execution privilege.
ALTER FUNCTION public.fn_audit_log()
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.fn_audit_log()
  FROM PUBLIC, anon, authenticated, service_role;

-- These functions are also trigger-only. A fixed search_path removes the
-- session-controlled resolution surface and direct execution is unnecessary.
ALTER FUNCTION public.fn_set_updated_at()
  SET search_path = pg_catalog;
ALTER FUNCTION public.prevent_snag_event_mutation()
  SET search_path = pg_catalog;
ALTER FUNCTION public.prevent_scope_mutation_during_review()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.prevent_schedule_version_task_mutation()
  SET search_path = pg_catalog;

REVOKE ALL ON FUNCTION
  public.fn_set_updated_at(),
  public.prevent_snag_event_mutation(),
  public.prevent_scope_mutation_during_review(),
  public.prevent_schedule_version_task_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

DO $openday_security_147$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.fn_audit_log()',
    'public.fn_set_updated_at()',
    'public.prevent_snag_event_mutation()',
    'public.prevent_scope_mutation_during_review()',
    'public.prevent_schedule_version_task_mutation()'
  ] LOOP
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
       OR has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'SECURITY_147_TRIGGER_FUNCTION_ACL_FAILED: %', v_signature;
    END IF;
  END LOOP;

  IF EXISTS(
    SELECT 1
      FROM pg_proc procedure_row
      JOIN pg_namespace namespace_row ON namespace_row.oid = procedure_row.pronamespace
     WHERE namespace_row.nspname = 'public'
       AND procedure_row.proname IN (
         'fn_audit_log',
         'fn_set_updated_at',
         'prevent_snag_event_mutation',
         'prevent_scope_mutation_during_review',
         'prevent_schedule_version_task_mutation'
       )
       AND NOT EXISTS(
         SELECT 1 FROM unnest(COALESCE(procedure_row.proconfig, ARRAY[]::text[])) setting
          WHERE setting LIKE 'search_path=%'
       )
  ) THEN
    RAISE EXCEPTION 'SECURITY_147_TRIGGER_FUNCTION_SEARCH_PATH_FAILED';
  END IF;
END
$openday_security_147$;

SELECT private.register_schema_migration('147_security_advisor_hardening', 147, '147_security_advisor_hardening.sql', 'a3dcd7a577a2035b2863bc73a1a50711e2c93a705e3a201a0e6f8d31ca6a60c8');

DO $openday_security_147_postflight$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
     WHERE migration_id='147_security_advisor_hardening'
       AND sequence_number=147
       AND filename='147_security_advisor_hardening.sql'
       AND sha256='a3dcd7a577a2035b2863bc73a1a50711e2c93a705e3a201a0e6f8d31ca6a60c8'
  ) THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_147_LEDGER_MISMATCH';
  END IF;

  IF to_regprocedure('public.fn_audit_log()') IS NULL
     OR to_regprocedure('public.fn_set_updated_at()') IS NULL
     OR to_regprocedure('public.prevent_snag_event_mutation()') IS NULL
     OR to_regprocedure('public.prevent_scope_mutation_during_review()') IS NULL
     OR to_regprocedure('public.prevent_schedule_version_task_mutation()') IS NULL THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_147_POSTFLIGHT_REQUIRED_FUNCTION_MISSING';
  END IF;
END
$openday_security_147_postflight$;

COMMIT;
