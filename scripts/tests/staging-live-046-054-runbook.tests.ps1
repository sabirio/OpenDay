$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runbookPath = Join-Path $repoRoot 'docs\STAGING_LIVE_APPLY_046_054_RUNBOOK.md'
$attestationTemplatePath = Join-Path $repoRoot 'scripts\manifests\staging-live-046-054-attestation.template.json'
$releaseManifestPath = Join-Path $repoRoot 'scripts\manifests\contractor-managed-rollout-046-054.psd1'
$backupManifestPath = Join-Path $repoRoot 'backups\staging\20260802T135704Z\backup-manifest.json'
$migrationsDir = Join-Path $repoRoot 'weekly-tracker\src\migrations'

$script:passed = 0
$script:failed = 0
function Assert-True([string]$Name, [bool]$Condition, [string]$Detail = '') {
    if ($Condition) { $script:passed++; Write-Host "[PASS] $Name" }
    else { $script:failed++; Write-Host "[FAIL] $Name $Detail" }
}

function Get-NormalizedSha256 {
    param([Parameter(Mandatory)][string]$Path)
    $bytes = [IO.File]::ReadAllBytes($Path)
    $text = [Text.Encoding]::UTF8.GetString($bytes)
    $normalized = $text -replace "`r`n", "`n"
    $normalizedBytes = [Text.Encoding]::UTF8.GetBytes($normalized)
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        -join ($sha256.ComputeHash($normalizedBytes) | ForEach-Object { $_.ToString('x2') })
    } finally {
        $sha256.Dispose()
    }
}

Assert-True 'runbook file exists' (Test-Path -LiteralPath $runbookPath -PathType Leaf)
Assert-True 'attestation template exists' (Test-Path -LiteralPath $attestationTemplatePath -PathType Leaf)

$runbook = Get-Content -LiteralPath $runbookPath -Raw

# --- No secrets ever hardcoded into the runbook ---
Assert-True 'runbook never contains a literal STAGING_DB_URL value' ($runbook -notmatch 'STAGING_DB_URL\s*=\s*[''"]?postgresql://[^$]')
Assert-True 'runbook never contains an embedded password in a connection URI' ($runbook -notmatch 'postgresql://[^:\s()$]+:[^@\s()$]+@')
Assert-True 'runbook never hardcodes PGPASSWORD to a literal value' ($runbook -notmatch 'PGPASSWORD\s*=\s*[''"][^$]')
Assert-True 'runbook credential block reads the password only from the fingerprint object' ($runbook -match '\$env:PGPASSWORD = \$fingerprint\.Password')
Assert-True 'runbook includes a leaked-password sanity check on the constructed URI' ($runbook -match 'password leaked into the connection URI')

# --- Identity / fail-closed checks are present ---
Assert-True 'runbook uses the existing Get-StagingConnectionFingerprint helper (no reimplemented identity check)' ($runbook -match 'Get-StagingConnectionFingerprint')
Assert-True 'runbook pins the expected staging project ref' ($runbook -match "ExpectedProjectRef 'sdndsekarwhumdbcqxni'")
Assert-True 'runbook fixes sslmode to require (never trusted from the raw URL)' ($runbook -match '\?sslmode=require')

# --- Backup / manifest binding matches the files actually on disk ---
$actualReleaseManifestHash = (Get-FileHash -LiteralPath $releaseManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-True 'runbook release-manifest hash matches the file on disk' ($runbook.ToLowerInvariant() -match [regex]::Escape($actualReleaseManifestHash)) "expected $actualReleaseManifestHash"

$actualBackupManifestHash = (Get-FileHash -LiteralPath $backupManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-True 'runbook backup-manifest hash matches the file on disk' ($runbook.ToLowerInvariant() -match [regex]::Escape($actualBackupManifestHash)) "expected $actualBackupManifestHash"

$backupManifestJson = Get-Content -LiteralPath $backupManifestPath -Raw | ConvertFrom-Json
$backupSourceCommit = '6e568d836ebdec6ab6bdb0419a859cb0c9d1666d'
# NOTE: this is the backup's own frozen sourceCommit - the commit the backup
# was taken FROM, not the current branch HEAD. It is one commit before this
# runbook was even added and stays fixed forever; the runbook's own HEAD
# check must instead prove ancestry (see the "impossible self-referential
# HEAD gate" regression tests below), never equality with this value.
Assert-True 'bound backup manifest sourceCommit matches the frozen, pinned value' ($backupManifestJson.sourceCommit -eq $backupSourceCommit)
Assert-True 'bound backup manifest environment is staging' ($backupManifestJson.environment -eq 'staging')

# --- Regression: the runbook must never re-introduce an impossible
#     self-referential HEAD gate (asserting `git rev-parse HEAD` equals a
#     fixed literal commit SHA) - editing the runbook always changes HEAD,
#     so pinning "current HEAD" to one exact SHA can never be satisfied by
#     the file's own next edit. The correct, stable check is ancestry of the
#     backup's sourceCommit, not equality of HEAD itself. ---
Assert-True 'runbook does not assert git rev-parse HEAD equals a fixed literal commit SHA' (
    -not [regex]::IsMatch($runbook, '(?ms)git rev-parse HEAD\s*\r?\n#\s*expect:\s*[0-9a-f]{40}')
)
Assert-True 'runbook verifies backup-source-commit ancestry via git merge-base --is-ancestor, not HEAD equality' (
    $runbook -match 'git merge-base --is-ancestor \$backupSourceCommit HEAD'
)
Assert-True 'runbook pins the backup source commit constant to the real, frozen backup-manifest sourceCommit' (
    $runbook -match [regex]::Escape("`$backupSourceCommit = '$backupSourceCommit'")
)
Assert-True 'runbook diffs migration files against the backup source commit, not against a moving HEAD literal' (
    $runbook -match 'git diff --exit-code \$backupSourceCommit -- weekly-tracker/src/migrations/'
)
Assert-True 'runbook restricts post-backup file changes to docs/manifests/tests/backups paths only' (
    $runbook -match 'docs/\|scripts/manifests/\|scripts/tests/\|backups/staging/'
)

# --- Every one of the 9 migration hashes in the runbook matches the CRLF-normalized hash of the real file ---
$migrationFiles = @(
    '046_contractor_schedule_draft_foundation.sql',
    '047_contractor_schedule_human_date_semantics.sql',
    '048_contractor_schedule_ownership_enforcement.sql',
    '049_contractor_schedule_submission_lifecycle.sql',
    '050_contractor_schedule_draft_lifecycle_lock.sql',
    '051_contractor_schedule_lifecycle_lock_integrity.sql',
    '052_create_contractor_managed_project.sql',
    '053_contractor_managed_project_scope_sync.sql',
    '054_fix_contractor_managed_scope_null_artifact.sql'
)
foreach ($file in $migrationFiles) {
    $path = Join-Path $migrationsDir $file
    $expected = Get-NormalizedSha256 -Path $path
    Assert-True "runbook pins the correct normalized hash for $file" ($runbook.ToLowerInvariant() -match [regex]::Escape($expected)) "expected $expected"
}

# --- Regression guard: raw Get-FileHash on a CRLF-checked-out migration file must NOT equal the
#     normalized hash this runbook pins - if it ever did, that would mean line endings changed
#     and the CRLF-normalization warning/workaround in Step 5 would be stale. ---
$sampleFile = Join-Path $migrationsDir '046_contractor_schedule_draft_foundation.sql'
$rawHash = (Get-FileHash -LiteralPath $sampleFile -Algorithm SHA256).Hash.ToLowerInvariant()
$normalizedHash = Get-NormalizedSha256 -Path $sampleFile
if ($rawHash -ne $normalizedHash) {
    Assert-True 'CRLF-normalization warning in Step 5 is still necessary (raw vs normalized hashes differ, as documented)' ($true)
} else {
    Assert-True 'raw and normalized hashes now match - Step 5''s CRLF warning may be stale and should be reviewed' ($false) 'raw Get-FileHash now equals the normalized hash; re-check whether this repo still uses core.autocrlf=true'
}
Assert-True 'runbook explicitly documents the raw (CRLF) hash it warns against, for the 046 example' ($runbook -match '9f0b0190a2c98cee08e2bd71f5461790113ae302e21b3f9bc58828776c3a4645' -or $runbook.ToLowerInvariant() -match '9f0b0190a2c98cee08e2bd71f5461790113ae302e21b3f9bc58828776c3a4645')

# --- Docker invocation safety: migrations directory is mounted read-only; every apply uses ON_ERROR_STOP and a single transaction ---
Assert-True 'migration apply mounts the migrations directory read-only' ($runbook -match 'target=/apply,readonly')
Assert-True 'migration apply uses ON_ERROR_STOP=1' ($runbook -match 'ON_ERROR_STOP=1')
Assert-True 'migration apply uses --single-transaction' ($runbook -match '--single-transaction')
Assert-True 'migration apply stops immediately on non-zero exit code (no automatic continuation)' ($runbook -match 'REFUSING TO CONTINUE')
Assert-True 'runbook applies migrations one at a time, not combined into one command' ($runbook -match "FileName '046_contractor_schedule_draft_foundation\.sql'" -and $runbook -match "FileName '054_fix_contractor_managed_scope_null_artifact\.sql'")

# --- Migration 054's null-scope predicate is present verbatim and gated on owner acknowledgement ---
Assert-True "054 preflight uses the exact null-scope predicate" ($runbook -match "schedule_ownership_mode = 'CONTRACTOR_MANAGED' AND jsonb_typeof\(scope\) = 'null'")
Assert-True '054 requires explicit owner acknowledgement when pre-count > 0' ($runbook -match 'I ACKNOWLEDGE THE 054 CORRECTION')

# --- Frontend deploy is explicitly out of scope for this runbook ---
Assert-True 'runbook explicitly states it does not deploy any new frontend' ($runbook -match 'Do not deploy the new frontend')

# --- Migration file contents are unchanged (this test would fail if 046-054 were ever edited without updating the runbook) ---
Assert-True 'migration files 046-054 are still exactly 9 files with no gaps' ((Get-ChildItem $migrationsDir -Filter '0*.sql' | Where-Object { $_.Name -match '^0(4[6-9]|5[0-4])_' }).Count -eq 9)

# --- Attestation template shape ---
$attestation = Get-Content -LiteralPath $attestationTemplatePath -Raw | ConvertFrom-Json
Assert-True 'attestation template schemaVersion is staging-migration-attestation/v1' ($attestation.schemaVersion -eq 'staging-migration-attestation/v1')
Assert-True 'attestation template batchId matches the release manifest' ($attestation.batchId -eq 'contractor-managed-rollout-046-054')
Assert-True 'attestation template has exactly 9 migration entries' ($attestation.migrations.Count -eq 9)
$attestationWithoutComment = $attestation | Select-Object -Property * -ExcludeProperty _comment
Assert-True 'attestation template contains no password/secret-shaped field (outside its own explanatory comment)' (($attestationWithoutComment | ConvertTo-Json -Depth 10) -notmatch 'password|PGPASSWORD|STAGING_DB_URL')


# --- Every ```powershell code block in the runbook parses as valid PowerShell 5.1 ---
$codeBlocks = [regex]::Matches($runbook, '(?ms)^```powershell\r?\n(.*?)^```')
Assert-True 'runbook contains at least one powershell code block' ($codeBlocks.Count -gt 0)
$tempDir = Join-Path ([IO.Path]::GetTempPath()) ('staging-live-runbook-blocks-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
try {
    $blockIndex = 0
    $allBlocksParse = $true
    foreach ($match in $codeBlocks) {
        $blockPath = Join-Path $tempDir "block$blockIndex.ps1"
        Set-Content -LiteralPath $blockPath -Value $match.Groups[1].Value -NoNewline
        $tokens = $null; $parseErrors = $null
        [void][Management.Automation.Language.Parser]::ParseFile($blockPath, [ref]$tokens, [ref]$parseErrors)
        if ($parseErrors.Count -gt 0) {
            $allBlocksParse = $false
            Write-Host "  parse error in code block $blockIndex : $($parseErrors[0].Message)"
        }
        $blockIndex++
    }
    Assert-True "all $blockIndex powershell code blocks in the runbook parse without syntax errors" $allBlocksParse
} finally {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "TOTAL: $script:passed passed, $script:failed failed"
if ($script:failed -gt 0) { exit 1 }
