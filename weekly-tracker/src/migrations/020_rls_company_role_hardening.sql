-- 020_rls_company_role_hardening.sql
-- P0.4: company-aware RLS and SECURITY DEFINER authorization audit.
--
-- Purpose:
-- 010_rls_by_roles.sql established role-based RLS, but Admin/PM/Viewer read
-- policies were portfolio-wide. This migration keeps the same product model
-- and hardens it for multi-company use:
--   - Admin with NULL profiles.company_id is the explicit global admin.
--   - Admin/PM/Viewer with company_id see/write only rows for that company.
--   - Contractor can read only assigned projects and submit only through the
--     approved submit_contractor_report() RPC; direct contractor table writes
--     are blocked.
--   - Storage photo reads are scoped by the project id in the object path.
--
-- Rollback:
--   Re-run src/migrations/010_rls_by_roles.sql to restore the previous
--   role-only policies, then optionally:
--     DROP FUNCTION IF EXISTS public.can_access_audit_log(text, text);
--     DROP FUNCTION IF EXISTS public.can_admin_project(bigint);
--     DROP FUNCTION IF EXISTS public.can_write_project(bigint);
--     DROP FUNCTION IF EXISTS public.can_create_project(text);
--     DROP FUNCTION IF EXISTS public.can_access_project(bigint);
--     DROP FUNCTION IF EXISTS public.can_admin_company(text);
--     DROP FUNCTION IF EXISTS public.current_company_id();

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(role)
  FROM public.profiles
  WHERE id = auth.uid()
    AND auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
    AND auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.can_admin_company(p_company_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_company_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT lower(role), company_id
    INTO v_role, v_company_id
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN v_role = 'admin'
    AND (
      v_company_id IS NULL        -- explicit global admin
      OR p_company_id IS NULL     -- unscoped/single-company legacy row
      OR v_company_id = p_company_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_create_project(p_company_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_company_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT lower(role), company_id
    INTO v_role, v_company_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role = 'admin' AND v_company_id IS NULL THEN
    RETURN true;
  END IF;

  RETURN v_role IN ('admin', 'pm')
    AND (
      p_company_id IS NULL
      OR v_company_id = p_company_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_project(p_project_id bigint)
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
  v_project_company text;
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

  SELECT company_id
    INTO v_project_company
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_role = 'admin' AND v_profile_company IS NULL THEN
    RETURN true;
  END IF;

  IF v_role IN ('admin', 'pm', 'viewer') THEN
    RETURN v_project_company IS NULL OR v_profile_company = v_project_company;
  END IF;

  IF v_role = 'contractor' THEN
    RETURN p_project_id = ANY(v_assigned_projects::bigint[])
      AND (
        v_project_company IS NULL
        OR v_profile_company IS NULL
        OR v_profile_company = v_project_company
      );
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_write_project(p_project_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_profile_company text;
  v_project_company text;
BEGIN
  IF auth.uid() IS NULL OR p_project_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT lower(role), company_id
    INTO v_role, v_profile_company
  FROM public.profiles
  WHERE id = auth.uid();

  SELECT company_id
    INTO v_project_company
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_role = 'admin' AND v_profile_company IS NULL THEN
    RETURN true;
  END IF;

  RETURN v_role IN ('admin', 'pm')
    AND (
      v_project_company IS NULL
      OR v_profile_company = v_project_company
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_admin_project(p_project_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_company text;
BEGIN
  IF auth.uid() IS NULL OR p_project_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT company_id
    INTO v_project_company
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN public.can_admin_company(v_project_company);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_audit_log(p_table_name text, p_record_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF p_table_name = 'projects' AND p_record_id ~ '^[0-9]+$' THEN
    RETURN public.can_access_project(p_record_id::bigint);
  END IF;

  IF p_table_name = 'contractor_reports' AND p_record_id ~ '^[0-9]+$' THEN
    SELECT project_id INTO v_project_id
    FROM public.contractor_reports
    WHERE id = p_record_id::bigint;
    RETURN public.can_access_project(v_project_id);
  END IF;

  IF p_table_name = 'site_visits' AND p_record_id ~ '^[0-9]+$' THEN
    SELECT project_id INTO v_project_id
    FROM public.site_visits
    WHERE id = p_record_id::bigint;
    RETURN public.can_access_project(v_project_id);
  END IF;

  RETURN public.get_my_role() = 'admin';
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_contractor(contractor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  caller_role text;
BEGIN
  caller_role := public.auth_user_role();
  IF caller_role NOT IN ('Admin', 'PM') THEN
    RETURN jsonb_build_object('error', 'Not authorized');
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

REVOKE ALL ON FUNCTION public.fn_audit_log() FROM PUBLIC;

-- Drop replaced policies from 010/015 so the narrower policies below are the
-- only active policies for these operations.
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

DROP POLICY IF EXISTS "projects_select" ON public.projects;
DROP POLICY IF EXISTS "projects_insert" ON public.projects;
DROP POLICY IF EXISTS "projects_update" ON public.projects;
DROP POLICY IF EXISTS "projects_delete" ON public.projects;

DROP POLICY IF EXISTS "reports_select" ON public.reports;
DROP POLICY IF EXISTS "reports_insert" ON public.reports;
DROP POLICY IF EXISTS "reports_update" ON public.reports;
DROP POLICY IF EXISTS "reports_delete" ON public.reports;

DROP POLICY IF EXISTS "site_visits_select" ON public.site_visits;
DROP POLICY IF EXISTS "site_visits_insert" ON public.site_visits;
DROP POLICY IF EXISTS "site_visits_update" ON public.site_visits;
DROP POLICY IF EXISTS "site_visits_delete" ON public.site_visits;

DROP POLICY IF EXISTS "gantt_tasks_select" ON public.project_gantt_tasks;
DROP POLICY IF EXISTS "gantt_tasks_insert" ON public.project_gantt_tasks;
DROP POLICY IF EXISTS "gantt_tasks_update" ON public.project_gantt_tasks;
DROP POLICY IF EXISTS "gantt_tasks_delete" ON public.project_gantt_tasks;

DROP POLICY IF EXISTS "contractor_reports_select" ON public.contractor_reports;
DROP POLICY IF EXISTS "contractor_reports_insert" ON public.contractor_reports;
DROP POLICY IF EXISTS "contractor_reports_update" ON public.contractor_reports;
DROP POLICY IF EXISTS "contractor_reports_delete" ON public.contractor_reports;

DROP POLICY IF EXISTS "contractor_report_wps_select" ON public.contractor_report_wps;
DROP POLICY IF EXISTS "contractor_report_wps_insert" ON public.contractor_report_wps;
DROP POLICY IF EXISTS "contractor_report_wps_update" ON public.contractor_report_wps;
DROP POLICY IF EXISTS "contractor_report_wps_delete" ON public.contractor_report_wps;

DROP POLICY IF EXISTS "site_visit_wps_select" ON public.site_visit_wps;
DROP POLICY IF EXISTS "site_visit_wps_insert" ON public.site_visit_wps;
DROP POLICY IF EXISTS "site_visit_wps_update" ON public.site_visit_wps;
DROP POLICY IF EXISTS "site_visit_wps_delete" ON public.site_visit_wps;

DROP POLICY IF EXISTS "site_visit_discrepancies_select" ON public.site_visit_discrepancies;
DROP POLICY IF EXISTS "site_visit_discrepancies_insert" ON public.site_visit_discrepancies;
DROP POLICY IF EXISTS "site_visit_discrepancies_update" ON public.site_visit_discrepancies;
DROP POLICY IF EXISTS "site_visit_discrepancies_delete" ON public.site_visit_discrepancies;

DROP POLICY IF EXISTS "progress_history_select" ON public.progress_history;
DROP POLICY IF EXISTS "progress_history_insert" ON public.progress_history;
DROP POLICY IF EXISTS "progress_history_update" ON public.progress_history;
DROP POLICY IF EXISTS "progress_history_delete" ON public.progress_history;

DROP POLICY IF EXISTS "authenticated can read audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_select" ON public.audit_log;

DROP POLICY IF EXISTS "authenticated can upload site photos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated can read site photos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated can delete own photos" ON storage.objects;

CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.can_admin_company(company_id));

CREATE POLICY "profiles_insert"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.can_admin_company(company_id));

CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.can_admin_company(company_id))
  WITH CHECK (public.can_admin_company(company_id));

CREATE POLICY "profiles_delete"
  ON public.profiles FOR DELETE TO authenticated
  USING (public.can_admin_company(company_id));

CREATE POLICY "projects_select"
  ON public.projects FOR SELECT TO authenticated
  USING (public.can_access_project(id));

CREATE POLICY "projects_insert"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.can_create_project(company_id));

CREATE POLICY "projects_update"
  ON public.projects FOR UPDATE TO authenticated
  USING (public.can_write_project(id))
  WITH CHECK (public.can_create_project(company_id));

CREATE POLICY "projects_delete"
  ON public.projects FOR DELETE TO authenticated
  USING (public.can_admin_company(company_id));

CREATE POLICY "reports_select"
  ON public.reports FOR SELECT TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "reports_insert"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "reports_update"
  ON public.reports FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "reports_delete"
  ON public.reports FOR DELETE TO authenticated
  USING (public.can_admin_project(project_id));

CREATE POLICY "site_visits_select"
  ON public.site_visits FOR SELECT TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "site_visits_insert"
  ON public.site_visits FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "site_visits_update"
  ON public.site_visits FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "site_visits_delete"
  ON public.site_visits FOR DELETE TO authenticated
  USING (public.can_admin_project(project_id));

CREATE POLICY "gantt_tasks_select"
  ON public.project_gantt_tasks FOR SELECT TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "gantt_tasks_insert"
  ON public.project_gantt_tasks FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "gantt_tasks_update"
  ON public.project_gantt_tasks FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "gantt_tasks_delete"
  ON public.project_gantt_tasks FOR DELETE TO authenticated
  USING (public.can_admin_project(project_id));

CREATE POLICY "contractor_reports_select"
  ON public.contractor_reports FOR SELECT TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "contractor_reports_insert"
  ON public.contractor_reports FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "contractor_reports_update"
  ON public.contractor_reports FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "contractor_reports_delete"
  ON public.contractor_reports FOR DELETE TO authenticated
  USING (public.can_admin_project(project_id));

CREATE POLICY "contractor_report_wps_select"
  ON public.contractor_report_wps FOR SELECT TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "contractor_report_wps_insert"
  ON public.contractor_report_wps FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "contractor_report_wps_update"
  ON public.contractor_report_wps FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "contractor_report_wps_delete"
  ON public.contractor_report_wps FOR DELETE TO authenticated
  USING (public.can_admin_project(project_id));

CREATE POLICY "site_visit_wps_select"
  ON public.site_visit_wps FOR SELECT TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "site_visit_wps_insert"
  ON public.site_visit_wps FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "site_visit_wps_update"
  ON public.site_visit_wps FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "site_visit_wps_delete"
  ON public.site_visit_wps FOR DELETE TO authenticated
  USING (public.can_admin_project(project_id));

CREATE POLICY "site_visit_discrepancies_select"
  ON public.site_visit_discrepancies FOR SELECT TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "site_visit_discrepancies_insert"
  ON public.site_visit_discrepancies FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "site_visit_discrepancies_update"
  ON public.site_visit_discrepancies FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "site_visit_discrepancies_delete"
  ON public.site_visit_discrepancies FOR DELETE TO authenticated
  USING (public.can_admin_project(project_id));

CREATE POLICY "progress_history_select"
  ON public.progress_history FOR SELECT TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "progress_history_insert"
  ON public.progress_history FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "progress_history_update"
  ON public.progress_history FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "progress_history_delete"
  ON public.progress_history FOR DELETE TO authenticated
  USING (public.can_admin_project(project_id));

CREATE POLICY "audit_log_select"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.can_access_audit_log(table_name, record_id));

CREATE POLICY "authenticated can upload site photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'site-photos'
  AND (storage.foldername(name))[1] ~ '^[0-9]+$'
  AND public.can_access_project(((storage.foldername(name))[1])::bigint)
  AND split_part(storage.filename(name), '_', 1) = auth.uid()::text
);

CREATE POLICY "authenticated can read site photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'site-photos'
  AND (storage.foldername(name))[1] ~ '^[0-9]+$'
  AND public.can_access_project(((storage.foldername(name))[1])::bigint)
);

CREATE POLICY "authenticated can delete own photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'site-photos'
  AND (storage.foldername(name))[1] ~ '^[0-9]+$'
  AND public.can_access_project(((storage.foldername(name))[1])::bigint)
  AND split_part(storage.filename(name), '_', 1) = auth.uid()::text
);
