-- 013_auth_user_role.sql
-- Wave 2 tail: auth_user_role() helper used by invite_contractor RPC.
-- Previously existed only in live DB.

CREATE OR REPLACE FUNCTION public.auth_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select role from public.profiles where id = auth.uid()
$function$;
