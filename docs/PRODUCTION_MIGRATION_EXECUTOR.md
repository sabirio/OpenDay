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
| `scripts/lib/MigrationManifestValidator.ps1` | Pure validation functions: manifest schema, strict order (+ contiguity), path containment (blocks traversal/absolute paths), byte-exact checksums, repository HEAD identity, the deterministic confirmation phrase, secret redaction. |
| `scripts/lib/ManifestMigrationExecutor.ps1` | Connection-agnostic execution engine (`Invoke-ManifestMigrationSequence`). Takes already-resolved PG connection values and a validated manifest; applies each file via one `psql -X -v ON_ERROR_STOP=1` invocation per file, in order, stopping on the first non-zero exit. No retry loop. Used unmodified by both the disposable certification and the real production apply script. |
| `scripts/lib/SnagListMigrationContract.ps1` | Batch-specific (Snag List 030-034) read-only object-inventory and contract assertions, via the same `$Query`-callback convention as `lib/RemediationPreflightPostflight.ps1`. |
| `scripts/production-migration-apply.ps1` | The CLI. Two parameter sets: `-ValidateOnly` (manifest/order/path/checksum/git-identity only — never touches Docker, network, or a credential) and Apply mode (everything `-ValidateOnly` checks, plus verified-backup checksum, approved-preflight-result checksum and status, an exact confirmation phrase computed from the manifest, then the production connection and apply). |
| `scripts/production-migration-preflight-live.ps1` | Read-only. Confirms the batch's objects are entirely absent and predecessor objects are present, via a bounded `READ ONLY REPEATABLE READ` transaction per query (`New-ReadOnlyCatalogScript`) with a forbidden-statement guard. Writes an atomic evidence file whose `status` the apply script re-checks. |
| `scripts/production-migration-postflight-live.ps1` | Read-only. Confirms every expected object exists with the expected contract (RLS enabled, private buckets, no anon execute grant). Never calls a business RPC, never creates a row. |
| `scripts/production-migration-disposable-certification.ps1` | Restores the already-verified production backup into disposable, throwaway Postgres containers (never production) and proves: (1) happy path — preflight READY → apply → postflight PASS → 0 unexpected row-count differences on pre-existing tables; (2) failure injection — a broken migration stops the sequence, earlier migrations' effects remain, later migrations are never attempted. |
| `scripts/tests/production-migration-executor.tests.ps1` | Plain assertion script (no Pester), fully offline. Covers manifest/order/path/checksum/identity validation, secret redaction, atomic evidence, no-retry-loop, no-arbitrary-SQL-surface, and the idempotency/partial-apply policy below. |

## Manifest contract

A `.psd1` manifest is a plain PowerShell data file (`Import-PowerShellDataFile`
— never `Invoke-Expression`, no code execution). Required keys:

```powershell
@{
    schemaVersion = 1
    batchId = 'SNAG-LIST-030-034'
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

## Validation-only mode

```powershell
.\scripts\production-migration-apply.ps1 `
  -ManifestPath .\scripts\manifests\snag-list-030-034.psd1 `
  -ValidateOnly
```

Checks manifest schema, order, path containment, checksums, and repository
HEAD identity. Exits 0/1. **Never opens Docker, a network connection, or a
credential** — safe to run as often as wanted, by anyone with read access to
the repository, including an AI agent.

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
needed to exercise the policy logic) and the clean/fresh-state `READY` path
is proven against a live disposable connection in the certification script.

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
