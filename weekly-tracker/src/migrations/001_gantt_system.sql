-- ⚠️  DEPRECATED — superseded by src/migrations/002_gantt_system.sql
-- Do not run this file. Use the numbered migration sequence in src/migrations/ instead.
-- ============================================================
-- Migration 001 (DEPRECATED): Gantt Chart System
-- Construction & Fit-out Progress Tracker
-- ============================================================

-- ── Projects table additions ─────────────────────────────────────────────────

ALTER TABLE projects ADD COLUMN IF NOT EXISTS template_type               TEXT    DEFAULT 'standard_with_demo';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS store_size_sqm              INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS gantt_generated_at          TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS forecast_opening_date       DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS construction_completion_date DATE;

-- target_opening_date may already exist (rename from target_opening_date if needed)
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

-- ── Contractor reports (new Gantt-integrated format) ─────────────────────────

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

-- ── Site visits (new Gantt-integrated format) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS site_visits (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           UUID    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contractor_report_id UUID    REFERENCES contractor_reports(id),
  visited_by           UUID    REFERENCES auth.users(id),
  visit_date           DATE    NOT NULL,
  overall_note         TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contractor_report_id)   -- one site visit per contractor report
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
