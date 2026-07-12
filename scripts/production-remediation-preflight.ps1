[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Container,
    [string]$OutputPath
)

# Read-only preflight for migration 028_production_security_reconciliation.sql.
# Takes an already-running, already-reachable PostgreSQL 17 container name
# (disposable rehearsal container today; a real read-only production
# connection in the reviewed runbook would wrap the same
# Invoke-RemediationPreflight function with a production-fingerprint-checked
# queryFn - this script itself never opens a database connection or accepts
# a connection string, so it cannot be pointed at production by accident).
# Never modifies anything. Exit 0 always (status is in the JSON output,
# not the exit code, so a caller can branch on READY/ALREADY_REMEDIATED/
# UNSAFE_STATE/BLOCKED without treating a legitimate BLOCKED as a script
# crash).

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $PSScriptRoot 'lib\SecurityContractInventory.ps1')
. (Join-Path $PSScriptRoot 'lib\RemediationPreflightPostflight.ps1')

$tempDir = Join-Path ([IO.Path]::GetTempPath()) "remediation-preflight-$([guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
try {
    $queryFn = {
        param([string]$Sql)
        $hostPath = Join-Path $tempDir 'query.sql'
        Write-Utf8NoBom -Path $hostPath -Value ($Sql + [Environment]::NewLine)
        docker cp $hostPath "${Container}:/tmp/remediation-preflight-query.sql" | Out-Null
        $r = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $Container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '--quiet', '--file', '/tmp/remediation-preflight-query.sql')
        if ($r.ExitCode -ne 0) { throw "preflight query failed: $($r.Output -join ' | ')" }
        return ($r.Output -join "`n")
    }

    $result = Invoke-RemediationPreflight -Query $queryFn
    $json = $result | ConvertTo-Json -Depth 10
    Write-Host $json
    if ($OutputPath) { Write-Utf8NoBom -Path $OutputPath -Value $json }
    Write-Host "PREFLIGHT: $($result.status)"
} finally {
    if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force }
}
exit 0
