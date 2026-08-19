# Supabase Advisor audit — 2026-08-19

Project reviewed: OpenDay Production (`szgbkeqornkdngoegyso`). The audit was
read-only. Migration 148 is the forward-only remediation produced from these
findings; it has not been applied to a hosted database by automation.

## Security Advisor baseline after migration 147

| Advisor check | Count | Disposition |
| --- | ---: | --- |
| RLS enabled with no policy | 13 | Accepted closed/internal tables |
| Authenticated can execute SECURITY DEFINER | 156 | 153 intended RPCs/helpers; 3 direct helper exposures remediated by migration 148 |
| Leaked password protection disabled | 1 | Owner dashboard setting required |

## Evidence

- All 13 no-policy tables have RLS enabled and expose no table privilege to
  `anon` or `authenticated`. The no-policy state therefore denies Data API
  access instead of opening it.
- No authenticated `SECURITY DEFINER` function was executable by `anon` or
  through `PUBLIC`.
- Every authenticated `SECURITY DEFINER` function had an explicit
  `search_path`.
- `anon`, `authenticated`, and `PUBLIC` have no `CREATE` privilege on the
  `public`, `private`, or `storage` schemas, closing object-shadowing paths in
  the configured function lookup paths.
- Five thin RPC wrappers do not repeat an authorization check because they
  delegate immediately to a non-client-executable function that enforces the
  caller boundary:
  - `invite_project_tender_bidder` → `invite_project_tender_bidder_legacy_auto_accept`
  - `save_project_tender_setup` (invitation-message overload) →
    `save_project_tender_setup_legacy_create_tender`
  - `submit_contractor_report` → `submit_contractor_report_r1_base`
  - `save_project_boq_revision` → the protected BOQ revision legacy chain
  - `create_tender_line_clarification` → `create_tender_clarification`

## Migration 148 remediation

- Revokes every Data API role from `next_snag_number(bigint)` so a client
  cannot advance a project's canonical snag sequence directly.
- Revokes every Data API role from
  `is_active_project_member(bigint, uuid)` so a client cannot probe another
  user's project membership directly.
- Revokes direct client access from the internal
  `contractor_schedule_lifecycle_status(bigint)` helper.
- Adds `get_contractor_schedule_lifecycle_status(bigint)` for the UI. The new
  RPC requires `auth.uid()`, verifies project-scoped schedule access, and only
  then calls the internal canonical status helper.

After migration 148, the expected SECURITY DEFINER Advisor count is 154: the
three internal helper warnings disappear and one intentional safe read RPC is
added. The Advisor flags every authenticated `SECURITY DEFINER` RPC by design;
the remaining count is not itself evidence of a vulnerability.

## Owner-only Auth action

In each hosted project, open **Authentication → Settings → Password Security**
and enable leaked password protection. This is a Supabase Auth configuration,
not a PostgreSQL migration, and is available on Pro plans and above. Apply and
verify it in Staging first, then Production. Rerun Security Advisor afterward.

References:

- [Supabase Security and Performance Advisors](https://supabase.com/docs/guides/database/database-advisors)
- [Supabase Database Function security](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker)
- [Supabase password security](https://supabase.com/docs/guides/auth/password-security)

## Deferred performance findings

Performance Advisor reported 258 unindexed foreign keys, 48 Auth/RLS init-plan
recommendations, and 47 unused indexes. These are not release-blocking security
findings. Do not drop an index solely because a newly migrated or low-traffic
database has not used it yet. Address performance findings as a separate,
measured change set with query plans and workload evidence.
