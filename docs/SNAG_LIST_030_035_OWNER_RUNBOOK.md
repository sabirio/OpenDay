# Snag List 030–035 production owner runbook

This is the canonical owner-controlled procedure for the first Snag List production release. The release is one ordered batch: `030 → 031 → 032 → 033 → 034 → 035`. Do not use the historical `030–034` manifest or runbook.

## Immutable release identity

- Manifest: `scripts\manifests\snag-list-030-035.psd1`
- Required tooling ancestor: `5ddb24098254343e830aab3f61a9167987d8189e`
- Migration-authoritative commit: `848659b770b02202c0b5e1a711c3a677aec34ef2`
- Production project ref: `szgbkeqornkdngoegyso`
- Required database user: `postgres`
- Stop on first failure: mandatory
- Owner confirmation phrase: `APPROVE PRODUCTION APPLY SNAG LIST 030-035`

| Migration | SHA-256 |
|---|---|
| `030_snag_list_foundation.sql` | `04843f8589fbaad18c6d47aa6733fc26b6bf52303d0bb8b4846819d725312bf0` |
| `031_snag_reassignment_semantics.sql` | `9b5a6f4fea1a4755c41d45066135e763329ddd1933969e04e22dfa932deffe1a` |
| `032_snag_project_contractors_rpc.sql` | `b0495a7a0f1f51a288ba1480a84c468a22f2a2cb51245a537dbd9ea6f4566de3` |
| `033_snag_private_plan_pinning.sql` | `63d809642b79c23553c9fca6e1d3e1fc0e39e99780bde1eeff91c39fad0fb6fb` |
| `034_snag_secure_evidence_lifecycle.sql` | `0d71d6185e90bd083816d73cf939798dce276e971127948576f4d7702b55a53d` |
| `035_snag_canonical_field_capture.sql` | `0d02ee77c6001a2369c159b50350e45e23d6f1942ed0a4672b19699fee3bd52a` |

## 1. Repository audit and local validation

Confirm the reviewed branch and commit, clean migration files, and absence of merge/rebase operations. Then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\production-migration-apply.ps1 `
  -ManifestPath .\scripts\manifests\snag-list-030-035.psd1 -ValidateOnly
```

Expected: six ordered hashes, tracked-and-clean PASS, repository identity PASS, and `VALIDATE_ONLY: PASS`. Validate-only must not read credentials, connect to a network, or start Docker.

## 2. Fresh backup and disposable restore

The owner creates one fresh production backup and records its manifest SHA-256. Restore and verify that exact backup in a disposable environment. Retain restore evidence, row counts, constraints, migration history, RLS, ACL/ownership inventory, and cleanup result. Never proceed with an old or partially verified backup.

## 3. Live preflight — owner terminal only

The AI agent does not perform this step.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\production-migration-preflight-live.ps1 `
  -ManifestPath .\scripts\manifests\snag-list-030-035.psd1 `
  -VerifiedBackupPath <fresh-backup-directory> `
  -ExpectedBackupManifestSha256 <sha256> `
  -OutputPath <preflight-evidence.json>
```

Required status: `READY_FOR_SNAG-LIST-030-035`. `PARTIAL_STATE`, `PARTIAL_DRIFT`, or `ALREADY_APPLIED` is a hard stop requiring forensic review. Never repair migration history or automatically resume.

Preflight evidence uses schema `snag-list-preflight/v1`. The canonical lock
field is `assertions.blockingLocks`, containing a consistent non-negative
`conflictingLockCount`, boolean `safe`, and `details[]`. The evidence must also
record a successful production fingerprint, read-only execution, predecessor
state, classification, status, batch identity and creation timestamp. Apply
rejects unsupported schemas, missing/malformed/contradictory fields, any lock,
non-READY state, failed fingerprint/read-only assertions, and evidence older
than 30 minutes. Never edit evidence or bypass this gate.

## 4. Approval and apply — owner terminal only

After reviewing backup and preflight evidence, the owner supplies exactly `APPROVE PRODUCTION APPLY SNAG LIST 030-035` and runs:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\production-migration-apply.ps1 `
  -ManifestPath .\scripts\manifests\snag-list-030-035.psd1 `
  -VerifiedBackupPath <fresh-backup-directory> `
  -ExpectedBackupManifestSha256 <sha256> `
  -ApprovedPreflightPath <preflight-evidence.json> `
  -ExpectedPreflightSha256 <sha256> `
  -Approval "APPROVE PRODUCTION APPLY SNAG LIST 030-035" `
  -OutputPath <apply-evidence.json>
```

The executor applies files in manifest order, one `psql` invocation per file with `ON_ERROR_STOP=1`. On failure, every later step remains `NOT_ATTEMPTED`. Do not retry blindly.

A gate failure before the first SQL invocation is `BLOCKED BEFORE APPLY`, not
`FAILED AT MIGRATION 030`. `FAILED AT MIGRATION XXX` requires proof that the
SQL invocation for XXX was attempted. `ALREADY_APPLIED` is postflight-only;
`PARTIAL_STATE` and `PARTIAL_DRIFT` remain forensic stops.

## 5. Postflight and acceptance

Run canonical postflight using the same manifest and apply evidence. Confirm all eleven Snag List tables and required RPCs, RLS, no PUBLIC/anon execution, private plan/evidence buckets and limits, monotonic non-reusing numbering, Captured/Published separation, assigned-contractor visibility, safe account-independent stakeholders, idempotent Activity, and preservation of predecessor rows, plans, evidence, ACL, ownership, and unrelated modules.

Archive the backup, restore report, manifest hash, preflight, apply report, postflight, row-preservation report, RLS/Storage evidence, operator identity, timestamps, and final decision. Evidence must pass secret redaction.

## 6. Recovery guidance

- Before apply: correct the evidence or repository defect and repeat from a fresh preflight.
- Partial state: stop for forensic inventory; never use migration repair or `supabase db push`.
- Apply failure: preserve executor/database logs. Earlier successful files remain applied; the failed file is rolled back and later files remain unattempted.
- Postflight failure: freeze rollout and prepare a separately reviewed forward-only remediation. Never edit migrations `030–035`.
- Already applied: do not rerun; verify postflight and retained evidence.

Nothing in this runbook authorizes an AI agent to open production, print credentials, deploy, or push.

After any tooling correction, start a new owner-controlled production release
run with renewed explicit approval. The verified backup from a failed run is
valid historical recovery evidence, but the default next-run decision is:
`CREATE A NEW FRESH PRODUCTION BACKUP`.
