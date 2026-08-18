-- 139_schema_migration_ledger.sql
-- Establish an immutable, hash-pinned ledger from the explicitly supported
-- migration-132 baseline. New schema changes must be registered by the
-- deployment runner after their exact bytes have been applied.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migration_ledger(
  migration_id text PRIMARY KEY,
  sequence_number integer NOT NULL UNIQUE CHECK(sequence_number >= 0),
  filename text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL DEFAULT current_user
);

CREATE OR REPLACE FUNCTION private.prevent_schema_migration_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'SCHEMA_MIGRATION_LEDGER_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS schema_migration_ledger_immutable ON public.schema_migration_ledger;
CREATE TRIGGER schema_migration_ledger_immutable
  BEFORE UPDATE OR DELETE ON public.schema_migration_ledger
  FOR EACH ROW EXECUTE FUNCTION private.prevent_schema_migration_ledger_mutation();

CREATE OR REPLACE FUNCTION private.register_schema_migration(
  p_migration_id text,
  p_sequence_number integer,
  p_filename text,
  p_sha256 text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.schema_migration_ledger%ROWTYPE;
BEGIN
  IF p_migration_id IS NULL OR p_sequence_number < 0 OR p_filename IS NULL
    OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_SCHEMA_MIGRATION_REGISTRATION' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_existing FROM public.schema_migration_ledger
  WHERE migration_id = p_migration_id;
  IF v_existing.migration_id IS NOT NULL THEN
    IF v_existing.sequence_number <> p_sequence_number
      OR v_existing.filename <> p_filename OR v_existing.sha256 <> p_sha256 THEN
      RAISE EXCEPTION 'SCHEMA_MIGRATION_HASH_MISMATCH: %', p_migration_id USING ERRCODE = '55000';
    END IF;
    RETURN;
  END IF;
  INSERT INTO public.schema_migration_ledger(migration_id, sequence_number, filename, sha256)
  VALUES(p_migration_id, p_sequence_number, p_filename, p_sha256);
END;
$$;

-- This checkpoint names the one supported pre-ledger upgrade baseline. Its
-- digest pins the declaration and source revision rather than pretending that
-- historical databases had a ledger retroactively.
SELECT private.register_schema_migration(
  'supported-baseline-000-132', 132,
  'SUPPORTED_BASELINE_000_132@f14abab2e0051297bf3b4430be7b6984cdf64ff8',
  'd1a1a545d755c544cf780da1b2cb220ac3b14c8aecd4325e33462e1e5be95b48'
);

ALTER TABLE public.schema_migration_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schema_migration_ledger_admin_read ON public.schema_migration_ledger;
CREATE POLICY schema_migration_ledger_admin_read ON public.schema_migration_ledger
  FOR SELECT TO authenticated USING(
    EXISTS(SELECT 1 FROM public.profiles profile WHERE profile.id = auth.uid() AND lower(profile.role) = 'admin')
  );
REVOKE ALL ON TABLE public.schema_migration_ledger FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.schema_migration_ledger TO authenticated;

REVOKE ALL ON FUNCTION private.prevent_schema_migration_ledger_mutation(),
  private.register_schema_migration(text,integer,text,text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
