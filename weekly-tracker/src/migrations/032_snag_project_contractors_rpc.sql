-- Phase 2: narrow contractor lookup for the Snag assignment UI.
-- Profiles RLS remains unchanged; callers receive only contractors who can access
-- the requested project in the caller's company.
CREATE OR REPLACE FUNCTION public.list_snag_project_contractors(p_project_id bigint)
RETURNS TABLE(id uuid, name text, email text, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_company_id text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  SELECT lower(p.role), p.company_id INTO v_role, v_company_id FROM public.profiles p WHERE p.id=auth.uid();
  IF v_role NOT IN ('admin','pm') OR NOT public.can_access_project(p_project_id) THEN
    RAISE EXCEPTION 'PROJECT_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT p.id,p.name,p.email,p.role
    FROM public.profiles p
    WHERE lower(p.role)='contractor'
      AND p.company_id=v_company_id
      AND p_project_id=ANY(COALESCE(p.assigned_projects,'{}'::integer[])::bigint[])
    ORDER BY p.name,p.email,p.id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_snag_project_contractors(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_snag_project_contractors(bigint) TO authenticated;
