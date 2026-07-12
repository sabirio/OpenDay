-- Migration 029: production ACL follow-up for migration 028
--
-- Migration 028 (production_security_reconciliation) revoked anon/authenticated
-- access from public.write_command_requests (the TABLE) and from the two
-- atomic write RPCs, then re-granted only what was intended. It did not
-- separately correct two categories of object that carry their OWN,
-- independent ACL rather than inheriting the table's:
--
--   1. public.write_command_requests_id_seq - the bigserial sequence
--      auto-created alongside write_command_requests.id. A sequence's ACL
--      is a distinct catalog entry from its owning table's ACL; REVOKE ALL
--      ON <table> never touches it.
--   2. anon's EXECUTE on both atomic RPC functions. REVOKE ALL ... FROM
--      PUBLIC removes the revocable grant made to the PUBLIC pseudo-role,
--      but does not remove a separate, direct grant already held by a
--      named role (anon).
--
-- Root cause (confirmed 2026-07-12 via a read-only production query against
-- pg_default_acl, see work/production-029-approval-evidence/
-- pg-default-acl-investigation.json and acl-analysis.json): the production
-- database carries a platform-configured `ALTER DEFAULT PRIVILEGES` rule,
-- owned by role postgres, scoped to schema public, that auto-grants broad
-- privileges to anon/authenticated/service_role on every NEW table,
-- sequence, and function created in that schema. This rule predates this
-- migration, is not set by any migration in this repository (0-028
-- contain zero CREATE ROLE / ALTER ROLE / ALTER DEFAULT PRIVILEGES
-- statements), and does not apply retroactively (confirmed: the
-- pre-existing projects_id_seq has no anon ACL entry at all). Migration
-- 028 created write_command_requests_id_seq and the two RPC functions as
-- brand-new objects, so they silently inherited this default and the
-- REVOKE statements 028 already had did not reach them.
--
-- This migration closes that gap for exactly the three affected objects.
-- It intentionally does NOT touch ALTER DEFAULT PRIVILEGES itself: that
-- setting is platform-wide (also covers storage/graphql schemas, not
-- scoped to this feature), is not proven safe or necessary to change, and
-- altering it would affect every future object project-wide rather than
-- just these three. See docs/PRODUCTION_SECURITY_REMEDIATION_RUNBOOK.md
-- for the durable guard this decision requires of future migrations:
-- every migration that creates a table, sequence, or function in schema
-- public must explicitly close its own ACL contract (REVOKE/GRANT as
-- needed) in the same file, rather than relying on the default to be
-- narrow.
--
-- Desired end state (proved via aclexplode against real production before
-- writing this migration, see acl-analysis.json):
--   write_command_requests_id_seq: postgres, service_role only.
--     (Both atomic RPCs are SECURITY DEFINER and execute all sequence
--     access as their owner, postgres - neither anon nor authenticated
--     ever needs a direct sequence privilege, matching the table's own
--     already-correct anon/authenticated REVOKE from 025/028.)
--   submit_contractor_report_atomic / submit_site_visit_atomic:
--     EXECUTE for authenticated (the actual application caller),
--     postgres, service_role. anon must not be able to invoke either.
--
-- No RLS policy, role, default-privilege, or unrelated-object change is
-- made by this migration.

BEGIN;

REVOKE ALL ON SEQUENCE public.write_command_requests_id_seq FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.submit_contractor_report_atomic(bigint, date, jsonb, jsonb, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_site_visit_atomic(bigint, bigint, date, jsonb, jsonb, uuid) FROM anon;

COMMIT;
