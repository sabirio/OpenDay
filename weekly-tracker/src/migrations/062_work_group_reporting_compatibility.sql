-- 062_work_group_reporting_compatibility.sql
-- Nullable compatibility boundary from current reporting/progress facts to
-- immutable Work Ontology versions and canonical Work Groups.
-- No historical row is backfilled or reclassified.

BEGIN;

ALTER TABLE public.contractor_reports
  ADD COLUMN IF NOT EXISTS work_ontology_version_id uuid;
ALTER TABLE public.contractor_report_wps
  ADD COLUMN IF NOT EXISTS work_ontology_version_id uuid,
  ADD COLUMN IF NOT EXISTS work_group_id uuid;
ALTER TABLE public.site_visit_wps
  ADD COLUMN IF NOT EXISTS work_ontology_version_id uuid,
  ADD COLUMN IF NOT EXISTS work_group_id uuid;
ALTER TABLE public.progress_history
  ADD COLUMN IF NOT EXISTS work_ontology_version_id uuid;

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('contractor_reports_work_ontology_version_fkey', 'contractor_reports'),
    ('contractor_report_wps_work_ontology_version_fkey', 'contractor_report_wps'),
    ('site_visit_wps_work_ontology_version_fkey', 'site_visit_wps'),
    ('progress_history_work_ontology_version_fkey', 'progress_history')
  ) AS constraints(constraint_name, table_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = item.constraint_name
        AND conrelid = format('public.%I', item.table_name)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (work_ontology_version_id) REFERENCES public.work_ontology_versions(id) ON DELETE RESTRICT NOT VALID',
        item.table_name, item.constraint_name
      );
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('contractor_report_wps_work_group_fkey', 'contractor_report_wps'),
    ('site_visit_wps_work_group_fkey', 'site_visit_wps')
  ) AS constraints(constraint_name, table_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = item.constraint_name
        AND conrelid = format('public.%I', item.table_name)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (work_ontology_version_id, work_group_id) REFERENCES public.work_ontology_work_groups(ontology_version_id, id) ON DELETE RESTRICT NOT VALID',
        item.table_name, item.constraint_name
      );
    END IF;
  END LOOP;
END
$$;

CREATE TABLE IF NOT EXISTS public.contractor_report_risk_work_groups (
  report_id bigint NOT NULL REFERENCES public.contractor_reports(id) ON DELETE CASCADE,
  ontology_version_id uuid NOT NULL,
  work_group_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, work_group_id),
  FOREIGN KEY (ontology_version_id, work_group_id)
    REFERENCES public.work_ontology_work_groups(ontology_version_id, id)
    ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.pin_project_fact_work_ontology_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  project_version_id uuid;
BEGIN
  SELECT project.work_ontology_version_id INTO project_version_id
  FROM public.projects project
  WHERE project.id = NEW.project_id;

  IF NEW.work_ontology_version_id IS NOT NULL
    AND NEW.work_ontology_version_id IS DISTINCT FROM project_version_id THEN
    RAISE EXCEPTION 'WORK_ONTOLOGY_VERSION_MISMATCH: fact must use the project ontology version'
      USING ERRCODE = '23514';
  END IF;

  NEW.work_ontology_version_id := project_version_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.map_execution_fact_to_work_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  project_version_id uuid;
  classification_kind text;
  mapped_work_group_id uuid;
BEGIN
  SELECT project.work_ontology_version_id INTO project_version_id
  FROM public.projects project
  WHERE project.id = NEW.project_id;

  IF project_version_id IS NULL THEN
    IF NEW.work_ontology_version_id IS NOT NULL OR NEW.work_group_id IS NOT NULL THEN
      RAISE EXCEPTION 'WORK_ONTOLOGY_VERSION_MISMATCH: legacy project facts cannot claim a Work Group'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.work_ontology_version_id IS NOT NULL
    AND NEW.work_ontology_version_id IS DISTINCT FROM project_version_id THEN
    RAISE EXCEPTION 'WORK_ONTOLOGY_VERSION_MISMATCH: fact must use the project ontology version'
      USING ERRCODE = '23514';
  END IF;

  SELECT classification.kind, classification.work_group_id
    INTO classification_kind, mapped_work_group_id
  FROM public.work_ontology_execution_classifications classification
  WHERE classification.ontology_version_id = project_version_id
    AND classification.execution_work_package_id = NEW.wp_id;

  IF classification_kind = 'MAPPED' THEN
    IF NEW.work_group_id IS NOT NULL AND NEW.work_group_id IS DISTINCT FROM mapped_work_group_id THEN
      RAISE EXCEPTION 'WORK_GROUP_MAPPING_MISMATCH: execution work has a different canonical Work Group'
        USING ERRCODE = '23514';
    END IF;
    NEW.work_group_id := mapped_work_group_id;
  ELSIF classification_kind IN ('DEFERRED', 'LIFECYCLE') AND NEW.work_group_id IS NOT NULL THEN
    RAISE EXCEPTION 'WORK_GROUP_MAPPING_MISMATCH: excluded execution work cannot claim a Work Group'
      USING ERRCODE = '23514';
  ELSIF classification_kind IS NULL AND NEW.work_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.work_ontology_work_groups work_group
    WHERE work_group.ontology_version_id = project_version_id
      AND work_group.id = NEW.work_group_id
  ) THEN
    RAISE EXCEPTION 'WORK_GROUP_MAPPING_MISMATCH: custom execution work must use a Work Group from the project ontology'
      USING ERRCODE = '23514';
  END IF;

  NEW.work_ontology_version_id := project_version_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_report_risk_work_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  report_version_id uuid;
BEGIN
  SELECT report.work_ontology_version_id INTO report_version_id
  FROM public.contractor_reports report
  WHERE report.id = NEW.report_id;

  IF report_version_id IS NULL THEN
    RAISE EXCEPTION 'WORK_ONTOLOGY_VERSION_MISMATCH: legacy reports cannot claim risk Work Groups'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.ontology_version_id IS NOT NULL
    AND NEW.ontology_version_id IS DISTINCT FROM report_version_id THEN
    RAISE EXCEPTION 'WORK_ONTOLOGY_VERSION_MISMATCH: risk must use the report ontology version'
      USING ERRCODE = '23514';
  END IF;

  NEW.ontology_version_id := report_version_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contractor_reports_pin_work_ontology ON public.contractor_reports;
CREATE TRIGGER contractor_reports_pin_work_ontology
  BEFORE INSERT OR UPDATE OF project_id, work_ontology_version_id ON public.contractor_reports
  FOR EACH ROW EXECUTE FUNCTION public.pin_project_fact_work_ontology_version();
DROP TRIGGER IF EXISTS progress_history_pin_work_ontology ON public.progress_history;
CREATE TRIGGER progress_history_pin_work_ontology
  BEFORE INSERT OR UPDATE OF project_id, work_ontology_version_id ON public.progress_history
  FOR EACH ROW EXECUTE FUNCTION public.pin_project_fact_work_ontology_version();

DROP TRIGGER IF EXISTS contractor_report_wps_map_work_group ON public.contractor_report_wps;
CREATE TRIGGER contractor_report_wps_map_work_group
  BEFORE INSERT OR UPDATE OF project_id, wp_id, work_ontology_version_id, work_group_id ON public.contractor_report_wps
  FOR EACH ROW EXECUTE FUNCTION public.map_execution_fact_to_work_group();
DROP TRIGGER IF EXISTS site_visit_wps_map_work_group ON public.site_visit_wps;
CREATE TRIGGER site_visit_wps_map_work_group
  BEFORE INSERT OR UPDATE OF project_id, wp_id, work_ontology_version_id, work_group_id ON public.site_visit_wps
  FOR EACH ROW EXECUTE FUNCTION public.map_execution_fact_to_work_group();
DROP TRIGGER IF EXISTS contractor_report_risk_work_groups_validate ON public.contractor_report_risk_work_groups;
CREATE TRIGGER contractor_report_risk_work_groups_validate
  BEFORE INSERT OR UPDATE ON public.contractor_report_risk_work_groups
  FOR EACH ROW EXECUTE FUNCTION public.validate_report_risk_work_group();

ALTER TABLE public.contractor_report_risk_work_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contractor_report_risk_work_groups_select" ON public.contractor_report_risk_work_groups;
CREATE POLICY "contractor_report_risk_work_groups_select"
  ON public.contractor_report_risk_work_groups
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.contractor_reports report
      WHERE report.id = report_id
        AND public.can_access_project(report.project_id)
    )
  );

REVOKE ALL ON TABLE public.contractor_report_risk_work_groups FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.contractor_report_risk_work_groups TO authenticated;
REVOKE ALL ON FUNCTION public.pin_project_fact_work_ontology_version() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.map_execution_fact_to_work_group() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_report_risk_work_group() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
