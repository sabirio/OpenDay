# Owner runbook: Snag List migrations 030→034 to production

Target: `szgbkeqornkdngoegyso`. Sequence: `030 → 031 → 032 → 033 → 034`.
Authoritative application commit: `7234b6413e46d76b82794dcedbe66fa2600f4e46`.
Manifest: `scripts\manifests\snag-list-030-034.psd1`.

**This runbook is owner-executed.** No step below is run by an AI agent
against production — see `docs/PRODUCTION_MIGRATION_EXECUTOR.md` and
`docs/backup-and-restore.md`. Frontend deployment, push, merge, and Phase 5
are explicitly out of scope for this runbook.

Run every command from the repository root in Windows PowerShell. Confirm
each step's exit code before proceeding to the next — do not chain these
with `;` past a failure.

## 0. Confirm clean repository identity

```powershell
git status --short
git rev-parse HEAD
```

Expected: only the 9 known protected untracked operational files; HEAD =
`7234b6413e46d76b82794dcedbe66fa2600f4e46`.

## 1. Validate the manifest (no credentials, no network)

```powershell
.\scripts\production-migration-apply.ps1 `
  -ManifestPath .\scripts\manifests\snag-list-030-034.psd1 `
  -ValidateOnly
```

Expected: `VALIDATE_ONLY: PASS`, exit code 0.

## 2. Disposable certification (no production access)

```powershell
.\scripts\production-migration-disposable-certification.ps1
```

Expected: `DISPOSABLE_CERTIFICATION: PASS`, exit code 0. Re-run this any
time you want fresh proof the executor still works before touching
production — it never opens a production connection.

## 3. Create (or confirm) a current production backup

```powershell
.\scripts\production-backup.ps1
```

Note the printed backup path, e.g. `backups\production\<UTC_TIMESTAMP>\`.
Then verify it:

```powershell
.\scripts\restore-verify.ps1 -Latest
```

Expected: `RESTORE_VERIFICATION: PASS`. Record the backup path and the
SHA-256 of `<backup path>\backup-manifest.json`:

```powershell
Get-FileHash -Path "<backup path>\backup-manifest.json" -Algorithm SHA256
```

## 4. Live read-only preflight

```powershell
.\scripts\production-migration-preflight-live.ps1 `
  -ManifestPath .\scripts\manifests\snag-list-030-034.psd1 `
  -VerifiedBackupPath "<backup path>" `
  -ExpectedBackupManifestSha256 "<hash from step 3>" `
  -OutputPath ".\work\snag-list-apply\preflight.json"
```

Expected: `MIGRATION_PREFLIGHT: READY_FOR_SNAG-LIST-030-034`, exit code 0.
Any other status means STOP — do not proceed to apply. Record the SHA-256
of the preflight output file:

```powershell
Get-FileHash -Path ".\work\snag-list-apply\preflight.json" -Algorithm SHA256
```

## 5. Apply — requires the exact confirmation phrase

```powershell
.\scripts\production-migration-apply.ps1 `
  -ManifestPath .\scripts\manifests\snag-list-030-034.psd1 `
  -VerifiedBackupPath "<backup path>" `
  -ExpectedBackupManifestSha256 "<hash from step 3>" `
  -ApprovedPreflightPath ".\work\snag-list-apply\preflight.json" `
  -ExpectedPreflightSha256 "<hash from step 4>" `
  -Approval "APPLY SNAG-LIST-030-034 TO szgbkeqornkdngoegyso" `
  -OutputPath ".\work\snag-list-apply\apply-result.json"
```

Stops on the first migration that fails; never continues past a failure.
Expected: `APPLY PASS`, all five steps `PASS`, exit code 0.

- If it prints `APPLY FAIL` with some steps `PASS` and the rest
  `NOT_ATTEMPTED`: **do not re-run.** Read `.\work\snag-list-apply\apply-result.json`,
  identify the failed migration, and follow
  `docs/PRODUCTION_ROLLBACK_RUNBOOK.md`'s forward-only guidance. Do not
  deploy the frontend.

## 6. Read-only postflight certification

```powershell
.\scripts\production-migration-postflight-live.ps1 `
  -ManifestPath .\scripts\manifests\snag-list-030-034.psd1 `
  -OutputPath ".\work\snag-list-apply\postflight.json"
```

Expected: `MIGRATION_POSTFLIGHT: PASS`, exit code 0. This confirms every
expected table/function/bucket exists with the expected contract (RLS
enabled, buckets private, no anon execute). It does not create a Snag or
upload a file.

## 7. Classify the outcome

- All of steps 1–6 `PASS` → `DATABASE READY FOR SEPARATE APPLICATION
  DEPLOYMENT REVIEW`. Do not deploy the frontend as part of this runbook —
  that is a separate, later approval.
- Step 5 failed cleanly (transaction rolled back) → forensic review before
  any retry; do not re-run the same apply blindly.
- Step 5 partially succeeded (some migrations `PASS`, later ones
  `NOT_ATTEMPTED`) → partial production state; frontend deployment
  prohibited; forward-only corrective migration required, reviewed
  separately.

## Evidence

All JSON evidence lives under `.\work\snag-list-apply\` (gitignored, never
committed) — preflight result, apply result, postflight result. None of
these files contain a password, connection string, token, or customer data;
every script that writes them runs `Assert-NoSecretLeak` first and refuses
to write if anything secret-shaped survives redaction.
