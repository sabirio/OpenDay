-- 148_authenticated_security_definer_boundary.sql
-- Separate internal SECURITY DEFINER helpers from the authenticated Data API.
-- The schedule UI keeps a dedicated, authorization-checked read RPC.

BEGIN;

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

COMMIT;
