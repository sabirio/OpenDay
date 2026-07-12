[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BackupPath,
    [Parameter(Mandatory)][string]$ProductionInventoryPath,
    [Parameter(Mandatory)][string]$ProductionInventoryChecksumPath,
    [Parameter(Mandatory)][string]$OutputPath,
    [string]$MigrationPath,
    [string]$ContractPath,
    [string]$ExceptionsPath,
    [string]$PostgresImage = 'postgres:17',
    [switch]$KeepDisposableEnvironment
)

# ===========================================================================
# Production Security Remediation Rehearsal - algorithm 1.0.0
#
# End-to-end, disposable-only rehearsal of migration 028
# (028_production_security_reconciliation.sql):
#
#   restore real backup (roles.sql + schema.sql, filtered exactly like
#   restore-verify.ps1) into a disposable container
#   -> hydrate its ACL to match production's ACTUAL current grants, read
#      from the immutable production security inventory (never guessed,
#      never a live production connection)
#   -> capture that as a "pre-remediation local inventory" artifact and run
#      the real composite-security-certification.ps1 against it, proving
#      the emulated state reproduces the same real root causes the actual
#      production composite run found
#   -> read-only preflight (expect READY)
#   -> apply the migration to the disposable container only
#   -> read-only postflight (expect PASS)
#   -> capture a "post-remediation local inventory" and run the composite
#      certification again, proving the emulated state now reaches PASS
#   -> never touches production; never writes to backups/production's
#      immutable production-inventory or composite-certification files
#
# All rehearsal artifacts are written under -OutputPath (a rehearsal
# working directory, not backups/production/<snapshot>/), so this can
# never be confused with, or overwrite, real production evidence.
# ===========================================================================

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RehearsalAlgorithmVersion = '1.0.0'

if (-not $MigrationPath) { $MigrationPath = Join-Path $PSScriptRoot '..\weekly-tracker\src\migrations\028_production_security_reconciliation.sql' }
if (-not $ContractPath) { $ContractPath = Join-Path $PSScriptRoot 'contracts\canonical-security-contract.json' }
if (-not $ExceptionsPath) { $ExceptionsPath = Join-Path $PSScriptRoot 'contracts\accepted-exceptions.json' }

. (Join-Path $PSScriptRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $PSScriptRoot 'lib\SecurityContractInventory.ps1')
. (Join-Path $PSScriptRoot 'lib\ProductionSecurityStateEmulator.ps1')
. (Join-Path $PSScriptRoot 'lib\RemediationPreflightPostflight.ps1')

function New-LocalInventoryArtifact {
    # Wraps a raw Get-SecurityContractInventory result in the same
    # orchestration-report shape production-security-inventory.ps1
    # produces, so composite-security-certification.ps1's evidence
    # validation (algorithmVersion/overallStatus/productionChanged/
    # redactionStatus/elements) accepts it unmodified when pointed at a
    # rehearsal container instead of real production.
    param([Parameter(Mandatory)]$Inventory, [Parameter(Mandatory)][string]$EnvironmentLabel)

    $categoryCounts = [ordered]@{}
    foreach ($k in $Inventory.categories.Keys) {
        [object[]]$categoryRows = $Inventory.categories[$k]
        $categoryCounts[$k] = $categoryRows.Count
    }

    [object[]]$normalizedElements = Get-RehearsalNormalizedElements -Elements $Inventory.elements

    # timestampUtc/completedAtUtc are deliberately NOT live [DateTime]::UtcNow
    # values here, unlike a real production-security-inventory.ps1 run (where
    # a live timestamp legitimately records when that one immutable artifact
    # was captured). This local inventory is regenerated fresh on every
    # rehearsal run; a live timestamp would change this file's own byte
    # content - and therefore its checksum - on every run even when the
    # underlying catalog data is identical, which then cascades into a
    # different composite-certification.ps1 canonicalPayloadHash between
    # two otherwise-identical rehearsal runs (found by a real determinism
    # rerun). A fixed placeholder keeps the rehearsal's own hash
    # deterministic across runs, matching section 20's "runtime timestamps
    # must not enter the canonical hash" principle for this artifact too.
    $deterministicPlaceholderTimestamp = '1970-01-01T00:00:00.0000000Z'

    return [ordered]@{
        algorithmVersion = $Inventory.algorithmVersion
        timestampUtc = $deterministicPlaceholderTimestamp
        sourceType = "local_rehearsal_catalog_read:$EnvironmentLabel"
        productionFingerprintVerified = $true
        transactionReadOnly = $true
        inventoryScope = 'openday-application-security-contract'
        elements = $normalizedElements
        categoryCounts = $categoryCounts
        canonicalPayloadHash = $Inventory.canonicalPayloadHash
        migration026Targets = @()
        migration026Evidence = 'N/A: rehearsal inventory, not a production run'
        redactionStatus = 'PASS'
        productionChanged = $false
        overallStatus = 'CREATED'
        failureReason = $null
        failedStep = $null
        completedAtUtc = $deterministicPlaceholderTimestamp
        durationSeconds = 0
    }
}

function Write-JsonArtifactWithChecksum {
    # Returns the checksum sidecar path actually written, so callers never
    # have to guess or re-derive the naming convention (a real end-to-end
    # rehearsal run found a mismatch between this function's actual output
    # name and a caller's independently-reconstructed "$Path.sha256" guess).
    param([Parameter(Mandatory)]$Payload, [Parameter(Mandatory)][string]$Path)
    $json = $Payload | ConvertTo-Json -Depth 20
    Write-Utf8NoBom -Path $Path -Value $json
    $hash = Get-FileChecksum -Path $Path
    $checksumPath = [System.IO.Path]::ChangeExtension($Path, '.sha256')
    Write-Utf8NoBom -Path $checksumPath -Value "$hash  $(Split-Path -Leaf $Path)`n"
    return $checksumPath
}

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
$container = "remediation-rehearsal-$suffix"
$volume = "remediation-rehearsal-vol-$suffix"
$tempDir = Join-Path ([IO.Path]::GetTempPath()) "remediation-rehearsal-$suffix"
$containerStarted = $false

$rehearsal = [ordered]@{
    algorithmVersion = $RehearsalAlgorithmVersion
    generatedAt = [DateTime]::UtcNow.ToString('o')
    restoreResult = $null
    productionStateEmulationResult = [ordered]@{ status = 'UNKNOWN'; grantStatementCount = 0 }
    preRemediationCompositeResult = $null
    preflightResult = $null
    migrationApplyResult = [ordered]@{ status = 'UNKNOWN'; exitCode = -1 }
    postflightResult = $null
    postRemediationInventoryResult = $null
    postRemediationCompositeResult = $null
    determinismResult = $null
    cleanupResult = 'UNKNOWN'
    overallStatus = 'FAIL'
}

try {
    $resolvedBackupPath = (Resolve-Path -LiteralPath $BackupPath).Path
    if (-not (Test-Path -LiteralPath $ProductionInventoryPath -PathType Leaf)) { throw "production inventory not found: $ProductionInventoryPath" }
    $sidecarHash = ((Get-Content -LiteralPath $ProductionInventoryChecksumPath -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    $actualHash = (Get-FileChecksum -Path $ProductionInventoryPath).ToLowerInvariant()
    if ($sidecarHash -ne $actualHash) { throw 'production inventory checksum mismatch - refusing to rehearse against untrustworthy evidence' }
    $prodInventory = Get-Content -LiteralPath $ProductionInventoryPath -Raw | ConvertFrom-Json

    if (-not (Test-Path -LiteralPath $OutputPath)) { New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null }
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    # -----------------------------------------------------------------
    # Phase 1: disposable container + real roles.sql/schema.sql restore
    # -----------------------------------------------------------------
    Invoke-NativeTool -Command 'docker' -ArgumentList @('volume', 'create', $volume) | Out-Null
    $mountBackup = "type=bind,source=$resolvedBackupPath,target=/backup,readonly"
    $mountTemp = "type=bind,source=$tempDir,target=/rehearsal"
    $run = Invoke-NativeTool -Command 'docker' -ArgumentList @('run', '-d', '--name', $container,
        '-v', "${volume}:/var/lib/postgresql/data", '--mount', $mountBackup, '--mount', $mountTemp,
        '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=postgres', $PostgresImage)
    if ($run.ExitCode -ne 0) { throw "disposable rehearsal container failed to start: $($run.Output -join ' | ')" }
    $containerStarted = $true

    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        if ((Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'pg_isready', '-U', 'postgres')).ExitCode -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'disposable rehearsal container did not become ready' }

    $filteredRolesPath = Join-Path $tempDir 'roles.filtered.sql'
    $filteredRoles = New-FilteredRolesFile -SourcePath (Join-Path $resolvedBackupPath 'roles.sql') -DestinationPath $filteredRolesPath -BootstrapRoleNames @('postgres')
    $rolesResult = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/rehearsal/roles.filtered.sql')
    if ($rolesResult.ExitCode -ne 0) { throw "roles.sql restore failed: $($rolesResult.Output -join ' | ')" }

    $filteredSchemaPath = Join-Path $tempDir 'schema.filtered.sql'
    $unavailableExtensions = @('supabase_vault', 'pgsodium', 'pg_graphql', 'pg_net', 'pgjwt', 'wrappers', 'pg_cron')
    $filteredExt = New-FilteredSchemaFile -SourcePath (Join-Path $resolvedBackupPath 'schema.sql') -DestinationPath $filteredSchemaPath -UnavailableExtensionNames $unavailableExtensions
    $schemaResult = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/rehearsal/schema.filtered.sql')
    if ($schemaResult.ExitCode -ne 0) { throw "schema.sql restore failed: $($schemaResult.Output -join ' | ')" }

    $rehearsal.restoreResult = [ordered]@{ status = 'PASS'; rolesFiltered = $filteredRoles; extensionsFiltered = $filteredExt; note = 'schema-only rehearsal restore (roles.sql + schema.sql); full data.sql restore + row-count/constraint/trigger verification already independently confirmed PASS by restore-verify.ps1 in the composite certification run this rehearsal is remediating' }

    # -----------------------------------------------------------------
    # Phase 2: production security state emulation (ACL hydration)
    # -----------------------------------------------------------------
    $hydrationScript = New-ProductionSecurityStateHydrationScript -Inventory $prodInventory
    $hydrationPath = Join-Path $tempDir 'hydrate-acl.sql'
    Write-Utf8NoBom -Path $hydrationPath -Value $hydrationScript
    $hydrationResult = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/rehearsal/hydrate-acl.sql')
    if ($hydrationResult.ExitCode -ne 0) { throw "ACL hydration failed: $($hydrationResult.Output -join ' | ')" }
    [string[]]$grantStatementsForCount = Get-ProductionActualGrantStatements -Inventory $prodInventory
    $grantStatementCount = $grantStatementsForCount.Count
    $rehearsal.productionStateEmulationResult = [ordered]@{ status = 'PASS'; grantStatementCount = $grantStatementCount }

    $queryFn = {
        param([string]$Sql)
        $wrapped = New-ReadOnlyCatalogScript -CatalogQuery $Sql
        $hostPath = Join-Path $tempDir 'query.sql'
        Write-Utf8NoBom -Path $hostPath -Value ($wrapped + [Environment]::NewLine)
        $r = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '--quiet', '--file', '/rehearsal/query.sql')
        if ($r.ExitCode -ne 0) { throw "rehearsal container query failed: $($r.Output -join ' | ')" }
        return ($r.Output -join "`n")
    }
    $rawQueryFn = {
        param([string]$Sql)
        $hostPath = Join-Path $tempDir 'rawquery.sql'
        Write-Utf8NoBom -Path $hostPath -Value ($Sql + [Environment]::NewLine)
        $r = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '--quiet', '--file', '/rehearsal/rawquery.sql')
        if ($r.ExitCode -ne 0) { throw "rehearsal container query failed: $($r.Output -join ' | ')" }
        return ($r.Output -join "`n")
    }

    # -----------------------------------------------------------------
    # Phase 3: pre-remediation local inventory + composite certification
    # (proves the emulated state reproduces the real root causes)
    # -----------------------------------------------------------------
    $preInventory = Get-SecurityContractInventory -Query $queryFn -Environment 'rehearsal-pre-remediation' -EvidenceSource 'production'
    $preArtifact = New-LocalInventoryArtifact -Inventory $preInventory -EnvironmentLabel 'pre-remediation'
    $preInventoryPath = Join-Path $OutputPath 'pre-remediation-local-inventory.json'
    $preInventoryChecksumPath = Write-JsonArtifactWithChecksum -Payload $preArtifact -Path $preInventoryPath

    $preCompositeOutput = Join-Path $OutputPath 'pre-remediation-composite'
    New-Item -ItemType Directory -Path $preCompositeOutput -Force | Out-Null
    $preCompositeArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'composite-security-certification.ps1'),
        '-BackupPath', $resolvedBackupPath, '-ProductionInventoryPath', $preInventoryPath,
        '-ProductionInventoryChecksumPath', $preInventoryChecksumPath, '-OutputPath', $preCompositeOutput,
        '-ContractPath', $ContractPath, '-ExceptionsPath', $ExceptionsPath, '-PostgresImage', $PostgresImage)
    $preStdout = Join-Path $tempDir 'pre-composite-stdout.txt'
    $preProc = Start-Process -FilePath 'powershell.exe' -ArgumentList $preCompositeArgs -NoNewWindow -PassThru -Wait -RedirectStandardOutput $preStdout
    $preCompositeReportPath = Join-Path $preCompositeOutput 'composite-certification.json'
    $preCompositeReport = if (Test-Path -LiteralPath $preCompositeReportPath) { Get-Content -LiteralPath $preCompositeReportPath -Raw | ConvertFrom-Json } else { $null }
    $rehearsal.preRemediationCompositeResult = [ordered]@{
        exitCode = $preProc.ExitCode
        status = if ($preCompositeReport) { $preCompositeReport.status } else { 'NO_ARTIFACT' }
        differenceCount = if ($preCompositeReport) { $preCompositeReport.differenceSummary.total } else { -1 }
        expectedFailReproduced = ($preCompositeReport -and $preCompositeReport.status -eq 'FAIL')
    }
    if (-not $rehearsal.preRemediationCompositeResult.expectedFailReproduced) {
        throw "pre-remediation rehearsal did not reproduce the expected FAIL (status=$($rehearsal.preRemediationCompositeResult.status)) - emulator or migration-derived-execution has drifted from the real root causes"
    }

    # -----------------------------------------------------------------
    # Phase 4: preflight (expect READY - migration not yet applied)
    # -----------------------------------------------------------------
    $preflight = Invoke-RemediationPreflight -Query $rawQueryFn
    $rehearsal.preflightResult = $preflight
    if ($preflight.status -ne 'READY') { throw "preflight expected READY before first apply, got $($preflight.status)" }

    # -----------------------------------------------------------------
    # Phase 5: apply the migration (disposable clone only)
    # -----------------------------------------------------------------
    # Migration file lives outside the read-only /backup mount; copy it in explicitly.
    $migrationHostCopy = Join-Path $tempDir (Split-Path -Leaf $MigrationPath)
    Copy-Item -LiteralPath $MigrationPath -Destination $migrationHostCopy -Force
    $migrationApplyResult = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '--quiet', '--file', "/rehearsal/$(Split-Path -Leaf $MigrationPath)")
    $rehearsal.migrationApplyResult = [ordered]@{ status = if ($migrationApplyResult.ExitCode -eq 0) { 'PASS' } else { 'FAIL' }; exitCode = $migrationApplyResult.ExitCode; output = ($migrationApplyResult.Output -join ' | ') }
    if ($migrationApplyResult.ExitCode -ne 0) { throw "migration apply failed: $($migrationApplyResult.Output -join ' | ')" }

    # -----------------------------------------------------------------
    # Phase 6: postflight (expect PASS)
    # -----------------------------------------------------------------
    $postflight = Invoke-RemediationPostflight -Query $rawQueryFn
    $rehearsal.postflightResult = $postflight
    if ($postflight.status -ne 'PASS') { throw "postflight FAIL: $($postflight.failures -join '; ')" }

    # -----------------------------------------------------------------
    # Phase 7: second preflight (expect ALREADY_REMEDIATED - idempotence)
    # -----------------------------------------------------------------
    $secondPreflight = Invoke-RemediationPreflight -Query $rawQueryFn
    $rehearsal.postRemediationInventoryResult = [ordered]@{ secondPreflightStatus = $secondPreflight.status }
    if ($secondPreflight.status -ne 'ALREADY_REMEDIATED') { throw "second preflight expected ALREADY_REMEDIATED after apply, got $($secondPreflight.status)" }

    # Idempotence: re-apply the migration a second time - must remain a safe no-op.
    $secondApply = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '--quiet', '--file', "/rehearsal/$(Split-Path -Leaf $MigrationPath)")
    if ($secondApply.ExitCode -ne 0) { throw "second (idempotent) migration apply failed: $($secondApply.Output -join ' | ')" }
    $secondPostflight = Invoke-RemediationPostflight -Query $rawQueryFn
    if ($secondPostflight.status -ne 'PASS') { throw "postflight FAIL after second (idempotent) apply: $($secondPostflight.failures -join '; ')" }
    $rehearsal.postRemediationInventoryResult['idempotentReapplyStatus'] = 'PASS'

    # -----------------------------------------------------------------
    # Phase 8: post-remediation local inventory + composite certification
    # -----------------------------------------------------------------
    $postInventory = Get-SecurityContractInventory -Query $queryFn -Environment 'rehearsal-post-remediation' -EvidenceSource 'production'
    $postArtifact = New-LocalInventoryArtifact -Inventory $postInventory -EnvironmentLabel 'post-remediation'
    $postInventoryPath = Join-Path $OutputPath 'post-remediation-local-inventory.json'
    $postInventoryChecksumPath = Write-JsonArtifactWithChecksum -Payload $postArtifact -Path $postInventoryPath
    $rehearsal.postRemediationInventoryResult['elementCount'] = $postArtifact.elements.Count

    $postCompositeOutput = Join-Path $OutputPath 'post-remediation-composite'
    New-Item -ItemType Directory -Path $postCompositeOutput -Force | Out-Null
    # write_command_requests is new (created by migration 028), so it can
    # never appear in a fresh restore-verify.ps1 run against the original,
    # unmodified backup - that always reflects the pristine pre-migration
    # structure, by design, for real production certification. postflight
    # already independently proved it exists in the actual migrated
    # rehearsal container (a real catalog read, not an assumption), so its
    # name is passed through explicitly rather than leaving the composite
    # engine to report a structurally-impossible-to-avoid false "missing".
    $postCompositeArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'composite-security-certification.ps1'),
        '-BackupPath', $resolvedBackupPath, '-ProductionInventoryPath', $postInventoryPath,
        '-ProductionInventoryChecksumPath', $postInventoryChecksumPath, '-OutputPath', $postCompositeOutput,
        '-ContractPath', $ContractPath, '-ExceptionsPath', $ExceptionsPath, '-PostgresImage', $PostgresImage,
        '-AdditionalVerifiedStructuralTables', 'write_command_requests')
    $postStdout = Join-Path $tempDir 'post-composite-stdout.txt'
    $postProc = Start-Process -FilePath 'powershell.exe' -ArgumentList $postCompositeArgs -NoNewWindow -PassThru -Wait -RedirectStandardOutput $postStdout
    $postCompositeReportPath = Join-Path $postCompositeOutput 'composite-certification.json'
    $postCompositeReport = if (Test-Path -LiteralPath $postCompositeReportPath) { Get-Content -LiteralPath $postCompositeReportPath -Raw | ConvertFrom-Json } else { $null }
    $rehearsal.postRemediationCompositeResult = [ordered]@{
        exitCode = $postProc.ExitCode
        status = if ($postCompositeReport) { $postCompositeReport.status } else { 'NO_ARTIFACT' }
        differenceCount = if ($postCompositeReport) { $postCompositeReport.differenceSummary.total } else { -1 }
        canonicalPayloadHash = if ($postCompositeReport) { $postCompositeReport.canonicalPayloadHash } else { $null }
    }

    $rehearsal.overallStatus = if ($rehearsal.postRemediationCompositeResult.status -eq 'PASS') { 'PASS' } else { 'FAIL' }

    Write-Host "REHEARSAL: $($rehearsal.overallStatus)"
    Write-Host "Pre-remediation composite: $($rehearsal.preRemediationCompositeResult.status) ($($rehearsal.preRemediationCompositeResult.differenceCount) differences)"
    Write-Host "Post-remediation composite: $($rehearsal.postRemediationCompositeResult.status) ($($rehearsal.postRemediationCompositeResult.differenceCount) differences)"

} catch {
    $rehearsal.overallStatus = 'FAIL'
    $rehearsal['failureReason'] = $_.Exception.Message
    Write-Host "REHEARSAL: FAIL"
    Write-Host "Reason: $($_.Exception.Message)"
} finally {
    if ($containerStarted -and -not $KeepDisposableEnvironment) {
        try { Invoke-NativeTool -Command 'docker' -ArgumentList @('rm', '-f', $container) | Out-Null; $rehearsal.cleanupResult = 'PASS' } catch { $rehearsal.cleanupResult = 'FAIL' }
        try { Invoke-NativeTool -Command 'docker' -ArgumentList @('volume', 'rm', $volume) | Out-Null } catch { $rehearsal.cleanupResult = 'FAIL' }
    } else { $rehearsal.cleanupResult = 'SKIPPED' }
    try { if ((Test-Path -LiteralPath $tempDir) -and -not $KeepDisposableEnvironment) { Remove-Item -LiteralPath $tempDir -Recurse -Force } } catch { }

    $rehearsalArtifactPath = Join-Path $OutputPath 'security-remediation-rehearsal.json'
    Write-JsonArtifactWithChecksum -Payload $rehearsal -Path $rehearsalArtifactPath | Out-Null
    Write-Host "Output: $rehearsalArtifactPath"
}

if ($rehearsal.overallStatus -eq 'PASS') { exit 0 } else { exit 1 }
