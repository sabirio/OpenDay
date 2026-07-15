[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$RunAAttestationPath,
  [Parameter(Mandatory=$true)][string]$RunAAttestationSha256,
  [Parameter(Mandatory=$true)][string]$RunBAttestationPath,
  [Parameter(Mandatory=$true)][string]$RunBAttestationSha256,
  [string]$OutputDir
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'CertificationCore.ps1')

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$head = (& git -C $repoRoot rev-parse HEAD).Trim()
$branch = (& git -C $repoRoot branch --show-current).Trim()
$startedAtUtc = [DateTime]::UtcNow

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $stamp = $startedAtUtc.ToString('yyyyMMddTHHmmssZ')
  $OutputDir = Join-Path $repoRoot "work/certification/snag-list-release-binding/final-$($head.Substring(0,12))-$stamp"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$attestation = New-FinalReleaseAttestation `
  -RunAAttestationPath $RunAAttestationPath `
  -RunAAttestationSha256 $RunAAttestationSha256 `
  -RunBAttestationPath $RunBAttestationPath `
  -RunBAttestationSha256 $RunBAttestationSha256 `
  -RepoRoot $repoRoot `
  -Head $head `
  -Branch $branch `
  -StartedAtUtc $startedAtUtc `
  -CompletedAtUtc ([DateTime]::UtcNow)

$artifact = Write-FinalReleaseAttestation $attestation $OutputDir
[void](Assert-ReleaseAttestationForProductionGate $artifact.path $artifact.sha256 $head $script:ExpectedReleaseManifestSha256)

Write-Host "FINAL_RELEASE_ATTESTATION=$($artifact.path)"
Write-Host "RELEASE_ATTESTATION_SHA256=$($artifact.sha256)"
Write-Host 'AUTHORITATIVE_FINAL_RELEASE_ATTESTATION: PASS'
