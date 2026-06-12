-- ⚠️  DEPRECATED — DO NOT RUN
-- This file has been superseded by the numbered migration sequence in src/migrations/.
-- To set up the database, run migrations in order:
--   src/migrations/001_initial_schema.sql
--   src/migrations/002_gantt_system.sql
--   src/migrations/003_task_groups.sql
--   src/migrations/004_site_visit_pm_assessment.sql
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CF Tracker — Schema Migration (DEPRECATED)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Add Gantt columns to existing projects table ─────────────────────────
-- The projects table already exists; we just add the new columns.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS template_type                TEXT,
  ADD COLUMN IF NOT EXISTS store_size_sqm               NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS gantt_generated_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS construction_completion_date DATE,
  ADD COLUMN IF NOT EXISTS forecast_opening_date        DATE;

-- ─── 2. project_gantt_tasks ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_gantt_tasks (
  id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wp_id           TEXT      NOT NULL,
  wp_label        TEXT,
  phase_id        TEXT,
  phase_label     TEXT,
  planned_start   DATE,
  planned_end     DATE,
  duration_days   INT,
  is_critical     BOOLEAN   DEFAULT FALSE,
  is_blocker      BOOLEAN   DEFAULT FALSE,
  float_days      INT       DEFAULT 0,
  actual_progress NUMERIC(5,2) DEFAULT 0,
  planned_progress NUMERIC(5,2) DEFAULT 0,
  status          TEXT      DEFAULT 'not_started',
  actual_start    DATE,
  actual_end      DATE,
  site_visit_progress  NUMERIC(5,2),
  discrepancy_status   TEXT,
  discrepancy_delta    NUMERIC(5,2),
  is_archived     BOOLEAN   DEFAULT FALSE,
  sort_order      INT       DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, wp_id)
);

CREATE INDEX IF NOT EXISTS idx_gantt_tasks_project
  ON project_gantt_tasks (project_id);

-- ─── 3. contractor_reports ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contractor_reports (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submitted_by     UUID      REFERENCES auth.users(id),
  report_date      DATE      NOT NULL DEFAULT CURRENT_DATE,
  week_number      INT,
  overall_progress NUMERIC(5,2) DEFAULT 0,
  status           TEXT      DEFAULT 'submitted',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contractor_reports_project
  ON contractor_reports (project_id);

-- ─── 4. contractor_report_wps (line items per WP) ────────────────────────────

CREATE TABLE IF NOT EXISTS contractor_report_wps (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    UUID      NOT NULL REFERENCES contractor_reports(id) ON DELETE CASCADE,
  project_id   UUID      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wp_id        TEXT      NOT NULL,
  progress_pct NUMERIC(5,2) DEFAULT 0,
  status       TEXT      DEFAULT 'not_started',
  comment      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_wps_report
  ON contractor_report_wps (report_id);

-- ─── 5. site_visits (add columns if the table already exists) ────────────────
-- The table may already exist from an earlier schema with different columns.
-- We add only the columns needed by the new Gantt-based site visit flow.

ALTER TABLE site_visits
  ADD COLUMN IF NOT EXISTS contractor_report_id UUID REFERENCES contractor_reports(id),
  ADD COLUMN IF NOT EXISTS visited_by           TEXT,
  ADD COLUMN IF NOT EXISTS overall_note         TEXT;

-- ─── 6. site_visit_wps ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_visit_wps (
  id                  UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  site_visit_id       UUID      NOT NULL REFERENCES site_visits(id) ON DELETE CASCADE,
  project_id          UUID      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wp_id               TEXT      NOT NULL,
  observed_progress   NUMERIC(5,2) DEFAULT 0,
  observed_status     TEXT      DEFAULT 'not_started',
  pm_note             TEXT,
  discrepancy_status  TEXT      DEFAULT 'ok',
  discrepancy_delta   NUMERIC(5,2) DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_visit_wps_visit
  ON site_visit_wps (site_visit_id);

-- ─── 7. site_visit_discrepancies ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_visit_discrepancies (
  id                   UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  site_visit_id        UUID      NOT NULL REFERENCES site_visits(id) ON DELETE CASCADE,
  project_id           UUID      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wp_id                TEXT      NOT NULL,
  contractor_progress  NUMERIC(5,2),
  site_visit_progress  NUMERIC(5,2),
  delta                NUMERIC(5,2),
  status               TEXT      DEFAULT 'ok',   -- ok | warning | critical
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discrepancies_project
  ON site_visit_discrepancies (project_id);

-- ─── 8. Enable Row Level Security (anon read, authenticated write) ────────────
-- Adjust to match your actual auth policies. These are permissive defaults
-- so the anon key can read/write during development.

ALTER TABLE project_gantt_tasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_report_wps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_wps          ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_discrepancies ENABLE ROW LEVEL SECURITY;

-- Permissive development policies (anon can do everything — restrict in prod)
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

-- ─── 8. Add WP statuses + look-ahead to reports table ───────────────────────
-- Allows the reports table to store new-format WP data alongside legacy fields.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS work_package_statuses JSONB    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS look_ahead_notes      TEXT     DEFAULT NULL;

-- ─── Verify ───────────────────────────────────────────────────────────────────
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns c
   WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'projects','project_gantt_tasks',
    'contractor_reports','contractor_report_wps',
    'site_visits','site_visit_wps','site_visit_discrepancies'
  )
ORDER BY table_name;
