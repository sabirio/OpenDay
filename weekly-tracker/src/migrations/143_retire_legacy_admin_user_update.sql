-- 143_retire_legacy_admin_user_update.sql
-- The legacy command mixes authorization role with profile properties.
-- Keep the function for historical database certification, but make it
-- unavailable to browser clients now that 142 owns the user directory API.

BEGIN;

REVOKE ALL ON FUNCTION public.update_admin_user(uuid,text,text,integer[],uuid)
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
