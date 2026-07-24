-- 037_retail_historical_project_profile.sql
-- Retail Historical Project Profile v1 (frozen design, see
-- OpenDay Retail Historical Project Profile v1 correction pass report).
--
-- Adds 10 canonical columns to the single `projects` table so the same
-- schema serves live project creation AND historical import (Capture Once,
-- Use Everywhere) - no historical_projects/locations/malls/countries/
-- cities/currencies/store_concepts/project_types table is created (Keep It
-- Simple: no evidence any of those solve a real problem today).
--
-- location_type is deliberately TEXT with NO CHECK constraint. The v1
-- application vocabulary (Mall/Street) is enforced at the import-validation
-- and UI layer only, so a future evidence-backed value (e.g. Airport) can be
-- added without a migration. A DB CHECK here would be the same rigidity the
-- frozen design explicitly rejected.
--
-- No existing column is renamed or reused for a different meaning:
--   construction_completion_date / forecast_opening_date remain CPM/Gantt
--   forecasts, owned exclusively by ganttService (see projectService.js's
--   own "owned by ganttService only" comment) - the three new actual_*
--   columns are observed historical facts and never overwrite them.
--
-- All columns nullable, no defaults - backward compatible with every
-- existing row, and "unknown" always stays NULL (never manufactured as 0).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS location_type text,
  ADD COLUMN IF NOT EXISTS store_concept text,
  ADD COLUMN IF NOT EXISTS sales_area_sqm numeric,
  ADD COLUMN IF NOT EXISTS back_of_house_area_sqm numeric,
  ADD COLUMN IF NOT EXISTS actual_construction_start_date date,
  ADD COLUMN IF NOT EXISTS actual_construction_completion_date date,
  ADD COLUMN IF NOT EXISTS actual_opening_date date,
  ADD COLUMN IF NOT EXISTS budget numeric(14,2),
  ADD COLUMN IF NOT EXISTS actual_cost numeric(14,2),
  ADD COLUMN IF NOT EXISTS currency_code text;

-- Rollback:
--   ALTER TABLE public.projects
--     DROP COLUMN IF EXISTS location_type,
--     DROP COLUMN IF EXISTS store_concept,
--     DROP COLUMN IF EXISTS sales_area_sqm,
--     DROP COLUMN IF EXISTS back_of_house_area_sqm,
--     DROP COLUMN IF EXISTS actual_construction_start_date,
--     DROP COLUMN IF EXISTS actual_construction_completion_date,
--     DROP COLUMN IF EXISTS actual_opening_date,
--     DROP COLUMN IF EXISTS budget,
--     DROP COLUMN IF EXISTS actual_cost,
--     DROP COLUMN IF EXISTS currency_code;
