-- 011_ownership_uuid.sql
-- Wave 1: ownership identity hardening.
--
-- Do not run blindly on production. Precheck legacy non-uuid owner values first:
--
-- SELECT id, submitted_by
-- FROM public.contractor_reports
-- WHERE submitted_by IS NOT NULL
--   AND submitted_by !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--
-- SELECT id, visited_by
-- FROM public.site_visits
-- WHERE visited_by IS NOT NULL
--   AND visited_by !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

BEGIN;

ALTER TABLE public.contractor_reports
  DROP CONSTRAINT IF EXISTS contractor_reports_submitted_by_fkey;

ALTER TABLE public.site_visits
  DROP CONSTRAINT IF EXISTS site_visits_visited_by_fkey;

ALTER TABLE public.contractor_reports
  ALTER COLUMN submitted_by TYPE uuid
  USING (
    CASE
      WHEN submitted_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN submitted_by::uuid
      ELSE NULL
    END
  );

ALTER TABLE public.site_visits
  ALTER COLUMN visited_by TYPE uuid
  USING (
    CASE
      WHEN visited_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN visited_by::uuid
      ELSE NULL
    END
  );

ALTER TABLE public.contractor_reports
  ADD CONSTRAINT contractor_reports_submitted_by_fkey
  FOREIGN KEY (submitted_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.site_visits
  ADD CONSTRAINT site_visits_visited_by_fkey
  FOREIGN KEY (visited_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

COMMIT;
