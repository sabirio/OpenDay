-- 146_security_definer_execute_hardening.sql
-- Close legacy default-PUBLIC EXECUTE grants on SECURITY DEFINER helpers.
-- RLS policies and authenticated RPC callers retain only the execution
-- privileges they require; client roles never execute the DDL event trigger.

BEGIN;

REVOKE ALL ON FUNCTION public.auth_user_role(),
  public.can_access_audit_log(text,text),
  public.can_admin_project(bigint),
  public.current_company_id(),
  public.get_my_role(),
  public.invite_contractor(text),
  public.is_global_admin()
  FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.auth_user_role(),
  public.can_access_audit_log(text,text),
  public.can_admin_project(bigint),
  public.current_company_id(),
  public.get_my_role(),
  public.invite_contractor(text),
  public.is_global_admin()
  TO authenticated;

REVOKE ALL ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
