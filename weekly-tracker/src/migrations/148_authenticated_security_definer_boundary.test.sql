-- Local database certification for 148_authenticated_security_definer_boundary.sql.
BEGIN;

DO $security_148_certification$
DECLARE
  v_signature text;
  v_definition text;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
     WHERE migration_id = '148_authenticated_security_definer_boundary'
       AND sequence_number = 148
       AND filename = '148_authenticated_security_definer_boundary.sql'
       AND sha256 = '3b6b20382f02c39bd7664143d92313c61b4a1a13ef3045d8f6c54369d8a5dc29'
  ) THEN
    RAISE EXCEPTION 'SECURITY_148_CERT_LEDGER_MISMATCH';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.next_snag_number(bigint)',
    'public.contractor_schedule_lifecycle_status(bigint)',
    'public.is_active_project_member(bigint,uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
       OR has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'SECURITY_148_CERT_INTERNAL_HELPER_EXPOSED: %', v_signature;
    END IF;
  END LOOP;

  IF has_function_privilege('anon',
       'public.get_contractor_schedule_lifecycle_status(bigint)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'public.get_contractor_schedule_lifecycle_status(bigint)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.get_contractor_schedule_lifecycle_status(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY_148_CERT_SCHEDULE_RPC_ACL_MISMATCH';
  END IF;

  SELECT pg_get_functiondef(
    'public.get_contractor_schedule_lifecycle_status(bigint)'::regprocedure
  ) INTO v_definition;
  IF v_definition NOT LIKE '%SET search_path TO ''pg_catalog'', ''public'', ''pg_temp''%'
     OR v_definition NOT LIKE '%auth.uid() IS NULL%'
     OR v_definition NOT LIKE '%can_access_schedule_submissions(p_project_id) IS NOT TRUE%'
     OR v_definition NOT LIKE '%contractor_schedule_lifecycle_status(p_project_id)%' THEN
    RAISE EXCEPTION 'SECURITY_148_CERT_SCHEDULE_RPC_DEFINITION_MISMATCH';
  END IF;

  BEGIN
    PERFORM public.get_contractor_schedule_lifecycle_status(-1);
    RAISE EXCEPTION 'SECURITY_148_CERT_UNAUTHENTICATED_CALL_SUCCEEDED';
  EXCEPTION
    WHEN SQLSTATE '28000' THEN NULL;
  END;
END
$security_148_certification$;

ROLLBACK;
