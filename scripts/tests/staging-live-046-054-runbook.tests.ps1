$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runbookPath = Join-Path $repoRoot 'docs\STAGING_LIVE_APPLY_046_054_RUNBOOK.md'
$attestationTemplatePath = Join-Path $repoRoot 'scripts\manifests\staging-live-046-054-attestation.template.json'
$releaseManifestPath = Join-Path $repoRoot 'scripts\manifests\contractor-managed-rollout-046-054.psd1'
$acl055ManifestPath = Join-Path $repoRoot 'scripts\manifests\contractor-schedule-function-acl-055.psd1'
$acl055AttestationTemplatePath = Join-Path $repoRoot 'scripts\manifests\staging-live-contractor-schedule-function-acl-055-attestation.template.json'
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
Assert-True '046-054 attestation template exists' (Test-Path -LiteralPath $attestationTemplatePath -PathType Leaf)
Assert-True '046-054 release manifest exists' (Test-Path -LiteralPath $releaseManifestPath -PathType Leaf)
Assert-True '055 release manifest exists (separate from the 046-054 manifest)' (Test-Path -LiteralPath $acl055ManifestPath -PathType Leaf)
Assert-True '055 attestation template exists (separate from the 046-054 attestation template)' (Test-Path -LiteralPath $acl055AttestationTemplatePath -PathType Leaf)

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

$actual055ManifestHash = (Get-FileHash -LiteralPath $acl055ManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-True 'runbook 055 release-manifest raw hash matches the file on disk' ($runbook.ToLowerInvariant() -match [regex]::Escape($actual055ManifestHash)) "expected $actual055ManifestHash"

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
Assert-True 'runbook pins and verifies reviewed implementation commit ancestry' (
    $runbook -match [regex]::Escape("`$reviewedImplementationCommit = 'cf5fc00d4028bbb255e4d100a537a6d1575bd81e'") -and
    $runbook -match 'git merge-base --is-ancestor \$reviewedImplementationCommit HEAD'
)
Assert-True 'runbook rejects migration drift after the reviewed implementation commit' (
    $runbook -match 'git diff --exit-code \$reviewedImplementationCommit -- weekly-tracker/src/migrations/'
)
Assert-True 'runbook verifies the exact reviewed migration delta of modified 053/054 plus added 055' (
    $runbook -match 'git diff --name-status' -and
    $runbook -match '053_contractor_managed_project_scope_sync\.sql' -and
    $runbook -match '054_fix_contractor_managed_scope_null_artifact\.sql' -and
    $runbook -match '055_restrict_contractor_schedule_function_acl\.sql'
)
Assert-True 'runbook restricts post-backup changes to an explicit reviewed allow-list' (
    $runbook -match '\$allowedChangesSinceBackup\s*=\s*@\(' -and
    $runbook -match 'applyContractorManagedScopeSyncLocal\.mjs' -and
    $runbook -match 'localCertificationMigrationPath\.test\.mjs'
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
Assert-True 'runbook applies migrations one at a time, not combined into one command' ($runbook -match "FileName '053_contractor_managed_project_scope_sync\.sql'" -and $runbook -match "FileName '054_fix_contractor_managed_scope_null_artifact\.sql'" -and $runbook -match "FileName '055_restrict_contractor_schedule_function_acl\.sql'")
Assert-True 'runbook never instructs the owner to reapply already-live migrations 046-052' (
    -not [regex]::IsMatch($runbook, "Invoke-StagingMigrationApply -FileName '0(4[6-9]|5[0-2])_")
)

# --- Migration 054's null-scope predicate is present verbatim and gated on owner acknowledgement ---
Assert-True "054 preflight uses the exact null-scope predicate" ($runbook -match "schedule_ownership_mode = 'CONTRACTOR_MANAGED' AND jsonb_typeof\(scope\) = 'null'")
Assert-True '054 requires explicit owner acknowledgement when pre-count > 0' ($runbook -match 'I ACKNOWLEDGE THE 054 CORRECTION')

# --- Frontend deploy is explicitly out of scope for this runbook ---
Assert-True 'runbook explicitly states it does not deploy any new frontend' ($runbook -match 'Do not deploy the new frontend')

# --- Migration file contents are unchanged (this test would fail if 046-054 were ever edited without updating the runbook) ---
Assert-True 'migration files 046-054 are still exactly 9 files with no gaps' ((Get-ChildItem $migrationsDir -Filter '0*.sql' | Where-Object { $_.Name -match '^0(4[6-9]|5[0-4])_' }).Count -eq 9)

# --- Migration 055's normalized hash is separately verified in the runbook ---
$expected055Hash = Get-NormalizedSha256 -Path (Join-Path $migrationsDir '055_restrict_contractor_schedule_function_acl.sql')
Assert-True 'runbook pins the correct normalized hash for 055_restrict_contractor_schedule_function_acl.sql' ($runbook.ToLowerInvariant() -match [regex]::Escape($expected055Hash)) "expected $expected055Hash"
Assert-True '055 file exists as the single migration in its own manifest' (Test-Path -LiteralPath (Join-Path $migrationsDir '055_restrict_contractor_schedule_function_acl.sql') -PathType Leaf)

# --- 046-054 attestation template shape ---
$attestation = Get-Content -LiteralPath $attestationTemplatePath -Raw | ConvertFrom-Json
Assert-True 'attestation template schemaVersion is staging-migration-attestation/v1' ($attestation.schemaVersion -eq 'staging-migration-attestation/v1')
Assert-True 'attestation template batchId matches the release manifest' ($attestation.batchId -eq 'contractor-managed-rollout-046-054')
Assert-True 'attestation template has exactly 9 migration entries' ($attestation.migrations.Count -eq 9)
$attestationWithoutComment = $attestation | Select-Object -Property * -ExcludeProperty _comment
Assert-True 'attestation template contains no password/secret-shaped field (outside its own explanatory comment)' (($attestationWithoutComment | ConvertTo-Json -Depth 10) -notmatch 'password|PGPASSWORD|STAGING_DB_URL')

# --- 055 attestation template shape ---
$acl055Attestation = Get-Content -LiteralPath $acl055AttestationTemplatePath -Raw | ConvertFrom-Json
Assert-True '055 attestation template schemaVersion is staging-migration-attestation/v1' ($acl055Attestation.schemaVersion -eq 'staging-migration-attestation/v1')
Assert-True '055 attestation template batchId matches the 055 release manifest' ($acl055Attestation.batchId -eq 'contractor-schedule-function-acl-055')
Assert-True '055 attestation template has exactly 1 migration entry' ($acl055Attestation.migrations.Count -eq 1)
Assert-True '055 attestation template postflight section has all 8 required count/result fields' (
    $acl055Attestation.postflight.PSObject.Properties.Name -contains 'anonymousUserFacingRpcExecuteCount' -and
    $acl055Attestation.postflight.PSObject.Properties.Name -contains 'anonymousTriggerFunctionExecuteCount' -and
    $acl055Attestation.postflight.PSObject.Properties.Name -contains 'authenticatedTriggerFunctionExecuteCount' -and
    $acl055Attestation.postflight.PSObject.Properties.Name -contains 'authenticatedUserFacingRpcChecksPassed' -and
    $acl055Attestation.postflight.PSObject.Properties.Name -contains 'serviceRoleExecuteChecksPassed' -and
    $acl055Attestation.postflight.PSObject.Properties.Name -contains 'projectsTotalBefore' -and
    $acl055Attestation.postflight.PSObject.Properties.Name -contains 'projectsTotalAfter' -and
    $acl055Attestation.postflight.PSObject.Properties.Name -contains 'securityInventoryResult'
)
$acl055AttestationWithoutComment = $acl055Attestation | Select-Object -Property * -ExcludeProperty _comment
Assert-True '055 attestation template contains no password/secret-shaped field (outside its own explanatory comment)' (($acl055AttestationWithoutComment | ConvertTo-Json -Depth 10) -notmatch 'password|PGPASSWORD|STAGING_DB_URL')

# --- Both PSD1 manifests parse and have the required shape ---
$mainManifest = Import-PowerShellDataFile -LiteralPath $releaseManifestPath
Assert-True '046-054 manifest manifestVersion is 1.0.1' ($mainManifest.manifestVersion -eq '1.0.1')
Assert-True '046-054 manifest authoritativeCommit is the reviewed implementation commit' ($mainManifest.authoritativeCommit -eq 'cf5fc00d4028bbb255e4d100a537a6d1575bd81e')
Assert-True '046-054 manifest expectedBranch is fix/contractor-schedule-function-acl' ($mainManifest.approvalContract.expectedBranch -eq 'fix/contractor-schedule-function-acl')
Assert-True '046-054 manifest has exactly 9 migrations (046-054), 055 excluded' ($mainManifest.migrations.Count -eq 9 -and -not ($mainManifest.migrations | Where-Object { $_.number -eq 55 }))

$acl055Manifest = Import-PowerShellDataFile -LiteralPath $acl055ManifestPath
Assert-True '055 manifest is a separate release manifest with exactly 1 migration' ($acl055Manifest.migrations.Count -eq 1 -and $acl055Manifest.migrations[0].number -eq 55)
Assert-True '055 manifest authoritativeCommit is the reviewed implementation commit' ($acl055Manifest.authoritativeCommit -eq 'cf5fc00d4028bbb255e4d100a537a6d1575bd81e')
Assert-True '055 manifest approvedProjectRef matches staging' ($acl055Manifest.approvedProjectRef -eq 'sdndsekarwhumdbcqxni')

# --- 055 is mandatory, sequenced after 054 and before the final security inventory ---
$idx054Postflight = $runbook.IndexOf('Post-054 count (expect 0)')
$idx055Preflight = $runbook.IndexOf('9a. Migration 055 Preflight')
$idx055Apply = $runbook.IndexOf('9b. Apply Migration 055')
$idx055Postflight = $runbook.IndexOf('9c. Migration 055 ACL Postflight')
$idxFinalInventory = $runbook.IndexOf('10. Final Security Inventory')
Assert-True '055 preflight/apply/postflight are all present and in order' ($idx055Preflight -gt 0 -and $idx055Apply -gt $idx055Preflight -and $idx055Postflight -gt $idx055Apply)
Assert-True '055 is sequenced strictly after 054 postflight and strictly before the final security inventory' (
    $idx054Postflight -gt 0 -and $idxFinalInventory -gt 0 -and
    $idx054Postflight -lt $idx055Preflight -and $idx055Postflight -lt $idxFinalInventory
)
Assert-True 'runbook explicitly states 055 is mandatory, not optional' ($runbook -match 'is not optional' -or $runbook -match 'mandatory,?\s*forward-only')
Assert-True 'runbook applies 055 as its own separate one-at-a-time migration' ($runbook -match "Invoke-StagingMigrationApply -FileName '055_restrict_contractor_schedule_function_acl\.sql'")

# --- Exact ACL expectations pinned in the runbook ---
Assert-True 'runbook expects exactly 6 of 8 user-facing RPCs to have anon EXECUTE pre-055' ($runbook -match 'expected exactly 6 of 8 user-facing RPCs to still have anon EXECUTE pre-055')
Assert-True 'runbook expects exactly 0 of 8 user-facing RPCs to have anon EXECUTE post-055' ($runbook -match "expected 0 of 8 user-facing RPCs to have anon EXECUTE post-055")
Assert-True 'runbook expects all 8 user-facing RPCs to keep authenticated EXECUTE post-055' ($runbook -match 'expected all 8 user-facing RPCs to keep authenticated EXECUTE post-055')
Assert-True 'runbook expects both trigger-only functions to deny anon EXECUTE post-055' ($runbook -match 'expected 0 of 2 trigger-only functions to have anon EXECUTE post-055')
Assert-True 'runbook expects both trigger-only functions to deny authenticated EXECUTE post-055' ($runbook -match 'expected 0 of 2 trigger-only functions to have authenticated EXECUTE post-055')
Assert-True 'runbook prints the MIGRATION_055_ACL_POSTFLIGHT_PASS classification' ($runbook -match 'MIGRATION_055_ACL_POSTFLIGHT_PASS')

# --- Final security inventory names all 8 RPCs + 2 trigger-only functions exactly ---
$expectedTenFunctions = @(
    'save_contractor_schedule_draft',
    'can_access_schedule_submissions',
    'contractor_schedule_lifecycle_status',
    'submit_contractor_schedule',
    'request_schedule_changes',
    'approve_schedule_submission',
    'create_contractor_managed_project',
    'update_contractor_managed_project_scope',
    'prevent_schedule_version_task_mutation',
    'prevent_scope_mutation_during_review'
)
$finalInventorySection = $runbook.Substring($idxFinalInventory, [Math]::Min(3000, $runbook.Length - $idxFinalInventory))
$missingFromFinalInventory = @($expectedTenFunctions | Where-Object { $finalInventorySection -notmatch [regex]::Escape($_) })
Assert-True 'final security inventory mentions all 10 exact function names' ($missingFromFinalInventory.Count -eq 0) "missing: $($missingFromFinalInventory -join ', ')"
Assert-True 'runbook never uses the obsolete function name request_contractor_schedule_changes' ($runbook -notmatch 'request_contractor_schedule_changes')
Assert-True 'runbook never uses the obsolete function name approve_contractor_schedule(?!_)' (-not [regex]::IsMatch($runbook, 'approve_contractor_schedule\('))


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
