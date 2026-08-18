-- 136_legacy_operational_referential_integrity.sql
-- Close structural orphan paths in the original Reports/Site Visit/History
-- tables. Existing data is audited before constraints become mandatory.

BEGIN;

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.contractor_reports report WHERE report.project_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.projects project WHERE project.id = report.project_id)) THEN
    RAISE EXCEPTION 'CONTRACTOR_REPORT_PROJECT_ORPHANS_REQUIRE_REPAIR';
  END IF;
  IF EXISTS(SELECT 1 FROM public.contractor_report_wps item
    WHERE NOT EXISTS(SELECT 1 FROM public.contractor_reports report
      WHERE report.id = item.report_id AND report.project_id = item.project_id)) THEN
    RAISE EXCEPTION 'CONTRACTOR_REPORT_ITEM_PARENT_ORPHANS_REQUIRE_REPAIR';
  END IF;
  IF EXISTS(SELECT 1 FROM public.site_visits visit WHERE visit.project_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.projects project WHERE project.id = visit.project_id)) THEN
    RAISE EXCEPTION 'SITE_VISIT_PROJECT_ORPHANS_REQUIRE_REPAIR';
  END IF;
  IF EXISTS(SELECT 1 FROM public.site_visit_wps item
    WHERE NOT EXISTS(SELECT 1 FROM public.site_visits visit
      WHERE visit.id = item.site_visit_id AND visit.project_id = item.project_id)) THEN
    RAISE EXCEPTION 'SITE_VISIT_ITEM_PARENT_ORPHANS_REQUIRE_REPAIR';
  END IF;
  IF EXISTS(SELECT 1 FROM public.site_visit_discrepancies discrepancy
    WHERE NOT EXISTS(SELECT 1 FROM public.site_visits visit
      WHERE visit.id = discrepancy.site_visit_id AND visit.project_id = discrepancy.project_id)) THEN
    RAISE EXCEPTION 'SITE_VISIT_DISCREPANCY_PARENT_ORPHANS_REQUIRE_REPAIR';
  END IF;
  IF EXISTS(SELECT 1 FROM public.progress_history history WHERE history.project_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.projects project WHERE project.id = history.project_id)) THEN
    RAISE EXCEPTION 'PROGRESS_HISTORY_PROJECT_ORPHANS_REQUIRE_REPAIR';
  END IF;
END;
$$;

ALTER TABLE public.site_visits ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.progress_history ALTER COLUMN project_id SET NOT NULL;

-- Add missing constraints without rebuilding existing identity keys: later
-- provenance tables may legitimately depend on those keys.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.contractor_reports'::regclass AND conname='contractor_reports_identity_project_key') THEN
    ALTER TABLE public.contractor_reports ADD CONSTRAINT contractor_reports_identity_project_key UNIQUE(id,project_id);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.contractor_reports'::regclass AND conname='contractor_reports_project_fk') THEN
    ALTER TABLE public.contractor_reports ADD CONSTRAINT contractor_reports_project_fk FOREIGN KEY(project_id) REFERENCES public.projects(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.contractor_report_wps'::regclass AND conname='contractor_report_wps_report_project_fk') THEN
    ALTER TABLE public.contractor_report_wps ADD CONSTRAINT contractor_report_wps_report_project_fk FOREIGN KEY(report_id,project_id) REFERENCES public.contractor_reports(id,project_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.site_visits'::regclass AND conname='site_visits_identity_project_key') THEN
    ALTER TABLE public.site_visits ADD CONSTRAINT site_visits_identity_project_key UNIQUE(id,project_id);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.site_visits'::regclass AND conname='site_visits_project_fk') THEN
    ALTER TABLE public.site_visits ADD CONSTRAINT site_visits_project_fk FOREIGN KEY(project_id) REFERENCES public.projects(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.site_visit_wps'::regclass AND conname='site_visit_wps_visit_project_fk') THEN
    ALTER TABLE public.site_visit_wps ADD CONSTRAINT site_visit_wps_visit_project_fk FOREIGN KEY(site_visit_id,project_id) REFERENCES public.site_visits(id,project_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.site_visit_discrepancies'::regclass AND conname='site_visit_discrepancies_visit_project_fk') THEN
    ALTER TABLE public.site_visit_discrepancies ADD CONSTRAINT site_visit_discrepancies_visit_project_fk FOREIGN KEY(site_visit_id,project_id) REFERENCES public.site_visits(id,project_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.progress_history'::regclass AND conname='progress_history_project_fk') THEN
    ALTER TABLE public.progress_history ADD CONSTRAINT progress_history_project_fk FOREIGN KEY(project_id) REFERENCES public.projects(id) ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;

ALTER TABLE public.contractor_reports VALIDATE CONSTRAINT contractor_reports_project_fk;
ALTER TABLE public.contractor_report_wps VALIDATE CONSTRAINT contractor_report_wps_report_project_fk;
ALTER TABLE public.site_visits VALIDATE CONSTRAINT site_visits_project_fk;
ALTER TABLE public.site_visit_wps VALIDATE CONSTRAINT site_visit_wps_visit_project_fk;
ALTER TABLE public.site_visit_discrepancies VALIDATE CONSTRAINT site_visit_discrepancies_visit_project_fk;
ALTER TABLE public.progress_history VALIDATE CONSTRAINT progress_history_project_fk;

COMMIT;
