[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$DatabasePostflightSqlPath,
    [Parameter(Mandatory)][string]$ExpectedDatabasePostflightSha256,
    [Parameter(Mandatory)][string]$ClassifierSqlPath,
    [Parameter(Mandatory)][string]$ExpectedClassifierSha256,
    [Parameter(Mandatory)][string]$SecurityPostflightSqlPath,
    [Parameter(Mandatory)][string]$ExpectedSecurityPostflightSha256,
    [Parameter(Mandatory)][string]$ExpectedProjectRef,
    [string]$EnvFile,
    [ValidateSet('READY','ALREADY_RECONCILED','NOT_APPLICABLE')]
    [string]$ExpectedPostWriteState = 'ALREADY_RECONCILED',
    [string]$DatabasePassMarker = 'DATABASE_POSTFLIGHT_ASSERTIONS_PASS',
    [string]$SecurityPassMarker = 'SECURITY_POSTFLIGHT_ASSERTIONS_PASS',
    [ValidateSet('PENDING','PASS','FAIL')][string]$BrowserSmoke = 'PENDING',
    [switch]$OwnerConfirmedPostCommit,
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $repoRoot 'weekly-tracker\.env.production.local'
}

. (Join-Path $repoRoot 'scripts\lib\ProductionClassifier.ps1')
. (Join-Path $repoRoot 'scripts\lib\ProductionReadOnlySql.ps1')
. (Join-Path $repoRoot 'scripts\lib\RestoreVerifyHelpers.ps1')

$stage = 'LOCAL_VALIDATION'
$connection = $null
$rawUri = $null

function ConvertTo-SanitizedOutput {
    param([object[]]$Output)
    return @(
        foreach ($entry in $Output) {
            $line = [string]$entry
            if ($env:PGPASSWORD) { $line = $line.Replace($env:PGPASSWORD, '<redacted>') }
            if ($rawUri) { $line = $line.Replace($rawUri, '<redacted-connection>') }
            [regex]::Replace($line, '(?i)(postgres(?:ql)?://)[^@\s]+@', '$1<redacted>@')
        }
    )
}

function Invoke-ReadOnlySqlFile {
    param([string]$Path, [string]$Label)
    $mount = "type=bind,source=$((Resolve-Path -LiteralPath $Path).Path),target=/gate/check.sql,readonly"
    $result = Invoke-NativeTool -Command 'docker' -ArgumentList @(
        'run','--rm','--network','bridge','--mount',$mount,
        '--env','PGHOST','--env','PGPORT','--env','PGDATABASE','--env','PGUSER','--env','PGPASSWORD','--env','PGSSLMODE',
        'postgres:17','psql','-X','--tuples-only','--no-align','-v','ON_ERROR_STOP=1','--file','/gate/check.sql'
    )
    $safe = ConvertTo-SanitizedOutput -Output $result.Output
    $safe | ForEach-Object { Write-Output $_ }
    if ($result.ExitCode -ne 0) { throw "$Label failed with exit code $($result.ExitCode)" }
    return $safe
}

try {
    $databaseArtifact = Assert-ProductionSqlArtifact -Path $DatabasePostflightSqlPath -ExpectedSha256 $ExpectedDatabasePostflightSha256 -Label 'database postflight SQL' -RequireTransaction
    $classifierArtifact = Assert-ProductionSqlArtifact -Path $ClassifierSqlPath -ExpectedSha256 $ExpectedClassifierSha256 -Label 'classifier SQL'
    $securityArtifact = Assert-ProductionSqlArtifact -Path $SecurityPostflightSqlPath -ExpectedSha256 $ExpectedSecurityPostflightSha256 -Label 'security postflight SQL' -RequireTransaction

    $databaseText = $databaseArtifact.Text
    $securityText = $securityArtifact.Text
    if ($databaseText -cnotmatch [regex]::Escape($DatabasePassMarker)) { throw 'database pass marker is absent from its SQL' }
    if ($securityText -cnotmatch [regex]::Escape($SecurityPassMarker)) { throw 'security pass marker is absent from its SQL' }

    if ($ValidateOnly) {
        Write-Output 'OWNER_PRODUCTION_POSTFLIGHT_VALIDATE_ONLY=PASS'
        return
    }

    if (-not $OwnerConfirmedPostCommit) {
        throw 'explicit owner post-COMMIT confirmation is required'
    }

    . (Join-Path $repoRoot 'scripts\lib\ProductionConnection.ps1')
    $connection = Get-ProductionConnectionFingerprint -EnvFile $EnvFile -RepoRoot $repoRoot -ExpectedProjectRef $ExpectedProjectRef
    if ($connection.ProjectRef -cne $ExpectedProjectRef) { throw 'production project-ref output contract mismatch' }

    $env:PGHOST = $connection.Host
    $env:PGPORT = [string]$connection.Port
    $env:PGDATABASE = $connection.Database
    $env:PGUSER = $connection.User
    $env:PGPASSWORD = $connection.Password
    $env:PGSSLMODE = 'require'
    $rawUri = $connection.RawUri
    $connection = $null

    $stage = 'DATABASE_POSTFLIGHT'
    $databaseOutput = Invoke-ReadOnlySqlFile -Path $DatabasePostflightSqlPath -Label $stage
    if (@($databaseOutput | Where-Object { $_.Trim() -ceq $DatabasePassMarker }).Count -ne 1) {
        throw 'database postflight did not emit exactly one pass marker'
    }
    Write-Output 'DATABASE_POSTFLIGHT=PASS'

    $stage = 'POST_WRITE_CLASSIFIER'
    $classifierOutput = Invoke-ReadOnlySqlFile -Path $ClassifierSqlPath -Label $stage
    $classification = ConvertFrom-ProductionClassifierOutput -Output $classifierOutput
    if ($classification.State -cne $ExpectedPostWriteState) {
        throw "post-write classifier state mismatch: $($classification.State)"
    }
    Write-Output "POST_WRITE_CLASSIFIER_STATE=$($classification.State)"
    Write-Output "POST_WRITE_CLASSIFIER_DUPLICATE_COUNT=$($classification.DuplicateCount)"
    Write-Output 'POST_WRITE_CLASSIFIER=PASS'

    $stage = 'SECURITY_POSTFLIGHT'
    $securityOutput = Invoke-ReadOnlySqlFile -Path $SecurityPostflightSqlPath -Label $stage
    if (@($securityOutput | Where-Object { $_.Trim() -ceq $SecurityPassMarker }).Count -ne 1) {
        throw 'security postflight did not emit exactly one pass marker'
    }
    Write-Output 'SECURITY_POSTFLIGHT=PASS'

    $stage = 'BROWSER_SMOKE'
    Write-Output "BROWSER_SMOKE=$BrowserSmoke"
    if ($BrowserSmoke -eq 'FAIL') { throw 'browser smoke failed' }
}
catch {
    Write-Output "$stage=FAIL"
    Write-Output 'DO NOT RERUN RECONCILIATION'
    Write-Output 'No corrective SQL, restore, DOWN migration, or transaction retry was attempted.'
    throw
}
finally {
    $connection = $null
    $rawUri = $null
    Remove-Item Env:PGHOST,Env:PGPORT,Env:PGDATABASE,Env:PGUSER,Env:PGPASSWORD,Env:PGSSLMODE -ErrorAction SilentlyContinue
}
