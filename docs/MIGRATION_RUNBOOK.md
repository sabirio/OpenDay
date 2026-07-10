# Migration runbook

**Update 2026-07-10 (Sprint 4.5):** this runbook has now actually been
executed, three times end to end, against a real local Supabase stack — not
just written. Two real defects surfaced only by running it (not by reading
the SQL) and are now fixed:

- **DEFECT-02**: `011_ownership_uuid.sql` fails outright on a fresh install
  (`operator does not exist: uuid ~* unknown`) — `000_baseline.sql` already
  declares the columns 011 tries to migrate as `uuid`. Fix: **skip `011`**
  on fresh installs, same treatment as `001-009` (011 is still required
  when upgrading a genuinely pre-011 database). No SQL changed.
- **DEFECT-03**: the fresh chain has RLS policies on every table but never
  grants `authenticated` the base `SELECT/INSERT/UPDATE/DELETE` table
  privileges those policies filter — every direct query fails `42501`
  before RLS is even evaluated. Fix: new migration
  `026_grant_authenticated_table_privileges.sql`, explicit per-table,
  `write_command_requests` deliberately excluded (025 revokes it on
  purpose — do not re-grant it).

**Corrected fresh path: `000`, `010`, `012–026` in numeric order** (011
excluded). See `docs/DATABASE_CERTIFICATION_REPORT.md` and
`docs/MIGRATION_CHAIN_AUDIT.md` for full reproduction detail, and
`weekly-tracker/scripts/certification/resetAndDeploy.mjs` for the
executable version of this exact sequence.

1. Never edit or replay historical `001–009` **or `011`** on a fresh database.
2. Fresh path: `000`, `010`, `012–026` in numeric order (011 excluded — see DEFECT-02 above), following README exceptions/notes.
3. Use an isolated Supabase project/local stack; never production for rehearsal.
4. Record environment, migration filenames and checksums before applying.
5. Apply through `026_grant_authenticated_table_privileges.sql`, then verify functions, grants, indexes, columns and RLS flags — **including base table grants, not only policies** (DEFECT-03).
6. Run application tests plus contractor/site-visit RPC success, replay, authorization and forced-failure scenarios. As of Sprint 4.5 this step is automated: `npm run test:certification` (requires local Docker + Supabase CLI; see `docs/CERTIFICATION_ENVIRONMENT.md`).
7. Compare migration ledger/checksums with repository before deployment.

Validation queries should inspect `pg_proc.prosecdef/proconfig`, `information_schema.columns`, `pg_indexes`, `pg_policies`, **`information_schema.role_table_grants`**, and execute permissions. Rollback of functions/request table is feasible before production dependency; dropping convention/version metadata after writes is data-loss and requires a separate forward migration. No production migration was executed in Sprint 4 or Sprint 4.5.

