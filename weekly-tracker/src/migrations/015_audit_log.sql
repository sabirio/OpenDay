-- 015_audit_log.sql
-- Client requirement: "who changed progress and when" — audit_log table +
-- triggers on contractor_reports, site_visits, projects.
--
-- NOT applied automatically — review and run this yourself via the Supabase
-- dashboard SQL editor or CLI, per the project's existing convention (see
-- 010_rls_by_roles.sql header) of not auto-applying schema/RLS changes.
--
-- Corrections vs. the original brief:
--   1. There is no `site_visit_reports` table — the real table is
--      `site_visits` (site_visit_wps holds the per-WP line items).
--   2. Bare `CREATE POLICY` fails on a second run if the policy already
--      exists (no IF NOT EXISTS for policies in Postgres). Wrapped in the
--      same idempotent DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL
--      $$ pattern already established in 010_rls_by_roles.sql.
--   3. projects.id / contractor_reports.id are plain integers here, not
--      UUIDs — record_id text still works fine via ::text casts, unchanged
--      from the brief.
--   4. The generic trigger, applied unfiltered to `projects`, would log an
--      audit row on every automated Gantt recalculation — projectService's
--      updateGanttDates() rewrites template_type / gantt_generated_at /
--      gantt_engine_version / construction_completion_date /
--      forecast_opening_date after every contractor report submission (via
--      ganttService.updateForecast()), not just on human PM edits. Added a
--      projects-specific check that skips the insert when the diff is
--      entirely made up of those five computed columns, so the log reflects
--      "a PM changed this project" rather than "the Gantt engine recalculated
--      a forecast," while still catching a PM edit that happens to land in
--      the same request as a recalculation.

-- ─── audit_log table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id            bigserial PRIMARY KEY,
  table_name    text        NOT NULL,
  record_id     text        NOT NULL,
  action        text        NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  changed_by    uuid        REFERENCES auth.users(id),
  changed_at    timestamptz NOT NULL DEFAULT now(),
  old_data      jsonb,
  new_data      jsonb,
  diff          jsonb       -- only changed fields, UPDATE only
);

CREATE INDEX IF NOT EXISTS audit_log_table_record
  ON audit_log (table_name, record_id);

CREATE INDEX IF NOT EXISTS audit_log_changed_at
  ON audit_log (changed_at DESC);

-- RLS: authenticated users can read; nobody can write directly (the trigger
-- function is SECURITY DEFINER and inserts under its own privileges).
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "authenticated can read audit_log"
    ON audit_log FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Generic trigger function ───────────────────────────────────
CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS
$$
DECLARE
  v_diff         jsonb := '{}';
  v_key          text;
  v_gantt_only   boolean;
  -- Columns projectService.updateGanttDates() rewrites automatically after
  -- every Gantt recalculation — not a human edit. See header note above.
  v_gantt_fields text[] := ARRAY[
    'template_type', 'gantt_generated_at', 'gantt_engine_version',
    'construction_completion_date', 'forecast_opening_date'
  ];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR v_key IN SELECT key FROM jsonb_each(to_jsonb(NEW)) LOOP
      IF (to_jsonb(OLD) -> v_key) IS DISTINCT FROM (to_jsonb(NEW) -> v_key) THEN
        v_diff := v_diff || jsonb_build_object(
          v_key,
          jsonb_build_object('from', to_jsonb(OLD) -> v_key,
                             'to',   to_jsonb(NEW) -> v_key)
        );
      END IF;
    END LOOP;

    IF v_diff = '{}'::jsonb THEN
      RETURN NEW; -- no actual column changed (e.g. a no-op UPDATE)
    END IF;

    IF TG_TABLE_NAME = 'projects' THEN
      SELECT bool_and(key = ANY(v_gantt_fields))
        INTO v_gantt_only
        FROM jsonb_object_keys(v_diff) AS key;
      IF v_gantt_only THEN
        RETURN NEW; -- Gantt-engine recalculation only, not a PM edit
      END IF;
    END IF;

    INSERT INTO audit_log (table_name, record_id, action, changed_by, old_data, new_data, diff)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'UPDATE',
            auth.uid(), to_jsonb(OLD), to_jsonb(NEW), v_diff);
    RETURN NEW;

  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, action, changed_by, new_data)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'INSERT',
            auth.uid(), to_jsonb(NEW));
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, action, changed_by, old_data)
    VALUES (TG_TABLE_NAME, OLD.id::text, 'DELETE',
            auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$;

-- ─── Attach triggers to key tables ─────────────────────────────
-- DROP + CREATE (not CREATE OR REPLACE TRIGGER) for compatibility with
-- Postgres versions before 14.

DROP TRIGGER IF EXISTS trg_audit_contractor_reports ON contractor_reports;
CREATE TRIGGER trg_audit_contractor_reports
  AFTER INSERT OR UPDATE OR DELETE ON contractor_reports
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

DROP TRIGGER IF EXISTS trg_audit_site_visits ON site_visits;
CREATE TRIGGER trg_audit_site_visits
  AFTER INSERT OR UPDATE OR DELETE ON site_visits
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

DROP TRIGGER IF EXISTS trg_audit_projects ON projects;
CREATE TRIGGER trg_audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
