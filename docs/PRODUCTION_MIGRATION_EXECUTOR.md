# Generalized production migration executor

Replaces the per-migration hardcoded pattern (`production-remediation-apply.ps1`
for migration 028, `production-migration029-apply.ps1` for migration 029) with
one manifest-driven executor that can apply any reviewed, ordered set of
migration files to production, without ever accepting an arbitrary SQL file
or path on the command line.

**AI agents do not run any of the scripts below against production** — not
even the read-only preflight. This mirrors the existing rule in
`docs/backup-and-restore.md` for `production-backup.ps1`, extended to the
whole migration-apply lifecycle. Every script in this document is
owner-executed. An agent's role stops at: building/testing this tooling,
running `-ValidateOnly`, running the disposable certification, and preparing
the exact commands below for the owner to run.

## Components

| File | Purpose |
|---|---|
| `scripts/manifests/<batch>.psd1` | Reviewed, tracked manifest: which migration files, in what order, with what SHA-256, for which approved project ref and authoritative commit. |
| `scripts/lib/MigrationManifestValidator.ps1` | Pure validation functions: manifest schema, strict order (+ contiguity), path containment (blocks traversal/absolute paths), byte-exact checksums, git-tracked-and-clean state (independent of checksum — see below), repository HEAD ancestry, the deterministic confirmation phrase, secret redaction. |
| `scripts/lib/ManifestMigrationExecutor.ps1` | Connection-agnostic execution engine (`Invoke-ManifestMigrationSequence`). Takes already-resolved PG connection values and a validated manifest; applies each file via one `psql -X -v ON_ERROR_STOP=1` invocation per file, in order, stopping on the first non-zero exit. No retry loop. Used unmodified by both the disposable certification and the real production apply script. |
| `scripts/lib/SnagListMigrationContract.ps1` | Batch-specific (Snag List 030-035) read-only object-inventory and contract assertions, via the same `$Query`-callback convention as `lib/RemediationPreflightPostflight.ps1`. |
| `scripts/production-migration-apply.ps1` | The CLI. Two parameter sets: `-ValidateOnly` (manifest/order/path/checksum/git-identity only — never touches Docker, network, or a credential) and Apply mode (everything `-ValidateOnly` checks, plus verified-backup checksum, approved-preflight-result checksum and status, an exact confirmation phrase computed from the manifest, then the production connection and apply). |
| `scripts/production-migration-preflight-live.ps1` | Read-only. Confirms the batch's objects are entirely absent and predecessor objects are present, via a bounded `READ ONLY REPEATABLE READ` transaction per query (`New-ReadOnlyCatalogScript`) with a forbidden-statement guard. Writes an atomic evidence file whose `status` the apply script re-checks. |
| `scripts/production-migration-postflight-live.ps1` | Read-only. Confirms every expected object exists with the expected contract (RLS enabled, private buckets, no anon execute grant). Never calls a business RPC, never creates a row. |
| `scripts/production-migration-disposable-certification.ps1` | Restores the already-verified production backup into disposable, throwaway Postgres containers (never production) and proves: (1) happy path — preflight READY → apply → postflight PASS → 0 unexpected row-count differences on pre-existing tables → a repeat preflight against the same now-applied database reports NOT_READY; (2) failure injection — a 6-migration test batch where steps 1–3 pass and step 4 fails: steps 5–6 are reported NOT_ATTEMPTED **and** their database objects are proven absent by direct query, not just missing from the log; (3) partial state — only the first 2 of 6 migrations applied, preflight against the full manifest reports NOT_READY with a drift/partial reason. |
| `scripts/tests/production-migration-executor.tests.ps1` | Plain assertion script (no Pester), fully offline. Covers manifest/order/path/checksum/identity validation, secret redaction, atomic evidence, no-retry-loop, no-arbitrary-SQL-surface, and the idempotency/partial-apply policy below. |

## Manifest contract

A `.psd1` manifest is a plain PowerShell data file (`Import-PowerShellDataFile`
— never `Invoke-Expression`, no code execution). Required keys:

```powershell
@{
    schemaVersion = 1
    batchId = 'SNAG-LIST-030-035'
    approvedProjectRef = 'szgbkeqornkdngoegyso'
    authoritativeCommit = '<40-char full SHA>'
    migrationsDirectory = 'weekly-tracker\src\migrations'
    contiguousSequence = $true
    migrations = @(
        @{ number = 30; file = '030_....sql'; sha256 = '<64-char lowercase hex>' }
        # ...
    )
}
```

- `migrations[].file` must be a bare filename matching `^\d{3}_[a-z0-9_]+\.sql$`
  — no path separators, no `..`. `Resolve-ManifestMigrationPath` re-resolves
  every path and rejects anything that lands outside `migrationsDirectory`.
- Order must be strictly ascending, no duplicates; if `contiguousSequence`
  is `$true`, no gaps are allowed either.
- Every checksum is recomputed from the actual file on disk immediately
  before use — a manifest's declared hash is never trusted without a fresh
  `Get-FileHash`.

## Target identity

Two distinct failure classes exist, and the tooling reports them differently:

- **Malformed project ref** (e.g. `bad-ref`, wrong length, uppercase, symbols)
  is rejected by manifest *schema* validation
  (`Import-MigrationManifest`'s `approvedProjectRef -match '^[a-z0-9]{15,25}$'`
  check) — this fails before anything about a real connection is even
  considered.
- **Valid-but-wrong project ref** — a real connection resolves to a
  project ref that is syntactically fine but different from
  `manifest.approvedProjectRef` — is rejected by
  `Get-ProductionConnectionFingerprint`'s exact, case-sensitive comparison
  of the connection URL's embedded username (`postgres.<ref>`) against
  `postgres.<manifest.approvedProjectRef>`. This runs *before* any migration
  file is ever applied — `production-migration-apply.ps1`'s connection
  fingerprint call is unconditionally sequenced before its call to
  `Invoke-ManifestMigrationSequence`. Both `production-migration-apply.ps1`
  and `production-migration-preflight-live.ps1`/`-postflight-live.ps1`
  route through this one shared function; there is no second, weaker
  comparison anywhere else in the codebase for a caller to fall back on.
- The manifest's `approvedProjectRef` is never accepted from a CLI
  parameter — it can only ever come from the reviewed, tracked `.psd1` file.

`scripts/tests/production-migration-executor.tests.ps1` proves the
valid-but-wrong case directly, via dependency injection: a fake,
syntactically-valid `PRODUCTION_DB_URL` pointing at a different project ref
is written to a gitignored fixture file and passed to
`Get-ProductionConnectionFingerprint` — no real credential, no real host, no
network call of any kind (the function only parses a URL and validates its
fields; the actual `psql`/Docker connection happens later, in a separate
step, and is never reached in this test).

## Dirty migration protection

A checksum match against the **manifest's declared hash** is a different
invariant from "this file's content is exactly what Git has committed" — a
migration file could be modified on disk, its manifest `sha256` updated to
match the new (uncommitted) content, and `Test-ManifestMigrationChecksums`
would report PASS even though the file no longer matches anything ever
reviewed or committed.

`Assert-MigrationFileTrackedAndClean` (and its batch-level wrapper,
`Test-ManifestMigrationsTrackedAndClean`) closes this gap independently:

1. the file must be tracked by Git (`git ls-files --error-unmatch`);
2. `git status --porcelain` for that exact path must be empty — no
   unstaged change, no staged change, no intent-to-add.

This runs as its own step, with its own distinct failure —
`TRACKED MIGRATION FILE IS DIRTY` — never conflated with
`MIGRATION HASH MISMATCH`, in `production-migration-apply.ps1`,
`-preflight-live.ps1`, and `-postflight-live.ps1` alike. A modified tracked
file with a *stale* manifest checksum is blocked by the hash gate; a
modified tracked file with an *updated, matching* manifest checksum is
blocked specifically by this gate instead — both are proven as separate
test cases (`scripts/tests/fixtures/900_dirty_gate_test_migration.sql`,
transiently modified and restored via `git checkout --` inside a `finally`
block, with a post-test hash comparison proving restoration actually
happened rather than being assumed).

## Validation-only mode

```powershell
.\scripts\production-migration-apply.ps1 `
  -ManifestPath .\scripts\manifests\snag-list-030-035.psd1 `
  -ValidateOnly
```

Checks manifest schema, order, path containment, checksums, git-tracked-and-
clean state, and repository identity. Exits 0/1. **Never opens Docker, a
network connection, or a credential** — safe to run as often as wanted, by
anyone with read access to the repository, including an AI agent.

Repository identity is an **ancestor check**, not exact equality:
`manifest.authoritativeCommit` must be HEAD itself or an ancestor of HEAD
(`git merge-base --is-ancestor`). This identifies the reviewed application
commit the migration files and their checksums were computed against — it
is deliberately not "the only commit this tool may ever run from", so a
later commit that only touches tooling (this hardening pass, for example)
does not make a previously-certified manifest impossible to validate or
apply. The safety property that actually matters — that the reviewed
migration *content* is genuinely present — is independently guaranteed by
the byte-exact checksum gate and the dirty-tracked-file gate above,
regardless of which exact commit HEAD currently sits at.

## Apply mode

Requires, in addition to everything `-ValidateOnly` checks:

- `-VerifiedBackupPath` / `-ExpectedBackupManifestSha256`: a current,
  checksummed, restore-verified production backup (see
  `docs/backup-and-restore.md`).
- `-ApprovedPreflightPath` / `-ExpectedPreflightSha256`: the preflight
  script's own evidence file, whose checksum is re-verified and whose
  `status` field must read exactly `READY_FOR_<batchId>`.
- `-Approval`: an exact, case-sensitive string equal to
  `"APPLY <batchId> TO <approvedProjectRef>"` — computed from the manifest
  by `Get-ManifestApprovalPhrase`, never accepted as a free-form value the
  script trusts on its own.

Applies each migration file via one `docker run ... psql -X -v
ON_ERROR_STOP=1 --file <migration>` invocation, in manifest order, stopping
immediately on the first non-zero exit code. Writes an atomic evidence file
(temp file + `Move-Item`) containing per-migration timestamps/duration/exit
code/redacted output — never a password, connection string, or token.

## Idempotency and partial-apply policy

**Safe default: block, never silently resume or silently re-apply.**

- **Repeat run after full success**: preflight finds every batch object
  already present and returns `NOT_READY` with reason `"every ... object
  already exists - batch appears already applied"`. Apply mode requires a
  `READY_FOR_<batchId>` preflight, so a repeat run is blocked before any
  connection to apply migrations is even opened.
- **Partial state** (some but not all batch objects present — e.g. `030`
  applied, `031-034` not yet): preflight returns `NOT_READY` with reason
  naming the partial/drift condition. There is no automatic
  resume-from-next-migration path anywhere in this tooling — resuming a
  partial batch requires a human to review what state exists and decide
  the next step, exactly as required by
  `docs/PRODUCTION_ROLLBACK_RUNBOOK.md`'s forward-only recovery policy.

Both branches are unit-tested with mocked catalog responses in
`scripts/tests/production-migration-executor.tests.ps1` (no live connection
needed to exercise the policy logic), and both are *also* proven against a
real, live disposable connection in
`scripts/production-migration-disposable-certification.ps1`: the repeat-run
check reuses the same database immediately after a successful full apply,
and the partial-state check applies only the first 2 of 6 migrations to a
fresh disposable clone before running preflight against the full manifest.

## Secret handling

- Every script that can reach a production credential clears `PGPASSWORD`
  and friends in a `finally` block.
- `Get-RedactedOutput` strips connection URIs, `PG*=value` assignments, and
  JWT-shaped tokens from any text before it is logged.
- `Assert-NoSecretLeak` is a last-line check before every write to disk or
  stdout; it throws rather than writing if anything secret-shaped survives
  redaction.
- No script accepts a raw connection string as a parameter — production
  credentials are only ever read from the gitignored
  `weekly-tracker/.env.production.local` via the existing
  `Get-ProductionConnectionFingerprint` (same function every other
  production script in this repo already uses).

## Regression invariant (migration-number inventory)

`scripts/tests/production-remediation.tests.ps1` (the migration 028/029
remediation regression suite — predates this generalized executor) used to
hardcode "029 is the max migration number anywhere in the repository". That
was only ever true until later, unrelated batches were added — Snag List
`030-035` makes it permanently false, and it is *supposed* to be false: new
migrations are expected to keep landing after 029 forever.

The suite now checks the narrower invariant it actually needs, which does
not go stale as the repository grows: migration numbers `028` and `029`
(the two numbers that specific remediation contract is about) each appear
exactly once and have no gap between them; "next free migration number",
where the suite needs one, is computed dynamically as `max(existing) + 1`,
never hardcoded. This deliberately does **not** assert repository-wide
migration-number uniqueness — `docs/MIGRATION_RUNBOOK.md` documents that
this repository's raw file listing has known, intentional historical
duplicates/skips from before the "fresh path" convention existed (both
`001_gantt_system.sql` and `001_initial_schema.sql` exist; `011` is
deliberately excluded from a fresh install) — a real, documented fact, not
a defect.

## Rollback policy

Forward-only, per `docs/PRODUCTION_ROLLBACK_RUNBOOK.md`. This tooling never
drops a table, bucket, or policy to "undo" a partially-applied batch. A
failed migration inside its own transaction rolls back automatically
(`ON_ERROR_STOP=1`); recovering from a genuinely partial multi-migration
state is a human decision, documented as a separate, reviewed corrective
migration.

## Extending to a future batch

1. Add a new `scripts/manifests/<batch-id>.psd1`.
2. If the new batch needs its own object-contract assertions, add a new
   `scripts/lib/<Batch>MigrationContract.ps1` following
   `SnagListMigrationContract.ps1`'s `$Query`-callback convention, and wire
   it into copies of the preflight/postflight scripts (or generalize further
   if the contract shape converges across batches — do not do this
   speculatively before a second real batch exists).
3. Run `-ValidateOnly`, then the disposable certification, before ever
   proposing a live apply.
