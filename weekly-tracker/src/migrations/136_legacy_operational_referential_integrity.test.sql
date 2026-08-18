BEGIN;

DO $$
DECLARE
  v_constraint text;
BEGIN
  FOREACH v_constraint IN ARRAY ARRAY[
    'contractor_reports_project_fk',
    'contractor_report_wps_report_project_fk',
    'site_visits_project_fk',
    'site_visit_wps_visit_project_fk',
    'site_visit_discrepancies_visit_project_fk',
    'progress_history_project_fk'
  ] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = v_constraint AND contype = 'f' AND convalidated) THEN
      RAISE EXCEPTION 'missing or unvalidated foreign key: %', v_constraint;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('site_visits', 'progress_history')
      AND column_name = 'project_id' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION 'legacy operational project identity remains nullable';
  END IF;
END;
$$;

ROLLBACK;
