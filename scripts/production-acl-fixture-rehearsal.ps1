[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('028', '029')][string]$ThroughMigration,
    [Parameter(Mandatory)][string]$BackupPath,
    [Parameter(Mandatory)][string]$OutputPath,
    [string]$ContractPath,
    [string]$ExceptionsPath,
    [string]$PostgresImage = 'postgres:17',
    [switch]$KeepDisposableEnvironment
)

# ===========================================================================
# ACL-Fixture Rehearsal - algorithm 1.0.0
#
# Fixes the rehearsal fidelity gap that let migration 028's 8 production
# ACL differences (write_command_requests_id_seq, submit_contractor_
# report_atomic, submit_site_visit_atomic) escape detection during that
# migration's pre-apply rehearsal (production-security-remediation-
# rehearsal.ps1). That rehearsal restores a real backup (taken with
# pg_dump --no-privileges, so it never carries platform default-ACL rules)
# and hydrates ACL only from a pre-028 production inventory snapshot -
# which by construction has no rows for objects that did not exist yet.
# When 028 then creates a new sequence/functions inside that container,
# vanilla Postgres grants them nothing extra, so the rehearsal's post-
# migration inventory looked clean even though real production - which
# independently carries a genuine ALTER DEFAULT PRIVILEGES rule, confirmed
# via a direct read-only pg_default_acl query (work/production-029-
# approval-evidence/pg-default-acl-investigation.json) - auto-granted
# broad access to anon/authenticated on those same new objects.
#
# This script builds a FRESH disposable container (no backup restore) that
# instead runs the real canonical migration chain from scratch, exactly
# like composite-security-certification.ps1's own PHASE 4 "migration-
# derived expected" container, EXCEPT this one first installs
# Get-SupabaseDefaultAclFixtureScript (scripts/lib/
# ProductionSecurityStateEmulator.ps1) - a disposable-only SQL fixture
# reproducing that exact real pg_default_acl rule - before the migration
# chain runs, so any new object the chain creates auto-inherits the same
# broad grants real Supabase would apply. This is a high-fidelity "what
# would actually happen in production" simulation, capturing genuine
# causation (fixture + real migration DDL -> real Postgres default-ACL
# mechanism -> observed grants) rather than replaying a recorded snapshot.
#
# -ThroughMigration selects how far the canonical chain runs:
#   028 - negative control: must reproduce the exact 8 known production
#         differences (proves the fixture faithfully reconstructs the
#         real root cause).
#   029 - positive control: must reach 0 differences (proves migration
#         029 actually closes the gap).
#
# The resulting fixture-container inventory is fed into the REAL,
# unmodified composite-security-certification.ps1 as the "actual"
# (-ProductionInventoryPath) evidence, so every other category (rls,
# policies, functions, tablePrivileges, ownership, roleAttributes,
# memberships, structuralSchema) is verified through the exact same
# comparator logic that runs against real production - not a narrow,
# hand-rolled ACL-only check - proving no other category regresses.
#
# Never touches production. Never touches
# canonical-security-contract.json's own -ContractPath default when
# ThroughMigration=028: a temporary copy with '029_production_acl_
# followup.sql' removed from canonicalMigrationPath.included is used
# instead, written under -OutputPath only, so this file's own execution
# never mutates the real, committed contract.
# ===========================================================================

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$FixtureRehearsalAlgorithmVersion = '1.0.0'

if (-not $ContractPath) { $ContractPath = Join-Path $PSScriptRoot 'contracts\canonical-security-contract.json' }
if (-not $ExceptionsPath) { $ExceptionsPath = Join-Path $PSScriptRoot 'contracts\accepted-exceptions.json' }

. (Join-Path $PSScriptRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $PSScriptRoot 'lib\SecurityContractInventory.ps1')
. (Join-Path $PSScriptRoot 'lib\MigrationContractExtractor.ps1')
. (Join-Path $PSScriptRoot 'lib\ProductionSecurityStateEmulator.ps1')
. (Join-Path $PSScriptRoot 'lib\RemediationPreflightPostflight.ps1')

# The exact 8 differences known from real production (backups/production/
# 20260712T145403Z/composite-certification.json), used only to make this
# script's own negative-control self-check explicit and independently
# reproducible. objectIdentity for functionPrivileges is built from
# pg_get_function_identity_arguments(), which returns the function's
# DECLARED parameter names, not bare types (confirmed by a first run of
# this script against real production's own recorded difference identity
# strings) - REVOKE ... FROM anon (migration 029, and this list) may use
# either bare-type or named-parameter form to IDENTIFY the same function
# (both resolve to the same regprocedure in Postgres), but this
# comparison list must match the catalog's own rendering exactly.
$script:Known8DifferenceObjectIdentities = @(
    'write_command_requests_id_seq.anon.SELECT',
    'write_command_requests_id_seq.anon.UPDATE',
    'write_command_requests_id_seq.anon.USAGE',
    'write_command_requests_id_seq.authenticated.SELECT',
    'write_command_requests_id_seq.authenticated.UPDATE',
    'write_command_requests_id_seq.authenticated.USAGE',
    'public.submit_contractor_report_atomic(p_project_id bigint, p_report_date date, p_wp_progress jsonb, p_meta jsonb, p_client_request_id uuid).anon',
    'public.submit_site_visit_atomic(p_project_id bigint, p_contractor_report_id bigint, p_visit_date date, p_observations jsonb, p_meta jsonb, p_client_request_id uuid).anon'
)

function Write-JsonArtifactWithChecksum {
    param([Parameter(Mandatory)]$Payload, [Parameter(Mandatory)][string]$Path)
    $json = $Payload | ConvertTo-Json -Depth 20
    Write-Utf8NoBom -Path $Path -Value $json
    $hash = Get-FileChecksum -Path $Path
    $checksumPath = [System.IO.Path]::ChangeExtension($Path, '.sha256')
    Write-Utf8NoBom -Path $checksumPath -Value "$hash  $(Split-Path -Leaf $Path)`n"
    return $checksumPath
}

function New-LocalInventoryArtifact {
    param([Parameter(Mandatory)]$Inventory, [Parameter(Mandatory)][string]$EnvironmentLabel)
    $categoryCounts = [ordered]@{}
    foreach ($k in $Inventory.categories.Keys) {
        [object[]]$categoryRows = $Inventory.categories[$k]
        $categoryCounts[$k] = $categoryRows.Count
    }
    [object[]]$normalizedElements = Get-RehearsalNormalizedElements -Elements $Inventory.elements
    $deterministicPlaceholderTimestamp = '1970-01-01T00:00:00.0000000Z'
    return [ordered]@{
        algorithmVersion = $Inventory.algorithmVersion
        timestampUtc = $deterministicPlaceholderTimestamp
        sourceType = "acl_fixture_rehearsal_catalog_read:$EnvironmentLabel"
        productionFingerprintVerified = $true
        transactionReadOnly = $true
        inventoryScope = 'openday-application-security-contract'
        elements = $normalizedElements
        categoryCounts = $categoryCounts
        canonicalPayloadHash = $Inventory.canonicalPayloadHash
        migration026Targets = @()
        migration026Evidence = 'N/A: acl-fixture rehearsal inventory, not a production run'
        redactionStatus = 'PASS'
        productionChanged = $false
        overallStatus = 'CREATED'
        failureReason = $null
        failedStep = $null
        completedAtUtc = $deterministicPlaceholderTimestamp
        durationSeconds = 0
    }
}

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
$container = "acl-fixture-rehearsal-$suffix"
$volume = "acl-fixture-rehearsal-vol-$suffix"
$tempDir = Join-Path ([IO.Path]::GetTempPath()) "acl-fixture-rehearsal-$suffix"
$containerStarted = $false

$result = [ordered]@{
    algorithmVersion = $FixtureRehearsalAlgorithmVersion
    generatedAt = [DateTime]::UtcNow.ToString('o')
    throughMigration = $ThroughMigration
    fixtureApplied = $false
    migrationChainResult = [ordered]@{ status = 'UNKNOWN'; migrationsApplied = @() }
    inventoryResult = $null
    postflightResult = $null
    compositeResult = $null
    controlAssertion = [ordered]@{ mode = $(if ($ThroughMigration -eq '028') { 'NEGATIVE_CONTROL' } else { 'POSITIVE_CONTROL' }); status = 'UNKNOWN'; details = $null }
    cleanupResult = 'UNKNOWN'
    overallStatus = 'FAIL'
    failureReason = $null
}

try {
    if (-not (Test-Path -LiteralPath $OutputPath)) { New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null }
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    # -----------------------------------------------------------------
    # Phase 1: resolve the contract to use for this run's migration chain
    # -----------------------------------------------------------------
    $effectiveContractPath = $ContractPath
    if ($ThroughMigration -eq '028') {
        $contractForRun = Get-Content -LiteralPath $ContractPath -Raw | ConvertFrom-Json
        [string[]]$includedList = @($contractForRun.canonicalMigrationPath.included) | Where-Object { $_ -ne '029_production_acl_followup.sql' }
        $contractForRun.canonicalMigrationPath.included = $includedList
        $effectiveContractPath = Join-Path $tempDir 'contract-through-028.json'
        Write-Utf8NoBom -Path $effectiveContractPath -Value ($contractForRun | ConvertTo-Json -Depth 20)
    }
    $contract = Get-Content -LiteralPath $effectiveContractPath -Raw | ConvertFrom-Json

    # -----------------------------------------------------------------
    # Phase 2: fresh disposable container (no backup restore - matches
    # composite-security-certification.ps1 PHASE 4's own construction)
    # -----------------------------------------------------------------
    Invoke-NativeTool -Command 'docker' -ArgumentList @('volume', 'create', $volume) | Out-Null
    $migrationsHostPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\weekly-tracker\src\migrations')).Path
    $mountQuery = "type=bind,source=$tempDir,target=/rehearsal"
    $mountMigrations = "type=bind,source=$migrationsHostPath,target=/migrations,readonly"
    $run = Invoke-NativeTool -Command 'docker' -ArgumentList @('run', '-d', '--name', $container,
        '-v', "${volume}:/var/lib/postgresql/data", '--mount', $mountQuery, '--mount', $mountMigrations,
        '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=postgres', $PostgresImage)
    if ($run.ExitCode -ne 0) { throw "disposable acl-fixture-rehearsal container failed to start: $($run.Output -join ' | ')" }
    $containerStarted = $true

    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        if ((Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'pg_isready', '-U', 'postgres')).ExitCode -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'disposable acl-fixture-rehearsal container did not become ready' }

    function Invoke-ContainerFile {
        param([string]$HostPath, [string]$ContainerPath)
        $r = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '--quiet', '--file', $ContainerPath)
        if ($r.ExitCode -ne 0) { throw "$ContainerPath failed: $($r.Output -join ' | ')" }
    }

    $rolesStubPath = Join-Path $tempDir 'roles-platform-stub.sql'
    Write-Utf8NoBom -Path $rolesStubPath -Value (Get-SupabasePlatformRoleStubScript -Contract $contract)
    Invoke-ContainerFile -HostPath $rolesStubPath -ContainerPath '/rehearsal/roles-platform-stub.sql'

    $authStubPath = Join-Path $tempDir 'auth-platform-stub.sql'
    Write-Utf8NoBom -Path $authStubPath -Value (Get-SupabasePlatformSchemaStubScript)
    Invoke-ContainerFile -HostPath $authStubPath -ContainerPath '/rehearsal/auth-platform-stub.sql'

    $storageStubPath = Join-Path $tempDir 'storage-platform-stub.sql'
    Write-Utf8NoBom -Path $storageStubPath -Value (Get-SupabaseStorageSchemaStubScript)
    Invoke-ContainerFile -HostPath $storageStubPath -ContainerPath '/rehearsal/storage-platform-stub.sql'

    # -----------------------------------------------------------------
    # Phase 3: install the Supabase-like default-ACL fixture BEFORE the
    # migration chain runs, so any new object the chain creates inherits
    # it exactly like real production does - disposable-only, see
    # Get-SupabaseDefaultAclFixtureScript's own header for full rationale.
    # -----------------------------------------------------------------
    $fixturePath = Join-Path $tempDir 'default-acl-fixture.sql'
    Write-Utf8NoBom -Path $fixturePath -Value (Get-SupabaseDefaultAclFixtureScript)
    Invoke-ContainerFile -HostPath $fixturePath -ContainerPath '/rehearsal/default-acl-fixture.sql'
    $result.fixtureApplied = $true

    # -----------------------------------------------------------------
    # Phase 4: canonical migration chain, through $ThroughMigration
    # -----------------------------------------------------------------
    $migrationFiles = Get-CanonicalMigrationFileList -ContractPath $effectiveContractPath -MigrationsRoot $migrationsHostPath
    Invoke-CanonicalMigrationChain -Container $container -ContainerMigrationsMountPath '/migrations' -MigrationFiles $migrationFiles -InvokeNativeTool ${function:Invoke-NativeTool}
    $result.migrationChainResult = [ordered]@{ status = 'PASS'; migrationsApplied = @($migrationFiles | ForEach-Object { $_.FileName }) }

    # -----------------------------------------------------------------
    # Phase 5: capture the fixture container's real inventory (this run's
    # "actual" evidence)
    # -----------------------------------------------------------------
    $queryFn = {
        param([string]$Sql)
        $wrapped = New-ReadOnlyCatalogScript -CatalogQuery $Sql
        $hostPath = Join-Path $tempDir 'query.sql'
        Write-Utf8NoBom -Path $hostPath -Value ($wrapped + [Environment]::NewLine)
        $r = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '--quiet', '--file', '/rehearsal/query.sql')
        if ($r.ExitCode -ne 0) { throw "acl-fixture-rehearsal catalog query failed: $($r.Output -join ' | ')" }
        return ($r.Output -join "`n")
    }
    $fixtureInventory = Get-SecurityContractInventory -Query $queryFn -Environment "acl-fixture-rehearsal-through-$ThroughMigration" -EvidenceSource 'production'
    $localArtifact = New-LocalInventoryArtifact -Inventory $fixtureInventory -EnvironmentLabel "through-$ThroughMigration"
    $inventoryPath = Join-Path $OutputPath "acl-fixture-inventory-through-$ThroughMigration.json"
    $inventoryChecksumPath = Write-JsonArtifactWithChecksum -Payload $localArtifact -Path $inventoryPath
    $result.inventoryResult = [ordered]@{ path = (Split-Path -Leaf $inventoryPath); elementCount = $localArtifact.elements.Count }

    # -----------------------------------------------------------------
    # Phase 5b: expanded postflight (Invoke-RemediationPostflight) against
    # the same fixture container - independent cross-check of the same
    # 8 objects using its own direct+effective ACL spot-checks, so this
    # rehearsal also proves the postflight coverage expansion itself
    # actually catches what it was expanded to catch.
    # -----------------------------------------------------------------
    $rawQueryFn = {
        param([string]$WrappedSql)
        $hostPath = Join-Path $tempDir 'rawquery.sql'
        Write-Utf8NoBom -Path $hostPath -Value ($WrappedSql + [Environment]::NewLine)
        $r = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '--quiet', '--file', '/rehearsal/rawquery.sql')
        if ($r.ExitCode -ne 0) { throw "acl-fixture-rehearsal postflight query failed: $($r.Output -join ' | ')" }
        return ($r.Output -join "`n")
    }
    $postflight = Invoke-RemediationPostflight -Query $rawQueryFn
    $result.postflightResult = [ordered]@{ status = $postflight.status; failureCount = $postflight.failures.Count; failures = $postflight.failures }
    $expectedPostflightStatus = if ($ThroughMigration -eq '028') { 'FAIL' } else { 'PASS' }
    if ($postflight.status -ne $expectedPostflightStatus) {
        throw "expanded postflight status mismatch for ThroughMigration=$ThroughMigration - expected=$expectedPostflightStatus actual=$($postflight.status); failures: $($postflight.failures -join '; ')"
    }

    # -----------------------------------------------------------------
    # Phase 6: full composite certification against this fixture evidence
    # (proves every other category still matches - not just the 3 ACL
    # objects this rehearsal was purpose-built to catch)
    # -----------------------------------------------------------------
    $compositeOutput = Join-Path $OutputPath "composite-through-$ThroughMigration"
    New-Item -ItemType Directory -Path $compositeOutput -Force | Out-Null
    $compositeArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'composite-security-certification.ps1'),
        '-BackupPath', (Resolve-Path -LiteralPath $BackupPath).Path, '-ProductionInventoryPath', $inventoryPath,
        '-ProductionInventoryChecksumPath', $inventoryChecksumPath, '-OutputPath', $compositeOutput,
        '-ContractPath', $effectiveContractPath, '-ExceptionsPath', $ExceptionsPath, '-PostgresImage', $PostgresImage,
        '-AdditionalVerifiedStructuralTables', 'write_command_requests')
    $compositeStdout = Join-Path $tempDir 'composite-stdout.txt'
    $compositeProc = Start-Process -FilePath 'powershell.exe' -ArgumentList $compositeArgs -NoNewWindow -PassThru -Wait -RedirectStandardOutput $compositeStdout
    $compositeReportPath = Join-Path $compositeOutput 'composite-certification.json'
    $compositeReport = if (Test-Path -LiteralPath $compositeReportPath) { Get-Content -LiteralPath $compositeReportPath -Raw | ConvertFrom-Json } else { $null }
    if (-not $compositeReport) { throw "composite-security-certification.ps1 produced no artifact (exit=$($compositeProc.ExitCode)); stdout: $(Get-Content -LiteralPath $compositeStdout -Raw -ErrorAction SilentlyContinue)" }

    [object[]]$allDifferences = @($compositeReport.differences)
    [object[]]$aclDifferences = @($allDifferences | Where-Object { $_.category -eq 'sequencePrivileges' -or $_.category -eq 'functionPrivileges' })
    [object[]]$aclIdentities = @($aclDifferences | ForEach-Object { $_.objectIdentity } | Sort-Object)
    [object[]]$nonAclDifferences = @($allDifferences | Where-Object { $_.category -ne 'sequencePrivileges' -and $_.category -ne 'functionPrivileges' })

    $result.compositeResult = [ordered]@{
        exitCode = $compositeProc.ExitCode
        status = $compositeReport.status
        differenceCountTotal = $allDifferences.Count
        differenceCountAcl = $aclDifferences.Count
        differenceCountNonAcl = $nonAclDifferences.Count
        aclDifferenceIdentities = $aclIdentities
        canonicalPayloadHash = $compositeReport.canonicalPayloadHash
    }

    if ($nonAclDifferences.Count -gt 0) {
        throw "unexpected non-ACL difference(s) found - a category other than sequencePrivileges/functionPrivileges regressed: $(($nonAclDifferences | ForEach-Object { $_.objectIdentity }) -join '; ')"
    }

    if ($ThroughMigration -eq '028') {
        [object[]]$expectedSorted = @($script:Known8DifferenceObjectIdentities | Sort-Object)
        $identical = ($aclIdentities.Count -eq $expectedSorted.Count)
        if ($identical) {
            for ($i = 0; $i -lt $aclIdentities.Count; $i++) {
                if ($aclIdentities[$i] -ne $expectedSorted[$i]) { $identical = $false; break }
            }
        }
        $result.controlAssertion.details = [ordered]@{ expected = $expectedSorted; actual = $aclIdentities; identical = $identical }
        if (-not $identical) { throw "negative control did NOT reproduce exactly the known 8 production differences - fixture or methodology has drifted; expected=$($expectedSorted -join ',') actual=$($aclIdentities -join ',')" }
        if ($compositeReport.status -ne 'FAIL') { throw "negative control expected composite status FAIL, got $($compositeReport.status)" }
        $result.controlAssertion.status = 'PASS'
    } else {
        $result.controlAssertion.details = [ordered]@{ differenceCount = $aclDifferences.Count }
        if ($aclDifferences.Count -ne 0) { throw "positive control expected 0 ACL differences, got $($aclDifferences.Count): $($aclIdentities -join '; ')" }
        if ($compositeReport.status -ne 'PASS') { throw "positive control expected composite status PASS, got $($compositeReport.status)" }
        $result.controlAssertion.status = 'PASS'
    }

    $result.overallStatus = 'PASS'
    Write-Host "ACL_FIXTURE_REHEARSAL ($ThroughMigration): PASS"
    Write-Host "Composite status: $($compositeReport.status), total differences: $($allDifferences.Count), ACL differences: $($aclDifferences.Count)"

} catch {
    $result.overallStatus = 'FAIL'
    $result.failureReason = $_.Exception.Message
    Write-Host "ACL_FIXTURE_REHEARSAL ($ThroughMigration): FAIL"
    Write-Host "Reason: $($_.Exception.Message)"
} finally {
    if ($containerStarted -and -not $KeepDisposableEnvironment) {
        try { Invoke-NativeTool -Command 'docker' -ArgumentList @('rm', '-f', $container) | Out-Null; $result.cleanupResult = 'PASS' } catch { $result.cleanupResult = 'FAIL' }
        try { Invoke-NativeTool -Command 'docker' -ArgumentList @('volume', 'rm', $volume) | Out-Null } catch { $result.cleanupResult = 'FAIL' }
    } else { $result.cleanupResult = 'SKIPPED' }
    try { if ((Test-Path -LiteralPath $tempDir) -and -not $KeepDisposableEnvironment) { Remove-Item -LiteralPath $tempDir -Recurse -Force } } catch { }

    $resultPath = Join-Path $OutputPath "acl-fixture-rehearsal-through-$ThroughMigration.json"
    Write-JsonArtifactWithChecksum -Payload $result -Path $resultPath | Out-Null
    Write-Host "Output: $resultPath"
}

if ($result.overallStatus -eq 'PASS') { exit 0 } else { exit 1 }
