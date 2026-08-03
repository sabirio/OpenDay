-- Restrict the three company/project RLS helper functions to authenticated
-- only: idempotent, safely re-applicable privilege narrowing; no
-- function-body, schema, data, ownership or policy mutation.
--
-- can_admin_company(text), can_create_project(text), and
-- can_write_project(bigint) were created by 020_rls_company_role_hardening.sql
-- with no REVOKE/GRANT statements of their own, so they have carried
-- Supabase's platform-default privileges (PUBLIC + anon + service_role
-- EXECUTE - confirmed live via work/production-029-approval-evidence/
-- pg-default-acl-investigation.json, whose pg_default_acl dump shows the
-- platform's public-schema default already includes service_role for
-- every function, not just anon/authenticated) ever since. Confirmed via a
-- disposable-PostgreSQL reconstruction of their live pg_proc.prosrc against
-- the exact 020 source, with zero drift (Simplification Phase 3E.4, Gate
-- 13B/13B-R) - the functions themselves are correct, non-recursive, fully
-- schema-qualified, and already fail closed on an unauthenticated caller
-- (auth.uid() IS NULL -> false), so this is a defense-in-depth excess-ACL
-- closure, not a fix for an exploitable data leak. Mirrors the identical
-- anon/PUBLIC pattern already applied to the eight Contractor-Managed
-- Schedule RPCs in 055_restrict_contractor_schedule_function_acl.sql (055
-- did not address service_role for those eight; that remains a separate,
-- undecided gap, not touched here).
--
-- service_role is explicitly revoked, not left at its default/implicit
-- state. service_role bypasses RLS, but RLS bypass and function EXECUTE
-- privilege are two independent checks - service_role does NOT bypass
-- EXECUTE. Leaving it unaddressed produces a different, environment-
-- dependent result: live Supabase staging currently shows service_role
-- EXECUTE=true (inherited platform default, never revoked by any
-- migration), while a disposable copy restored from an ACL-stripped
-- schema dump (production-backup.ps1 uses --no-privileges) shows
-- service_role EXECUTE=false, purely as an artifact of the restore
-- tooling. A repository-wide audit (Simplification Phase 3E.4 Gate 13B/056
-- design review) found zero call sites - browser/authenticated clients,
-- service-role scripts (seed.mjs, verify-f03-scope-narrowing.mjs,
-- scripts/certification/*.mjs), raw psql, Edge Functions, or CI - that
-- invoke these three functions directly as service_role. The only internal
-- callers are other SECURITY DEFINER functions (e.g. 025, 028, 030, 033,
-- 034, 035, 038, 039, 040, 046, 047, 049, 052, 053, 054), which execute
-- nested calls under their own owner's privileges regardless of the
-- original caller's role, and RLS policies, which evaluate only under the
-- querying session's role (always authenticated per each policy's own `TO
-- authenticated` clause). service_role has no legitimate need for direct
-- EXECUTE, so the deterministic target is REVOKE, not GRANT - the same
-- explicit-over-implicit posture 025/028 already use for
-- write_command_requests (see 028 Part 1's own comment: "explicit here
-- rather than assumed").
--
-- authenticated is also included in every REVOKE, immediately before its
-- own GRANT EXECUTE. This is required, not redundant: GRANT does not
-- narrow an existing grant - if authenticated already held EXECUTE WITH
-- GRANT OPTION on any of these three functions (from a prior manual grant,
-- a platform default, or drift), a plain `GRANT EXECUTE ... TO
-- authenticated` would leave that grant option in place, since granting a
-- privilege a role already holds is a no-op with respect to any grantable
-- flag already set. REVOKE ALL unconditionally clears every existing
-- grant, including the grant-option bit, before the immediately following
-- GRANT EXECUTE re-establishes plain (non-grantable) EXECUTE. The
-- resulting state is deterministic regardless of what authenticated held
-- before this migration ran.
--
-- This migration is function-ACL only. It does not touch public.projects
-- itself (or any other table) - that table's own excess anon/authenticated
-- grants are already addressed by 028_production_security_reconciliation.sql
-- (Part 5), which real live evidence indicates may not yet be applied to
-- every environment; reconciling that is a separate, environment-specific
-- bridge decision tracked as Gate 13C, not new SQL, and is out of scope
-- here.
--
-- Rollback (not recommended - see docs/PRODUCTION_ROLLBACK_RUNBOOK.md
-- forward-only policy):
--   GRANT EXECUTE ON FUNCTION public.can_admin_company(text) TO PUBLIC, service_role;
--   GRANT EXECUTE ON FUNCTION public.can_create_project(text) TO PUBLIC, service_role;
--   GRANT EXECUTE ON FUNCTION public.can_write_project(bigint) TO PUBLIC, service_role;

REVOKE ALL ON FUNCTION public.can_admin_company(text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_admin_company(text)
TO authenticated;

REVOKE ALL ON FUNCTION public.can_create_project(text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_project(text)
TO authenticated;

REVOKE ALL ON FUNCTION public.can_write_project(bigint)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_project(bigint)
TO authenticated;
