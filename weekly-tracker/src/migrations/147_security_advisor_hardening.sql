-- 147_security_advisor_hardening.sql
-- Forward-only hardening for legacy trigger functions reported by the
-- Supabase security advisor after the 059-146 catch-up certification.

BEGIN;

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

COMMIT;
