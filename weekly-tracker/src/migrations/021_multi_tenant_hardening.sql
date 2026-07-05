-- 021_multi_tenant_hardening.sql
-- P1.5: close two cross-company blast-radius gaps left after 020's
-- company-scoped RLS pass.
--
-- Gap 1 — invite_contractor() cross-company profile takeover:
--   Any Admin/PM (checked only by role, not company) could call
--   invite_contractor('someone@othercompany.com') and the function would
--   unconditionally UPDATE that profile's role to 'Contractor' if a
--   matching auth.users row existed — with NO check that the target
--   profile belongs to the caller's company. A PM in Company A could
--   accidentally (or deliberately) demote an Admin/PM in Company B to
--   Contractor just by knowing their email. Fixed: the profile UPDATE now
--   only proceeds if the caller is the explicit global admin
--   (company_id IS NULL), the target profile has no company assigned yet
--   (legacy/unscoped row), or the target's company_id matches the
--   caller's — mirroring the exact three-way check can_write_project()
--   already uses for projects.
--
-- Gap 2 — templates table writes allowed for ANY admin, not just the
--   global admin:
--   public.templates has no company_id column (010_rls_by_roles.sql
--   documents it as "no project_id — global config table", shared by every
--   company's Gantt generation via templatesApi.fetchActiveTemplate). Its
--   010 write policies check only get_my_role() = 'admin', so a
--   company-scoped Admin (e.g. Company A's admin) could edit or delete the
--   shared template every other company's project creation also reads
--   from. Fixed: writes now require the explicit global admin.
--   Reads are unchanged (every authenticated role still needs SELECT).
--
-- Rollback:
--   Re-run src/migrations/020_rls_company_role_hardening.sql's
--   invite_contractor definition and 010_rls_by_roles.sql's
--   templates_insert/update/delete policies to restore the pre-021 behavior:
--     DROP FUNCTION IF EXISTS public.is_global_admin();
--   then re-apply the CREATE POLICY statements from 010_rls_by_roles.sql
--   for templates_insert/templates_update/templates_delete.

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(role) = 'admin' AND company_id IS NULL
  FROM public.profiles
  WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.invite_contractor(contractor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  caller_role text;
  caller_company text;
  target_company text;
BEGIN
  SELECT lower(role), company_id
    INTO caller_role, caller_company
  FROM public.profiles
  WHERE id = auth.uid();

  IF caller_role NOT IN ('admin', 'pm') THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT p.company_id
    INTO target_company
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(u.email) = lower(contractor_email);

  -- FOUND is only true here if the target profile already exists; a brand
  -- new invite (no matching profile yet) always proceeds — there is no
  -- cross-company row to protect.
  IF FOUND AND NOT (
    (caller_role = 'admin' AND caller_company IS NULL)
    OR target_company IS NULL
    OR caller_company = target_company
  ) THEN
    RETURN jsonb_build_object('error', 'Not authorized for this company');
  END IF;

  INSERT INTO public.pending_invites (email, role)
  VALUES (contractor_email, 'Contractor')
  ON CONFLICT (email) DO UPDATE SET role = 'Contractor';

  UPDATE public.profiles p
  SET role = 'Contractor'
  FROM auth.users u
  WHERE p.id = u.id
    AND lower(u.email) = lower(contractor_email);

  RETURN jsonb_build_object('success', true);
END;
$function$;

DROP POLICY IF EXISTS "templates_insert" ON public.templates;
DROP POLICY IF EXISTS "templates_update" ON public.templates;
DROP POLICY IF EXISTS "templates_delete" ON public.templates;

CREATE POLICY "templates_insert"
  ON public.templates FOR INSERT TO authenticated
  WITH CHECK ( public.is_global_admin() );

CREATE POLICY "templates_update"
  ON public.templates FOR UPDATE TO authenticated
  USING     ( public.is_global_admin() )
  WITH CHECK ( public.is_global_admin() );

CREATE POLICY "templates_delete"
  ON public.templates FOR DELETE TO authenticated
  USING ( public.is_global_admin() );
