$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $repoRoot 'scripts\lib\P1ReconciliationPackage.ps1')

$script:passed=0; $script:failed=0
function A([string]$n,[bool]$ok) { if($ok){$script:passed++; Write-Host "[PASS] $n"}else{$script:failed++;Write-Host "[FAIL] $n"} }
$temp = Join-Path ([IO.Path]::GetTempPath()) "p1-package-$([guid]::NewGuid().ToString('N')).sql"
try {
    $contract = Import-P1ReconciliationContract -RepoRoot $repoRoot
    A 'approved order' ((@($contract.Manifest.includedMigrations.number)-join ',') -ceq '41,42,43,44,45,46,49,51,53,54,55,56,57,58')
    A 'approved skip set' ((@($contract.Manifest.skippedSupersededMigrations.number)-join ',') -ceq '47,48,50,52')
    $built = New-P1ReconciliationSql -RepoRoot $repoRoot -OutputPath $temp
    $sql = [IO.File]::ReadAllText($temp)
    $markers = @($sql -split "`n" | Where-Object { $_.StartsWith('\echo P1_MIGRATION ') })
    A 'all fourteen migrations embedded' ($built.MigrationCount -eq 14 -and $markers.Count -eq 14)
    A 'one outer BEGIN' (([regex]::Matches($sql,'(?m)^BEGIN;$')).Count -eq 1)
    A 'one outer COMMIT' (([regex]::Matches($sql,'(?m)^COMMIT;$')).Count -eq 1)
    A 'precondition precedes first migration' ($sql.IndexOf('DO $p1_pre$') -lt $sql.IndexOf('\echo P1_MIGRATION'))
    A 'postcondition precedes commit' ($sql.IndexOf('DO $p1_post$') -lt $sql.IndexOf("COMMIT;"))
    A 'explicit exact FK guard and repair' ($sql -match 'FK changed before explicit repair' -and $sql -match 'ON DELETE RESTRICT')
    A '037 project-profile repair is source-bound and precedes 041' ($sql -match 'P1_FORWARD_REPAIR 037_retail_historical_project_profile.sql SHA256=e0627888ea4b57b108ba8bf28e6e09bb4f2c06f218646022ce959e663d7cc091' -and $sql.IndexOf('P1_FORWARD_REPAIR 037_') -lt $sql.IndexOf('P1_MIGRATION 041_'))
    A 'project-profile repair has exact fail-closed PRE and POST counts' ($sql -match 'project profile columns must all be absent' -and $sql -match 'P1_POST_FAIL: project profile columns')
    A 'new-object ACL normalization is explicit' ($sql -match 'REVOKE ALL ON TABLE public.project_schedule_versions' -and $sql -match 'REVOKE ALL ON SEQUENCE public.project_schedule_versions_id_seq' -and $sql -match 'prevent_referenced_template_semantic_change')
    A '044 and 045 execution markers included once' (@($markers | Where-Object { $_ -like '* 044_master_catalog_weight_calibration.sql *' }).Count -eq 1 -and @($markers | Where-Object { $_ -like '* 045_master_catalog_duration_calibration.sql *' }).Count -eq 1)
    A 'superseded execution markers absent' (@($markers | Where-Object { $_ -match ' (047_|048_|050_|052_)' }).Count -eq 0)
    A 'artifact LF-only UTF8' ([Array]::IndexOf([IO.File]::ReadAllBytes($temp),[byte]13) -eq -1)
    $stateSql=Get-P1ReconciliationStateSql
    A 'second-run classifier is fail closed' ($stateSql -match 'ALREADY_RECONCILED' -and $stateSql -match 'NOT_APPLICABLE' -and $stateSql -notmatch '(?i)insert|update|delete')
} finally { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
Write-Host "RESULT passed=$script:passed failed=$script:failed"
if($script:failed -gt 0){exit 1}
