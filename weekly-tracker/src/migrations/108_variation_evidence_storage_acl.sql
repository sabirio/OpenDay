-- 108_variation_evidence_storage_acl.sql
-- Keep variation upload intents private while allowing Storage RLS policies
-- to inspect the authenticated user's own active intent.
--
-- Migration 086 created an authenticated SELECT policy on this table but then
-- revoked the table-level SELECT privilege. PostgreSQL checks that privilege
-- while planning every storage.objects request whose policies reference the
-- table, including unrelated uploads to the site-photos bucket. The result was
-- `permission denied for table project_variation_evidence_upload_intents`.

BEGIN;

REVOKE ALL ON TABLE public.project_variation_evidence_upload_intents
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.project_variation_evidence_upload_intents
TO authenticated;

COMMIT;
