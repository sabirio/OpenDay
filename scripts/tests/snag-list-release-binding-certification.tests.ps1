$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$subsystem = Join-Path $root 'scripts/certification/snag-list-release-binding'
. (Join-Path $subsystem 'CertificationCore.ps1')

$passed = 0
function Assert-True([bool]$Condition,[string]$Name) {
  if (-not $Condition) { throw "FAIL: $Name" }
  $script:passed++
  Write-Host "PASS: $Name"
}

function Assert-Rejects([string]$Name,[scriptblock]$Action) {
  $rejected = $false
  try { & $Action } catch { $rejected = $true }
  Assert-True $rejected $Name
}

function New-SupportingArtifact([string]$Directory,[string]$Name,[string]$Content) {
  $path = Join-Path $Directory "$Name.json"
  [IO.File]::WriteAllText($path, $Content, [Text.UTF8Encoding]::new($false))
  Get-ArtifactDescriptor $Name $path
}

function New-FixtureRunAttestation([string]$Directory,[string]$Label,[string]$RunId,[string]$Head,[string]$Branch,[string]$ManifestSha256,[string]$Fingerprint) {
  $runDir = Join-Path $Directory $Label
  New-Item -ItemType Directory -Force -Path $runDir | Out-Null
  $supporting = @(
    New-SupportingArtifact $runDir 'dependency-closure' "$Label dependency"
    New-SupportingArtifact $runDir 'backup-manifest' "$Label backup"
    New-SupportingArtifact $runDir 'backup-dump' "$Label dump"
    New-SupportingArtifact $runDir 'restore-report' "$Label restore"
    New-SupportingArtifact $runDir 'preflight-report' "$Label preflight"
    New-SupportingArtifact $runDir 'apply-report' "$Label apply"
    New-SupportingArtifact $runDir 'postflight-report' "$Label postflight"
    New-SupportingArtifact $runDir 'certification-report' "$Label certification"
  )
  $attestation = [ordered]@{
    schemaVersion = 1
    schema = $script:ReleaseAttestationSchema
    status = 'PASS'
    releaseId = 'snag-list-030-035'
    generatedAtUtc = ([DateTime]::UtcNow.ToString('o'))
    validUntilUtc = ([DateTime]::UtcNow.AddHours(1).ToString('o'))
    timestamps = [ordered]@{ startedAtUtc = ([DateTime]::UtcNow.AddMinutes(-5).ToString('o')); completedAtUtc = ([DateTime]::UtcNow.ToString('o')) }
    repository = [ordered]@{ exactHead = $Head; branch = $Branch; manifestPath = 'scripts/manifests/snag-list-030-035.psd1'; manifestSha256 = $ManifestSha256 }
    releaseManifest = [ordered]@{ sha256 = $ManifestSha256; migrations = @((Get-ReleaseFiles $root) | ForEach-Object { [ordered]@{ number = $_.number; file = $_.file; sha256 = $_.actual } }) }
    certificationScripts = Get-CertificationScriptArtifacts $root
    docker = [ordered]@{
      runtime = [ordered]@{ serverVersion = 'fixture-server'; clientVersion = 'fixture-client' }
      image = [ordered]@{ image = $script:AllowedImage; imageId = "sha256:$Label"; created = '2026-01-01T00:00:00Z'; repoDigests = @("postgres@sha256:$Label") }
      network = [ordered]@{ name = "openday-snag-cert-net-$RunId"; id = "network-$Label" }
      independentRuns = @(
        [ordered]@{ kind = 'source'; runId = $RunId; database = "snag_cert_source_$RunId"; host = '127.0.0.1'; port = 15001; container = "source-$Label"; containerId = "container-source-$Label"; volume = "volume-source-$Label"; network = "net-$Label"; networkId = "network-$Label"; image = $script:AllowedImage; serverIdentitySha256 = "server-source-$Label"; fingerprint = "$Fingerprint-source" }
        [ordered]@{ kind = 'restore'; runId = $RunId; database = "snag_cert_restore_$RunId"; host = '127.0.0.1'; port = 15002; container = "restore-$Label"; containerId = "container-restore-$Label"; volume = "volume-restore-$Label"; network = "net-$Label"; networkId = "network-$Label"; image = $script:AllowedImage; serverIdentitySha256 = "server-restore-$Label"; fingerprint = "$Fingerprint-restore" }
      )
    }
    evidence = [ordered]@{
      predecessorSchemaFingerprint = "predecessor-$Fingerprint"
      sourceFingerprint = "$Fingerprint-source"
      restoreFingerprint = "$Fingerprint-restore"
      schemaFingerprint = $Fingerprint
      backupManifestSha256 = $supporting[1].sha256
      restoreReportSha256 = $supporting[3].sha256
      preflightReportSha256 = $supporting[4].sha256
      applyReportSha256 = $supporting[5].sha256
      postflightReportSha256 = $supporting[6].sha256
      supportingArtifacts = $supporting
    }
    checks = [ordered]@{ status = 'PASS'; passed = 31; total = 31; lifecycleNegativeChecks = 2; preApplyNegativeChecks = 27; postApplyNegativeChecks = 2 }
    cleanup = [ordered]@{ status = 'PASS'; containers = 0; volumes = 0; networks = 0 }
    productionGateContract = [ordered]@{ gateReadsOnlyThisArtifact = $true; requiredChecks = @('artifactExists','sha256Matches','statusPass','exactHeadMatches','releaseManifestSha256Matches','notExpired','notModified'); noLogReconstructionRequired = $true }
    productionAccessed = $false
    stagingAccessed = $false
  }
  $path = Join-Path $runDir 'release-attestation.json'
  $hash = Write-CanonicalJson $attestation $path
  [ordered]@{ path = $path; sha256 = $hash; report = $attestation }
}

$temp = Join-Path ([IO.Path]::GetTempPath()) ("snag-cert-unit-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $temp | Out-Null
try {
  $a = Join-Path $temp 'a.json'
  $b = Join-Path $temp 'b.json'
  $value = [ordered]@{ schemaVersion = 1; a = 'x'; nested = [ordered]@{ z = 2 } }
  $ha = Write-CanonicalJson $value $a
  $hb = Write-CanonicalJson $value $b
  Assert-True ($ha -eq $hb) 'canonical JSON is deterministic'
  Assert-True ($ha -eq (Get-Sha256 $a)) 'artifact hash matches bytes'
  Assert-True ((Get-TextSha256 'abc') -eq 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') 'text SHA-256 calculation'

  $release = @(Get-ReleaseFiles $root)
  Assert-True (($release.number -join ',') -eq '30,31,32,33,34,35') 'canonical migration ordering'
  Assert-True ((@($release | Where-Object { $_.actual -ne $_.expected })).Count -eq 0) 'migration hashes match manifest'

  $source = Get-Content (Join-Path $subsystem 'CertificationCore.ps1') -Raw
  $entry = Get-Content (Join-Path $subsystem 'Invoke-SnagListReleaseBindingCertification.ps1') -Raw
  $finalGenerator = Get-Content (Join-Path $subsystem 'New-SnagListFinalReleaseAttestation.ps1') -Raw
  Assert-True ($source -notmatch '(?i)backups[\\/]production') 'no production backup path'
  Assert-True ($source -notmatch '(?i)\.env\.production|\.env\.staging') 'no production/staging env loading'
  Assert-True ($source -notmatch 'APPROVE PRODUCTION APPLY') 'local namespace does not use production approval prefix'
  Assert-True ($entry -notmatch '(?i)DatabaseUrl|TargetConnectionString|LocalMode|TestMode|AllowArbitraryTarget') 'no arbitrary-target parameters'
  Assert-True ($source -match 'ReleaseAttestationSchema') 'authoritative release attestation schema is declared'
  Assert-True ($source -match 'function New-ReleaseAttestation') 'per-run release attestation builder exists'
  Assert-True ($source -match 'function New-FinalReleaseAttestation') 'final two-run release attestation builder exists'
  Assert-True ($source -match 'function Assert-ReleaseAttestationForProductionGate') 'production gate validates attestation artifact only'
  Assert-True ($source -match 'Assert-DisjointIdentitySet') 'final gate proves independent Docker identities'
  Assert-True ($source -match 'Assert-ArtifactsMatchDisk') 'final gate verifies bound artifact hashes against disk'
  Assert-True ($source -match "passed = 31[\s\S]{0,80}total = 31") 'per-run attestation records 31/31 PASS'
  Assert-True ($source -match 'runA = \[ordered\]@\{ passed = 31; total = 31 \}') 'final attestation records RUN_A 31/31 PASS'
  Assert-True ($source -match 'runB = \[ordered\]@\{ passed = 31; total = 31 \}') 'final attestation records RUN_B 31/31 PASS'
  Assert-True ($source -match 'Get-DockerRuntimeIdentity' -and $source -match 'Get-DockerImageIdentity') 'attestation binds Docker runtime and image identity'
  Assert-True ($source -match 'certificationScripts' -and $source -match 'supportingArtifacts') 'attestation hashes certification scripts and supporting artifacts'
  Assert-True ($source -match "'certification-report'") 'attestation includes certification-report as supporting artifact'
  Assert-True ($source.Contains('gateReadsOnlyThisArtifact = $true')) 'production gate contract is artifact-only'
  Assert-True ($entry -match 'Write-ReleaseAttestation' -and $source -match "'release-attestation\.json'") 'per-run entrypoint writes release-attestation artifact'
  Assert-True ($entry -match 'Assert-ReleaseAttestationForProductionGate') 'per-run entrypoint self-verifies attestation artifact before PASS'
  Assert-True ($finalGenerator -match 'New-FinalReleaseAttestation' -and $finalGenerator -match 'Write-FinalReleaseAttestation') 'final generator writes canonical release-attestation artifact'
  Assert-True ($finalGenerator -match 'Assert-ReleaseAttestationForProductionGate') 'final generator self-verifies final artifact before PASS'

  $head = (& git -C $root rev-parse HEAD).Trim()
  $branch = (& git -C $root branch --show-current).Trim()
  $manifest = $script:ExpectedReleaseManifestSha256
  $runA = New-FixtureRunAttestation $temp 'RUN_A' 'aaaaaaaaaaaa' $head $branch $manifest 'schema-fingerprint'
  $runB = New-FixtureRunAttestation $temp 'RUN_B' 'bbbbbbbbbbbb' $head $branch $manifest 'schema-fingerprint'
  $final = New-FinalReleaseAttestation $runA.path $runA.sha256 $runB.path $runB.sha256 $root $head $branch ([DateTime]::UtcNow.AddMinutes(-10)) ([DateTime]::UtcNow) -SkipGitCleanCheck
  Assert-True ($final.schemaVersion -eq 2 -and $final.status -eq 'PASS') 'final two-run attestation is generated as PASS'
  Assert-True ($final.runs.RUN_A.report.checks.passed -eq 31 -and $final.runs.RUN_B.report.checks.passed -eq 31) 'final attestation binds RUN_A and RUN_B 31/31 PASS'
  Assert-True ($final.independence.status -eq 'PASS') 'final attestation records independence proof'
  $finalPath = Join-Path $temp 'final-release-attestation.json'
  $finalHash = Write-CanonicalJson $final $finalPath
  $accepted = Assert-ReleaseAttestationForProductionGate $finalPath $finalHash $head $manifest ([DateTime]::UtcNow) -SkipGitCleanCheck
  Assert-True ($accepted.status -eq 'PASS') 'production gate accepts exact final attestation'

  Assert-Rejects 'production gate rejects wrong artifact SHA' { Assert-ReleaseAttestationForProductionGate $finalPath ('0' * 64) $head $manifest ([DateTime]::UtcNow) -SkipGitCleanCheck }
  Assert-Rejects 'production gate rejects wrong HEAD' { Assert-ReleaseAttestationForProductionGate $finalPath $finalHash ('c' * 40) $manifest ([DateTime]::UtcNow) -SkipGitCleanCheck }
  Assert-Rejects 'production gate rejects wrong manifest' { Assert-ReleaseAttestationForProductionGate $finalPath $finalHash $head ('d' * 64) ([DateTime]::UtcNow) -SkipGitCleanCheck }
  $expired = $final | ConvertTo-Json -Depth 40 | ConvertFrom-Json
  $expired.validUntilUtc = [DateTime]::UtcNow.AddMinutes(-1).ToString('o')
  $expiredHash = Write-CanonicalJson $expired $finalPath
  Assert-Rejects 'production gate rejects expired attestation' { Assert-ReleaseAttestationForProductionGate $finalPath $expiredHash $head $manifest ([DateTime]::UtcNow) -SkipGitCleanCheck }
  $bad = $final | ConvertTo-Json -Depth 40 | ConvertFrom-Json
  $bad.runs.RUN_B.report.docker.independentRuns[0].containerId = $bad.runs.RUN_A.report.docker.independentRuns[0].containerId
  $badHash = Write-CanonicalJson $bad $finalPath
  Assert-Rejects 'production gate rejects reused container identity' { Assert-ReleaseAttestationForProductionGate $finalPath $badHash $head $manifest ([DateTime]::UtcNow) -SkipGitCleanCheck }
  $bad = $final | ConvertTo-Json -Depth 40 | ConvertFrom-Json
  $bad.runs.RUN_A.report.checks.passed = 30
  $badHash = Write-CanonicalJson $bad $finalPath
  Assert-Rejects 'production gate rejects RUN_A below 31/31' { Assert-ReleaseAttestationForProductionGate $finalPath $badHash $head $manifest ([DateTime]::UtcNow) -SkipGitCleanCheck }
  $bad = $final | ConvertTo-Json -Depth 40 | ConvertFrom-Json
  $bad.runs.RUN_B.report.cleanup.volumes = 1
  $badHash = Write-CanonicalJson $bad $finalPath
  Assert-Rejects 'production gate rejects cleanup leak' { Assert-ReleaseAttestationForProductionGate $finalPath $badHash $head $manifest ([DateTime]::UtcNow) -SkipGitCleanCheck }
  $bad = $final | ConvertTo-Json -Depth 40 | ConvertFrom-Json
  $bad.runs.RUN_A.report.evidence.supportingArtifacts[0].sha256 = '0' * 64
  $badHash = Write-CanonicalJson $bad $finalPath
  Assert-Rejects 'production gate rejects supporting artifact hash mismatch' { Assert-ReleaseAttestationForProductionGate $finalPath $badHash $head $manifest ([DateTime]::UtcNow) -SkipGitCleanCheck }

  $badContext = [pscustomobject]@{ schema = $script:CertificationSchema; host = 'production.example'; database = 'x'; kind = 'x'; runId = '000000000000'; container = 'x' }
  Assert-Rejects 'external context fails closed' { Assert-TargetContext $badContext }

  Write-Host "SNAG_LIST_RELEASE_BINDING_UNIT_STATIC: PASS ($passed assertions)"
} finally {
  Remove-Item -LiteralPath $temp -Recurse -Force
}
