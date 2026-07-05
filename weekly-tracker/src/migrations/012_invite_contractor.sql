-- 012_invite_contractor.sql
-- Wave 2: capture live invite_contractor RPC from Supabase.
--
-- Source of truth: pg_get_functiondef(public.invite_contractor(text))
-- provided from the live database.
--
-- Dependency note:
--   The live function calls public.auth_user_role(). That helper is not
--   redefined here; this migration records invite_contractor exactly as it
--   exists in the live database.

CREATE OR REPLACE FUNCTION public.invite_contractor(contractor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  caller_role text;
begin
  caller_role := public.auth_user_role();
  if caller_role not in ('Admin', 'PM') then
    return jsonb_build_object('error', 'Not authorized');
  end if;

  -- Register email in advance.
  insert into public.pending_invites (email, role)
  values (contractor_email, 'Contractor')
  on conflict (email) do update set role = 'Contractor';

  -- If the user already exists, update the role immediately.
  update public.profiles p
  set role = 'Contractor'
  from auth.users u
  where p.id = u.id and lower(u.email) = lower(contractor_email);

  return jsonb_build_object('success', true);
end;
$function$;
