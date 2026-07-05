-- 016_updated_at.sql
-- Optimistic-update conflict detection: updated_at column + auto-update
-- trigger on projects, contractor_reports, site_visits.
--
-- NOT applied automatically — review and run this yourself, per this
-- project's existing convention (see 010_rls_by_roles.sql /
-- 014_site_photos_storage.sql / 015_audit_log.sql headers).
--
-- Scope note: conflict-detection UI (Step 3+ of this feature) is only
-- wired up for `projects`, via Projects.jsx's Edit Project flow — that's
-- the only one of these three tables with a real "load an existing row,
-- edit it, save it back" path where two users can actually clobber each
-- other. contractor_reports and site_visits are insert-only in this app
-- (every submission is a new row; see contractorReportService.js /
-- siteVisitService.js — neither has an .update() call), so there is no
-- overwrite to detect there today. The column + trigger are still added
-- to all three tables now, since audit_log (015) already logs UPDATEs on
-- all three and a later feature may need updated_at on the report tables
-- too — but no app code reads updated_at on contractor_reports/site_visits
-- yet.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE contractor_reports
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE site_visits
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS
$$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- DROP + CREATE (not CREATE OR REPLACE TRIGGER) for compatibility with
-- Postgres versions before 14.

DROP TRIGGER IF EXISTS trg_updated_at_projects ON projects;
CREATE TRIGGER trg_updated_at_projects
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_contractor_reports ON contractor_reports;
CREATE TRIGGER trg_updated_at_contractor_reports
  BEFORE UPDATE ON contractor_reports
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_site_visits ON site_visits;
CREATE TRIGGER trg_updated_at_site_visits
  BEFORE UPDATE ON site_visits
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
