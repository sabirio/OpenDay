$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $repoRoot 'scripts\lib\P1ReconciliationPackage.ps1')

$script:passed=0; $script:failed=0
function A([string]$Name,[bool]$Condition){if($Condition){$script:passed++;Write-Host "[PASS] $Name"}else{$script:failed++;Write-Host "[FAIL] $Name"}}

$migrationPath = Join-Path $repoRoot 'weekly-tracker\src\migrations\037_retail_historical_project_profile.sql'
$contract = Get-P1Migration037ColumnContract -MigrationPath $migrationPath
$expected = @('location_type','store_concept','sales_area_sqm','back_of_house_area_sqm','actual_construction_start_date','actual_construction_completion_date','actual_opening_date','budget','actual_cost','currency_code')
$oldWrong = @('project_type','gross_floor_area','storeys','structural_system','envelope_type','mep_complexity','ground_conditions','site_constraints','delivery_method','location_context')

A 'canonical source yields exactly ten columns' ($contract.Count -eq 10)
A 'canonical names are derived exactly from migration 037' (($contract.Name -join ',') -ceq ($expected -join ','))
A 'all migration-037 columns are nullable' (@($contract | Where-Object { -not $_.Nullable }).Count -eq 0)
A 'all migration-037 columns have no default' (@($contract | Where-Object { $_.HasDefault }).Count -eq 0)
A 'canonical ten-column set passes' (Test-P1Migration037ColumnSet -MigrationPath $migrationPath -ColumnNames $expected)
A 'old unrelated ten-column list fails' (-not (Test-P1Migration037ColumnSet -MigrationPath $migrationPath -ColumnNames $oldWrong))

$postflight = Get-P1Migration037PostflightSql -MigrationPath $migrationPath
A 'postflight checks exact count ten' ($postflight -match 'count\(\*\) = 10')
A 'postflight checks nullable semantics' ($postflight -match "is_nullable = 'YES'")
A 'postflight checks no-default semantics' ($postflight -match 'column_default IS NULL')
foreach($name in $expected){A "postflight includes $name" ($postflight -match "'$name'")}
foreach($name in $oldWrong){A "postflight excludes wrong $name" ($postflight -notmatch "'$name'")}

$temp = Join-Path ([IO.Path]::GetTempPath()) ("p1-037-artifact-{0}.sql" -f [guid]::NewGuid().ToString('N'))
try {
    $built = New-P1ReconciliationSql -RepoRoot $repoRoot -OutputPath $temp
    A 'certified reconciliation SQL remains byte-identical' ($built.Sha256 -ceq 'dbebe29b9edec1aaa7f619d887d520445700eb48b4ffad48029935515ab23c7e')
}
finally { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }

Write-Host "RESULT passed=$script:passed failed=$script:failed"
if($script:failed -gt 0){exit 1}
