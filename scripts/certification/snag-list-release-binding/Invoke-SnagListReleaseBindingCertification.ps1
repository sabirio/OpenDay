[CmdletBinding()]
param([string]$RunId, [switch]$KeepArtifacts)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'CertificationCore.ps1')
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
if(-not $RunId){$RunId=[guid]::NewGuid().ToString('N').Substring(0,12)}
if($RunId -notmatch '^[a-f0-9]{12}$'){throw 'RunId must be exactly 12 lowercase hex characters'}
$head=(& git -C $repoRoot rev-parse HEAD).Trim(); $branch=(& git -C $repoRoot branch --show-current).Trim()
$workDir=Join-Path $repoRoot "work/certification/snag-list-release-binding/$RunId"
$network="openday-snag-cert-net-$RunId"; $contexts=@(); $success=$false; $primaryError=$null
$source=$null;$restoreTarget=$null;$predecessor=$null;$backup=$null;$restore=$null;$preflight=$null;$apply=$null;$postflight=$null;$certificationReport=$null;$negativePre=$null;$negativePost=$null;$lifecycle=$null
$startedAtUtc=[DateTime]::UtcNow
New-Item -ItemType Directory -Force -Path $workDir | Out-Null
try {
  Assert-NoRemoteEnvironment
  Invoke-Docker @('network','create','--label',"openday.cert.run=$RunId",$network)|Out-Null
  $networkId=Invoke-Docker @('network','inspect','--format','{{.Id}}',$network) -Capture
  $lifecycle=Invoke-TargetLifecycleNegativeScenarios $RunId $network $networkId $workDir;$contexts+=,$lifecycle.context
  $source=New-TargetContext $RunId 'source' $network $networkId $workDir; $contexts+=,$source
  $predecessor=New-PredecessorSchema $source $repoRoot $workDir
  $backup=New-LocalBackup $source $workDir
  $restoreTarget=New-TargetContext $RunId 'restore' $network $networkId $workDir; $contexts+=,$restoreTarget
  $restore=Restore-LocalBackup $restoreTarget $backup $workDir
  $preflight=New-LocalPreflight $restoreTarget $repoRoot $backup $restore $workDir $head $branch
  $negativePre=Invoke-PreApplyNegativeScenarios $restoreTarget $repoRoot $backup $restore $preflight $workDir $head $branch
  $apply=Invoke-LocalApply $restoreTarget $repoRoot $backup $restore $preflight $preflight.phrase $workDir $head
  $postflight=Invoke-LocalPostflight $restoreTarget $apply $workDir
  $negativePost=Invoke-PostApplyNegativeScenarios $restoreTarget $repoRoot $backup $restore $preflight $apply $workDir $head
  $chain=[ordered]@{schemaVersion=1;status='PASS';runId=$RunId;head=$head;predecessor=$predecessor;backupManifestSha256=$backup.manifestHash;restoreReportSha256=$restore.hash;preflightReportSha256=$preflight.hash;applyReportSha256=$apply.hash;postflightReportSha256=$postflight.hash;negativeScenarios=($lifecycle.count+$negativePre.count+$negativePost.count);schemaFingerprint=$postflight.report.schemaFingerprint;productionAccessed=$false;stagingAccessed=$false}
  $chainPath=Join-Path $workDir 'certification-report.json';$chainHash=Write-CanonicalJson $chain $chainPath
  $certificationReport=[ordered]@{path=$chainPath;hash=$chainHash;report=$chain}
  $success=$true
  Write-Host "RUN_ID=$RunId"; Write-Host "ARTIFACT_DIR=$workDir"; Write-Host "CERTIFICATION_REPORT_SHA256=$chainHash"; Write-Host "NEGATIVE_SCENARIOS=$($chain.negativeScenarios)"; Write-Host "SCHEMA_FINGERPRINT=$($postflight.report.schemaFingerprint)"
} catch { $primaryError=$_ } finally {
  $containers=@($contexts|ForEach-Object{$_.container});$volumes=@($contexts|ForEach-Object{$_.volume})
  $cleanup=$null
  try { $cleanup=Remove-CertificationResources $RunId $containers $volumes $network; Write-Host "CLEANUP: PASS $($cleanup.containers)/$($cleanup.volumes)/$($cleanup.networks)" } catch { Write-Error $_; $success=$false; if(-not $primaryError){$primaryError=$_} }
  if($success -and -not $primaryError){
    try {
      $attestation=New-ReleaseAttestation $source $restoreTarget $repoRoot $predecessor $backup $restore $preflight $apply $postflight $certificationReport $negativePre $negativePost $lifecycle $cleanup $workDir $head $branch $startedAtUtc ([DateTime]::UtcNow)
      $attestationArtifact=Write-ReleaseAttestation $attestation $workDir
      [void](Assert-ReleaseAttestationForProductionGate $attestationArtifact.path $attestationArtifact.sha256 $head $script:ExpectedReleaseManifestSha256)
      Write-Host "RELEASE_ATTESTATION=$($attestationArtifact.path)"
      Write-Host "RELEASE_ATTESTATION_SHA256=$($attestationArtifact.sha256)"
      Write-Host 'AUTHORITATIVE_RELEASE_ATTESTATION: PASS'
      Write-Host 'DOCKER_BACKED_LOCAL_RELEASE_BINDING: PASS'
    } catch {
      Write-Error $_
      $success=$false
      if(-not $primaryError){$primaryError=$_}
    }
  }
  foreach($c in $contexts){$c.password=$null}
}
if($primaryError){throw $primaryError}
if(-not $success){exit 1}
