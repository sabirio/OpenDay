-- 019_primary_key_defaults.sql
-- P0.3: Fresh-install bigint primary key defaults.
--
-- Purpose:
-- 000_baseline.sql captured several production tables as `bigint PRIMARY KEY`
-- without explicit defaults. The browser app inserts into these tables without
-- supplying ids:
--   - projects      via projectService.create()
--   - reports       via reportService.create()
--   - site_visits   via siteVisitService.create()/submitSiteVisit()
--   - progress_history via report/contractor history writes
--
-- On a fresh database, those inserts fail unless the database generates ids.
-- This migration adds sequence-backed defaults only when a default is missing.
-- Existing serial/bigserial/identity defaults are left untouched.
--
-- Identity-column note (found live, 2026-07-06): a table created via the
-- Supabase Studio Table Editor gets `id bigint GENERATED ... AS IDENTITY` by
-- default, not a plain `DEFAULT nextval(...)`. Identity columns report NULL
-- for `information_schema.columns.column_default` too (the generation isn't
-- stored there), so a naive `v_default IS NULL` check can't tell "no default
-- at all" apart from "already has an identity". Attempting to attach a fresh
-- sequence via `ALTER SEQUENCE ... OWNED BY` then fails with
-- `0A000: cannot change ownership of identity sequence` because Postgres
-- already owns and manages that column's sequence internally. Guarded below
-- by also checking `is_identity`.
--
-- Rollback, if needed:
--   ALTER TABLE public.projects         ALTER COLUMN id DROP DEFAULT;
--   ALTER TABLE public.reports          ALTER COLUMN id DROP DEFAULT;
--   ALTER TABLE public.site_visits      ALTER COLUMN id DROP DEFAULT;
--   ALTER TABLE public.progress_history ALTER COLUMN id DROP DEFAULT;
--   DROP SEQUENCE IF EXISTS public.projects_id_seq;
--   DROP SEQUENCE IF EXISTS public.reports_id_seq;
--   DROP SEQUENCE IF EXISTS public.site_visits_id_seq;
--   DROP SEQUENCE IF EXISTS public.progress_history_id_seq;

DO $$
DECLARE
  r record;
  v_default text;
  v_is_identity text;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('projects', 'projects_id_seq'),
      ('reports', 'reports_id_seq'),
      ('site_visits', 'site_visits_id_seq'),
      ('progress_history', 'progress_history_id_seq')
    ) AS targets(table_name, sequence_name)
  LOOP
    SELECT column_default, is_identity
      INTO v_default, v_is_identity
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = r.table_name
      AND column_name = 'id';

    IF v_default IS NULL AND COALESCE(v_is_identity, 'NO') <> 'YES' THEN
      EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I', r.sequence_name);
      EXECUTE format('ALTER SEQUENCE public.%I OWNED BY public.%I.id', r.sequence_name, r.table_name);
      EXECUTE format(
        'SELECT setval(%L, COALESCE((SELECT MAX(id) FROM public.%I), 0) + 1, false)',
        'public.' || r.sequence_name,
        r.table_name
      );
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT nextval(%L::regclass)',
        r.table_name,
        'public.' || r.sequence_name
      );
    END IF;
  END LOOP;
END $$;
