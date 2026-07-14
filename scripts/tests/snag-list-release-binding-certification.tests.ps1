$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$subsystem=Join-Path $root 'scripts/certification/snag-list-release-binding'
. (Join-Path $subsystem 'CertificationCore.ps1')
$passed=0
function Assert-True([bool]$Condition,[string]$Name){if(-not $Condition){throw "FAIL: $Name"};$script:passed++;Write-Host "PASS: $Name"}
$temp=Join-Path ([IO.Path]::GetTempPath()) ("snag-cert-unit-"+[guid]::NewGuid().ToString('N'));New-Item -ItemType Directory $temp|Out-Null
try{
  $a=Join-Path $temp 'a.json';$b=Join-Path $temp 'b.json';$value=[ordered]@{schemaVersion=1;a='x';nested=[ordered]@{z=2}}
  $ha=Write-CanonicalJson $value $a;$hb=Write-CanonicalJson $value $b
  Assert-True ($ha -eq $hb) 'canonical JSON is deterministic'
  Assert-True ($ha -eq (Get-Sha256 $a)) 'artifact hash matches bytes'
  Assert-True ((Get-TextSha256 'abc') -eq 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') 'text SHA-256 calculation'
  $release=@(Get-ReleaseFiles $root)
  Assert-True (($release.number -join ',') -eq '30,31,32,33,34,35') 'canonical migration ordering'
  Assert-True ((@($release|Where-Object{$_.actual -ne $_.expected})).Count -eq 0) 'migration hashes match manifest'
  $source=Get-Content (Join-Path $subsystem 'CertificationCore.ps1') -Raw
  Assert-True ($source -notmatch '(?i)backups[\\/]production') 'no production backup path'
  Assert-True ($source -notmatch '(?i)\.env\.production|\.env\.staging') 'no production/staging env loading'
  Assert-True ($source -notmatch 'APPROVE PRODUCTION APPLY') 'local namespace does not use production approval prefix'
  $entry=Get-Content (Join-Path $subsystem 'Invoke-SnagListReleaseBindingCertification.ps1') -Raw
  Assert-True ($entry -notmatch '(?i)DatabaseUrl|TargetConnectionString|LocalMode|TestMode|AllowArbitraryTarget') 'no arbitrary-target parameters'
  $bad=[pscustomobject]@{schema=$script:CertificationSchema;host='production.example';database='x';kind='x';runId='000000000000';container='x'}
  $rejected=$false;try{Assert-TargetContext $bad}catch{$rejected=$true};Assert-True $rejected 'external context fails closed'
  Write-Host "SNAG_LIST_RELEASE_BINDING_UNIT_STATIC: PASS ($passed assertions)"
}finally{Remove-Item -LiteralPath $temp -Recurse -Force}
