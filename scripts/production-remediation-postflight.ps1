[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Container,
    [string]$OutputPath
)

# Read-only postflight for migration 028_production_security_reconciliation.sql.
# Same connection convention as production-remediation-preflight.ps1 (no
# connection string accepted; operates against an already-reachable
# container name only). Returns a non-zero exit code on ANY check failure.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $PSScriptRoot 'lib\SecurityContractInventory.ps1')
. (Join-Path $PSScriptRoot 'lib\RemediationPreflightPostflight.ps1')

$tempDir = Join-Path ([IO.Path]::GetTempPath()) "remediation-postflight-$([guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
try {
    $queryFn = {
        param([string]$Sql)
        $hostPath = Join-Path $tempDir 'query.sql'
        Write-Utf8NoBom -Path $hostPath -Value ($Sql + [Environment]::NewLine)
        docker cp $hostPath "${Container}:/tmp/remediation-postflight-query.sql" | Out-Null
        $r = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $Container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '--quiet', '--file', '/tmp/remediation-postflight-query.sql')
        if ($r.ExitCode -ne 0) { throw "postflight query failed: $($r.Output -join ' | ')" }
        return ($r.Output -join "`n")
    }

    $result = Invoke-RemediationPostflight -Query $queryFn
    $json = $result | ConvertTo-Json -Depth 10
    Write-Host $json
    if ($OutputPath) { Write-Utf8NoBom -Path $OutputPath -Value $json }
    Write-Host "POSTFLIGHT: $($result.status)"
    if ($result.status -ne 'PASS') { exit 1 }
} finally {
    if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force }
}
exit 0
