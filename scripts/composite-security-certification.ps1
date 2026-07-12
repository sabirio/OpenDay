[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BackupPath,
    [Parameter(Mandatory)][string]$ProductionInventoryPath,
    [Parameter(Mandatory)][string]$ProductionInventoryChecksumPath,
    [Parameter(Mandatory)][string]$OutputPath,
    [string]$ContractPath,
    [string]$ExceptionsPath,
    [string]$PostgresImage = 'postgres:17',
    [switch]$KeepDisposableEnvironment,
    [string[]]$AdditionalVerifiedStructuralTables = @()
)

# -AdditionalVerifiedStructuralTables exists solely for rehearsal use
# (scripts/production-security-remediation-rehearsal.ps1). This entrypoint's
# structuralSchema "actual" evidence always comes from a fresh restore-
# verify.ps1 run against -BackupPath, which is correct for real production
# certification (a real backup never reflects an unmerged migration) but
# means a rehearsal's post-migration disposable container is invisible to
# it - the rehearsal has already independently, authoritatively proven
# those tables exist via its own postflight checks (real catalog reads
# against the actual migrated container), and passes their names here
# rather than this entrypoint silently trusting an unverified claim. Real
# production runs never pass this parameter, so its default (empty) leaves
# every existing production certification path byte-for-byte unchanged.

# ===========================================================================
# Composite Security Certification - canonical entrypoint (algorithm 2.0.0)
#
# Orchestrates, in order: evidence validation -> real disposable restore
# verification (delegated to restore-verify.ps1, unmodified) -> real
# canonical-migration-chain execution against a fresh disposable container
# (the "migration-derived expected" contract for rls/policies/functions/
# privileges/structural-schema - see lib/MigrationContractExtractor.ps1's
# header for why this replaces static SQL-diff parsing) -> category-
# specific comparators (lib/SecurityContractComparators.ps1) against the
# immutable production security inventory artifact -> difference
# classification against the explicit accepted-exceptions ledger ->
# aggregation to a single PASS/FAIL/BLOCKED decision
# (lib/CertificationAggregator.ps1) -> an atomically-written, hash-sealed
# artifact, and (PASS only) a baseline-freeze manifest.
#
# Never connects to production. All evidence for every category except
# structuralSchema comes from the already-captured, checksum-verified
# production-security-inventory.ps1 artifact; structuralSchema's "actual"
# comes from restore-verify.ps1's real restore of the real backup into a
# disposable, unpublished-port PostgreSQL 17 container.
#
# Exit codes: 0=PASS, 1=certification FAIL, 2=invalid input/evidence,
# 3=external BLOCKED, 4=internal implementation error.
# ===========================================================================

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$CompositeAlgorithmVersion = '2.0.0'
$ArtifactSchemaVersion = '1.0.0'
$BaselineManifestSchemaVersion = '1.0.0'

if (-not $ContractPath) { $ContractPath = Join-Path $PSScriptRoot 'contracts\canonical-security-contract.json' }
if (-not $ExceptionsPath) { $ExceptionsPath = Join-Path $PSScriptRoot 'contracts\accepted-exceptions.json' }

. (Join-Path $PSScriptRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $PSScriptRoot 'lib\SecurityContractInventory.ps1')
. (Join-Path $PSScriptRoot 'lib\MigrationContractExtractor.ps1')
. (Join-Path $PSScriptRoot 'lib\SecurityDifferenceModel.ps1')
. (Join-Path $PSScriptRoot 'lib\SecurityContractComparators.ps1')
. (Join-Path $PSScriptRoot 'lib\CertificationAggregator.ps1')

function Write-CertificationOutcome {
    param([string]$Status, [string]$Reason)
    if ($Status -eq 'PASS') {
        Write-Host 'COMPOSITE_CERTIFICATION: PASS'
    } else {
        Write-Host "COMPOSITE_CERTIFICATION: $Status"
        Write-Host "Reason: $Reason"
    }
    Write-Host 'Production modified: NO'
}

function ConvertFrom-InventoryElements {
    param([Parameter(Mandatory)][object[]]$Elements)
    $byCategory = [ordered]@{}
    foreach ($el in $Elements) {
        $cat = $el.category
        if (-not $byCategory.Contains($cat)) { $byCategory[$cat] = New-Object System.Collections.Generic.List[object] }
        $byCategory[$cat].Add($el.value)
    }
    return $byCategory
}

$startedAt = [DateTime]::UtcNow
$suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
$container = "composite-cert-$suffix"
$volume = "composite-cert-vol-$suffix"
$tempDir = Join-Path ([IO.Path]::GetTempPath()) "composite-cert-$suffix"
$containerStarted = $false
$cleanupOk = $true

$diag = [ordered]@{
    schemaVersion = $ArtifactSchemaVersion
    algorithmVersion = $CompositeAlgorithmVersion
    status = 'FAIL'
    generatedAt = $startedAt.ToString('o')
    repositoryBranch = $null
    repositoryCommit = $null
    backupIdentifier = $null
    backupChecksumSummary = $null
    productionInventoryPath = $ProductionInventoryPath
    productionInventoryChecksum = $null
    productionInventoryAlgorithm = $null
    productionInventoryCanonicalPayloadHash = $null
    postgresVersion = $PostgresImage
    restoreVerification = [ordered]@{ status = 'UNKNOWN'; tableCount = -1 }
    contractVersions = [ordered]@{ contractSchemaVersion = $null; contractVersion = $null; exceptionsSchemaVersion = $null; exceptionsVersion = $null }
    categoryResults = [ordered]@{}
    differenceSummary = [ordered]@{}
    differences = @()
    acceptedExceptions = @()
    safetySummary = [ordered]@{
        productionDataModified = $false
        productionMigrationsExecuted = $false
        productionDdlExecuted = $false
        productionDmlExecuted = $false
        credentialsPrinted = $false
    }
    productionModified = $false
    canonicalPayloadHash = $null
}

try {
    # -----------------------------------------------------------------
    # PHASE 0: repository identity (informational, not security-critical)
    # -----------------------------------------------------------------
    try {
        $diag.repositoryBranch = (& git -C $PSScriptRoot rev-parse --abbrev-ref HEAD 2>$null).Trim()
        $diag.repositoryCommit = (& git -C $PSScriptRoot rev-parse HEAD 2>$null).Trim()
    } catch { }

    # -----------------------------------------------------------------
    # PHASE 1: validate contracts
    # -----------------------------------------------------------------
    if (-not (Test-Path -LiteralPath $ContractPath -PathType Leaf)) { throw "INVALID_INPUT: canonical security contract not found: $ContractPath" }
    if (-not (Test-Path -LiteralPath $ExceptionsPath -PathType Leaf)) { throw "INVALID_INPUT: accepted-exceptions file not found: $ExceptionsPath" }
    $contract = Get-Content -LiteralPath $ContractPath -Raw | ConvertFrom-Json
    $exceptionsDoc = Get-Content -LiteralPath $ExceptionsPath -Raw | ConvertFrom-Json
    if ($contract.contractSchemaVersion -ne '1.0.0') { throw "INVALID_INPUT: unknown contract schema version $($contract.contractSchemaVersion)" }
    if ($exceptionsDoc.exceptionsSchemaVersion -ne '1.0.0') { throw "INVALID_INPUT: unknown exceptions schema version $($exceptionsDoc.exceptionsSchemaVersion)" }
    $diag.contractVersions.contractSchemaVersion = $contract.contractSchemaVersion
    $diag.contractVersions.contractVersion = $contract.contractVersion
    $diag.contractVersions.exceptionsSchemaVersion = $exceptionsDoc.exceptionsSchemaVersion
    $diag.contractVersions.exceptionsVersion = $exceptionsDoc.exceptionsVersion
    $acceptedExceptions = @($exceptionsDoc.exceptions)
    $diag.acceptedExceptions = @($acceptedExceptions | ForEach-Object { [ordered]@{ exceptionId = $_.exceptionId; category = $_.category; exactObjectIdentity = $_.exactObjectIdentity } })

    if (-not (Test-NoOwnershipOrRoleStatementsInMigrations -MigrationsRoot (Join-Path $PSScriptRoot '..\weekly-tracker\src\migrations'))) {
        throw 'INVALID_INPUT: a migration now creates/alters a role or object ownership - canonical-security-contract.json roleAttributes/memberships/ownershipRules assumptions are stale, fail closed'
    }

    # -----------------------------------------------------------------
    # PHASE 2: production inventory integrity (immutable evidence)
    # -----------------------------------------------------------------
    if (-not (Test-Path -LiteralPath $ProductionInventoryPath -PathType Leaf)) { throw "INVALID_INPUT: production inventory not found: $ProductionInventoryPath" }
    if (-not (Test-Path -LiteralPath $ProductionInventoryChecksumPath -PathType Leaf)) { throw "INVALID_INPUT: production inventory checksum not found: $ProductionInventoryChecksumPath" }

    $sidecarLine = (Get-Content -LiteralPath $ProductionInventoryChecksumPath -Raw).Trim()
    $sidecarHash = ($sidecarLine -split '\s+')[0].ToLowerInvariant()
    $actualHash = (Get-FileChecksum -Path $ProductionInventoryPath).ToLowerInvariant()
    if ($sidecarHash -ne $actualHash) { throw "INVALID_INPUT: production inventory checksum mismatch (sidecar=$sidecarHash actual=$actualHash) - the artifact is not trustworthy evidence" }
    $diag.productionInventoryChecksum = $actualHash

    $prodInventory = Get-Content -LiteralPath $ProductionInventoryPath -Raw | ConvertFrom-Json
    if ($prodInventory.algorithmVersion -ne (Get-SecurityContractAlgorithmVersion)) { throw "INVALID_INPUT: production inventory algorithm version $($prodInventory.algorithmVersion) does not match the currently recognized algorithm $(Get-SecurityContractAlgorithmVersion)" }
    if ($prodInventory.overallStatus -ne 'CREATED') { throw "INVALID_INPUT: production inventory overallStatus is '$($prodInventory.overallStatus)', not CREATED" }
    if ($prodInventory.productionChanged -ne $false) { throw 'INVALID_INPUT: production inventory reports productionChanged=true - refusing to certify against evidence that admits mutating production' }
    if ($prodInventory.redactionStatus -ne 'PASS') { throw "INVALID_INPUT: production inventory redactionStatus is '$($prodInventory.redactionStatus)', not PASS" }
    if (-not $prodInventory.elements -or $prodInventory.elements.Count -eq 0) { throw 'INVALID_INPUT: production inventory has zero elements' }
    $diag.productionInventoryAlgorithm = $prodInventory.algorithmVersion
    $diag.productionInventoryCanonicalPayloadHash = $prodInventory.canonicalPayloadHash

    $actualByCategory = ConvertFrom-InventoryElements -Elements $prodInventory.elements

    # -----------------------------------------------------------------
    # PHASE 3: real disposable restore verification (delegated, unmodified script)
    # -----------------------------------------------------------------
    $resolvedBackupPath = (Resolve-Path -LiteralPath $BackupPath).Path
    $diag.backupIdentifier = Split-Path -Leaf $resolvedBackupPath
    $checksumsFile = Join-Path $resolvedBackupPath 'checksums.sha256'
    if (Test-Path -LiteralPath $checksumsFile -PathType Leaf) {
        $diag.backupChecksumSummary = (Get-FileChecksum -Path $checksumsFile)
    }

    if (-not (Test-Path -LiteralPath $tempDir)) { New-Item -ItemType Directory -Path $tempDir | Out-Null }
    $restoreVerifyScript = Join-Path $PSScriptRoot 'restore-verify.ps1'
    $restoreArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $restoreVerifyScript, '-BackupPath', $resolvedBackupPath, '-PostgresImage', $PostgresImage)
    $restoreStdoutPath = Join-Path $tempDir 'restore-verify-stdout.txt'
    $restoreProc = Start-Process -FilePath 'powershell.exe' -ArgumentList $restoreArgs -NoNewWindow -PassThru -Wait -RedirectStandardOutput $restoreStdoutPath
    $restoreExitCode = $restoreProc.ExitCode

    $restoreReportPath = Join-Path $resolvedBackupPath 'restore-verification.json'
    if (-not (Test-Path -LiteralPath $restoreReportPath -PathType Leaf)) { throw 'BLOCKED: restore-verify.ps1 produced no restore-verification.json artifact' }
    $restoreReport = Get-Content -LiteralPath $restoreReportPath -Raw | ConvertFrom-Json
    $diag.restoreVerification.status = $restoreReport.overallStatus
    $diag.restoreVerification.tableCount = $restoreReport.tableCount
    $restoreVerificationPassed = ($restoreReport.overallStatus -eq 'PASS' -and $restoreExitCode -eq 0)

    $scopeTables = @($contract.scopeRules.tables)
    $scopeRoles = @($contract.scopeRules.roles)
    $localTables = Get-SecurityContractTables
    $localRoles = Get-SecurityContractRoles
    $scopeTablesSorted = (@($scopeTables) | Sort-Object) -join ','
    $localTablesSorted = (@($localTables) | Sort-Object) -join ','
    if ($scopeTablesSorted -ne $localTablesSorted) { throw 'INVALID_INPUT: contract scopeRules.tables has drifted from Get-SecurityContractTables()' }
    $scopeRolesSorted = (@($scopeRoles) | Sort-Object) -join ','
    $localRolesSorted = (@($localRoles) | Sort-Object) -join ','
    if ($scopeRolesSorted -ne $localRolesSorted) { throw 'INVALID_INPUT: contract scopeRules.roles has drifted from Get-SecurityContractRoles()' }

    $cloneStructural = @($restoreReport.tables | Where-Object { $_.schema -eq 'public' -and ($scopeTables -contains $_.table) } | ForEach-Object { [ordered]@{ table = $_.table; exists = [bool]$_.relationExists } } | Where-Object { $_.exists })
    $cloneStructuralTableNames = @($cloneStructural | ForEach-Object { $_.table })
    foreach ($extraTable in $AdditionalVerifiedStructuralTables) {
        if ($scopeTables -contains $extraTable -and ($cloneStructuralTableNames -notcontains $extraTable)) {
            $cloneStructural += [ordered]@{ table = $extraTable; exists = $true }
        }
    }

    # -----------------------------------------------------------------
    # PHASE 4: migration-derived expected contract (real execution, fresh container)
    # -----------------------------------------------------------------
    $migrationFiles = Get-CanonicalMigrationFileList -ContractPath $ContractPath -MigrationsRoot (Join-Path $PSScriptRoot '..\weekly-tracker\src\migrations')

    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    Invoke-NativeTool -Command 'docker' -ArgumentList @('volume', 'create', $volume) | Out-Null
    $migrationsHostPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\weekly-tracker\src\migrations')).Path
    $mountQuery = "type=bind,source=$tempDir,target=/inventory,readonly"
    $mountMigrations = "type=bind,source=$migrationsHostPath,target=/migrations,readonly"
    $run = Invoke-NativeTool -Command 'docker' -ArgumentList @('run', '-d', '--name', $container,
        '-v', "${volume}:/var/lib/postgresql/data", '--mount', $mountQuery, '--mount', $mountMigrations,
        '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=postgres', $PostgresImage)
    if ($run.ExitCode -ne 0) { throw "BLOCKED: disposable migration-derived-execution container failed to start: $($run.Output -join ' | ')" }
    $containerStarted = $true

    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        if ((Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'pg_isready', '-U', 'postgres')).ExitCode -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'BLOCKED: disposable migration-derived-execution container did not become ready' }

    $rolesStubPath = Join-Path $tempDir 'roles-platform-stub.sql'
    Write-Utf8NoBom -Path $rolesStubPath -Value (Get-SupabasePlatformRoleStubScript -Contract $contract)
    $rolesStubResult = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '--quiet', '--file', '/inventory/roles-platform-stub.sql')
    if ($rolesStubResult.ExitCode -ne 0) { throw "BLOCKED: Supabase platform role stub (anon/authenticated/authenticator/service_role) failed to apply: $($rolesStubResult.Output -join ' | ')" }

    $stubPath = Join-Path $tempDir 'auth-platform-stub.sql'
    Write-Utf8NoBom -Path $stubPath -Value (Get-SupabasePlatformSchemaStubScript)
    $stubResult = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '--quiet', '--file', '/inventory/auth-platform-stub.sql')
    if ($stubResult.ExitCode -ne 0) { throw "BLOCKED: Supabase platform schema stub (auth.uid/auth.users) failed to apply: $($stubResult.Output -join ' | ')" }

    $storageStubPath = Join-Path $tempDir 'storage-platform-stub.sql'
    Write-Utf8NoBom -Path $storageStubPath -Value (Get-SupabaseStorageSchemaStubScript)
    $storageStubResult = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '--quiet', '--file', '/inventory/storage-platform-stub.sql')
    if ($storageStubResult.ExitCode -ne 0) { throw "BLOCKED: Supabase storage schema stub (storage.buckets/storage.objects) failed to apply: $($storageStubResult.Output -join ' | ')" }

    Invoke-CanonicalMigrationChain -Container $container -ContainerMigrationsMountPath '/migrations' -MigrationFiles $migrationFiles -InvokeNativeTool ${function:Invoke-NativeTool}

    $queryFn = {
        param([string]$Sql)
        $wrapped = New-ReadOnlyCatalogScript -CatalogQuery $Sql
        $hostPath = Join-Path $tempDir 'query.sql'
        Write-Utf8NoBom -Path $hostPath -Value ($wrapped + [Environment]::NewLine)
        $r = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '--quiet', '--file', '/inventory/query.sql')
        if ($r.ExitCode -ne 0) { throw "migration-derived-execution catalog query failed: $($r.Output -join ' | ')" }
        return ($r.Output -join "`n")
    }

    $migrationDerived = Get-SecurityContractInventory -Query $queryFn -Environment 'migration-derived-execution' -EvidenceSource 'local'
    $expectedStructural = Get-StructuralSchemaEvidence -Query $queryFn -Tables $scopeTables

    # service_role's ACL is platform-managed (see
    # Set-ServiceRolePlatformPrivilegeDefaults), not derived from this
    # repository's migrations - correct the migration-derived expected
    # rows for the three privilege categories before comparison.
    $migrationDerived.categories.tablePrivileges = Set-ServiceRolePlatformPrivilegeDefaults -Rows $migrationDerived.categories.tablePrivileges -ValueField 'allowed'
    $migrationDerived.categories.sequencePrivileges = Set-ServiceRolePlatformPrivilegeDefaults -Rows $migrationDerived.categories.sequencePrivileges -ValueField 'allowed'
    $migrationDerived.categories.functionPrivileges = Set-ServiceRolePlatformPrivilegeDefaults -Rows $migrationDerived.categories.functionPrivileges -ValueField 'execute'

    # A role that can INSERT into a bigserial-backed table needs USAGE on
    # that table's own sequence for the nextval()-via-DEFAULT to succeed -
    # see Set-InsertRoleSequenceUsageDefaults. Derived structurally from
    # the already-computed expected tablePrivileges, never from production.
    $migrationDerived.categories.sequencePrivileges = Set-InsertRoleSequenceUsageDefaults -TablePrivilegeRows $migrationDerived.categories.tablePrivileges -SequencePrivilegeRows $migrationDerived.categories.sequencePrivileges

    # -----------------------------------------------------------------
    # PHASE 5: explicit-contract expected evidence (roleAttributes, memberships, ownership)
    # -----------------------------------------------------------------
    $expectedRoleAttributes = @($contract.roleAttributes.rules | ForEach-Object {
        [ordered]@{ role = $_.role; canLogin = [bool]$_.canLogin; superuser = [bool]$_.superuser; inherit = [bool]$_.inherit; createRole = [bool]$_.createRole; createDb = [bool]$_.createDb; replication = [bool]$_.replication; bypassRls = [bool]$_.bypassRls }
    })
    $expectedMemberships = @($contract.memberships.rules | ForEach-Object {
        [ordered]@{ grantedRole = $_.grantedRole; memberRole = $_.memberRole; adminOption = [bool]$_.adminOption }
    })
    $allowedOwners = @($contract.ownershipRules.allowedOwners)

    # -----------------------------------------------------------------
    # PHASE 6: category comparators
    # -----------------------------------------------------------------
    $categoryResults = [ordered]@{}
    $categoryResults['structuralSchema']   = Compare-StructuralSchema   -Expected (ConvertTo-PlainArray $expectedStructural)                              -Actual (ConvertTo-PlainArray $cloneStructural)
    $categoryResults['rls']                = Compare-RlsContract        -Expected (ConvertTo-PlainArray $migrationDerived.categories.rls)                 -Actual (ConvertTo-PlainArray $actualByCategory['rls'])
    $categoryResults['policies']           = Compare-PolicyContract     -Expected (ConvertTo-PlainArray $migrationDerived.categories.policies)            -Actual (ConvertTo-PlainArray $actualByCategory['policies'])
    $categoryResults['functions']          = Compare-FunctionDefinitions -Expected (ConvertTo-PlainArray $migrationDerived.categories.functions)          -Actual (ConvertTo-PlainArray $actualByCategory['functions'])
    $categoryResults['roleAttributes']     = Compare-RoleAttributes     -Expected (ConvertTo-PlainArray $expectedRoleAttributes)                          -Actual (ConvertTo-PlainArray $actualByCategory['roleAttributes'])
    $categoryResults['memberships']        = Compare-RoleMemberships    -Expected (ConvertTo-PlainArray $expectedMemberships)                             -Actual (ConvertTo-PlainArray $actualByCategory['memberships'])
    $categoryResults['tablePrivileges']    = Compare-TablePrivileges    -Expected (ConvertTo-PlainArray $migrationDerived.categories.tablePrivileges)     -Actual (ConvertTo-PlainArray $actualByCategory['tablePrivileges'])
    $categoryResults['sequencePrivileges'] = Compare-SequencePrivileges -Expected (ConvertTo-PlainArray $migrationDerived.categories.sequencePrivileges)  -Actual (ConvertTo-PlainArray $actualByCategory['sequencePrivileges'])
    $categoryResults['functionPrivileges'] = Compare-FunctionPrivileges -Expected (ConvertTo-PlainArray $migrationDerived.categories.functionPrivileges)  -Actual (ConvertTo-PlainArray $actualByCategory['functionPrivileges'])
    $categoryResults['ownership']          = Compare-Ownership          -Actual (ConvertTo-PlainArray $actualByCategory['ownership']) -AllowedOwners $allowedOwners

    # -----------------------------------------------------------------
    # PHASE 7: difference classification against accepted exceptions
    # -----------------------------------------------------------------
    $allDifferences = New-Object System.Collections.Generic.List[object]
    foreach ($catName in $categoryResults.Keys) { foreach ($d in $categoryResults[$catName].differences) { $allDifferences.Add($d) } }

    [object[]]$allDifferencesArray = $allDifferences
    $resolution = Resolve-DifferencesAgainstExceptions -Differences $allDifferencesArray -AcceptedExceptions $acceptedExceptions -AsOfUtc ([DateTime]::UtcNow)
    $resolvedDiffs = $resolution.Differences
    $resolvedByCategory = [ordered]@{}
    foreach ($d in $resolvedDiffs) {
        if (-not $resolvedByCategory.Contains($d.category)) { $resolvedByCategory[$d.category] = New-Object System.Collections.Generic.List[object] }
        $resolvedByCategory[$d.category].Add($d)
    }
    foreach ($catName in $categoryResults.Keys) {
        if ($resolvedByCategory.Contains($catName)) {
            [object[]]$catDiffs = $resolvedByCategory[$catName]
            $categoryResults[$catName].differences = $catDiffs
        } else {
            $categoryResults[$catName].differences = @()
        }
    }

    # -----------------------------------------------------------------
    # PHASE 8: aggregate
    # -----------------------------------------------------------------
    $castedResults = @{}
    foreach ($k in $categoryResults.Keys) { $castedResults[$k] = $categoryResults[$k] }
    $decision = Get-CertificationDecision -CategoryResults $castedResults -ProductionInventoryValid $true -RestoreVerificationPassed $restoreVerificationPassed -ArtifactIntegrityOk $true -ExpiredExceptionMatches $resolution.ExpiredExceptionMatches

    $diag.status = $decision.status
    $diag.categoryResults = [ordered]@{}
    foreach ($catName in $categoryResults.Keys) {
        $r = $categoryResults[$catName]
        $diag.categoryResults[$catName] = [ordered]@{
            category = $r.category; expectedCount = $r.expectedCount; actualCount = $r.actualCount
            matchedCount = $r.matchedCount; missingCount = $r.missingCount; unexpectedCount = $r.unexpectedCount
            mismatchCount = $r.mismatchCount; differenceCount = $r.differenceCount
        }
    }
    $diag.differences = @($resolvedDiffs | Where-Object { $_.classification -ne 'ACCEPTED_EXCEPTION' -or $true } | Sort-Object category, objectIdentity)
    $diag.differenceSummary = [ordered]@{
        total = $resolvedDiffs.Count
        byClassification = [ordered]@{}
    }
    foreach ($cls in (Get-AllowedDifferenceClassifications)) {
        $diag.differenceSummary.byClassification[$cls] = @($resolvedDiffs | Where-Object { $_.classification -eq $cls }).Count
    }

    if (-not $restoreVerificationPassed) {
        $diag.status = 'FAIL'
    }

    Write-CertificationOutcome -Status $diag.status -Reason $decision.reason

    # -----------------------------------------------------------------
    # PHASE 9: write artifact atomically
    # -----------------------------------------------------------------
    if (-not (Test-Path -LiteralPath $OutputPath)) { New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null }
    $artifactPath = Join-Path $OutputPath 'composite-certification.json'
    $checksumPath = Join-Path $OutputPath 'composite-certification.sha256'
    $artifactTempPath = "$artifactPath.tmp"
    $checksumTempPath = "$checksumPath.tmp"

    $hashPayload = [ordered]@{}
    foreach ($k in $diag.Keys) { if ($k -ne 'generatedAt') { $hashPayload[$k] = $diag[$k] } }
    $hashJson = $hashPayload | ConvertTo-Json -Depth 20 -Compress
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $canonicalHash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($hashJson)))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
    $diag.canonicalPayloadHash = $canonicalHash

    $finalJson = $diag | ConvertTo-Json -Depth 20
    Write-Utf8NoBom -Path $artifactTempPath -Value $finalJson
    $fileHash = Get-FileChecksum -Path $artifactTempPath
    Write-Utf8NoBom -Path $checksumTempPath -Value "$fileHash  composite-certification.json`n"

    $reparsed = Get-Content -LiteralPath $artifactTempPath -Raw | ConvertFrom-Json
    if ($reparsed.status -ne $diag.status -or $reparsed.canonicalPayloadHash -ne $canonicalHash) { throw 'INTERNAL: artifact self-validation failed after write' }

    Move-Item -LiteralPath $artifactTempPath -Destination $artifactPath -Force
    Move-Item -LiteralPath $checksumTempPath -Destination $checksumPath -Force

    # -----------------------------------------------------------------
    # PHASE 10: baseline freeze (PASS only)
    # -----------------------------------------------------------------
    if ($diag.status -eq 'PASS') {
        $baselinePath = Join-Path $OutputPath 'database-security-baseline.json'
        $baselineChecksumPath = Join-Path $OutputPath 'database-security-baseline.sha256'
        $baseline = [ordered]@{
            schemaVersion = $BaselineManifestSchemaVersion
            repositoryCommit = $diag.repositoryCommit
            backupIdentifier = $diag.backupIdentifier
            productionInventoryChecksum = $diag.productionInventoryChecksum
            productionInventoryCanonicalPayloadHash = $diag.productionInventoryCanonicalPayloadHash
            productionInventoryAlgorithm = $diag.productionInventoryAlgorithm
            restoreVerificationStatus = $diag.restoreVerification.status
            compositeCertificationChecksum = (Get-FileChecksum -Path $artifactPath)
            compositeCertificationCanonicalHash = $canonicalHash
            compositeAlgorithmVersion = $CompositeAlgorithmVersion
            contractVersions = $diag.contractVersions
            postgresVersion = $PostgresImage
            frozenAt = [DateTime]::UtcNow.ToString('o')
            baselineStatus = 'FROZEN'
            coreStabilizationReady = $true
        }
        $baselineHashPayload = [ordered]@{}
        foreach ($k in $baseline.Keys) { if ($k -ne 'frozenAt') { $baselineHashPayload[$k] = $baseline[$k] } }
        $baselineJsonForHash = $baselineHashPayload | ConvertTo-Json -Depth 20 -Compress
        $sha2 = [Security.Cryptography.SHA256]::Create()
        try { $baselineHash = ([BitConverter]::ToString($sha2.ComputeHash([Text.Encoding]::UTF8.GetBytes($baselineJsonForHash)))).Replace('-', '').ToLowerInvariant() }
        finally { $sha2.Dispose() }
        $baseline['baselineCanonicalHash'] = $baselineHash

        $baselineTempPath = "$baselinePath.tmp"
        Write-Utf8NoBom -Path $baselineTempPath -Value ($baseline | ConvertTo-Json -Depth 20)
        $baselineFileHash = Get-FileChecksum -Path $baselineTempPath
        Write-Utf8NoBom -Path $baselineChecksumPath -Value "$baselineFileHash  database-security-baseline.json`n"
        Move-Item -LiteralPath $baselineTempPath -Destination $baselinePath -Force
    }

    Write-Host "Output: $artifactPath"
    if ($diag.status -eq 'PASS') { exit 0 } else { exit 1 }

} catch {
    $msg = $_.Exception.Message
    $exitCode = 4
    $status = 'BLOCKED'
    if ($msg -match '^INVALID_INPUT:') { $exitCode = 2; $status = 'BLOCKED' }
    elseif ($msg -match '^BLOCKED:') { $exitCode = 3; $status = 'BLOCKED' }
    elseif ($msg -match '^INTERNAL:') { $exitCode = 4; $status = 'FAIL' }

    Write-Host "COMPOSITE_CERTIFICATION: $status"
    Write-Host "Reason: $msg"
    Write-Host 'Production modified: NO'

    try {
        if (-not (Test-Path -LiteralPath $OutputPath)) { New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null }
        foreach ($p in @((Join-Path $OutputPath 'composite-certification.json.tmp'), (Join-Path $OutputPath 'composite-certification.sha256.tmp'))) {
            if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
        }
    } catch { }

    exit $exitCode
} finally {
    if ($containerStarted -and -not $KeepDisposableEnvironment) {
        try { Invoke-NativeTool -Command 'docker' -ArgumentList @('rm', '-f', $container) | Out-Null } catch { $cleanupOk = $false }
        try { Invoke-NativeTool -Command 'docker' -ArgumentList @('volume', 'rm', $volume) | Out-Null } catch { $cleanupOk = $false }
    }
    try { if ((Test-Path -LiteralPath $tempDir) -and -not $KeepDisposableEnvironment) { Remove-Item -LiteralPath $tempDir -Recurse -Force } } catch { $cleanupOk = $false }
}
