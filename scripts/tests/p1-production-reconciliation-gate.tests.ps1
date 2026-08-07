$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestPath = Join-Path $repoRoot 'scripts\manifests\p1-mixed-state-reconciliation.psd1'
$securityPath = Join-Path $repoRoot 'scripts\evidence\p1-production-security-baseline.json'
$emulatorPath = Join-Path $repoRoot 'scripts\lib\ProductionSecurityStateEmulator.ps1'
$bindingPath = Join-Path $repoRoot 'scripts\lib\BackupReleaseBinding.ps1'
$backupPath = Join-Path $repoRoot 'scripts\production-backup.ps1'
$restorePath = Join-Path $repoRoot 'scripts\restore-verify.ps1'

$script:passed = 0
$script:failed = 0
function Assert-True([string]$Name, [bool]$Condition) {
    if ($Condition) { $script:passed++; Write-Host "[PASS] $Name" }
    else { $script:failed++; Write-Host "[FAIL] $Name" }
}
function Assert-Throws([string]$Name, [scriptblock]$Action, [string]$Pattern) {
    try { & $Action; Assert-True $Name $false }
    catch { Assert-True $Name ($_.Exception.Message -match $Pattern) }
}

foreach ($path in @($manifestPath,$securityPath,$emulatorPath,$bindingPath,$backupPath,$restorePath)) {
    Assert-True "required gate file exists: $path" (Test-Path -LiteralPath $path -PathType Leaf)
}

$tokens=$null; $errors=$null
[void][Management.Automation.Language.Parser]::ParseFile($manifestPath,[ref]$tokens,[ref]$errors)
Assert-True 'P1 manifest parses as PowerShell data syntax' ($errors.Count -eq 0)
$manifest = Import-PowerShellDataFile -LiteralPath $manifestPath

$tokens=$null; $errors=$null
[void][Management.Automation.Language.Parser]::ParseFile($emulatorPath,[ref]$tokens,[ref]$errors)
Assert-True 'security emulator parses on Windows PowerShell 5.1' ($errors.Count -eq 0)

Assert-True 'manifest binds canonical application main separately from gate commit' `
    ($manifest.applicationMainCommit -ceq 'ecfa6771136b47a0372caf18fc52136997784069')
Assert-True 'manifest binds approved production project ref' `
    ($manifest.approvedProjectRef -ceq 'szgbkeqornkdngoegyso')
Assert-True 'manifest does not embed a future gate commit SHA' `
    (-not $manifest.ContainsKey('gateCommit') -and -not $manifest.ContainsKey('authoritativeCommit'))
Assert-True 'manifest binds approved full preflight SQL hash' `
    ($manifest.preflightEvidence.production.sqlSha256 -ceq 'c9e61e6a7f621e71b7f3cb71de98de5cc429062c849e368fbc752f3219428fba')
Assert-True 'manifest binds approved minimal-delta SQL hash' `
    ($manifest.preflightEvidence.minimalDelta.sqlSha256 -ceq '06095198f66b714f285c850b0e6c1e8d9e968bc5add5147457da446fd3044daf')

$securitySha256 = (Get-FileHash -LiteralPath $securityPath -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-True 'security evidence bytes are LF-pinned for cross-checkout SHA stability' `
    ([Array]::IndexOf([IO.File]::ReadAllBytes($securityPath), [byte]13) -eq -1)
Assert-True 'manifest bytes are LF-pinned for cross-checkout SHA stability' `
    ([Array]::IndexOf([IO.File]::ReadAllBytes($manifestPath), [byte]13) -eq -1)
Assert-True 'manifest security evidence path is repository-relative and exact' `
    ($manifest.securityEvidence.path -ceq 'scripts/evidence/p1-production-security-baseline.json')
Assert-True 'manifest cryptographically binds exact security artifact bytes' `
    ($manifest.securityEvidence.sha256 -ceq $securitySha256)

$migrationNumbers = @(41,42,43,44,45,46,49,51,53,54,55,56,57,58)
$skippedNumbers = @(47,48,50,52)
Assert-True 'included migration order is exact' `
    ((@($manifest.includedMigrations | ForEach-Object { [int]$_.number }) -join ',') -ceq ($migrationNumbers -join ','))
Assert-True 'superseded migration skip set is exact' `
    ((@($manifest.skippedSupersededMigrations | ForEach-Object { [int]$_.number }) -join ',') -ceq ($skippedNumbers -join ','))
foreach ($migration in $manifest.includedMigrations) {
    $migrationPath = Join-Path $repoRoot (Join-Path $manifest.migrationsDirectory $migration.file)
    $actual = (Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-True "migration $($migration.number) SHA-256 matches manifest" ($actual -ceq $migration.sha256)
}
Assert-True 'FK repair is explicitly NO ACTION to RESTRICT' `
    ($manifest.explicitForwardReconciliation.projectsTemplateForeignKey.fromOnDelete -ceq 'NO ACTION' -and
     $manifest.explicitForwardReconciliation.projectsTemplateForeignKey.toOnDelete -ceq 'RESTRICT')
Assert-True 'contractor-report 027/028 to 036/058 upgrade is explicit' `
    ($manifest.explicitForwardReconciliation.contractorReportUpgrade.intentional -eq $true -and
     $manifest.explicitForwardReconciliation.contractorReportUpgrade.fromBodyMd5 -ceq '94ae61e04f32b5917edd78063bf12f5f' -and
     $manifest.explicitForwardReconciliation.contractorReportUpgrade.toBodyMd5 -ceq '53ddc257aaa05053822b30e8c7e8d72f')
Assert-True '91-WP v1 remains active' `
    ($manifest.expectedPost.canonicalV1.workPackageCount -eq 91 -and $manifest.expectedPost.canonicalV1.active -eq $true)
Assert-True '221-WP v2 remains inactive' `
    ($manifest.expectedPost.masterCatalogV2.workPackageCount -eq 221 -and $manifest.expectedPost.masterCatalogV2.active -eq $false)

. $emulatorPath
$baseline = Import-P1ProductionSecurityBaseline -Path $securityPath -ExpectedSha256 $securitySha256
Assert-True 'security evidence schema version is exact' `
    ($baseline.schemaVersion -ceq 'openday-production-security-baseline/v1')
Assert-True 'security evidence binds application main' `
    ($baseline.applicationMainCommit -ceq $manifest.applicationMainCommit)
Assert-True 'security evidence has exact table ACL objects' `
    ((@($baseline.tables | ForEach-Object { $_.name }) -join ',') -ceq 'templates,projects,project_gantt_tasks,write_command_requests')
Assert-True 'table ACL row cardinalities preserve owner output' `
    ((@($baseline.tables | ForEach-Object { @($_.aclRows).Count }) -join ',') -ceq '21,21,21,16')
Assert-True 'sequence ACL row cardinalities preserve owner output' `
    ((@($baseline.sequences | ForEach-Object { @($_.aclRows).Count }) -join ',') -ceq '7,7,6')
Assert-True 'function ACL row cardinalities preserve owner output' `
    ((@($baseline.functions | ForEach-Object { @($_.aclRows).Count }) -join ',') -ceq '3,3')
Assert-True 'no PUBLIC or anon direct ACL rows were returned' `
    (@($baseline.tables.aclRows + $baseline.sequences.aclRows + $baseline.functions.aclRows | Where-Object { $_.grantee -in @('PUBLIC','anon') }).Count -eq 0)
Assert-True 'templates RLS enabled/forced state is preserved' `
    (($baseline.tables | Where-Object name -eq 'templates').rls.enabled -eq $true -and
     ($baseline.tables | Where-Object name -eq 'templates').rls.forced -eq $false)
Assert-True 'write_command_requests zero-policy evidence is preserved' `
    (@(($baseline.tables | Where-Object name -eq 'write_command_requests').policies).Count -eq 0)

$defaultGrantors = @($baseline.defaultPrivileges | ForEach-Object { $_.grantor_role } | Sort-Object -Unique)
Assert-True 'default ACL evidence includes both exact grantors' `
    (($defaultGrantors -join ',') -ceq 'postgres,supabase_admin')
foreach ($grantor in @('postgres','supabase_admin')) {
    $entries = @($baseline.defaultPrivileges | Where-Object grantor_role -eq $grantor)
    Assert-True "$grantor has exact r/S/f default ACL rows" `
        ($entries.Count -eq 3 -and
         @($entries | Where-Object defaclobjtype -ceq 'r').Count -eq 1 -and
         @($entries | Where-Object defaclobjtype -ceq 'S').Count -eq 1 -and
         @($entries | Where-Object defaclobjtype -ceq 'f').Count -eq 1)
    foreach ($entry in $entries) {
        $reconstructed = '{' + (@($entry.aclItems | ForEach-Object { "$($_.grantee)=$($_.privileges)/$($_.grantor)" }) -join ',') + '}'
        Assert-True "$grantor $($entry.defaclobjtype) raw ACL array is losslessly preserved" `
            ($reconstructed -ceq $entry.defaclacl)
    }
}

$hydration = New-P1ProductionSecurityStateHydrationScript -Baseline $baseline
Assert-True 'P1 hydration is deterministic' (Test-P1ProductionSecurityHydrationDeterministic -Baseline $baseline)
foreach ($grantor in @('postgres','supabase_admin')) {
    Assert-True "$grantor table defaults are hydrated" `
        ($hydration -match "ALTER DEFAULT PRIVILEGES FOR ROLE $grantor IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO anon;")
    Assert-True "$grantor sequence defaults are hydrated" `
        ($hydration -match "ALTER DEFAULT PRIVILEGES FOR ROLE $grantor IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO authenticated;")
    Assert-True "$grantor function defaults are hydrated" `
        ($hydration -match "ALTER DEFAULT PRIVILEGES FOR ROLE $grantor IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;")
}
Assert-True 'hydration SQL has no connection or execution primitive' `
    ($hydration -notmatch '(?i)postgresql://|PRODUCTION_DB_URL|PGPASSWORD|docker|psql')

$securityText = Get-Content -LiteralPath $securityPath -Raw
Assert-True 'security artifact contains no credential or personal-data field' `
    ($securityText -notmatch '(?i)password|databaseUrl|apiKey|jwt|email|phone|raw_user_meta_data')
Assert-Throws 'wrong security evidence hash fails closed' {
    Import-P1ProductionSecurityBaseline -Path $securityPath -ExpectedSha256 ('0' * 64) | Out-Null
} 'SHA-256 mismatch'

. $bindingPath
$head = (& git -C $repoRoot rev-parse HEAD).Trim().ToLowerInvariant()
$manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$backupScriptSha256 = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
$binding = Resolve-BackupReleaseBinding -RepoRoot $repoRoot -CanonicalScriptPath $backupPath `
    -SourceCommit $head -ReleaseManifestPath $manifestPath `
    -ExpectedReleaseManifestSha256 $manifestSha256 -ExpectedBackupScriptSha256 $backupScriptSha256
Assert-True 'backup accepts P1 manifest as opaque in-repository path/hash binding' `
    ($binding.releaseManifestPath -ceq 'scripts/manifests/p1-mixed-state-reconciliation.psd1' -and
     $binding.releaseManifestSha256 -ceq $manifestSha256)

$syntheticBackupManifest = [pscustomobject]@{
    status = 'DUMP_CREATED_STATIC_VALIDATION_PASS_RELEASE_BOUND'
    sourceCommit = $head
    releaseManifestSha256 = $manifestSha256
    manifestSha256 = $manifestSha256
    scriptSha256 = $backupScriptSha256
    backupScriptPath = 'scripts/production-backup.ps1'
}
Assert-True 'restore binding accepts the exact P1 manifest hash' `
    (Assert-BackupManifestReleaseBinding -Manifest $syntheticBackupManifest `
        -ExpectedSourceCommit $head -ExpectedReleaseManifestSha256 $manifestSha256 `
        -ExpectedBackupScriptSha256 $backupScriptSha256)

$backupText = Get-Content -LiteralPath $backupPath -Raw
$restoreText = Get-Content -LiteralPath $restorePath -Raw
Assert-True 'backup records opaque manifest relative path and hash' `
    ($backupText -match 'releaseManifestPath = \$releaseBinding\.releaseManifestPath' -and
     $backupText -match 'releaseManifestSha256 = \$releaseBinding\.releaseManifestSha256')
Assert-True 'restore verifies exact manifest hash without Snag List semantics' `
    ($restoreText -match 'ExpectedReleaseManifestSha256' -and $restoreText -notmatch 'snag-list-030-035')

Write-Host "TOTAL: $script:passed passed, $script:failed failed"
if ($script:failed -gt 0) { exit 1 }
