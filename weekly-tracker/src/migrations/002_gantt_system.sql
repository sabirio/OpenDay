-- ============================================================
-- [HISTORICAL - DO NOT RUN ON FRESH DATABASE]
-- This migration was applied during initial development.
-- For fresh installs, use 000_baseline.sql instead.
-- Kept for historical reference only.
-- ============================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 002: Gantt System Tables
-- Construction & Fit-out Progress Tracker
--
-- Creates: project_gantt_tasks, contractor_reports, contractor_report_wps,
--          site_visits, site_visit_wps, site_visit_discrepancies
-- Extends: projects (Gantt columns), reports (WP status columns)
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Projects table additions ─────────────────────────────────────────────────

ALTER TABLE projects ADD COLUMN IF NOT EXISTS template_type               TEXT    DEFAULT 'standard_with_demo';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS store_size_sqm              INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS gantt_generated_at          TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS forecast_opening_date       DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS construction_completion_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS construction_start_date     DATE;

-- ── Gantt WP task table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_gantt_tasks (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wp_id            TEXT    NOT NULL,
  wp_label         TEXT    NOT NULL,
  phase_id         TEXT    NOT NULL,
  phase_label      TEXT    NOT NULL,
  planned_start    DATE    NOT NULL,
  planned_end      DATE    NOT NULL,
  duration_days    INTEGER NOT NULL,
  is_critical      BOOLEAN DEFAULT false,
  is_blocker       BOOLEAN DEFAULT false,
  float_days       INTEGER DEFAULT 0,
  actual_progress  INTEGER DEFAULT 0   CHECK (actual_progress  BETWEEN 0 AND 100),
  planned_progress NUMERIC(5,2) DEFAULT 0,
  site_visit_progress INTEGER           CHECK (site_visit_progress BETWEEN 0 AND 100),
  discrepancy_status  TEXT              CHECK (discrepancy_status  IN ('ok','warning','critical')),
  discrepancy_delta   INTEGER,
  actual_start     DATE,
  actual_end       DATE,
  status           TEXT    DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','completed','delayed')),
  is_archived      BOOLEAN DEFAULT false,
  sort_order       INTEGER,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, wp_id)
);

-- Add planned_progress for installations that already have this table
ALTER TABLE project_gantt_tasks ADD COLUMN IF NOT EXISTS planned_progress NUMERIC(5,2) DEFAULT 0;

-- ── Contractor reports (Gantt-integrated format) ──────────────────────────────

CREATE TABLE IF NOT EXISTS contractor_reports (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submitted_by     UUID    REFERENCES auth.users(id),
  report_date      DATE    NOT NULL,
  week_number      INTEGER,
  overall_progress INTEGER CHECK (overall_progress BETWEEN 0 AND 100),
  status           TEXT    DEFAULT 'submitted',
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Contractor report WP line items ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contractor_report_wps (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID    NOT NULL REFERENCES contractor_reports(id) ON DELETE CASCADE,
  project_id  UUID    NOT NULL REFERENCES projects(id),
  wp_id       TEXT    NOT NULL,
  progress_pct INTEGER CHECK (progress_pct BETWEEN 0 AND 100),
  status      TEXT    CHECK (status IN ('not_started','in_progress','completed','delayed')),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Site visits ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_visits (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           UUID    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contractor_report_id UUID    REFERENCES contractor_reports(id),
  visited_by           UUID    REFERENCES auth.users(id),
  visit_date           DATE    NOT NULL,
  overall_note         TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contractor_report_id)
);

-- ── Site visit WP observations ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_visit_wps (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  site_visit_id       UUID    NOT NULL REFERENCES site_visits(id) ON DELETE CASCADE,
  project_id          UUID    NOT NULL REFERENCES projects(id),
  wp_id               TEXT    NOT NULL,
  observed_progress   INTEGER CHECK (observed_progress BETWEEN 0 AND 100),
  observed_status     TEXT    CHECK (observed_status IN ('not_started','in_progress','completed','delayed')),
  pm_note             TEXT,
  discrepancy_status  TEXT    CHECK (discrepancy_status IN ('ok','warning','critical')),
  discrepancy_delta   INTEGER,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ── Site visit discrepancy summary ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_visit_discrepancies (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  site_visit_id        UUID    NOT NULL REFERENCES site_visits(id) ON DELETE CASCADE,
  project_id           UUID    NOT NULL REFERENCES projects(id),
  wp_id                TEXT    NOT NULL,
  contractor_progress  INTEGER,
  site_visit_progress  INTEGER,
  delta                INTEGER,
  status               TEXT    CHECK (status IN ('ok','warning','critical')),
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- ── Report format columns ─────────────────────────────────────────────────────

ALTER TABLE reports ADD COLUMN IF NOT EXISTS work_package_statuses JSONB DEFAULT NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS look_ahead_notes      TEXT  DEFAULT NULL;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_gantt_tasks_project     ON project_gantt_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_gantt_tasks_wp          ON project_gantt_tasks(wp_id);
CREATE INDEX IF NOT EXISTS idx_contractor_reports_proj ON contractor_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_contractor_reports_date ON contractor_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_contractor_wps_report   ON contractor_report_wps(report_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_project     ON site_visits(project_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_date        ON site_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_site_visit_wps_visit    ON site_visit_wps(site_visit_id);
CREATE INDEX IF NOT EXISTS idx_discrepancies_visit     ON site_visit_discrepancies(site_visit_id);

-- ── updated_at trigger for gantt tasks ────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_gantt_tasks_updated_at ON project_gantt_tasks;
CREATE TRIGGER set_gantt_tasks_updated_at
  BEFORE UPDATE ON project_gantt_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE project_gantt_tasks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_report_wps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_wps           ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_discrepancies ENABLE ROW LEVEL SECURITY;

-- Permissive development policies (restrict in production)
DO $$ BEGIN
  CREATE POLICY "anon_all_gantt_tasks"
    ON project_gantt_tasks FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon_all_contractor_reports"
    ON contractor_reports FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon_all_contractor_report_wps"
    ON contractor_report_wps FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon_all_site_visit_wps"
    ON site_visit_wps FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon_all_discrepancies"
    ON site_visit_discrepancies FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
