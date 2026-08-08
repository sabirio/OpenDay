[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SqlPath,
    [Parameter(Mandatory)][string]$ExpectedSqlSha256,
    [Parameter(Mandatory)][string[]]$RequiredMarkers,
    [Parameter(Mandatory)][string]$ExpectedProjectRef,
    [string]$EnvFile,
    [string]$EvidencePath,
    [switch]$AllowProceduralAssertions,
    [switch]$OwnerConfirmedReadOnlyProduction,
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ([string]::IsNullOrWhiteSpace($EnvFile)) { $EnvFile = Join-Path $repoRoot 'weekly-tracker\.env.production.local' }

. (Join-Path $repoRoot 'scripts\lib\ProductionReadOnlySql.ps1')
. (Join-Path $repoRoot 'scripts\lib\RestoreVerifyHelpers.ps1')

$connection = $null
$rawUri = $null
try {
    $artifact = Assert-ProductionSqlArtifact -Path $SqlPath -ExpectedSha256 $ExpectedSqlSha256 -Label 'owner read-only SQL' -RequireTransaction -AllowProceduralAssertions:$AllowProceduralAssertions
    if ($RequiredMarkers.Count -eq 0 -or @($RequiredMarkers | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count -ne 0) {
        throw 'at least one non-empty required marker is required'
    }
    foreach ($marker in $RequiredMarkers) {
        if ($artifact.Text -cnotmatch [regex]::Escape($marker)) { throw "required marker is absent from SQL: $marker" }
    }
    if ($ValidateOnly) { Write-Output 'OWNER_PRODUCTION_READ_ONLY_GATE_VALIDATE_ONLY=PASS'; return }
    if (-not $OwnerConfirmedReadOnlyProduction) { throw 'explicit owner read-only production confirmation is required' }
    if ([string]::IsNullOrWhiteSpace($EvidencePath)) { throw 'EvidencePath is required for live owner execution' }
    if (Test-Path -LiteralPath $EvidencePath) { throw 'evidence path already exists' }

    . (Join-Path $repoRoot 'scripts\lib\ProductionConnection.ps1')
    $connection = Get-ProductionConnectionFingerprint -EnvFile $EnvFile -RepoRoot $repoRoot -ExpectedProjectRef $ExpectedProjectRef
    if ($connection.ProjectRef -cne $ExpectedProjectRef) { throw 'production project-ref output contract mismatch' }
    $env:PGHOST=$connection.Host; $env:PGPORT=[string]$connection.Port; $env:PGDATABASE=$connection.Database
    $env:PGUSER=$connection.User; $env:PGPASSWORD=$connection.Password; $env:PGSSLMODE='require'
    $rawUri=$connection.RawUri; $connection=$null

    $mount = "type=bind,source=$($artifact.Path),target=/gate/read-only.sql,readonly"
    $result = Invoke-NativeTool -Command 'docker' -ArgumentList @(
        'run','--rm','--network','bridge','--mount',$mount,
        '--env','PGHOST','--env','PGPORT','--env','PGDATABASE','--env','PGUSER','--env','PGPASSWORD','--env','PGSSLMODE',
        'postgres:17','psql','-X','--tuples-only','--no-align','-v','ON_ERROR_STOP=1','--file','/gate/read-only.sql'
    )
    $safe = @(foreach($entry in $result.Output){$line=[string]$entry;if($env:PGPASSWORD){$line=$line.Replace($env:PGPASSWORD,'<redacted>')};if($rawUri){$line=$line.Replace($rawUri,'<redacted-connection>')};$line})
    foreach($line in $safe){Write-Output $line;Add-Content -LiteralPath $EvidencePath -Value $line}
    if($result.ExitCode -ne 0){throw "read-only production gate failed with exit code $($result.ExitCode)"}
    $markers=Test-ProductionTranscriptMarkers -Transcript $safe -RequiredMarkers $RequiredMarkers
    if(-not $markers.Passed){throw 'read-only production transcript marker contract failed'}
    Write-Output 'PRODUCTION_READ_ONLY_GATE=PASS'
    Write-Output "SANITIZED_EVIDENCE=$EvidencePath"
}
catch {
    Write-Output 'PRODUCTION_READ_ONLY_GATE=FAIL'
    throw
}
finally {
    $connection=$null;$rawUri=$null
    Remove-Item Env:PGHOST,Env:PGPORT,Env:PGDATABASE,Env:PGUSER,Env:PGPASSWORD,Env:PGSSLMODE -ErrorAction SilentlyContinue
}
