-- Local database certification for 147_security_advisor_hardening.sql.
BEGIN;

DO $security_147_certification$
DECLARE
  v_signature text;
  v_function_name text;
  v_expected_setting text;
  v_trigger_count integer;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
     WHERE migration_id = '147_security_advisor_hardening'
       AND sequence_number = 147
       AND filename = '147_security_advisor_hardening.sql'
       AND sha256 = 'a3dcd7a577a2035b2863bc73a1a50711e2c93a705e3a201a0e6f8d31ca6a60c8'
  ) THEN
    RAISE EXCEPTION 'SECURITY_147_CERT_LEDGER_MISMATCH';
  END IF;

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
      RAISE EXCEPTION 'SECURITY_147_CERT_EXECUTE_LEAK: %', v_signature;
    END IF;
  END LOOP;

  FOR v_function_name, v_expected_setting IN
    SELECT * FROM (VALUES
      ('fn_audit_log', 'search_path=pg_catalog, public'),
      ('fn_set_updated_at', 'search_path=pg_catalog'),
      ('prevent_snag_event_mutation', 'search_path=pg_catalog'),
      ('prevent_scope_mutation_during_review', 'search_path=pg_catalog, public'),
      ('prevent_schedule_version_task_mutation', 'search_path=pg_catalog')
    ) expected(function_name, setting)
  LOOP
    IF NOT EXISTS(
      SELECT 1 FROM pg_proc procedure_row
      JOIN pg_namespace namespace_row ON namespace_row.oid = procedure_row.pronamespace
      WHERE namespace_row.nspname = 'public'
        AND procedure_row.proname = v_function_name
        AND procedure_row.proconfig @> ARRAY[v_expected_setting]
    ) THEN
      RAISE EXCEPTION 'SECURITY_147_CERT_SEARCH_PATH_MISMATCH: %', v_function_name;
    END IF;

    SELECT count(*) INTO v_trigger_count
      FROM pg_trigger trigger_row
      JOIN pg_proc procedure_row ON procedure_row.oid = trigger_row.tgfoid
      JOIN pg_namespace namespace_row ON namespace_row.oid = procedure_row.pronamespace
     WHERE namespace_row.nspname = 'public'
       AND procedure_row.proname = v_function_name
       AND NOT trigger_row.tgisinternal;
    IF v_trigger_count = 0 THEN
      RAISE EXCEPTION 'SECURITY_147_CERT_TRIGGER_ATTACHMENT_MISSING: %', v_function_name;
    END IF;
  END LOOP;
END
$security_147_certification$;

ROLLBACK;
