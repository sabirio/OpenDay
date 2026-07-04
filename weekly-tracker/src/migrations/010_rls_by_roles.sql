-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 010: RLS by Roles  (M0.2 — closes K-1)
-- Construction & Fit-out Progress Tracker
--
-- Root cause: every table has a permissive anon_all_* policy (USING (true)
-- WITH CHECK (true) for anon + authenticated) so anyone with the public
-- anon key can read/write/delete any row via the Supabase REST API,
-- bypassing the UI-only role checks in src/auth/rolePermissions.js.
--
-- Fix: drop every permissive policy; replace with operation-scoped policies
-- keyed on public.profiles.role for the requesting authenticated user.
--
-- CONFIRMED DB TYPES (verified via SQL — do NOT change):
--   profiles.id                 uuid   (= auth.uid())
--   profiles.role               text   ('Admin'|'PM'|'Viewer'|'Contractor')  ← capital case
--                               get_my_role() normalises via LOWER() — policies use lowercase
--   profiles.assigned_projects  integer[]
--   projects.id                 bigint
--   All FK project_id columns   bigint
--
-- CRITICAL CAST: assigned_projects is integer[] but project IDs are bigint.
-- Postgres will NOT auto-cast bigint = ANY(integer[]).
-- Every contractor scope check MUST use the pattern:
--   project_id = ANY(
--     (SELECT assigned_projects FROM public.profiles WHERE id = auth.uid())::bigint[]
--   )
-- For the projects table itself, use `id` in place of `project_id`.
--
-- Role × Operation matrix:
--
--   Role        SELECT              INSERT / UPDATE             DELETE
--   ──────────  ──────────────────  ──────────────────────────  ──────
--   admin       all rows            ✓ (all tables)              ✓
--   pm          all rows            ✓ (except profiles/templates/lookups)  ✗
--   viewer      all rows            ✗                           ✗
--   contractor  own projects only   contractor_reports + wps    ✗
--               (assigned_projects)   for own projects only
--   anon        BLOCKED             BLOCKED                     BLOCKED
--
-- Exceptions:
--   profiles:               SELECT own row only (admin sees all);
--                           INSERT/UPDATE/DELETE admin only.
--   templates, task_groups, task_group_members:
--                           SELECT any authenticated; writes admin only.
--
-- Tables covered (14):
--   profiles, projects, reports, site_visits, project_gantt_tasks,
--   contractor_reports, contractor_report_wps, site_visit_wps,
--   site_visit_discrepancies, progress_history, templates,
--   task_groups, task_group_members, pending_invites
--
-- Safe to re-run (idempotent):
--   CREATE OR REPLACE FUNCTION   — always replaces
--   ALTER TABLE … ENABLE RLS     — no-op if already on
--   DROP POLICY IF EXISTS        — no-op if already gone
--   CREATE POLICY inside DO $$…EXCEPTION WHEN duplicate_object THEN NULL $$
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- Step 0: Helper function
--
-- SECURITY DEFINER so the SELECT on profiles skips that table's RLS check.
-- Without it: profiles policy calls get_my_role() → SELECT profiles →
-- re-triggers profiles policy → infinite recursion / access denied.
-- SET search_path = public prevents schema-injection via search_path.
-- STABLE lets Postgres cache the result for the duration of one query.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_role()
  RETURNS TEXT STABLE SECURITY DEFINER SET search_path = public
  LANGUAGE sql AS $$
    SELECT LOWER(role) FROM public.profiles WHERE id = auth.uid();
  $$;


-- ─────────────────────────────────────────────────────────────────────────
-- Step 1: Enable RLS on all 14 tables (idempotent)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_gantt_tasks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_report_wps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visit_wps        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visit_discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_group_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_invites       ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────
-- Step 2: Drop ALL existing policies on target tables (dynamic)
--
-- Enumerates every policy in pg_policies for the 14 target tables and
-- drops each one by exact name.  This survives any naming convention —
-- the previous manual DROP-by-name approach missed the "human" names
-- applied via the Supabase dashboard, leaving 28 old policies alive and
-- 6 critical anon_all_* policies active alongside the new ones.
--
-- task_groups and task_group_members exist (created in 003_task_groups.sql)
-- but have no policies yet — the loop returns no rows for them and skips
-- them silently.  They are included in target_tables so that any policy
-- added later is also cleaned on a re-run.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r            record;
  target_tables text[] := ARRAY[
    'contractor_report_wps',
    'contractor_reports',
    'pending_invites',
    'profiles',
    'progress_history',
    'project_gantt_tasks',
    'projects',
    'reports',
    'site_visit_discrepancies',
    'site_visit_wps',
    'site_visits',
    'task_group_members',
    'task_groups',
    'templates'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = ANY(target_tables)
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename
    );
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────
-- Step 3: Granular policies
--
-- Contractor scope pattern (used wherever a project_id bigint exists):
--   project_id = ANY(
--     (SELECT assigned_projects FROM public.profiles WHERE id = auth.uid())::bigint[]
--   )
-- The ::bigint[] cast is mandatory: assigned_projects is integer[], project
-- IDs are bigint; Postgres will NOT auto-cast.
-- For the `projects` table use `id` instead of `project_id`.
-- ─────────────────────────────────────────────────────────────────────────


-- ── profiles ─────────────────────────────────────────────────────────────
-- SELECT: own row always visible; admin sees all (for AdminUsers page).
-- Writes: admin only — user creation/management is done manually.

DO $$ BEGIN
  CREATE POLICY "profiles_select"
    ON public.profiles FOR SELECT TO authenticated
    USING (
      id = auth.uid()
      OR get_my_role() = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "profiles_insert"
    ON public.profiles FOR INSERT TO authenticated
    WITH CHECK ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "profiles_update"
    ON public.profiles FOR UPDATE TO authenticated
    USING     ( get_my_role() = 'admin' )
    WITH CHECK ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "profiles_delete"
    ON public.profiles FOR DELETE TO authenticated
    USING ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── projects  (project root — uses `id`, not `project_id`) ───────────────

DO $$ BEGIN
  CREATE POLICY "projects_select"
    ON public.projects FOR SELECT TO authenticated
    USING (
      get_my_role() IN ('admin', 'pm', 'viewer')
      OR ( get_my_role() = 'contractor'
           AND id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "projects_insert"
    ON public.projects FOR INSERT TO authenticated
    WITH CHECK ( get_my_role() IN ('admin', 'pm') );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "projects_update"
    ON public.projects FOR UPDATE TO authenticated
    USING     ( get_my_role() IN ('admin', 'pm') )
    WITH CHECK ( get_my_role() IN ('admin', 'pm') );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "projects_delete"
    ON public.projects FOR DELETE TO authenticated
    USING ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── reports  (project_id bigint — 001_initial_schema.sql docs) ────────────

DO $$ BEGIN
  CREATE POLICY "reports_select"
    ON public.reports FOR SELECT TO authenticated
    USING (
      get_my_role() IN ('admin', 'pm', 'viewer')
      OR ( get_my_role() = 'contractor'
           AND project_id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "reports_insert"
    ON public.reports FOR INSERT TO authenticated
    WITH CHECK ( get_my_role() IN ('admin', 'pm') );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "reports_update"
    ON public.reports FOR UPDATE TO authenticated
    USING     ( get_my_role() IN ('admin', 'pm') )
    WITH CHECK ( get_my_role() IN ('admin', 'pm') );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "reports_delete"
    ON public.reports FOR DELETE TO authenticated
    USING ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── site_visits  (project_id bigint — 002_gantt_system.sql:85) ───────────

DO $$ BEGIN
  CREATE POLICY "site_visits_select"
    ON public.site_visits FOR SELECT TO authenticated
    USING (
      get_my_role() IN ('admin', 'pm', 'viewer')
      OR ( get_my_role() = 'contractor'
           AND project_id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PM submits site visits; no contractor write path for this table.
DO $$ BEGIN
  CREATE POLICY "site_visits_insert"
    ON public.site_visits FOR INSERT TO authenticated
    WITH CHECK ( get_my_role() IN ('admin', 'pm') );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "site_visits_update"
    ON public.site_visits FOR UPDATE TO authenticated
    USING     ( get_my_role() IN ('admin', 'pm') )
    WITH CHECK ( get_my_role() IN ('admin', 'pm') );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "site_visits_delete"
    ON public.site_visits FOR DELETE TO authenticated
    USING ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── project_gantt_tasks  (project_id bigint — 002_gantt_system.sql:25) ───
-- Gantt is generated/updated by PM via ganttService; contractors do not
-- write to this table directly (they write contractor_reports instead).

DO $$ BEGIN
  CREATE POLICY "gantt_tasks_select"
    ON public.project_gantt_tasks FOR SELECT TO authenticated
    USING (
      get_my_role() IN ('admin', 'pm', 'viewer')
      OR ( get_my_role() = 'contractor'
           AND project_id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "gantt_tasks_insert"
    ON public.project_gantt_tasks FOR INSERT TO authenticated
    WITH CHECK ( get_my_role() IN ('admin', 'pm') );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "gantt_tasks_update"
    ON public.project_gantt_tasks FOR UPDATE TO authenticated
    USING     ( get_my_role() IN ('admin', 'pm') )
    WITH CHECK ( get_my_role() IN ('admin', 'pm') );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "gantt_tasks_delete"
    ON public.project_gantt_tasks FOR DELETE TO authenticated
    USING ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── contractor_reports  (project_id bigint — 002_gantt_system.sql:59) ────
-- Contractor INSERT/UPDATE scope: their own assigned projects only.

DO $$ BEGIN
  CREATE POLICY "contractor_reports_select"
    ON public.contractor_reports FOR SELECT TO authenticated
    USING (
      get_my_role() IN ('admin', 'pm', 'viewer')
      OR ( get_my_role() = 'contractor'
           AND project_id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "contractor_reports_insert"
    ON public.contractor_reports FOR INSERT TO authenticated
    WITH CHECK (
      get_my_role() IN ('admin', 'pm')
      OR ( get_my_role() = 'contractor'
           AND project_id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "contractor_reports_update"
    ON public.contractor_reports FOR UPDATE TO authenticated
    USING (
      get_my_role() IN ('admin', 'pm')
      OR ( get_my_role() = 'contractor'
           AND project_id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    )
    WITH CHECK (
      get_my_role() IN ('admin', 'pm')
      OR ( get_my_role() = 'contractor'
           AND project_id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "contractor_reports_delete"
    ON public.contractor_reports FOR DELETE TO authenticated
    USING ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── contractor_report_wps  (project_id bigint — 002_gantt_system.sql:73) ─
-- Has both report_id FK and a direct project_id column — using project_id
-- directly (NOT NULL, cleaner than an EXISTS join to contractor_reports).
-- Same contractor write scope as the parent table.

DO $$ BEGIN
  CREATE POLICY "contractor_report_wps_select"
    ON public.contractor_report_wps FOR SELECT TO authenticated
    USING (
      get_my_role() IN ('admin', 'pm', 'viewer')
      OR ( get_my_role() = 'contractor'
           AND project_id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "contractor_report_wps_insert"
    ON public.contractor_report_wps FOR INSERT TO authenticated
    WITH CHECK (
      get_my_role() IN ('admin', 'pm')
      OR ( get_my_role() = 'contractor'
           AND project_id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "contractor_report_wps_update"
    ON public.contractor_report_wps FOR UPDATE TO authenticated
    USING (
      get_my_role() IN ('admin', 'pm')
      OR ( get_my_role() = 'contractor'
           AND project_id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    )
    WITH CHECK (
      get_my_role() IN ('admin', 'pm')
      OR ( get_my_role() = 'contractor'
           AND project_id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "contractor_report_wps_delete"
    ON public.contractor_report_wps FOR DELETE TO authenticated
    USING ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── site_visit_wps  (project_id bigint — 002_gantt_system.sql:99) ────────
-- Has both site_visit_id FK and a direct project_id — using project_id.
-- No contractor write path (PM submits site visits).

DO $$ BEGIN
  CREATE POLICY "site_visit_wps_select"
    ON public.site_visit_wps FOR SELECT TO authenticated
    USING (
      get_my_role() IN ('admin', 'pm', 'viewer')
      OR ( get_my_role() = 'contractor'
           AND project_id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "site_visit_wps_insert"
    ON public.site_visit_wps FOR INSERT TO authenticated
    WITH CHECK ( get_my_role() IN ('admin', 'pm') );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "site_visit_wps_update"
    ON public.site_visit_wps FOR UPDATE TO authenticated
    USING     ( get_my_role() IN ('admin', 'pm') )
    WITH CHECK ( get_my_role() IN ('admin', 'pm') );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "site_visit_wps_delete"
    ON public.site_visit_wps FOR DELETE TO authenticated
    USING ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── site_visit_discrepancies  (project_id bigint — 002_gantt_system.sql:114)
-- Has both site_visit_id FK and a direct project_id — using project_id.

DO $$ BEGIN
  CREATE POLICY "site_visit_discrepancies_select"
    ON public.site_visit_discrepancies FOR SELECT TO authenticated
    USING (
      get_my_role() IN ('admin', 'pm', 'viewer')
      OR ( get_my_role() = 'contractor'
           AND project_id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "site_visit_discrepancies_insert"
    ON public.site_visit_discrepancies FOR INSERT TO authenticated
    WITH CHECK ( get_my_role() IN ('admin', 'pm') );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "site_visit_discrepancies_update"
    ON public.site_visit_discrepancies FOR UPDATE TO authenticated
    USING     ( get_my_role() IN ('admin', 'pm') )
    WITH CHECK ( get_my_role() IN ('admin', 'pm') );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "site_visit_discrepancies_delete"
    ON public.site_visit_discrepancies FOR DELETE TO authenticated
    USING ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── progress_history  (project_id bigint — 007_progress_history.sql:6) ───
-- Migration 007 correctly declares project_id as BIGINT (FK to projects.id).
-- The ::bigint[] cast is still required because assigned_projects is integer[].

DO $$ BEGIN
  CREATE POLICY "progress_history_select"
    ON public.progress_history FOR SELECT TO authenticated
    USING (
      get_my_role() IN ('admin', 'pm', 'viewer')
      OR ( get_my_role() = 'contractor'
           AND project_id = ANY(
             (SELECT assigned_projects FROM public.profiles
               WHERE id = auth.uid())::bigint[]
           ) )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- reportService.create() inserts a row on each PM report submission.
-- backfillProgressHistory.js uses service-role (bypasses RLS entirely).
DO $$ BEGIN
  CREATE POLICY "progress_history_insert"
    ON public.progress_history FOR INSERT TO authenticated
    WITH CHECK ( get_my_role() IN ('admin', 'pm') );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "progress_history_update"
    ON public.progress_history FOR UPDATE TO authenticated
    USING     ( get_my_role() IN ('admin', 'pm') )
    WITH CHECK ( get_my_role() IN ('admin', 'pm') );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "progress_history_delete"
    ON public.progress_history FOR DELETE TO authenticated
    USING ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── templates  (no project_id — global config table) ─────────────────────
-- All authenticated roles need SELECT: templatesApi.fetchActiveTemplate is
-- called during project creation (PM) and Gantt/report rendering (all roles).
-- Writes are admin-only: TemplateEditor page requires admin_users permission.

DO $$ BEGIN
  CREATE POLICY "templates_select"
    ON public.templates FOR SELECT TO authenticated
    USING ( auth.uid() IS NOT NULL );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "templates_insert"
    ON public.templates FOR INSERT TO authenticated
    WITH CHECK ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "templates_update"
    ON public.templates FOR UPDATE TO authenticated
    USING     ( get_my_role() = 'admin' )
    WITH CHECK ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "templates_delete"
    ON public.templates FOR DELETE TO authenticated
    USING ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── task_groups  (static lookup, no project_id — 003_task_groups.sql) ────
-- RLS was not enabled in migration 003; enabling here.
-- All authenticated users need SELECT (Gantt/template rendering).

DO $$ BEGIN
  CREATE POLICY "task_groups_select"
    ON public.task_groups FOR SELECT TO authenticated
    USING ( auth.uid() IS NOT NULL );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "task_groups_insert"
    ON public.task_groups FOR INSERT TO authenticated
    WITH CHECK ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "task_groups_update"
    ON public.task_groups FOR UPDATE TO authenticated
    USING     ( get_my_role() = 'admin' )
    WITH CHECK ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "task_groups_delete"
    ON public.task_groups FOR DELETE TO authenticated
    USING ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── task_group_members  (static lookup, no project_id — 003_task_groups.sql)

DO $$ BEGIN
  CREATE POLICY "task_group_members_select"
    ON public.task_group_members FOR SELECT TO authenticated
    USING ( auth.uid() IS NOT NULL );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "task_group_members_insert"
    ON public.task_group_members FOR INSERT TO authenticated
    WITH CHECK ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "task_group_members_update"
    ON public.task_group_members FOR UPDATE TO authenticated
    USING     ( get_my_role() = 'admin' )
    WITH CHECK ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "task_group_members_delete"
    ON public.task_group_members FOR DELETE TO authenticated
    USING ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── pending_invites  (admin-only — matches policy applied manually in DB) ─
-- Single FOR ALL policy: admin creates/reads/updates/deletes invites;
-- no other role has any access path to this table.

DO $$ BEGIN
  CREATE POLICY "pending_invites_admin_all"
    ON public.pending_invites FOR ALL TO authenticated
    USING     ( get_my_role() = 'admin' )
    WITH CHECK ( get_my_role() = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Verification queries — run in Supabase SQL Editor after applying.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Confirm RLS is ON for all 14 tables (expect 14 rows):
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'profiles','projects','reports','site_visits','project_gantt_tasks',
--     'contractor_reports','contractor_report_wps','site_visit_wps',
--     'site_visit_discrepancies','progress_history','templates',
--     'task_groups','task_group_members','pending_invites'
--   )
-- ORDER BY tablename;

-- 2. Count policies per table (13 tables × 4 = 52 + 1 FOR ALL on pending_invites = 53 total):
-- SELECT tablename, count(*) AS policy_count
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'profiles','projects','reports','site_visits','project_gantt_tasks',
--     'contractor_reports','contractor_report_wps','site_visit_wps',
--     'site_visit_discrepancies','progress_history','templates',
--     'task_groups','task_group_members','pending_invites'
--   )
-- GROUP BY tablename
-- ORDER BY tablename;

-- 3. Confirm zero anon_all_* policies remain (expect 0 rows):
-- SELECT tablename, policyname
-- FROM pg_policies
-- WHERE schemaname = 'public' AND policyname LIKE 'anon_all%';

-- 4. Confirm helper function exists with correct signature:
-- SELECT proname, prosecdef, provolatile
-- FROM pg_proc
-- WHERE proname = 'get_my_role' AND pronamespace = 'public'::regnamespace;
-- (expect: prosecdef = true, provolatile = 's' for STABLE)

-- 5. Confirm assigned_projects type and project id type:
-- SELECT pg_typeof(assigned_projects) FROM public.profiles LIMIT 1;
-- SELECT pg_typeof(id) FROM public.projects LIMIT 1;
-- (expect: integer[], bigint)

-- 6. Smoke-test contractor isolation — set JWT to a contractor user, then:
-- SELECT count(*) FROM public.projects;
-- (expect: count of their assigned_projects entries, not the full portfolio)

-- 7. Smoke-test anon block — REST call with only the anon key (no JWT):
-- GET https://<project>.supabase.co/rest/v1/projects?apikey=<anon-key>
-- (expect: [] empty array — no rows returned)
