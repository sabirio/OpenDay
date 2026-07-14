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
. (Join-Path $root 'scripts\lib\PreflightEvidenceContract.ps1')

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
    'scripts\lib\PreflightEvidenceContract.ps1',
    'scripts\production-migration-apply.ps1',
    'scripts\production-migration-preflight-live.ps1',
    'scripts\production-migration-postflight-live.ps1'
) | ForEach-Object { Join-Path $root $_ }
foreach ($p in $newScripts) { $e = $null; [Management.Automation.Language.Parser]::ParseFile($p, [ref]$null, [ref]$e) | Out-Null; A "AST: $p" ($e.Count -eq 0) }

# --- Real manifest loads and validates cleanly ---
$realManifestPath = Join-Path $root 'scripts\manifests\snag-list-030-035.psd1'
$realManifest = Import-MigrationManifest -Path $realManifestPath
A 'real manifest: batchId is SNAG-LIST-030-035' ($realManifest.batchId -eq 'SNAG-LIST-030-035')
A 'real manifest: 6 migrations declared' ($realManifest.migrations.Count -eq 6)
A 'real manifest: migration 035 is the final ordered entry' ($realManifest.migrations[-1].file -eq '035_snag_canonical_field_capture.sql')
A 'real manifest: postgres owner and stop-on-first-failure are explicit' ($realManifest.requiredDatabaseUser -eq 'postgres' -and $realManifest.stopOnFirstFailure)
A 'real manifest: order valid' (Test-ManifestMigrationOrder -Manifest $realManifest)
$realChecksums = Test-ManifestMigrationChecksums -Manifest $realManifest -RepoRoot $root
A 'real manifest: all 6 checksums byte-identical' (($realChecksums | Where-Object { $_.byteIdentical }).Count -eq 6)
$realManifestHead = Test-RepositoryIdentity -RepoRoot $root -ExpectedCommit $realManifest.authoritativeCommit
A 'real manifest: authoritative commit is HEAD or an ancestor of HEAD' ($realManifestHead -match '^[0-9a-f]{40}$')
$isExactOrAncestor = ($realManifestHead -eq $realManifest.authoritativeCommit)
if (-not $isExactOrAncestor) {
    & git -C $root merge-base --is-ancestor $realManifest.authoritativeCommit $realManifestHead 2>$null
    $isExactOrAncestor = ($LASTEXITCODE -eq 0)
}
A 'real manifest: authoritative commit genuinely precedes-or-equals current HEAD' $isExactOrAncestor

# Positive proof the ancestor semantics actually work (not just "no
# exception was thrown"): a genuine ancestor of HEAD (HEAD~1, an existing
# commit strictly before current HEAD) must be accepted.
$ancestorCommit = (& git -C $root rev-parse 'HEAD~1' 2>$null)
if ($LASTEXITCODE -eq 0 -and $ancestorCommit) {
    $ancestorCommit = $ancestorCommit.Trim()
    $ancestorResult = $null
    try { $ancestorResult = Test-RepositoryIdentity -RepoRoot $root -ExpectedCommit $ancestorCommit } catch {}
    A 'ancestor semantics: HEAD~1 (a real ancestor, not equal to HEAD) is accepted' ($ancestorResult -eq (& git -C $root rev-parse HEAD).Trim())
}
A 'real manifest: exact owner approval phrase is deterministic' ((Get-ManifestApprovalPhrase -Manifest $realManifest) -eq 'APPROVE PRODUCTION APPLY SNAG LIST 030-035')

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
    $wrongOrderManifest.migrations = @($realManifest.migrations[1], $realManifest.migrations[0]) + $realManifest.migrations[2..5]
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
    $badChecksumManifest.migrations = @($tamperedEntry) + $realManifest.migrations[1..5]
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
    AThrows 'scenario 10: repository HEAD mismatch (non-ancestor commit)' { Test-RepositoryIdentity -RepoRoot $root -ExpectedCommit ('f' * 40) } 'does not contain.*ancestor'

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

# --- SnagListMigrationContract: object lists include migration 030-035 objects ---
$contractSource = Get-Content -Raw (Join-Path $root 'scripts\lib\SnagListMigrationContract.ps1')
$expectedTables = @('snags', 'snag_events', 'snag_evidence', 'snag_plan_versions', 'snag_command_requests', 'snag_evidence_upload_intents', 'project_snag_sequences', 'project_snag_trades', 'project_stakeholders', 'snag_trade_stakeholders', 'snag_comments')
A 'SnagListTables source declares all 11 expected tables' (@($expectedTables | Where-Object { $contractSource -notmatch [regex]::Escape("'$_'") }).Count -eq 0)

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
    if ($Sql -match "pg_locks") { return '[]' }
    return 't'
}
$repeatRunResult = Test-SnagListPreflightAssertions -Query $allPresentQuery -BatchId 'SNAG-LIST-030-035'
A 'idempotency: repeat run after success is classified NOT_READY (blocked, not silently re-applied)' ($repeatRunResult.status -eq 'NOT_READY')
A 'idempotency: repeat run classification is ALREADY_APPLIED' ($repeatRunResult.classification -eq 'ALREADY_APPLIED')
A 'idempotency: repeat-run reason names "already exists"' (@($repeatRunResult.reasons | Where-Object { $_ -match 'already exists' }).Count -gt 0)

# Scenario: partial apply - predecessor present, only SOME Snag List objects
# present (simulates 030 applied, 031-034 not yet applied).
$partialQuery = {
    param([string]$Sql)
    if ($Sql -match 'pg_locks') { return '[]' }
    if ($Sql -match "to_regclass\('public\.snags'\)") { return 't' }
    if ($Sql -match "to_regclass\('public\.projects'\)|to_regclass\('public\.profiles'\)|to_regclass\('auth\.users'\)|to_regprocedure\('public\.can_") { return 't' }
    return 'f'
}
$partialResult = Test-SnagListPreflightAssertions -Query $partialQuery -BatchId 'SNAG-LIST-030-035'
A 'partial-apply: mixed presence is classified NOT_READY (blocked pending forensic review)' ($partialResult.status -eq 'NOT_READY')
A 'partial-apply: explicit PARTIAL_STATE classification is emitted' ($partialResult.classification -eq 'PARTIAL_STATE')
A 'partial-apply: reason names drift/partial state, not a resumable state' (@($partialResult.reasons | Where-Object { $_ -match 'partial|drift' }).Count -gt 0)
A 'partial-apply: safe default is BLOCK, never an automatic resume-from-next-migration' ($applySource -notmatch '(?i)resume|continue.?from.?next')

$only035Names = 'project_snag_sequences|project_snag_trades|project_stakeholders|snag_trade_stakeholders|snag_comments|capture_snag_observation|execute_snag_product_command|publish_snag_observations|add_snag_comment|configure_snag_catalog'
$legacyOnlyQuery = {
    param([string]$Sql)
    if ($Sql -match 'pg_locks') { return '[]' }
    if ($Sql -match $only035Names) { return 'f' }
    return 't'
}
$missing035 = Test-SnagListPreflightAssertions -Query $legacyOnlyQuery -BatchId 'SNAG-LIST-030-035'
A 'partial state: 030-034 present with 035 missing is NOT_READY' ($missing035.status -eq 'NOT_READY')
A 'partial state: 030-034 present with 035 missing is classified PARTIAL_STATE' ($missing035.classification -eq 'PARTIAL_STATE')

$driftQuery = {
    param([string]$Sql)
    if ($Sql -match 'pg_locks') { return '[]' }
    if ($Sql -match "to_regclass\('public\.projects'\)|to_regclass\('public\.profiles'\)|to_regclass\('auth\.users'\)|to_regprocedure\('public\.can_") { return 'f' }
    if ($Sql -match 'project_snag_trades') { return 't' }
    return 'f'
}
$driftResult = Test-SnagListPreflightAssertions -Query $driftQuery -BatchId 'SNAG-LIST-030-035'
A 'unexpected 035 object without predecessor is NOT_READY' ($driftResult.status -eq 'NOT_READY')
A 'unexpected 035 object without predecessor is PARTIAL_DRIFT' ($driftResult.classification -eq 'PARTIAL_DRIFT')

# ---------------------------------------------------------------------------
# H-02: valid-but-wrong target project ref. Get-ProductionConnectionFingerprint
# never opens a network connection - it only parses a connection URL and
# validates its fields - so this is exercised via dependency injection: a
# fake, syntactically-valid PRODUCTION_DB_URL pointing at a DIFFERENT (but
# equally well-formed) project ref, written to a gitignored fixture file
# (the function requires its EnvFile to be git-ignored, exactly like the
# real .env.production.local). No real credential, no real host, no network
# call of any kind.
# ---------------------------------------------------------------------------
. (Join-Path $root 'scripts\lib\ProductionConnection.ps1')
$fingerprintFixtureDir = Join-Path $root 'work\executor-hardening-fixtures'
New-Item -ItemType Directory -Path $fingerprintFixtureDir -Force | Out-Null
try {
    $wrongRefEnvPath = Join-Path $fingerprintFixtureDir 'wrong-ref.env'
    Set-Content -LiteralPath $wrongRefEnvPath -Value 'PRODUCTION_DB_URL=postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:fakepassword123@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres' -Encoding utf8 -NoNewline
    AThrows 'H-02: valid-format expected ref vs different valid-format actual ref is blocked before any migration execution' {
        Get-ProductionConnectionFingerprint -EnvFile $wrongRefEnvPath -RepoRoot $root -ExpectedProjectRef $realManifest.approvedProjectRef
    } 'does not match production'

    $rightRefEnvPath = Join-Path $fingerprintFixtureDir 'right-ref.env'
    Set-Content -LiteralPath $rightRefEnvPath -Value "PRODUCTION_DB_URL=postgresql://postgres.$($realManifest.approvedProjectRef):fakepassword123@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres" -Encoding utf8 -NoNewline
    $matchingFingerprint = $null
    try { $matchingFingerprint = Get-ProductionConnectionFingerprint -EnvFile $rightRefEnvPath -RepoRoot $root -ExpectedProjectRef $realManifest.approvedProjectRef } catch {}
    A 'H-02 control: matching project ref is accepted (proves the rejection above is ref-specific, not a fixture-format problem)' ($null -ne $matchingFingerprint -and $matchingFingerprint.User -eq "postgres.$($realManifest.approvedProjectRef)")
} finally {
    Remove-Item -LiteralPath $fingerprintFixtureDir -Recurse -Force -ErrorAction SilentlyContinue
}
$applyIndexTargetCheck = $applySource.IndexOf('$conn = Get-ProductionConnectionFingerprint')
$applyIndexMigrationExec = $applySource.IndexOf('Invoke-ManifestMigrationSequence -Manifest')
A 'H-02: target fingerprint check happens before any migration is executed in the apply CLI' ($applyIndexTargetCheck -gt 0 -and $applyIndexTargetCheck -lt $applyIndexMigrationExec)
A 'required database user is checked before migration execution' ($applySource.IndexOf('requiredDatabaseUser') -gt $applyIndexTargetCheck -and $applySource.IndexOf('requiredDatabaseUser') -lt $applyIndexMigrationExec)

# ---------------------------------------------------------------------------
# H-07/H-08/H-09: dirty tracked migration, independent of checksum.
# Uses scripts/tests/fixtures/900_dirty_gate_test_migration.sql - a
# dedicated, tracked, test-only fixture (never a historical or Snag List
# migration) so this can safely modify-then-restore working-tree content.
# Restoration always runs in a finally block via `git checkout --`, proven
# by a post-test hash comparison against the original committed content.
# ---------------------------------------------------------------------------
$dirtyFixtureRelative = 'scripts\tests\fixtures\900_dirty_gate_test_migration.sql'
$dirtyFixtureAbsolute = Join-Path $root $dirtyFixtureRelative
$originalFixtureHash = (Get-FileHash -LiteralPath $dirtyFixtureAbsolute -Algorithm SHA256).Hash.ToLowerInvariant()
$originalFixtureContent = Get-Content -Raw -LiteralPath $dirtyFixtureAbsolute
try {
    Add-Content -LiteralPath $dirtyFixtureAbsolute -Value '-- dirty-gate test mutation, restored by test cleanup' -Encoding utf8
    $dirtyHash = (Get-FileHash -LiteralPath $dirtyFixtureAbsolute -Algorithm SHA256).Hash.ToLowerInvariant()
    A 'dirty-gate fixture: mutation actually changed the file content' ($dirtyHash -ne $originalFixtureHash)

    $dirtyManifestTemplate = @{
        schemaVersion = 1; batchId = 'TEST-DIRTY-GATE'; approvedProjectRef = 'szgbkeqornkdngoegyso'
        authoritativeCommit = $realManifest.authoritativeCommit
        migrationsDirectory = 'scripts\tests\fixtures'; contiguousSequence = $false
    }

    # H-07: dirty file, STALE manifest checksum (still the original) -
    # blocked by the checksum gate, with the checksum-specific message.
    $staleManifest = $dirtyManifestTemplate.Clone()
    $staleManifest.migrations = @(@{ number = 900; file = '900_dirty_gate_test_migration.sql'; sha256 = $originalFixtureHash })
    AThrows 'H-07: dirty file with STALE manifest checksum is blocked by the hash gate' {
        Test-ManifestMigrationChecksums -Manifest $staleManifest -RepoRoot $root
    } 'MIGRATION HASH MISMATCH'

    # H-08: dirty file, manifest checksum UPDATED to match the dirty content
    # - checksum validation now passes, but the dirty-state gate still
    # blocks, with its own distinct message, before any execution.
    $updatedManifest = $dirtyManifestTemplate.Clone()
    $updatedManifest.migrations = @(@{ number = 900; file = '900_dirty_gate_test_migration.sql'; sha256 = $dirtyHash })
    $checksumPassed = $false
    try { Test-ManifestMigrationChecksums -Manifest $updatedManifest -RepoRoot $root | Out-Null; $checksumPassed = $true } catch {}
    A 'H-08: checksum validation PASSES once the manifest hash matches the dirty content' $checksumPassed
    AThrows 'H-08: dirty-state gate still blocks even though checksum validation passed' {
        Test-ManifestMigrationsTrackedAndClean -Manifest $updatedManifest -RepoRoot $root
    } 'TRACKED MIGRATION FILE IS DIRTY'
} finally {
    [IO.File]::WriteAllText($dirtyFixtureAbsolute, $originalFixtureContent, [Text.UTF8Encoding]::new($false))
    $restoredHash = (Get-FileHash -LiteralPath $dirtyFixtureAbsolute -Algorithm SHA256).Hash.ToLowerInvariant()
}
$finalFixtureContent = [IO.File]::ReadAllText($dirtyFixtureAbsolute)
A 'dirty-gate fixture: restored to original content after the test (cleanup proven, not assumed)' ($finalFixtureContent -eq $originalFixtureContent)

# H-09: clean tracked file, matching checksum - both gates pass. Uses the
# real, already-committed Snag List manifest/migrations rather than the
# dirty-gate fixture: the fixture above is only *staged* at this point in
# the working tree (it becomes committed, and therefore a true "clean"
# baseline, only once this hardening pass's own follow-up commit lands),
# so it cannot yet demonstrate a genuinely clean state on its own. The real
# manifest's 5 migration files are already committed at HEAD right now,
# which is exactly what H-09 needs to prove.
$cleanChecksumsOk = $false; $cleanDirtyGateOk = $false
try { Test-ManifestMigrationChecksums -Manifest $realManifest -RepoRoot $root | Out-Null; $cleanChecksumsOk = $true } catch {}
try { Test-ManifestMigrationsTrackedAndClean -Manifest $realManifest -RepoRoot $root | Out-Null; $cleanDirtyGateOk = $true } catch {}
A 'H-09: clean tracked files (real Snag List manifest) with matching checksums pass both the checksum and dirty-state gates' ($cleanChecksumsOk -and $cleanDirtyGateOk)

# ---------------------------------------------------------------------------
# Versioned preflight evidence contract. Fully local: fixtures contain no
# connection data and Import-SnagListPreflightEvidence performs no network or
# credential access.
# ---------------------------------------------------------------------------
$evidenceFixtureDir = Join-Path ([IO.Path]::GetTempPath()) "preflight-contract-$([guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $evidenceFixtureDir | Out-Null
function New-ValidEvidenceFixture {
    param([datetime]$At = [DateTime]::UtcNow)
    return [ordered]@{
        schemaVersion = 'snag-list-preflight/v1'; generatedAtUtc = $At.ToString('o'); batchId = 'SNAG-LIST-030-035'
        productionFingerprintVerified = $true; readOnlyVerified = $true
        assertions = [ordered]@{
            predecessorState = [ordered]@{ projects = $true }
            blockingLocks = [ordered]@{ conflictingLockCount = 0; safe = $true; details = @() }
            classification = 'READY'; status = 'READY_FOR_SNAG-LIST-030-035'
        }
        status = 'READY_FOR_SNAG-LIST-030-035'
    }
}
function Write-EvidenceFixture([string]$Name, $Value) {
    $path = Join-Path $evidenceFixtureDir $Name
    Write-Utf8NoBom -Path $path -Value ($Value | ConvertTo-Json -Depth 10)
    return $path
}
try {
    $fixtureNow = [datetime]'2026-07-14T12:00:00Z'
    $validPath = Write-EvidenceFixture 'valid.json' (New-ValidEvidenceFixture -At $fixtureNow)
    $validModel = Import-SnagListPreflightEvidence -Path $validPath -ExpectedBatchId 'SNAG-LIST-030-035' -NowUtc $fixtureNow.AddMinutes(5)
    A 'evidence A: canonical READY/zero-lock/fingerprint/read-only fixture passes' ($validModel.status -eq 'READY_FOR_SNAG-LIST-030-035' -and $validModel.blockingLocks.conflictingLockCount -eq 0)

    $incidentPath = Join-Path $root 'work\snag-list-030-035-production-release\20260714T122738Z\preflight-evidence.json'
    $incidentRaw = Get-Content -Raw -LiteralPath $incidentPath | ConvertFrom-Json
    $incidentAt = [datetime]$incidentRaw.generatedAtUtc
    $incidentModel = Import-SnagListPreflightEvidence -Path $incidentPath -ExpectedBatchId 'SNAG-LIST-030-035' -NowUtc $incidentAt.AddMinutes(5)
    A 'evidence B: historical incident schema is accepted only through explicit legacy adapter' ($incidentModel.sourceSchemaVersion -eq 'legacy-unversioned-v0' -and $incidentModel.blockingLocks.safe)

    $missing = New-ValidEvidenceFixture -At $fixtureNow; $missing.assertions.Remove('blockingLocks')
    AThrows 'evidence C: missing blockingLocks hard-fails before connection' { Import-SnagListPreflightEvidence -Path (Write-EvidenceFixture 'missing.json' $missing) -ExpectedBatchId 'SNAG-LIST-030-035' -NowUtc $fixtureNow } 'blockingLocks.*no migration was attempted'
    $nullLocks = New-ValidEvidenceFixture -At $fixtureNow; $nullLocks.assertions.blockingLocks = $null
    AThrows 'evidence D: null blockingLocks hard-fails' { Import-SnagListPreflightEvidence -Path (Write-EvidenceFixture 'null.json' $nullLocks) -ExpectedBatchId 'SNAG-LIST-030-035' -NowUtc $fixtureNow } 'assertions.blockingLocks'
    foreach ($wrong in @('none', 7, $true)) {
        $wrongType = New-ValidEvidenceFixture -At $fixtureNow; $wrongType.assertions.blockingLocks = $wrong
        AThrows "evidence E: wrong blockingLocks type '$wrong' hard-fails" { Import-SnagListPreflightEvidence -Path (Write-EvidenceFixture "wrong-$wrong.json" $wrongType) -ExpectedBatchId 'SNAG-LIST-030-035' -NowUtc $fixtureNow } 'assertions.blockingLocks'
    }
    $locked = New-ValidEvidenceFixture -At $fixtureNow; $locked.assertions.blockingLocks = [ordered]@{ conflictingLockCount = 1; safe = $false; details = @([ordered]@{ pid = 42; mode = 'AccessExclusiveLock'; schema = 'public'; relation = 'projects' }) }
    AThrows 'evidence F: one blocking lock hard-fails' { Import-SnagListPreflightEvidence -Path (Write-EvidenceFixture 'locked.json' $locked) -ExpectedBatchId 'SNAG-LIST-030-035' -NowUtc $fixtureNow } 'blocking locks present.*no migration was attempted'
    foreach ($state in @('PARTIAL_STATE','PARTIAL_DRIFT','ALREADY_APPLIED')) {
        $notReady = New-ValidEvidenceFixture -At $fixtureNow; $notReady.assertions.classification = $state; $notReady.assertions.status = 'NOT_READY'; $notReady.status = 'NOT_READY'
        AThrows "evidence state: $state cannot enter apply" { Import-SnagListPreflightEvidence -Path (Write-EvidenceFixture "$state.json" $notReady) -ExpectedBatchId 'SNAG-LIST-030-035' -NowUtc $fixtureNow } 'state is not READY.*no migration was attempted'
    }
    $unknown = New-ValidEvidenceFixture -At $fixtureNow; $unknown.schemaVersion = 'snag-list-preflight/v999'
    AThrows 'evidence J: unknown schema version hard-fails' { Import-SnagListPreflightEvidence -Path (Write-EvidenceFixture 'unknown.json' $unknown) -ExpectedBatchId 'SNAG-LIST-030-035' -NowUtc $fixtureNow } 'unsupported schema version.*no migration was attempted'
    $contradiction = New-ValidEvidenceFixture -At $fixtureNow; $contradiction.assertions.blockingLocks.details = @([ordered]@{ pid = 42 })
    AThrows 'evidence K: contradictory count/details hard-fails' { Import-SnagListPreflightEvidence -Path (Write-EvidenceFixture 'contradiction.json' $contradiction) -ExpectedBatchId 'SNAG-LIST-030-035' -NowUtc $fixtureNow } 'contradictory.*no migration was attempted'
    $stale = New-ValidEvidenceFixture -At $fixtureNow.AddMinutes(-31)
    AThrows 'evidence L: stale evidence hard-fails' { Import-SnagListPreflightEvidence -Path (Write-EvidenceFixture 'stale.json' $stale) -ExpectedBatchId 'SNAG-LIST-030-035' -NowUtc $fixtureNow } 'stale.*no migration was attempted'
    $badFingerprint = New-ValidEvidenceFixture -At $fixtureNow; $badFingerprint.productionFingerprintVerified = $false
    AThrows 'evidence M: failed fingerprint hard-fails' { Import-SnagListPreflightEvidence -Path (Write-EvidenceFixture 'fingerprint.json' $badFingerprint) -ExpectedBatchId 'SNAG-LIST-030-035' -NowUtc $fixtureNow } 'productionFingerprintVerified.*no migration was attempted'
    $badReadOnly = New-ValidEvidenceFixture -At $fixtureNow; $badReadOnly.readOnlyVerified = $false
    AThrows 'evidence N: failed read-only assertion hard-fails' { Import-SnagListPreflightEvidence -Path (Write-EvidenceFixture 'readonly.json' $badReadOnly) -ExpectedBatchId 'SNAG-LIST-030-035' -NowUtc $fixtureNow } 'readOnlyVerified.*no migration was attempted'

    A 'classification O1: pre-apply failure is BLOCKED BEFORE APPLY' ((Get-SnagListReleaseFailureStatus -Phase PRE_APPLY) -eq 'BLOCKED BEFORE APPLY - EXECUTOR EVIDENCE CONTRACT DEFECT')
    A 'classification O2: NOT_ATTEMPTED migration cannot be labeled failed' ((Get-SnagListReleaseFailureStatus -Phase EXECUTION -Steps @([pscustomobject]@{number='030';status='NOT_ATTEMPTED';attempted=$false})) -notmatch 'FAILED AT MIGRATION')
    A 'classification O3: migration failure requires an actually attempted step' ((Get-SnagListReleaseFailureStatus -Phase EXECUTION -Steps @([pscustomobject]@{number='033';status='FAIL';attempted=$true})) -eq 'FAILED AT MIGRATION 033')

    $gateIndex = $applySource.IndexOf('Import-SnagListPreflightEvidence')
    $connectionIndex = $applySource.IndexOf('$conn = Get-ProductionConnectionFingerprint')
    A 'evidence gate is executed before apply connection creation' ($gateIndex -gt 0 -and $gateIndex -lt $connectionIndex)
    A 'producer and consumer share the centralized evidence helper' ($preflightSource -match 'New-SnagListPreflightEvidence' -and $applySource -match 'Import-SnagListPreflightEvidence')
    A 'pre-apply report uses canonical BLOCKED BEFORE APPLY classification' ($applySource -match 'Get-SnagListReleaseFailureStatus -Phase PRE_APPLY' -and $applySource -match "overallStatus = 'BLOCKED_BEFORE_APPLY'")
    A 'pre-apply report marks every migration NOT_ATTEMPTED' ($applySource -match "attempted = \`$false; status = 'NOT_ATTEMPTED'")
} finally {
    Remove-Item -LiteralPath $evidenceFixtureDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "TOTAL: $pass passed, $fail failed"
if ($fail) { exit 1 }
