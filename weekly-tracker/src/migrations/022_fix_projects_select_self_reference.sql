-- 022_fix_projects_select_self_reference.sql
-- Fix: every project creation was failing with
--   "new row violates row-level security policy for table \"projects\""
--   (Postgres error 42501)
-- even for a global Admin (role='Admin', company_id NULL) who should always
-- be allowed to create and read projects.
--
-- Root cause:
--   020_rls_company_role_hardening.sql's "projects_select" policy is
--   `USING (public.can_access_project(id))`, and can_access_project(p_project_id)
--   resolves the row's company by running its OWN subquery:
--     SELECT company_id INTO v_project_company FROM public.projects WHERE id = p_project_id;
--   supabase-js always does `.insert(...).select().single()` (PostgREST
--   `Prefer: return=representation`), so every INSERT into projects is
--   immediately followed by a RETURNING clause, which Postgres gates through
--   the SELECT policy for the just-inserted row. That row was created by the
--   SAME command that is still executing — the subquery inside
--   can_access_project() runs under a snapshot taken before the INSERT, so it
--   cannot see the new row, hits "NOT FOUND", and returns false. The INSERT's
--   own WITH CHECK (public.can_create_project(company_id)) passes fine
--   first (confirmed: a plain INSERT with no RETURNING succeeds) — it never
--   re-queries the table because Postgres passes it the row's column value
--   directly. Only the self-referencing SELECT-policy lookup breaks, and only
--   for a same-transaction row (RETURNING), which is exactly what every
--   project-creation call does — so this affected 100% of project creations
--   for every role, not a specific account.
--
--   `can_access_project(project_id)` itself is NOT changed here and is still
--   correct for every OTHER policy that calls it (contractor_reports,
--   site_visits, gantt_tasks, progress_history, site_visit_wps,
--   site_visit_discrepancies, storage photo policies, etc.) — those all look
--   up a *different*, already-committed `projects` row via a foreign key
--   (`project_id`), which is never the row being inserted in that same
--   command, so they don't hit this visibility issue.
--
-- Fix: a dedicated function for the projects table's own SELECT policy that
-- takes the row's `company_id` as a direct parameter (Postgres supplies the
-- new row's column values directly, the same way can_create_project(company_id)
-- already does) instead of re-querying `public.projects` by id. Same
-- role/company/contractor-assignment logic as can_access_project(), just
-- without the self-referencing subquery.
--
-- Rollback:
--   DROP POLICY IF EXISTS "projects_select" ON public.projects;
--   CREATE POLICY "projects_select"
--     ON public.projects FOR SELECT TO authenticated
--     USING (public.can_access_project(id));
--   DROP FUNCTION IF EXISTS public.can_view_own_project_row(bigint, text);

CREATE OR REPLACE FUNCTION public.can_view_own_project_row(p_project_id bigint, p_company_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_profile_company text;
  v_assigned_projects integer[] := '{}'::integer[];
BEGIN
  IF auth.uid() IS NULL OR p_project_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT lower(role), company_id, COALESCE(assigned_projects, '{}'::integer[])
    INTO v_role, v_profile_company, v_assigned_projects
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'admin' AND v_profile_company IS NULL THEN
    RETURN true;
  END IF;

  IF v_role IN ('admin', 'pm', 'viewer') THEN
    RETURN p_company_id IS NULL OR v_profile_company = p_company_id;
  END IF;

  IF v_role = 'contractor' THEN
    RETURN p_project_id = ANY(v_assigned_projects::bigint[])
      AND (
        p_company_id IS NULL
        OR v_profile_company IS NULL
        OR v_profile_company = p_company_id
      );
  END IF;

  RETURN false;
END;
$$;

DROP POLICY IF EXISTS "projects_select" ON public.projects;

CREATE POLICY "projects_select"
  ON public.projects FOR SELECT TO authenticated
  USING (public.can_view_own_project_row(id, company_id));
