BEGIN;

DO $$ BEGIN
  IF to_regprocedure('public.update_admin_user(uuid,text,text,integer[],uuid)')IS NULL THEN
    RAISE EXCEPTION 'Legacy command disappeared before historical certification';END IF;
  IF has_function_privilege('authenticated','public.update_admin_user(uuid,text,text,integer[],uuid)','EXECUTE')
    OR has_function_privilege('anon','public.update_admin_user(uuid,text,text,integer[],uuid)','EXECUTE')THEN
    RAISE EXCEPTION 'Legacy admin user command remains browser-callable';END IF;
  IF NOT has_function_privilege('authenticated','public.update_admin_user_profile(uuid,text,text,text,integer[],uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.remove_admin_user(uuid,uuid)','EXECUTE')THEN
    RAISE EXCEPTION 'Replacement user directory commands are unavailable';END IF;
END $$;

ROLLBACK;
