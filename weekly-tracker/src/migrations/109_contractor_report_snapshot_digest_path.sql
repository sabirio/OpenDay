-- 109_contractor_report_snapshot_digest_path.sql
-- The reporting snapshot trigger hashes its immutable scope payload with
-- pgcrypto.digest(). Supabase installs pgcrypto in the `extensions` schema,
-- while migration 059 restricted this SECURITY DEFINER function to `public`.
-- Include the trusted extension schema so report creation can resolve digest.

BEGIN;

ALTER FUNCTION public.capture_contractor_report_scope_snapshot()
  SET search_path = public, extensions;

COMMIT;
