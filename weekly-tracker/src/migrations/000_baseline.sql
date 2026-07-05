-- ============================================================
-- 000_baseline.sql
-- Canonical schema baseline - exact copy of production DB shape
-- from Supabase information_schema / pg_indexes / pg_tables exports.
-- Generated: 2026-07-05
--
-- HOW TO USE:
--   Fresh install: run this file, then 010_rls_by_roles.sql, then 011+
--   migrations in order.
--   DO NOT run 001-009 migrations on a fresh DB - they are HISTORICAL
--   and exist only as a record of past changes.
--
-- Notes:
--   - RLS policies are intentionally not included; apply them from
--     010_rls_by_roles.sql immediately after this baseline.
--   - Function/RPC definitions are intentionally not included.
--   - Column types/defaults, indexes, and RLS-enabled flags mirror the
--     Supabase exports supplied for Wave 0.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------
-- Core identity / assignment tables
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'Viewer'::text,
  company_id text,
  assigned_projects integer[] DEFAULT '{}'::integer[],
  created_at timestamp with time zone DEFAULT now(),
  email text
);

CREATE TABLE IF NOT EXISTS public.pending_invites (
  email text PRIMARY KEY,
  role text NOT NULL DEFAULT 'Contractor'::text,
  created_at timestamp with time zone DEFAULT now()
);

-- ----------------------------------------------------------------
-- Project and template tables
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  data jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  family_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.projects (
  id bigint PRIMARY KEY,
  store_code text,
  shopping_mall_name text,
  city text,
  street text,
  state text,
  country text,
  sales_market text,
  construction_start_date date,
  construction_end_date date,
  target_opening_date date,
  project_manager text,
  general_contractor text,
  contractor_email text,
  security_manager text,
  it_manager text,
  facility_manager text,
  hr_manager text,
  supply_manager text,
  project_type text DEFAULT 'New Opening'::text,
  project_status text DEFAULT 'Active'::text,
  phases text[] DEFAULT '{}'::text[],
  company_id text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  template_type text,
  store_size_sqm numeric,
  gantt_generated_at timestamp with time zone,
  construction_completion_date date,
  forecast_opening_date date,
  scope jsonb,
  weight_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_id uuid,
  gantt_engine_version integer
);

-- ----------------------------------------------------------------
-- Legacy report / site visit tables
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reports (
  id bigint PRIMARY KEY,
  project_id bigint,
  store_code text,
  project_name text,
  contractor text,
  submitted_at timestamp with time zone DEFAULT now(),
  reporting_date date,
  current_phase text,
  demolition_status text
);

CREATE TABLE IF NOT EXISTS public.site_visits (
  id bigint PRIMARY KEY,
  project_id bigint,
  visit_date date,
  submitted_at timestamp with time zone DEFAULT now(),
  pm_schedule_assessment text,
  demolition_status text,
  construction_statuses jsonb DEFAULT '{}'::jsonb,
  testing_statuses jsonb DEFAULT '{}'::jsonb,
  handover_statuses jsonb DEFAULT '{}'::jsonb,
  photos text[] DEFAULT '{}'::text[],
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  declaration_confirmed boolean DEFAULT false,
  observations text,
  reference_report_id bigint,
  pm_work_package_statuses jsonb,
  contractor_report_id bigint,
  visited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  overall_note text
);

-- ----------------------------------------------------------------
-- Gantt / canonical contractor report tables
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_gantt_tasks (
  id bigserial PRIMARY KEY,
  project_id bigint NOT NULL,
  wp_id text NOT NULL,
  wp_label text,
  phase_id text,
  phase_label text,
  planned_start date,
  planned_end date,
  duration_days integer,
  is_critical boolean DEFAULT false,
  is_blocker boolean DEFAULT false,
  float_days integer DEFAULT 0,
  actual_progress numeric DEFAULT 0,
  planned_progress numeric DEFAULT 0,
  status text DEFAULT 'not_started'::text,
  actual_start date,
  actual_end date,
  site_visit_progress numeric,
  discrepancy_status text,
  discrepancy_delta numeric,
  is_archived boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE (project_id, wp_id)
);

CREATE TABLE IF NOT EXISTS public.contractor_reports (
  id bigserial PRIMARY KEY,
  project_id bigint NOT NULL,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  week_number integer,
  overall_progress numeric DEFAULT 0,
  status text DEFAULT 'submitted'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contractor_report_wps (
  id bigserial PRIMARY KEY,
  report_id bigint NOT NULL,
  project_id bigint NOT NULL,
  wp_id text NOT NULL,
  progress_pct numeric DEFAULT 0,
  status text DEFAULT 'not_started'::text,
  comment text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.site_visit_wps (
  id bigserial PRIMARY KEY,
  site_visit_id bigint NOT NULL,
  project_id bigint NOT NULL,
  wp_id text NOT NULL,
  observed_progress numeric DEFAULT 0,
  observed_status text DEFAULT 'not_started'::text,
  pm_note text,
  discrepancy_status text DEFAULT 'ok'::text,
  discrepancy_delta numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  gc_status text DEFAULT 'not_started'::text
);

CREATE TABLE IF NOT EXISTS public.site_visit_discrepancies (
  id bigserial PRIMARY KEY,
  site_visit_id bigint NOT NULL,
  project_id bigint NOT NULL,
  wp_id text NOT NULL,
  contractor_progress numeric,
  site_visit_progress numeric,
  delta numeric,
  status text DEFAULT 'ok'::text,
  created_at timestamp with time zone DEFAULT now()
);

-- ----------------------------------------------------------------
-- Progress snapshots
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.progress_history (
  id bigint PRIMARY KEY,
  project_id bigint,
  recorded_at timestamp with time zone DEFAULT now(),
  week_number integer,
  overall_progress numeric,
  spi numeric,
  snapshot jsonb
);

-- ----------------------------------------------------------------
-- Task group lookup tables
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_groups (
  id text PRIMARY KEY,
  wp_id text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.task_group_members (
  group_id text NOT NULL,
  wp_id text NOT NULL,
  task_name text NOT NULL,
  PRIMARY KEY (wp_id, task_name)
);

-- ----------------------------------------------------------------
-- Indexes from production
-- ----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_report_wps_report
  ON public.contractor_report_wps USING btree (report_id);

CREATE INDEX IF NOT EXISTS idx_contractor_reports_project
  ON public.contractor_reports USING btree (project_id);

CREATE INDEX IF NOT EXISTS idx_progress_history_date
  ON public.progress_history USING btree (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_progress_history_project
  ON public.progress_history USING btree (project_id);

CREATE INDEX IF NOT EXISTS idx_gantt_tasks_project
  ON public.project_gantt_tasks USING btree (project_id);

CREATE INDEX IF NOT EXISTS idx_discrepancies_project
  ON public.site_visit_discrepancies USING btree (project_id);

CREATE INDEX IF NOT EXISTS idx_site_visit_wps_visit
  ON public.site_visit_wps USING btree (site_visit_id);

CREATE UNIQUE INDEX IF NOT EXISTS templates_family_version_uniq
  ON public.templates USING btree (family_id, version);

CREATE UNIQUE INDEX IF NOT EXISTS templates_one_active_per_family
  ON public.templates USING btree (family_id) WHERE (is_active = true);

-- ----------------------------------------------------------------
-- RLS enabled flags from production
-- ----------------------------------------------------------------

ALTER TABLE public.contractor_report_wps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_gantt_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visit_discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visit_wps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
