-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 001: Initial Schema Reference
-- Construction & Fit-out Progress Tracker
--
-- The base tables (projects, reports, site_visits, users) were created
-- via Supabase dashboard or an earlier migration not tracked in this repo.
-- This file documents the baseline schema and adds the initial required columns.
--
-- Safe to re-run: all statements use ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

-- Base columns expected on the `projects` table before migrations:
--   id UUID PRIMARY KEY, name TEXT, status TEXT,
--   target_opening_date DATE, created_at TIMESTAMPTZ

-- Base columns expected on the `reports` table:
--   id UUID PRIMARY KEY, project_id UUID REFERENCES projects(id),
--   submitted_at TIMESTAMPTZ, reporting_date DATE,
--   contractor TEXT, project_schedule_status TEXT,
--   demolition_status TEXT, construction_statuses JSONB,
--   testing_statuses JSONB, handover_statuses JSONB

-- Base columns expected on the `site_visits` table:
--   id UUID PRIMARY KEY, project_id UUID REFERENCES projects(id),
--   visit_date DATE, created_at TIMESTAMPTZ

-- ── Add report format tracking column ────────────────────────────────────────

ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_format TEXT DEFAULT 'legacy';
