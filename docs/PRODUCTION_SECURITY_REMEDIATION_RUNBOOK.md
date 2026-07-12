# Production Security Remediation Runbook

Reviewed, human-executed runbook for applying `weekly-tracker/src/migrations/028_production_security_reconciliation.sql` to real production. **No command in this document has been run against production by any automated process.** Everything below was rehearsed against a disposable, local-only clone — see `work/security-remediation-rehearsal/security-remediation-rehearsal.json` for the full rehearsal record and `docs/PRODUCTION_SECURITY_REMEDIATION_PLAN.md` (embedded in `work/security-remediation-rehearsal/security-remediation-plan.json`) for the forensic basis.

## 1. Required approvals

- Sign-off from whoever owns the production Supabase project (the migration changes ACL and creates new objects; it is a security-relevant change).
- Confirmation that this is being applied during a low-traffic / reviewed change window, not urgently.

## 2. Preconditions (must all be true before proceeding)

- [ ] A production backup taken **after** any other pending changes, following the existing `scripts/production-backup.ps1` process.
- [ ] Exact repository commit to apply from: **`8742b2ab83a3349540e6dde9c1cb6e255c558aba`** or a later commit that has not modified `028_production_security_reconciliation.sql`.
- [ ] Migration file checksum (compute fresh before applying and compare):
  ```powershell
  Get-FileHash weekly-tracker/src/migrations/028_production_security_reconciliation.sql -Algorithm SHA256
  ```
  Record this value in the change ticket.
- [ ] Contract checksums (informational, confirms the certification engine used to validate the rehearsal hasn't silently drifted):
  ```powershell
  Get-FileHash scripts/contracts/canonical-security-contract.json -Algorithm SHA256
  Get-FileHash scripts/contracts/accepted-exceptions.json -Algorithm SHA256
  ```

## 3. Preflight (read-only, run against production)

This repository does not ship a script that connects to production directly for preflight (by design — see `scripts/lib/RemediationPreflightPostflight.ps1`'s header). Preflight must be run as a genuine read-only production connection, reusing the same fingerprint/safety pattern as `scripts/production-security-inventory.ps1`:

1. Load `weekly-tracker/.env.production.local` exactly as `production-security-inventory.ps1` does (via `Get-ProductionConnectionFingerprint`).
2. Open a read-only transaction (`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='30s';`).
3. Run the same checks `Invoke-RemediationPreflight` (`scripts/lib/RemediationPreflightPostflight.ps1`) performs — this function is connection-agnostic (takes a `$Query` scriptblock) and can be reused directly against a real read-only production connection instead of the rehearsal container.

**Expected preflight result: `READY`** (production currently has 026 applied, 025/027 not applied — matches the rehearsal's own starting state exactly).

If preflight returns `ALREADY_REMEDIATED`: stop, someone already applied this; do not re-apply blindly — investigate first.
If preflight returns `BLOCKED` or `UNSAFE_STATE`: stop, do not proceed; the conflicting object(s) reported must be investigated and resolved first.

## 4. Apply

```powershell
psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 --file weekly-tracker/src/migrations/028_production_security_reconciliation.sql
```

The migration is a single `BEGIN...COMMIT` transaction — on any error, Postgres rolls back the entire statement set automatically. `ON_ERROR_STOP=1` ensures psql itself also aborts on the first error rather than continuing.

Do not run this via Supabase's `db push`/`migration up` tooling unless that tooling is confirmed to apply the file verbatim in a single transaction — the rehearsal validated the file's own `BEGIN`/`COMMIT`, not any wrapper tool's behavior.

## 5. Postflight (read-only, run against production)

Same connection-agnostic approach as preflight: run `Invoke-RemediationPostflight` (`scripts/lib/RemediationPreflightPostflight.ps1`) against the real, now-migrated production connection.

**Expected postflight result: `PASS`**, with all `objects` entries `true` and all `aclSpotChecks` entries `true` (the exact same checks the rehearsal validated).

If postflight returns `FAIL`: **do not attempt an automated rollback.** Follow the forward-fix strategy in `security-remediation-plan.json`'s `rollbackStrategy`/`forwardFixStrategy` fields — investigate the specific failing check(s) and author a new forward-only migration.

## 6. Fresh production inventory

```powershell
powershell.exe -File scripts/production-security-inventory.ps1 -BackupPath <new-backup-path>
```

This produces a fresh, real, immutable `security-inventory-production.json` reflecting the post-migration state.

## 7. Composite certification rerun

```powershell
powershell.exe -File scripts/composite-security-certification.ps1 `
  -BackupPath <new-backup-path> `
  -ProductionInventoryPath <new-backup-path>/security-inventory-production.json `
  -ProductionInventoryChecksumPath <new-backup-path>/security-inventory-production.sha256 `
  -OutputPath <new-backup-path>
```

**Expected: `COMPOSITE_CERTIFICATION: PASS`.** Note this real run does **not** need `-AdditionalVerifiedStructuralTables` — a genuinely fresh backup taken after the migration will naturally contain `write_command_requests`, so the parameter that was only needed to work around the rehearsal's stale-pristine-backup limitation is unnecessary here.

## 8. Baseline freeze

Only after step 7 returns `PASS`, promote the rehearsal's `database-security-baseline-candidate.json` pattern to a real frozen baseline (`baselineStatus: FROZEN`, `productionApplied: true`) referencing the fresh backup, fresh inventory, and fresh composite certification's checksums/hashes from steps 6–7 — not the rehearsal's own local artifacts.

## 9. Abort conditions

Abort (do not proceed to the next step) if:
- Preflight is not `READY` or `ALREADY_REMEDIATED`.
- The migration file checksum does not match what was rehearsed and approved.
- Postflight is not `PASS`.
- The fresh composite certification is not `PASS`.
- Any step prints a connection string, password, or JWT — stop immediately, treat as a credential leak, rotate if needed.

## 10. Rollback / forward-fix decision tree

See `security-remediation-plan.json`'s `rollbackStrategy` field for the full reasoning. Summary:
- **ACL changes** (all `REVOKE`/`GRANT` statements in 028): exactly reversible — the reverse `GRANT` for every `REVOKE` is enumerated in 028's own trailing comment.
- **Structural changes** (`write_command_requests`, both atomic RPCs, `handle_new_user`, `rls_auto_enable`, their triggers): **not** safely reversible once real traffic has used them. Treat any post-apply defect here as requiring a new forward-only migration, never a `DROP`.

## 11. Log / redaction rules

- Never print `weekly-tracker/.env.production.local`'s contents, the raw `PRODUCTION_DB_URL`, or any password/JWT.
- Preflight/postflight output (this repo's existing pattern) contains only booleans, counts, and object names — safe to log in full.
- If a step must be pasted into a ticket/chat, redact anything matching `postgresql://`, `eyJ`, or a `password=` pattern first.
