[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$OutputPath,
    [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }
. (Join-Path $PSScriptRoot 'lib\P1ReconciliationPackage.ps1')

$result = New-P1ReconciliationSql -RepoRoot $RepoRoot -OutputPath $OutputPath
$result | ConvertTo-Json -Compress
