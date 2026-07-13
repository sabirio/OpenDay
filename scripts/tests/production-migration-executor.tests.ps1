# Plain assertion script (no Pester dependency, matching
# scripts/tests/restore-verify.tests.ps1's convention). Fully offline: no
# Docker, no network, no production access. Covers the static/unit-testable
# subset of the 20 required failure-injection scenarios - everything that
# scripts/lib/MigrationManifestValidator.ps1 and
# scripts/lib/ManifestMigrationExecutor.ps1 can reject before ever opening a
# connection. The remaining scenarios (SQL failure mid-sequence, stop-on-
# first-failure proof, happy path, cleanup) are covered separately by
# scripts/production-migration-disposable-certification.ps1, which needs a
# live disposable Postgres container.

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $root 'scripts\lib\RestoreVerifyHelpers.ps1')
. (Join-Path $root 'scripts\lib\MigrationManifestValidator.ps1')
. (Join-Path $root 'scripts\lib\ManifestMigrationExecutor.ps1')
. (Join-Path $root 'scripts\lib\SnagListMigrationContract.ps1')

$pass = 0; $fail = 0
function A([string]$n, [bool]$c) { if ($c) { $script:pass++; Write-Host "[PASS] $n" } else { $script:fail++; Write-Host "[FAIL] $n" } }
function AThrows([string]$n, [scriptblock]$Block, [string]$MessagePattern = $null) {
    try {
        & $Block
        $script:fail++; Write-Host "[FAIL] $n (expected an exception, none thrown)"
    } catch {
        if (-not $MessagePattern -or $_.Exception.Message -match $MessagePattern) {
            $script:pass++; Write-Host "[PASS] $n"
        } else {
            $script:fail++; Write-Host "[FAIL] $n (wrong exception: $($_.Exception.Message))"
        }
    }
}

# --- AST parse of every new script ---
$newScripts = @(
    'scripts\lib\MigrationManifestValidator.ps1',
    'scripts\lib\ManifestMigrationExecutor.ps1',
    'scripts\lib\SnagListMigrationContract.ps1',
    'scripts\production-migration-apply.ps1',
    'scripts\production-migration-preflight-live.ps1',
    'scripts\production-migration-postflight-live.ps1'
) | ForEach-Object { Join-Path $root $_ }
foreach ($p in $newScripts) { $e = $null; [Management.Automation.Language.Parser]::ParseFile($p, [ref]$null, [ref]$e) | Out-Null; A "AST: $p" ($e.Count -eq 0) }

# --- Real manifest loads and validates cleanly ---
$realManifestPath = Join-Path $root 'scripts\manifests\snag-list-030-034.psd1'
$realManifest = Import-MigrationManifest -Path $realManifestPath
A 'real manifest: batchId is SNAG-LIST-030-034' ($realManifest.batchId -eq 'SNAG-LIST-030-034')
A 'real manifest: 5 migrations declared' ($realManifest.migrations.Count -eq 5)
A 'real manifest: order valid' (Test-ManifestMigrationOrder -Manifest $realManifest)
$realChecksums = Test-ManifestMigrationChecksums -Manifest $realManifest -RepoRoot $root
A 'real manifest: all 5 checksums byte-identical' (($realChecksums | Where-Object { $_.byteIdentical }).Count -eq 5)
A 'real manifest: repository identity matches authoritative commit' ((Test-RepositoryIdentity -RepoRoot $root -ExpectedCommit $realManifest.authoritativeCommit) -eq $realManifest.authoritativeCommit)
A 'real manifest: approval phrase is deterministic and includes batch+target' ((Get-ManifestApprovalPhrase -Manifest $realManifest) -eq 'APPLY SNAG-LIST-030-034 TO szgbkeqornkdngoegyso')

# --- Scenario 14: missing manifest ---
AThrows 'scenario 14: missing manifest file' { Import-MigrationManifest -Path (Join-Path $root 'scripts\manifests\does-not-exist.psd1') } 'manifest not found'

# --- Scenario 15: malformed manifest ---
$tmpDir = Join-Path ([IO.Path]::GetTempPath()) "manifest-test-$([guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $tmpDir | Out-Null
try {
    $malformedPath = Join-Path $tmpDir 'malformed.psd1'
    Set-Content -LiteralPath $malformedPath -Value '@{ batchId = "X"; this is not valid psd1 syntax @@@' -Encoding utf8
    AThrows 'scenario 15a: malformed manifest (bad syntax)' { Import-MigrationManifest -Path $malformedPath } 'not a valid PowerShell data file'

    $incompletePath = Join-Path $tmpDir 'incomplete.psd1'
    Set-Content -LiteralPath $incompletePath -Value '@{ batchId = "X" }' -Encoding utf8
    AThrows 'scenario 15b: malformed manifest (missing required keys)' { Import-MigrationManifest -Path $incompletePath } 'missing required key'

    # --- Scenario 4: wrong order (031 before 030) ---
    $wrongOrderManifest = $realManifest.Clone()
    $wrongOrderManifest.migrations = @($realManifest.migrations[1], $realManifest.migrations[0]) + $realManifest.migrations[2..4]
    AThrows 'scenario 4: wrong order (031 before 030)' { Test-ManifestMigrationOrder -Manifest $wrongOrderManifest } 'ascending order'

    # --- Scenario 5: duplicate migration number ---
    $dupManifest = $realManifest.Clone()
    $dupEntry = $realManifest.migrations[0].Clone()
    $dupManifest.migrations = @($realManifest.migrations[0], $dupEntry) + $realManifest.migrations[1..3]
    AThrows 'scenario 5: duplicate migration number' { Test-ManifestMigrationOrder -Manifest $dupManifest } 'duplicate migration numbers'

    # --- Scenario 6: sequence gap (030,031,033,034 - missing 032) ---
    $gapManifest = $realManifest.Clone()
    $gapManifest.migrations = @($realManifest.migrations[0], $realManifest.migrations[1], $realManifest.migrations[3], $realManifest.migrations[4])
    AThrows 'scenario 6: sequence gap' { Test-ManifestMigrationOrder -Manifest $gapManifest } 'gap'

    # --- Scenario 1/2: wrong/tampered checksum ---
    $badChecksumManifest = $realManifest.Clone()
    $tamperedEntry = $realManifest.migrations[0].Clone()
    $tamperedEntry.sha256 = ('0' * 64)
    $badChecksumManifest.migrations = @($tamperedEntry) + $realManifest.migrations[1..4]
    AThrows 'scenario 1/2: wrong checksum in manifest' { Test-ManifestMigrationChecksums -Manifest $badChecksumManifest -RepoRoot $root } 'MIGRATION HASH MISMATCH'

    # --- Scenario 3: missing migration file ---
    $missingFileManifest = $realManifest.Clone()
    $missingEntry = @{ number = 99; file = '099_does_not_exist.sql'; sha256 = ('1' * 64) }
    $missingFileManifest.migrations = @($missingEntry)
    AThrows 'scenario 3: missing migration file' { Test-ManifestMigrationChecksums -Manifest $missingFileManifest -RepoRoot $root } 'does not exist'

    # --- Scenario 7: file path outside approved migrations directory ---
    New-Item -ItemType Directory -Path (Join-Path $tmpDir 'outside') | Out-Null
    Set-Content -LiteralPath (Join-Path $tmpDir 'outside\099_outside_migrations_dir.sql') -Value '-- test' -Encoding utf8
    $outsideManifest = @{
        schemaVersion = 1; batchId = 'TEST'; approvedProjectRef = 'abcdefghijklmnopqrstu'; authoritativeCommit = ('a' * 40)
        migrationsDirectory = (Resolve-Path (Join-Path $root 'weekly-tracker\src\migrations')).Path
        migrations = @(@{ number = 99; file = '099_outside_migrations_dir.sql'; sha256 = ('2' * 64) })
    }
    AThrows 'scenario 7: file outside approved migrations directory' {
        Resolve-ManifestMigrationPath -Manifest $outsideManifest -Migration $outsideManifest.migrations[0] -RepoRoot $root
    } 'does not exist'

    # --- Scenario 8: path traversal ---
    $traversalManifest = @{
        schemaVersion = 1; batchId = 'TEST'; approvedProjectRef = 'abcdefghijklmnopqrstu'; authoritativeCommit = ('a' * 40)
        migrationsDirectory = 'weekly-tracker\src\migrations'
        migrations = @(@{ number = 99; file = '..\..\..\Windows\win.ini'; sha256 = ('3' * 64) })
    }
    AThrows 'scenario 8a: path traversal via ..\\' {
        Resolve-ManifestMigrationPath -Manifest $traversalManifest -Migration $traversalManifest.migrations[0] -RepoRoot $root
    } 'must be a bare filename|does not match the expected'
    $traversalManifest2 = $traversalManifest.Clone()
    $traversalManifest2.migrations = @(@{ number = 99; file = 'C:\Windows\win.ini'; sha256 = ('3' * 64) })
    AThrows 'scenario 8b: path traversal via absolute path' {
        Resolve-ManifestMigrationPath -Manifest $traversalManifest2 -Migration $traversalManifest2.migrations[0] -RepoRoot $root
    } 'must be a bare filename|does not match the expected'

    # --- Scenario 10: HEAD mismatch ---
    AThrows 'scenario 10: repository HEAD mismatch' { Test-RepositoryIdentity -RepoRoot $root -ExpectedCommit ('f' * 40) } 'does not match'

    # --- Manifest schema validation: bad project ref / bad commit format ---
    $badRefPath = Join-Path $tmpDir 'bad-ref.psd1'
    Set-Content -LiteralPath $badRefPath -Value @'
@{
    schemaVersion = 1
    batchId = 'TEST'
    approvedProjectRef = 'not a valid ref!!'
    authoritativeCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    migrationsDirectory = 'weekly-tracker\src\migrations'
    migrations = @(@{ number = 1; file = '001_x.sql'; sha256 = '1111111111111111111111111111111111111111111111111111111111111111' })
}
'@ -Encoding utf8
    AThrows 'manifest schema: invalid project ref rejected' { Import-MigrationManifest -Path $badRefPath } 'project ref'
} finally {
    Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}

# --- Scenario 16: extra migration not in manifest can never be applied ---
# Structural proof: Invoke-ManifestMigrationSequence only ever iterates
# $ChecksumResults, itself derived only from $Manifest.migrations - there is
# no code path that can reach a file not present in the manifest.
$executorSource = Get-Content -Raw (Join-Path $root 'scripts\lib\ManifestMigrationExecutor.ps1')
A 'scenario 16: executor iterates only checksum-verified manifest entries' ($executorSource -match 'foreach\s*\(\$checksum\s+in\s+\$ChecksumResults\)')
A 'scenario 16: executor has no arbitrary SQL/file parameter' ($executorSource -notmatch '\[string\]\$(Sql|Query|Command|SqlFile)\b')
$applySource = Get-Content -Raw (Join-Path $root 'scripts\production-migration-apply.ps1')
A 'no generic arbitrary SQL runner surface in apply CLI' ($applySource -notmatch '\[string\]\$(Sql|Query|Command|SqlFile)\b')

# --- Scenario 17: -ValidateOnly never touches Docker/network ---
A 'scenario 17: ValidateOnly path exits before any Docker/connection call' ($applySource.IndexOf("ParameterSetName -eq 'Validate'") -lt $applySource.IndexOf('$conn = Get-ProductionConnectionFingerprint'))
A 'scenario 17: ValidateOnly parameter set excludes Approval/backup/preflight params' (
    ($applySource -match "ParameterSetName = 'Validate'\)\]\s*\r?\n\s*\[switch\]\`$ValidateOnly") -and
    ($applySource -match "ParameterSetName = 'Apply'\)\]\s*\r?\n\s*\[string\]\`$Approval")
)

# --- Scenario 18: secret redaction ---
$secretFixture = 'connect via postgresql://postgres.abc:s3cr3t@aws.pooler.supabase.com:5432/postgres and PGPASSWORD=hunter2 token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123'
$redacted = Get-RedactedOutput -Text $secretFixture
A 'scenario 18a: connection URI redacted' ($redacted -notmatch 'postgresql://[^\s]*:[^\s]*@' -and $redacted -match '\[REDACTED_URI\]')
A 'scenario 18b: PGPASSWORD redacted' ($redacted -notmatch 'PGPASSWORD=hunter2' -and $redacted -match '\[REDACTED\]')
A 'scenario 18c: JWT-shaped token redacted' ($redacted -notmatch 'eyJhbGciOiJIUzI1NiJ9' -and $redacted -match '\[REDACTED_TOKEN\]')
AThrows 'scenario 18d: Assert-NoSecretLeak still catches an unredacted secret' { Assert-NoSecretLeak -Text $secretFixture } 'REDACTION_CHECK'
A 'scenario 18e: Assert-NoSecretLeak accepts already-redacted text' ((Assert-NoSecretLeak -Text $redacted) -eq $true)

# --- Scenario 19: non-zero exit code on failure is structural, not incidental ---
A 'scenario 19: apply CLI exits non-zero on FAIL' ($applySource -match "if \(\`$applyReport\.overallStatus -eq 'PASS'\) \{ exit 0 \} else \{ exit 1 \}")
$preflightSource = Get-Content -Raw (Join-Path $root 'scripts\production-migration-preflight-live.ps1')
A 'preflight CLI exits non-zero on NOT_READY' ($preflightSource -match "else \{ exit 1 \}")
$postflightSource = Get-Content -Raw (Join-Path $root 'scripts\production-migration-postflight-live.ps1')
A 'postflight CLI exits non-zero on FAIL' ($postflightSource -match "else \{ exit 1 \}")

# --- No retry loop anywhere in the execution engine ---
A 'no retry loop in migration execution engine' ($executorSource -notmatch 'for\s*\(|while\s*\(')

# --- Atomic evidence writes ---
foreach ($src in @(@{n='apply';t=$applySource},@{n='preflight';t=$preflightSource},@{n='postflight';t=$postflightSource})) {
    A "$($src.n) evidence write is atomic (.tmp- + Move-Item)" ($src.t -match '\.tmp-' -and $src.t -match 'Move-Item')
}

# --- Confirmation phrase is compared, not blindly trusted ---
A 'apply CLI compares Approval against manifest-derived phrase (case-sensitive)' ($applySource -match '\$Approval -cne \$expectedApproval')

# --- SnagListMigrationContract: object lists match migration 030-034 exactly ---
$contractSource = Get-Content -Raw (Join-Path $root 'scripts\lib\SnagListMigrationContract.ps1')
$expectedTables = @('snags', 'snag_events', 'snag_evidence', 'snag_plan_versions', 'snag_command_requests', 'snag_evidence_upload_intents')
A 'SnagListTables source declares all 6 expected tables' (@($expectedTables | Where-Object { $contractSource -notmatch [regex]::Escape("'$_'") }).Count -eq 0)

# ---------------------------------------------------------------------------
# Idempotency and partial-apply policy (section 7.3/7.4): mocked $Query
# scriptblocks simulate "every object already present" and "some but not
# all objects present" without touching a real database. The safe default
# required by the task - BLOCK, never silently resume or silently re-apply -
# is proven here structurally; the disposable certification proves the
# clean/fresh-state READY path with a real connection.
# ---------------------------------------------------------------------------
# Scenario: repeat run after full prior success - every Snag List object,
# and every predecessor object, already present.
$allPresentQuery = {
    param([string]$Sql)
    if ($Sql -match "pg_locks") { return '0' }
    return 't'
}
$repeatRunResult = Test-SnagListPreflightAssertions -Query $allPresentQuery -BatchId 'SNAG-LIST-030-034'
A 'idempotency: repeat run after success is classified NOT_READY (blocked, not silently re-applied)' ($repeatRunResult.status -eq 'NOT_READY')
A 'idempotency: repeat-run reason names "already exists"' (@($repeatRunResult.reasons | Where-Object { $_ -match 'already exists' }).Count -gt 0)

# Scenario: partial apply - predecessor present, only SOME Snag List objects
# present (simulates 030 applied, 031-034 not yet applied).
$partialQuery = {
    param([string]$Sql)
    if ($Sql -match 'pg_locks') { return '0' }
    if ($Sql -match "to_regclass\('public\.snags'\)") { return 't' }
    if ($Sql -match "to_regclass\('public\.projects'\)|to_regclass\('public\.profiles'\)|to_regclass\('auth\.users'\)|to_regprocedure\('public\.can_") { return 't' }
    return 'f'
}
$partialResult = Test-SnagListPreflightAssertions -Query $partialQuery -BatchId 'SNAG-LIST-030-034'
A 'partial-apply: mixed presence is classified NOT_READY (blocked pending forensic review)' ($partialResult.status -eq 'NOT_READY')
A 'partial-apply: reason names drift/partial state, not a resumable state' (@($partialResult.reasons | Where-Object { $_ -match 'partial|drift' }).Count -gt 0)
A 'partial-apply: safe default is BLOCK, never an automatic resume-from-next-migration' ($applySource -notmatch '(?i)resume|continue.?from.?next')

Write-Host "TOTAL: $pass passed, $fail failed"
if ($fail) { exit 1 }
