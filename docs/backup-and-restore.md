# Production backup and restore verification

Two scripts, both local-only and both refuse to run against anything that
isn't their intended target:

- `scripts/production-backup.ps1` — owner-executed, connects to **production**
  Supabase Postgres (read-only) and writes a timestamped dump under
  `backups/production/<timestamp>/`.
- `scripts/restore-verify.ps1` — connects to **no** database credentials at
  all. It restores a local backup directory into a throwaway `postgres:17`
  Docker container and checks that the restore is trustworthy, then deletes
  the container/volume.

Neither script is run by an AI agent against production. `restore-verify.ps1`
never touches production in any way — it doesn't even read
`.env.production.local`.

## Creating a backup (owner-executed)

```powershell
$head = (git rev-parse HEAD).Trim().ToLowerInvariant()
$releaseManifest = '.\scripts\manifests\<approved-release>.psd1'
$releaseManifestSha256 = (Get-FileHash $releaseManifest -Algorithm SHA256).Hash.ToLowerInvariant()
$backupScriptSha256 = (Get-FileHash '.\scripts\production-backup.ps1' -Algorithm SHA256).Hash.ToLowerInvariant()
.\scripts\production-backup.ps1 -SourceCommit $head -ReleaseManifestPath $releaseManifest `
  -ExpectedReleaseManifestSha256 $releaseManifestSha256 `
  -ExpectedBackupScriptSha256 $backupScriptSha256
```

The entry point is Windows PowerShell 5.1 compatible. Its `param()` block
contains no `$PSScriptRoot`-dependent defaults: after parameter binding the
script derives its absolute entry-point path from `$PSCommandPath` (with the
invoked script path as a validated fallback), derives the repository root
from that location, and only then resolves defaults. Relative path, absolute
path, `&`, wrapper-script, and non-repository working-directory invocations
therefore resolve identically.

Path resolution is fail-closed. Omitted or empty `-EnvFile` selects only
`weekly-tracker\.env.production.local` beneath the resolved repository root.
An explicit absolute path is used exactly; an explicit relative path is
repository-relative, never current-working-directory-relative. It must be an
existing regular non-reparse-point file before credentials can be loaded.
`-BackupRoot` similarly defaults to `backups\production`, and explicit roots
must remain within that repository-controlled tree. Missing, escaping,
reparse-point, malformed, or colliding destinations are rejected without
overwrite.

Safe offline validation performs no credential loading, Docker invocation,
network/database access, or backup-directory creation:

```powershell
.\scripts\production-backup.ps1 <release-binding-parameters> -ValidateOnly
.\scripts\production-backup.ps1 <release-binding-parameters> -ShowResolvedPaths
```

The latter prints paths only, never environment-file contents. A path or
parameter failure during release is `BLOCKED BEFORE APPLY - BACKUP TOOLING
DEFECT` and cannot be bypassed with an ad hoc dump. A tooling repair requires
a new owner approval bound to its commit and a fresh production backup before
preflight.

Reads `weekly-tracker\.env.production.local` (gitignored) in memory only —
the password is never echoed or logged. Verifies the connection fingerprint
(host is a Supabase pooler, port 5432, expected project ref) before running
anything, then produces, via a disposable `postgres:17` Docker container with
no host network access beyond the outbound connection to production:

- `roles.sql`, `schema.sql`, `data.sql` (read-only `pg_dump`/`pg_dumpall`)
- `migration_history_schema.sql` / `migration_history_data.sql` — either the
  real `supabase_migrations` schema, or (if that schema isn't present in the
  source database) two safe no-op SQL comment files, recorded as
  `migrationHistory.status: "not_present"` in the manifest
- `checksums.sha256` — SHA-256 of every dump file
- `backup-manifest.json` — status, timestamps, migration-history status,
  per-file checksums and release bindings; `status:
  "DUMP_CREATED_STATIC_VALIDATION_PASS_RELEASE_BOUND"` is the
  only value that marks a backup as complete (anything else, or a missing
  manifest, means partial/failed — `restore-verify.ps1` refuses those)

Backups live under `backups/production/`, which is `.gitignore`d — dump
files, checksums, and manifests are never committed.

## Running restore verification

```powershell
.\scripts\restore-verify.ps1 -BackupPath <fresh-backup> `
  -ExpectedSourceCommit <40-char-head> `
  -ExpectedReleaseManifestSha256 <64-char-release-manifest-sha256> `
  -ExpectedBackupScriptSha256 <64-char-canonical-script-sha256>
# or
.\scripts\restore-verify.ps1 -Latest <same-release-binding-parameters>
```

`-Latest` picks the most recent directory under `backups/production/` whose
manifest reports the complete status above — it never falls back to a
partial/failed attempt, and it cannot be combined with `-BackupPath`.

### Release-binding semantics

Every qualifying backup is bound before credentials or Docker are used. The
script requires current `HEAD` as `sourceCommit`, independently hashes the
approved release manifest, and independently hashes the canonical repository
entry point. `releaseManifestSha256` and compatibility field `manifestSha256`
both mean the SHA-256 of the approved release manifest; neither is the hash of
`backup-manifest.json`. A manifest cannot contain its own final hash without a
recursive definition, so callers hash the completed JSON file separately and
pass that sidecar value to preflight/apply as
`ExpectedBackupManifestSha256`. `scriptSha256` identifies the exact canonical
backup entry point. An optional approved tag is recorded only when explicitly
supplied.

Malformed or non-HEAD commits, missing/escaping manifests, hash mismatches,
and destination collisions fail before production connectivity. Old unbound
backups—including `20260714T122356Z`—remain valid historical artifacts but
cannot be selected by `-Latest`, restored as release-qualified, or authorize
preflight/apply. Never edit an old manifest to add bindings. Any canonical
tooling change creates a new HEAD and requires a renewed approval contract.

### Why no production credentials are involved

`restore-verify.ps1` only ever reads files already sitting on disk in the
backup directory. It never opens `.env.production.local`, never accepts a
connection string, and the disposable container is seeded with
`POSTGRES_HOST_AUTH_METHOD=trust` — a login method that's only acceptable
because the container is thrown away at the end of the run, never has a host
port published, and never touches a credential that means anything outside
that one container's lifetime.

### Why the container never publishes a host port

The local dev Supabase stack already owns `54321-54324`, and a stray local
Postgres service on this machine already owns `5432`. The verifier avoids
all of that by not publishing any port at all — every interaction happens
through `docker exec ... psql` inside the container's own network namespace.
This also means it can never collide with a running Supabase project,
regardless of what else is running on the machine.

### Restore order, and the temp-copy filters

Restore always runs in this order, each `psql` call using
`-X -v ON_ERROR_STOP=1` (no `~/.psqlrc`, no continuing past an unexpected
error):

1. `roles.sql`
2. `schema.sql`
3. `migration_history_schema.sql`
4. `migration_history_data.sql`
5. `data.sql`

Three narrow, fully-documented conditions get a **TEMP-copy-only**
adjustment before that strict run — the real backup files on disk are never
modified, and anything outside these three exact cases still fails the run
under strict `ON_ERROR_STOP=1`:

| File | Problem | Fix |
|---|---|---|
| `roles.sql` | `CREATE ROLE postgres;` — `postgres:17`'s own `initdb` already created this role | that one `CREATE ROLE` line dropped |
| `roles.sql` | `ALTER ROLE postgres WITH NOSUPERUSER ...` — Postgres refuses to strip `SUPERUSER` from the actual bootstrap superuser | only the `NOSUPERUSER` token stripped; every other attribute (`INHERIT`, `CREATEROLE`, `CREATEDB`, `LOGIN`, `REPLICATION`, `BYPASSRLS`, ...) kept verbatim |
| `roles.sql` | `GRANT <role> TO <member> ... GRANTED BY supabase_admin;` — on a fresh container `supabase_admin` never has `ADMIN OPTION` on the granted role (Supabase's real infrastructure sets that up outside anything `pg_dumpall --roles-only` captures) | only the `GRANTED BY <grantor>` clause stripped; the role, member, and every `WITH ADMIN OPTION` / `INHERIT {TRUE\|FALSE}` / `SET OPTION {TRUE\|FALSE}` clause is preserved exactly |
| `schema.sql` | `CREATE EXTENSION supabase_vault ...` (and similarly `pgsodium`, `pg_graphql`, `pg_net`, `pgjwt`, `wrappers`, `pg_cron`) — these ship only in Supabase's own Postgres build, never in vanilla `postgres:17` | the `CREATE EXTENSION`/`COMMENT ON EXTENSION` pair for that extension dropped; any table that only exists because of that extension (e.g. `vault.secrets`) is then also absent, and its `data.sql` `COPY` block is skipped the same way — recorded per-table in the report, never treated as an error |

Every one of these is a deterministic property of restoring a *Supabase*
dump into *vanilla* Postgres — not a backup defect, and not something that
varies by how good or bad a given backup is. The report's `restoreSteps[]`
and `roleMemberships.grantorFidelity: "normalized"` record exactly what was
adjusted on every run.

**What is validated, not just assumed, after these adjustments:**

- **Role membership graph**: after `roles.sql` restores, every membership
  edge (`role` → `member`, plus `ADMIN OPTION`/`INHERIT`/`SET OPTION` where
  the source specified them) is independently re-read from
  `pg_auth_members` and compared against what `roles.sql` declared. The
  *grantor* column is deliberately not checked (it's supposed to differ —
  see the table above); the edge itself must match exactly, or the run
  fails.
- **Row counts**: `data.sql` is parsed for every `COPY ... FROM stdin; ... \.`
  block and the row count between the header and the terminator is counted
  *before* Docker ever starts. After restore, `COUNT(*)` is run for every
  one of those tables and compared. A mismatch on any `public`-schema
  (application) table fails the run; mismatches on Supabase-internal tables
  that genuinely can't exist without a filtered extension (e.g.
  `vault.secrets`) are recorded but don't gate PASS/FAIL, since a table with
  zero source rows and no live relation isn't a discrepancy.
- **Constraints**: every `NOT VALID` constraint found live is compared
  against constraints `schema.sql` itself declares `NOT VALID` (a simple
  text scan of the backup file — the source of truth, never hardcoded). A
  constraint that's `NOT VALID` in both is a faithful restore, not a defect.
  A constraint that's `NOT VALID` live but *wasn't* declared that way in the
  source is treated as a real problem and fails the run. (For the backup
  this was built against, `realtime.messages.messages_payload_exclusive` is
  `NOT VALID` in production's own `schema.sql` — restoring it as `NOT VALID`
  is correct, not a bug.)
- **Triggers**: `pg_trigger.tgenabled` is checked directly for every
  non-internal `public`-schema trigger; any `'D'` (disabled) fails the run.
- **`session_replication_role`**: see below.

### The single-session data load

`data.sql` sets `session_replication_role = replica` before loading (so
foreign-key/trigger checks don't fire mid-load — needed because
`reports.previous_report_id` is a non-deferrable self-referencing foreign
key, and several `public` tables reference `public.projects`/`public.reports`
in COPY order), then sets it back to `origin` afterward. This **must** happen
inside one `psql` invocation:

```
psql -X -v ON_ERROR_STOP=1 -c "SET session_replication_role = replica;" -f data.filtered.sql -c "SET session_replication_role = origin;"
```

`session_replication_role` is a per-**connection** setting, and each
`docker exec ... psql ...` call opens a new connection. An earlier version of
this script ran the `SET` and the `-f` load as two separate `docker exec`
calls — the `replica` setting silently never applied to the connection doing
the actual load, foreign-key enforcement stayed active, and (because of the
self-referencing `reports` table and the `projects`-dependency chain) every
core table ended up with **zero rows**, while the script still reported
`PASS` — the constraint-validity check passed vacuously against empty
tables. The fix, and the reason this must always be one `psql` invocation,
is documented in `scripts/lib/RestoreVerifyHelpers.ps1` and covered by an
offline test that greps the source for exactly this pattern.

After the load, a **fresh** connection runs `SHOW session_replication_role;`
and the run fails unless it reports `origin` — proving the override didn't
leak forward into anything else.

## Interpreting PASS / FAIL

```
RESTORE_VERIFICATION: PASS
Checksums: PASS
Schema restore: PASS
Data restore: PASS
Row counts: PASS
Constraints: PASS
Triggers: PASS
Cleanup: PASS
Report: <path>
```

PASS is fail-closed: `overallStatus` starts as `FAIL` and is set to `PASS`
exactly once, at the very end of every phase succeeding — any thrown error,
anywhere, leaves it `FAIL`. A `PASS` result that had a failed cleanup is
downgraded to `FAIL` after the fact (a leftover disposable container/volume
is itself one of the gates, not a footnote). Any check whose result was
never actually computed reports `FAIL`, never a default `PASS`.

On failure:

```
RESTORE_VERIFICATION: FAIL
Failed step: <step>
Reason: <safe technical summary>
Cleanup: PASS|FAIL
Report: <path if created>
```

The backup directory is never deleted, on success or failure. Disposable
Docker resources (container, volume, temp filtered-SQL directory) are always
cleaned up in a `finally` block, whether the run passed or failed.

## The JSON report

Written to `<BackupPath>/restore-verification.json`, UTF-8 without a BOM
(via `[System.IO.File]::WriteAllText` + `[System.Text.UTF8Encoding]::new($false)`
— compatible with Windows PowerShell 5.1 and PowerShell 7+; `-Encoding
utf8NoBOM` is PowerShell 7+/Core-only and isn't used anywhere in this repo's
scripts). Contains only technical results: timestamps, the Postgres image,
checksum/manifest/migration-history status, every restore step with its
outcome, schema presence, table counts, per-table `sourceCopyRows` /
`restoredRows` / `match`, constraint and trigger findings, the role-
membership graph comparison, cleanup result, and the overall PASS/FAIL with
a reason on failure. It never contains a password, connection string, table
row content, or any other user/personal data — only counts, booleans, and
structural identifiers (table/constraint/trigger/role names).

## Tests

`scripts/tests/restore-verify.tests.ps1` — a plain assertion script (no
Pester dependency in this project; introducing one for a single script's
tests wasn't worth the added infrastructure). Fully offline: no Docker, no
network, no production access. Run with:

```powershell
powershell -File scripts\tests\restore-verify.tests.ps1
```

Covers: AST parse of both files, absence of `-Encoding utf8NoBOM` and other
PowerShell-7-only syntax, the UTF-8-no-BOM helper, the `COPY` row parser
(empty/populated/multiple/quoted-identifier/escaped-content blocks, and that
malformed or unterminated blocks throw rather than silently under-counting),
the three roles.sql/schema.sql/data.sql temp-copy filters (including the
single-result case that once silently unwrapped to a scalar and broke every
`.Count` caller — now a standing regression test), parameter validation,
checksum-mismatch-stops-before-Docker, report schema completeness,
fail-closed behavior, the single-psql-invocation data-load pattern, and that
cleanup only ever targets this run's own randomly-suffixed container/volume
names.

## Known limitations

- Verification runs on vanilla `postgres:17`, not Supabase's own Postgres
  build — anything that depends on a Supabase-proprietary extension not on
  the documented allow-list will fail the run rather than being silently
  filtered. That's intentional: an unrecognized failure should surface, not
  disappear.
- Grantor attribution (`GRANTED BY`) in the role-membership graph is
  intentionally not restored to match production — see the table above.
  `roleMemberships.grantorFidelity: "normalized"` marks this explicitly in
  every report.
- This verifies restore fidelity (schema, data, constraints, triggers, role
  memberships) — it does not verify Storage object bytes, external Auth
  provider configuration, or Edge Functions/secrets, none of which
  `production-backup.ps1` captures (see its `known_exclusions` manifest
  field).
