[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BackupPath,
    [string]$PostgresImage = 'postgres:17'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $PSScriptRoot 'lib\ProductionConnection.ps1')
. (Join-Path $PSScriptRoot 'lib\SecurityContractInventory.ps1')

$AlgorithmVersion = Get-SecurityContractAlgorithmVersion
$ExpectedProjectRef = 'szgbkeqornkdngoegyso'
$EnvFile = Join-Path $repoRoot 'weekly-tracker\.env.production.local'
$Migration026Path = Join-Path $repoRoot 'weekly-tracker\src\migrations\026_grant_authenticated_table_privileges.sql'

$BackupPath = (Resolve-Path -LiteralPath $BackupPath).Path
$startedAt = [DateTime]::UtcNow

$diag = [ordered]@{
    algorithmVersion = $AlgorithmVersion
    timestampUtc = $startedAt.ToString('o')
    sourceType = 'production_catalog_read_only'
    productionFingerprintVerified = $false
    transactionReadOnly = $false
    inventoryScope = 'openday-application-security-contract'
    normalizationRules = @(
        'stable category and identity ordering'
        'whitespace collapsed without semantic rewriting'
        'roles/config arrays sorted'
        'grantor, OID, timestamps, credentials and row data excluded'
    )
    evidenceCategories = [ordered]@{
        cloneVerifiable = @('rls', 'policies', 'functions', 'memberships', 'roleAttributes')
        productionCatalogRequired = @('tablePrivileges', 'sequencePrivileges', 'functionPrivileges', 'ownership')
    }
    elements = @()
    categoryCounts = [ordered]@{}
    canonicalPayloadHash = $null
    migration026Targets = @()
    migration026Evidence = 'UNKNOWN'
    redactionStatus = 'UNKNOWN'
    productionChanged = $false
    overallStatus = 'FAIL'
    failureReason = $null
    failedStep = $null
}

function Add-Step { param([string]$Name, [string]$Status, [string]$Detail = '')
    Write-Host "[$Status] $Name $(if ($Detail) { "- $Detail" })"
}

# ---------------------------------------------------------------------------
# Secret/connection-information scan - run over the FINAL serialized report
# text, independent of how it was built, as a last line of defense before
# anything is written to disk.
# ---------------------------------------------------------------------------
function Test-NoSecretsInOutput {
    param([Parameter(Mandatory)][string]$Text)
    $patterns = @(
        'pooler\.supabase\.com'
        'postgresql://'
        'postgres://'
        'PRODUCTION_DB_URL'
        'eyJ[A-Za-z0-9_-]{10,}'          # JWT-shaped token
        '(?i)password["\s:=]'
        '(?i)\bsecret["\s:=]'
        [regex]::Escape($ExpectedProjectRef)
    )
    foreach ($p in $patterns) {
        if ($Text -match $p) { return $p }
    }
    return $null
}

$reportWritten = $false
$reportPath = Join-Path $BackupPath 'security-inventory-production.json'
$checksumPath = Join-Path $BackupPath 'security-inventory-production.sha256'
$reportTempPath = "$reportPath.tmp"
$checksumTempPath = "$checksumPath.tmp"
$queryTempDirectory = Join-Path ([IO.Path]::GetTempPath()) "openday-production-security-inventory-$([guid]::NewGuid().ToString('N'))"

try {
    $diag.failedStep = 'validate_backup_path'
    if (-not (Test-Path -LiteralPath $BackupPath -PathType Container)) { throw 'backup path is not a directory' }
    Remove-Item -LiteralPath $reportTempPath, $checksumTempPath -Force -ErrorAction SilentlyContinue
    # =========================================================================
    # PHASE 1: migration 026 scope check - parsed directly from the migration
    # file, not assumed. Fails closed if any target is missing from the
    # common inventory's table scope.
    # =========================================================================
    $diag.failedStep = 'derive_migration026_scope'
    $m026 = Get-Migration026Targets -MigrationPath $Migration026Path
    $diag.migration026Targets = $m026.AllTargetTables

    $diag.failedStep = 'validate_inventory_scope'
    $inventoryTables = Get-SecurityContractTables
    $missingFromScope = @($m026.AllTargetTables | Where-Object { $inventoryTables -notcontains $_ })
    if ($missingFromScope.Count -gt 0) {
        $diag.migration026Evidence = "FAIL: missing from inventory scope: $($missingFromScope -join ', ')"
        $diag.failureReason = "migration 026 target table(s) not covered by inventory scope: $($missingFromScope -join ', ')"
        $diag.failedStep = 'migration026_scope_check'
        throw $diag.failureReason
    }
    $diag.migration026Evidence = "PASS: all $($m026.AllTargetTables.Count) migration 026 target tables covered by inventory scope"
    Add-Step 'migration026_scope_check' 'PASS' $diag.migration026Evidence

    # =========================================================================
    # PHASE 2: production connection fingerprint - must pass before any query.
    # =========================================================================
    $diag.failedStep = 'resolve_production_connection'
    $conn = Get-ProductionConnectionFingerprint -EnvFile $EnvFile -RepoRoot $repoRoot -ExpectedProjectRef $ExpectedProjectRef
    $diag.failedStep = 'verify_production_fingerprint'
    $diag.productionFingerprintVerified = $true
    Add-Step 'production_fingerprint' 'PASS'

    # =========================================================================
    # PHASE 3: read-only inventory query, one bounded READ ONLY transaction
    # per catalog query, dockerized psql client, no host network beyond the
    # single outbound connection to production.
    # =========================================================================
    $env:PGHOST = $conn.Host
    $env:PGPORT = [string]$conn.Port
    $env:PGDATABASE = $conn.Database
    $env:PGUSER = $conn.User
    $env:PGPASSWORD = $conn.Password
    $env:PGSSLMODE = 'require'

    New-Item -ItemType Directory -Path $queryTempDirectory | Out-Null
    $queryMount = "type=bind,source=$queryTempDirectory,target=/inventory,readonly"
    $dockerCommon = @('run', '--rm', '--network', 'bridge', '--mount', $queryMount,
        '--env', 'PGHOST', '--env', 'PGPORT', '--env', 'PGDATABASE',
        '--env', 'PGUSER', '--env', 'PGPASSWORD', '--env', 'PGSSLMODE', $PostgresImage)

    $forbiddenPattern = '(?i)^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|COPY|SET\s+ROLE)\b'
    $readOnlyTransactionOk = $true

    $script:querySequence = 0
    $diag.failedStep = 'execute_production_catalog_query'
    $queryFn = {
        param([string]$Sql)
        if ($Sql -match $forbiddenPattern) {
            throw "refusing to execute a non-read-only statement: $Sql"
        }
        $script:querySequence++
        $wrapped = New-ReadOnlyCatalogScript -CatalogQuery $Sql
        $hostQueryPath = Join-Path $queryTempDirectory ("query-{0:D3}.sql" -f $script:querySequence)
        Write-Utf8NoBom -Path $hostQueryPath -Value ($wrapped + [Environment]::NewLine)
        $result = Invoke-NativeTool -Command 'docker' -ArgumentList ($dockerCommon + @(
            'psql', '-X', '--quiet', '--tuples-only', '--no-align', '--field-separator', "`t",
            '--file', "/inventory/$(Split-Path -Leaf $hostQueryPath)"))
        Remove-Item -LiteralPath $hostQueryPath -Force -ErrorAction SilentlyContinue
        if ($result.ExitCode -ne 0) {
            $script:readOnlyTransactionOk = $false
            throw "production catalog query failed (exit=$($result.ExitCode)): $($result.Output -join ' | ')"
        }
        return ($result.Output -join "`n")
    }

    try {
        $inventory = Get-SecurityContractInventory -Query $queryFn -Environment 'production' -EvidenceSource 'production'
    } finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        Remove-Item Env:PGHOST, Env:PGPORT, Env:PGDATABASE, Env:PGUSER, Env:PGSSLMODE -ErrorAction SilentlyContinue
        $conn = $null
    }
    $diag.failedStep = 'verify_read_only_state'
    $diag.transactionReadOnly = $readOnlyTransactionOk
    if (-not $readOnlyTransactionOk) {
        $diag.failureReason = 'one or more catalog queries did not complete inside a read-only transaction'
        $diag.failedStep = 'read_only_transaction'
        throw $diag.failureReason
    }
    Add-Step 'read_only_transaction' 'PASS' "$($inventory.elementCount) elements across $($inventory.categories.Keys.Count) categories"

    # =========================================================================
    # PHASE 4: assemble the report - counts, hash, redaction, no row data.
    # =========================================================================
    $diag.failedStep = 'validate_inventory_contract'
    foreach ($cat in $inventory.categories.Keys) {
        # .Count directly - never @()-wrap a category value here. Clone-
        # verifiable categories are System.Collections.Generic.List[object]
        # instances (from MapRows); wrapping a List directly with @() hits a
        # documented PowerShell 5.1 Set-StrictMode binder bug
        # ("Argument types do not match") that a plain .Count access avoids.
        $diag.categoryCounts[$cat] = $inventory.categories[$cat].Count
    }
    $diag.elements = $inventory.elements
    $diag.canonicalPayloadHash = $inventory.canonicalPayloadHash
    $diag.evidenceCategories.status = $inventory.evidenceStatus
    $diag.productionChanged = $false

    $completedAt = [DateTime]::UtcNow
    $diag['completedAtUtc'] = $completedAt.ToString('o')
    $diag['durationSeconds'] = [math]::Round(($completedAt - $startedAt).TotalSeconds, 3)
    $diag.overallStatus = 'CREATED'

    $json = ($diag | ConvertTo-Json -Depth 14) + [Environment]::NewLine

    $secretHit = Test-NoSecretsInOutput -Text $json
    if ($secretHit) {
        $diag.redactionStatus = "FAIL: output matched forbidden pattern /$secretHit/"
        $diag.failureReason = "secret/connection-information scan failed: output matched a forbidden pattern"
        $diag.failedStep = 'secrets_scan'
        throw $diag.failureReason
    }
    $diag.redactionStatus = 'PASS'
    Add-Step 'secrets_scan' 'PASS'

    # Re-serialize now that redactionStatus/overallStatus are final.
    $json = ($diag | ConvertTo-Json -Depth 14) + [Environment]::NewLine
    $secretHit2 = Test-NoSecretsInOutput -Text $json
    if ($secretHit2) {
        $diag.failureReason = "secret/connection-information scan failed on final payload: matched /$secretHit2/"
        $diag.failedStep = 'secrets_scan'
        throw $diag.failureReason
    }

    $diag.failedStep = 'write_inventory'
    Write-Utf8NoBom -Path $reportTempPath -Value $json
    $parsedTemp = Get-Content -LiteralPath $reportTempPath -Raw | ConvertFrom-Json
    if ($parsedTemp.algorithmVersion -ne $AlgorithmVersion -or $parsedTemp.sourceType -ne 'production_catalog_read_only' -or -not $parsedTemp.transactionReadOnly -or $parsedTemp.productionChanged) {
        throw 'temporary inventory failed final contract validation'
    }
    $diag.failedStep = 'write_checksum'
    $hash = (Get-FileHash -LiteralPath $reportTempPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Utf8NoBom -Path $checksumTempPath -Value "$hash  $(Split-Path -Leaf $reportPath)$([Environment]::NewLine)"
    $diag.failedStep = 'final_integrity_check'
    if ((Get-FileHash -LiteralPath $reportTempPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw 'temporary inventory checksum changed before publish' }
    Move-Item -LiteralPath $reportTempPath -Destination $reportPath -Force
    Move-Item -LiteralPath $checksumTempPath -Destination $checksumPath -Force
    $reportWritten = $true
    Add-Step 'checksum' 'PASS'

} catch {
    if (-not $diag.failureReason) { $diag.failureReason = $_.Exception.Message }
    if (-not $diag.failedStep) { $diag.failedStep = 'unknown' }
    $diag.overallStatus = 'FAIL'
    Remove-Item -LiteralPath $reportTempPath, $checksumTempPath -Force -ErrorAction SilentlyContinue
    Write-Host "PRODUCTION_SECURITY_INVENTORY FAILED at $($diag.failedStep): $($diag.failureReason)"
} finally {
    Remove-Item Env:PGPASSWORD, Env:PGHOST, Env:PGPORT, Env:PGDATABASE, Env:PGUSER, Env:PGSSLMODE -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $queryTempDirectory -Recurse -Force -ErrorAction SilentlyContinue
}

if ($diag.overallStatus -eq 'CREATED') {
    Write-Host 'PRODUCTION_SECURITY_INVENTORY: CREATED'
    Write-Host "Inventory algorithm: $AlgorithmVersion"
    Write-Host 'Production fingerprint: PASS'
    Write-Host 'Read-only transaction: PASS'
    Write-Host 'Inventory scope: PASS'
    Write-Host 'Migration 026 scope: PASS'
    Write-Host 'Secrets scan: PASS'
    Write-Host 'Checksum: PASS'
    Write-Host 'Production changed: NO'
    Write-Host "Output: $reportPath"
    exit 0
} else {
    Write-Host 'PRODUCTION_SECURITY_INVENTORY: FAIL'
    Write-Host "Failed step: $($diag.failedStep)"
    Write-Host "Reason: $($diag.failureReason)"
    Write-Host 'Production changed: NO'
    exit 1
}
