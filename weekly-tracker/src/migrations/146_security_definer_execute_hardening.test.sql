BEGIN;

DO $$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.auth_user_role()',
    'public.can_access_audit_log(text,text)',
    'public.can_admin_project(bigint)',
    'public.current_company_id()',
    'public.get_my_role()',
    'public.invite_contractor(text)',
    'public.is_global_admin()'
  ] LOOP
    IF has_function_privilege('anon',v_signature,'EXECUTE')
      OR has_function_privilege('service_role',v_signature,'EXECUTE')
      OR NOT has_function_privilege('authenticated',v_signature,'EXECUTE')THEN
      RAISE EXCEPTION 'Incorrect least-privilege EXECUTE ACL for %',v_signature;
    END IF;
  END LOOP;

  IF has_function_privilege('anon','public.rls_auto_enable()','EXECUTE')
    OR has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE')
    OR has_function_privilege('service_role','public.rls_auto_enable()','EXECUTE')THEN
    RAISE EXCEPTION 'RLS event trigger function is client-executable';
  END IF;
END;
$$;

ROLLBACK;
