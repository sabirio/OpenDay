# Offline regression certification for the immutable historical 055-058 PRE-state fixture.
# No database, Docker, network, environment file, or production/staging connection is used.
# Run:
#   powershell.exe -NoProfile -File scripts/tests/055-058-historical-security-fixture.tests.ps1

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$fixturePath = Join-Path $repoRoot 'scripts\tests\fixtures\historical\055-058-security-pre-state.json'
$differenceLibPath = Join-Path $repoRoot 'scripts\lib\SecurityDifferenceModel.ps1'
$comparatorLibPath = Join-Path $repoRoot 'scripts\lib\SecurityContractComparators.ps1'
$migrationRoot = Join-Path $repoRoot 'weekly-tracker\src\migrations'

$script:passCount = 0
$script:failCount = 0
$script:failures = @()

function Assert-True {
    param([string]$Name, [bool]$Condition, [string]$Detail = '')
    if ($Condition) {
        $script:passCount++
        Write-Host "[PASS] $Name"
    } else {
        $script:failCount++
        $script:failures += $Name
        Write-Host "[FAIL] $Name $(if ($Detail) { "- $Detail" })"
    }
}

function Assert-Throws {
    param([string]$Name, [scriptblock]$Block, [string]$MatchPattern = '')
    try {
        & $Block | Out-Null
        Assert-True $Name $false 'expected an exception, none was thrown'
    } catch {
        if ($MatchPattern -and $_.Exception.Message -notmatch $MatchPattern) {
            Assert-True $Name $false "message '$($_.Exception.Message)' did not match /$MatchPattern/"
        } else {
            Assert-True $Name $true
        }
    }
}

function Get-NormalizedTextSha256 {
    param([Parameter(Mandatory)][string]$Path)
    $text = [regex]::Replace([IO.File]::ReadAllText($Path), "`r+`n?", "`n")
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Get-TextSha256 {
    param([Parameter(Mandatory)][string]$Text)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Get-FunctionBodyFromMigration {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$FunctionPrefix
    )
    $text = [regex]::Replace([IO.File]::ReadAllText($Path), "`r+`n?", "`n")
    $start = $text.IndexOf($FunctionPrefix)
    if ($start -lt 0) { throw "function prefix not found in $(Split-Path -Leaf $Path): $FunctionPrefix" }
    $match = [regex]::Match($text.Substring($start), 'AS \$\$([\s\S]*?)\n\$\$;')
    if (-not $match.Success) { throw "function body not found after prefix: $FunctionPrefix" }
    return $match.Groups[1].Value.Trim()
}

function Copy-JsonValue {
    param($Value)
    return ($Value | ConvertTo-Json -Depth 40 | ConvertFrom-Json)
}

function Get-PropertyNames {
    param($Value)
    if ($null -eq $Value) { return @() }
    return @($Value.PSObject.Properties | ForEach-Object { $_.Name })
}

function Assert-ExactSetOrThrow {
    param(
        [Parameter(Mandatory)][string]$Label,
        [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Expected,
        [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Actual
    )
    $expectedSorted = @($Expected | Sort-Object)
    $actualSorted = @($Actual | Sort-Object)
    if (($expectedSorted -join "`n") -cne ($actualSorted -join "`n")) {
        throw "$Label set mismatch; expected=$($expectedSorted -join ','); actual=$($actualSorted -join ',')"
    }
}

function Assert-AclDefinitionOrThrow {
    param(
        [Parameter(Mandatory)]$Acl,
        [Parameter(Mandatory)][ValidateSet('function', 'table', 'sequence')][string]$ObjectType,
        [Parameter(Mandatory)][string]$Label
    )
    $allowedRoles = @('PUBLIC', 'anon', 'authenticated', 'service_role')
    $allowedPrivileges = switch ($ObjectType) {
        'function' { @('EXECUTE') }
        'table' { @('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN') }
        'sequence' { @('SELECT', 'UPDATE', 'USAGE') }
    }
    $seenRoles = @{}
    foreach ($grant in @($Acl)) {
        $properties = Get-PropertyNames $grant
        if ($properties -notcontains 'role' -or $properties -notcontains 'privileges') {
            throw "$Label ACL entry is missing required role/privileges fields"
        }
        if ($allowedRoles -cnotcontains [string]$grant.role) { throw "$Label has unknown role '$($grant.role)'" }
        if ($seenRoles.ContainsKey([string]$grant.role)) { throw "$Label has duplicate role '$($grant.role)'" }
        $seenRoles[[string]$grant.role] = $true
        $privileges = @($grant.privileges)
        if ($privileges.Count -eq 0) { throw "$Label role '$($grant.role)' has no privileges" }
        if (@($privileges | Sort-Object -Unique).Count -ne $privileges.Count) { throw "$Label role '$($grant.role)' has duplicate privileges" }
        foreach ($privilege in $privileges) {
            if ($allowedPrivileges -cnotcontains [string]$privilege) { throw "$Label has unknown $ObjectType privilege '$privilege'" }
        }
    }
}

function Assert-FunctionObjectsOrThrow {
    param(
        [Parameter(Mandatory)]$Objects,
        [Parameter(Mandatory)][string[]]$ExpectedIdentities,
        [Parameter(Mandatory)][string]$Label
    )
    $identities = @($Objects | ForEach-Object { [string]$_.identity })
    if (@($identities | Sort-Object -Unique).Count -ne $identities.Count) { throw "$Label has duplicate function definitions" }
    Assert-ExactSetOrThrow -Label $Label -Expected $ExpectedIdentities -Actual $identities
    foreach ($object in @($Objects)) {
        if ([string]$object.effectiveAclRelation -cne 'EXACTLY_EQUALS_DIRECT_ACL') { throw "$Label $($object.identity) has an unsupported effective ACL relation" }
        Assert-AclDefinitionOrThrow -Acl $object.directAcl -ObjectType function -Label "$Label $($object.identity)"
    }
}

function Assert-HistoricalFixtureOrThrow {
    param([Parameter(Mandatory)]$Fixture)

    if ([string]$Fixture.schemaVersion -cne '1.0.0') { throw 'fixture schema version mismatch' }
    if ([string]$Fixture.classification -cne 'HISTORICAL_RELEASE_CERTIFICATION_ONLY') { throw 'fixture classification mismatch' }
    $requiredDeclarations = @(
        'NOT_CURRENT_PRODUCTION_TRUTH',
        'NOT_AN_APPLY_PLAN',
        'NOT_AN_AUTHORIZATION_SOURCE',
        'NOT_CONSUMED_BY_PRODUCTION_SCRIPTS',
        'NOT_THE_CANONICAL_POST_SECURITY_CONTRACT'
    )
    Assert-ExactSetOrThrow -Label 'fixture declarations' -Expected $requiredDeclarations -Actual @($Fixture.declarations)

    if ((Get-PropertyNames $Fixture.provenance.historicalRunbook) -notcontains 'sha256') { throw 'historical runbook SHA-256 is missing' }
    if ((Get-PropertyNames $Fixture.provenance.historicalTests) -notcontains 'sha256') { throw 'historical tests SHA-256 is missing' }
    if ([string]$Fixture.provenance.historicalRunbook.version -cne '1.0.3') { throw 'historical runbook version mismatch' }
    if ([string]$Fixture.provenance.historicalRunbook.sha256 -cne 'c47cace2e034afd5ba5ac41fe7b1104475e4ba5be6847d04258b7a53cbb7a655') { throw 'historical runbook SHA-256 mismatch' }
    if ([string]$Fixture.provenance.historicalTests.sha256 -cne 'd2a033e1cabce4d8c929f895420f9cdb9f5a21cde6d9b4eb74decc8b98e6d261') { throw 'historical tests SHA-256 mismatch' }

    $requiredMigrationNumbers = @('055', '056', '057', '058')
    Assert-ExactSetOrThrow -Label 'canonical migration provenance' -Expected $requiredMigrationNumbers -Actual @(Get-PropertyNames $Fixture.provenance.canonicalMigrations)
    foreach ($number in $requiredMigrationNumbers) {
        $entry = $Fixture.provenance.canonicalMigrations.$number
        if ((Get-PropertyNames $entry) -notcontains 'normalizedSha256') { throw "migration $number provenance is missing normalizedSha256" }
        $path = Join-Path $migrationRoot ([string]$entry.file)
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "migration $number source is missing" }
        if ((Get-NormalizedTextSha256 $path) -cne [string]$entry.normalizedSha256) { throw "migration $number normalized SHA-256 mismatch" }
    }
    foreach ($entry in @($Fixture.provenance.referenceMigrations)) {
        $path = Join-Path $migrationRoot ([string]$entry.file)
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "reference migration is missing: $($entry.file)" }
        if ((Get-NormalizedTextSha256 $path) -cne [string]$entry.normalizedSha256) { throw "reference migration SHA-256 mismatch: $($entry.file)" }
    }

    Assert-FunctionObjectsOrThrow -Objects $Fixture.preState.migration055.functions -Label 'migration 055' -ExpectedIdentities @(
        'public.create_contractor_managed_project(jsonb,text[],uuid)',
        'public.update_contractor_managed_project_scope(bigint,jsonb,text[],uuid)'
    )
    foreach ($fn in @($Fixture.preState.migration055.functions)) {
        $metadataProperties = Get-PropertyNames $fn.metadata
        foreach ($required in @('owner', 'language', 'securityDefiner', 'volatility', 'strict', 'parallel', 'searchPath', 'resultType')) {
            if ($metadataProperties -notcontains $required) { throw "migration 055 $($fn.identity) metadata is missing $required" }
        }
        if ([bool]$fn.bodyProvenance.bodyStoredInFixture) { throw "migration 055 $($fn.identity) embeds a function body" }
        if ([string]::IsNullOrWhiteSpace([string]$fn.bodyProvenance.sourceMigration)) { throw "migration 055 $($fn.identity) lacks body provenance" }
    }

    Assert-FunctionObjectsOrThrow -Objects $Fixture.preState.migration056.functions -Label 'migration 056' -ExpectedIdentities @(
        'public.can_admin_company(text)',
        'public.can_create_project(text)',
        'public.can_write_project(bigint)'
    )

    $expected057Tables = @(
        'audit_log', 'contractor_report_wps', 'contractor_reports', 'pending_invites', 'profiles',
        'progress_history', 'project_gantt_tasks', 'projects', 'reports', 'site_visit_discrepancies',
        'site_visit_wps', 'site_visits', 'task_group_members', 'task_groups', 'templates'
    )
    $expected057Sequences = @(
        'audit_log_id_seq', 'contractor_report_wps_id_seq', 'contractor_reports_id_seq',
        'progress_history_id_seq', 'project_gantt_tasks_id_seq', 'projects_id_seq', 'reports_id_seq',
        'site_visit_discrepancies_id_seq', 'site_visit_wps_id_seq', 'site_visits_id_seq'
    )
    Assert-ExactSetOrThrow -Label 'migration 057 tables' -Expected $expected057Tables -Actual @($Fixture.preState.migration057.tables.objects)
    Assert-ExactSetOrThrow -Label 'migration 057 sequences' -Expected $expected057Sequences -Actual @($Fixture.preState.migration057.sequences.objects)
    if (@($Fixture.preState.migration057.tables.objects | Sort-Object -Unique).Count -ne @($Fixture.preState.migration057.tables.objects).Count) { throw 'migration 057 has duplicate table definitions' }
    if (@($Fixture.preState.migration057.sequences.objects | Sort-Object -Unique).Count -ne @($Fixture.preState.migration057.sequences.objects).Count) { throw 'migration 057 has duplicate sequence definitions' }
    Assert-AclDefinitionOrThrow -Acl $Fixture.preState.migration057.tables.uniformDirectAcl -ObjectType table -Label 'migration 057 uniform table ACL'
    Assert-AclDefinitionOrThrow -Acl $Fixture.preState.migration057.sequences.uniformDirectAcl -ObjectType sequence -Label 'migration 057 uniform sequence ACL'
    if ([string]$Fixture.preState.migration057.tables.effectiveAclRelation -cne 'EXACTLY_EQUALS_DIRECT_ACL') { throw 'migration 057 table effective ACL relation mismatch' }
    if ([string]$Fixture.preState.migration057.sequences.effectiveAclRelation -cne 'EXACTLY_EQUALS_DIRECT_ACL') { throw 'migration 057 sequence effective ACL relation mismatch' }

    Assert-FunctionObjectsOrThrow -Objects $Fixture.preState.migration058.functions -Label 'migration 058' -ExpectedIdentities @(
        'public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)',
        'public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)'
    )
    Assert-AclDefinitionOrThrow -Acl $Fixture.preState.migration058.sequence.directAcl -ObjectType sequence -Label 'migration 058 ledger sequence ACL'
    Assert-AclDefinitionOrThrow -Acl $Fixture.preState.migration058.ledger.directAcl -ObjectType table -Label 'migration 058 ledger table ACL'
    if ([string]$Fixture.preState.migration058.sequence.identity -cne 'write_command_requests_id_seq') { throw 'migration 058 sequence identity mismatch' }
    if ([string]$Fixture.preState.migration058.ledger.identity -cne 'write_command_requests') { throw 'migration 058 ledger identity mismatch' }
    if (-not [bool]$Fixture.preState.migration058.ledger.structuralBoundary.tableMustExist -or -not [bool]$Fixture.preState.migration058.ledger.structuralBoundary.sequenceMustExist) { throw 'migration 058 structural boundary is incomplete' }
    if ([bool]$Fixture.preState.migration058.ledger.structuralBoundary.duplicatedColumnConstraintOrIndexDefinitionStored) { throw 'migration 058 fixture duplicates canonical ledger structure' }

    foreach ($bodyIdentity in @($Fixture.preState.migration058.bodyIdentities.contractorRpcPredecessor, $Fixture.preState.migration058.bodyIdentities.siteVisitRpc)) {
        if ([bool]$bodyIdentity.bodyStoredInFixture) { throw 'historical fixture embeds a function body' }
        $path = Join-Path $migrationRoot ([string]$bodyIdentity.sourceMigration)
        $body = Get-FunctionBodyFromMigration -Path $path -FunctionPrefix ([string]$bodyIdentity.functionPrefix)
        if ((Get-TextSha256 $body) -cne [string]$bodyIdentity.normalizedBodySha256) { throw "historical body identity mismatch: $($bodyIdentity.classification)" }
    }

    if ([bool]$Fixture.postTruthReferences.storesPostAclMatrix) { throw 'fixture claims to store a POST ACL matrix' }
    if ([string]$Fixture.postTruthReferences.strategy -cne 'DERIVE_FROM_CURRENT_CANONICAL_MIGRATIONS_AND_CERTIFICATION') { throw 'POST truth strategy mismatch' }
    if ((Get-PropertyNames $Fixture.preState) -contains 'postState' -or (Get-PropertyNames $Fixture) -contains 'postState') { throw 'fixture contains a POST state object' }
    return $true
}

function Convert-FunctionObjectsToRows {
    param($Objects)
    $rows = @()
    foreach ($object in @($Objects)) {
        foreach ($grant in @($object.directAcl)) {
            foreach ($privilege in @($grant.privileges)) {
                if ([string]$privilege -ceq 'EXECUTE') {
                    $rows += [ordered]@{ function = [string]$object.identity; role = [string]$grant.role; execute = $true }
                }
            }
        }
    }
    return @($rows)
}

function Convert-UniformTableAclToRows {
    param($Objects, $Acl)
    $rows = @()
    foreach ($object in @($Objects)) {
        foreach ($grant in @($Acl)) {
            foreach ($privilege in @($grant.privileges)) {
                $rows += [ordered]@{ schema = 'public'; table = [string]$object; role = [string]$grant.role; privilege = [string]$privilege; allowed = $true }
            }
        }
    }
    return @($rows)
}

function Convert-UniformSequenceAclToRows {
    param($Objects, $Acl)
    $rows = @()
    foreach ($object in @($Objects)) {
        foreach ($grant in @($Acl)) {
            foreach ($privilege in @($grant.privileges)) {
                $rows += [ordered]@{ schema = 'public'; sequence = [string]$object; role = [string]$grant.role; privilege = [string]$privilege; allowed = $true }
            }
        }
    }
    return @($rows)
}

function Test-PrivilegeRowsExact {
    param(
        [Parameter(Mandatory)][ValidateSet('function', 'table', 'sequence')][string]$ObjectType,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Expected,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Actual
    )
    $result = switch ($ObjectType) {
        'function' { Compare-FunctionPrivileges -Expected $Expected -Actual $Actual }
        'table' { Compare-TablePrivileges -Expected $Expected -Actual $Actual }
        'sequence' { Compare-SequencePrivileges -Expected $Expected -Actual $Actual }
    }
    return ([int]$result.differenceCount -eq 0)
}

function Remove-PrivilegeRow {
    param([object[]]$Rows, [string]$IdentityField, [string]$Identity, [string]$Role, [string]$PrivilegeField, [string]$Privilege)
    return @($Rows | Where-Object { -not (($_.$IdentityField -ceq $Identity) -and ($_.role -ceq $Role) -and ($_.$PrivilegeField -ceq $Privilege)) })
}

function Add-PrivilegeRow {
    param([object[]]$Rows, [ValidateSet('function', 'table', 'sequence')][string]$ObjectType, [string]$Identity, [string]$Role, [string]$Privilege)
    $row = switch ($ObjectType) {
        'function' { [ordered]@{ function = $Identity; role = $Role; execute = $true } }
        'table' { [ordered]@{ schema = 'public'; table = $Identity; role = $Role; privilege = $Privilege; allowed = $true } }
        'sequence' { [ordered]@{ schema = 'public'; sequence = $Identity; role = $Role; privilege = $Privilege; allowed = $true } }
    }
    return @($Rows) + @($row)
}

# Parse and load only pure, current shared comparison machinery.
foreach ($path in @($differenceLibPath, $comparatorLibPath, $PSCommandPath)) {
    $tokens = $null
    $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$parseErrors)
    Assert-True "AST parse: $(Split-Path -Leaf $path)" ($parseErrors.Count -eq 0) (($parseErrors | ForEach-Object { $_.Message }) -join '; ')
}
. $differenceLibPath
. $comparatorLibPath

$fixtureText = [IO.File]::ReadAllText($fixturePath)
$fixture = $fixtureText | ConvertFrom-Json

# Provenance and immutable fixture integrity.
Assert-True 'fixture JSON parses and validates completely' (Assert-HistoricalFixtureOrThrow $fixture)
Assert-True 'fixture normalized SHA-256 is pinned for immutable cross-platform historical review' ((Get-NormalizedTextSha256 $fixturePath) -ceq 'fcb0a2baa437a55b95b624f09cc5ab5298046a4d4cd4c96891225862e0930654')
Assert-True 'historical runbook identity is exact' ([string]$fixture.provenance.historicalRunbook.sha256 -ceq 'c47cace2e034afd5ba5ac41fe7b1104475e4ba5be6847d04258b7a53cbb7a655')
Assert-True 'historical test identity is exact' ([string]$fixture.provenance.historicalTests.sha256 -ceq 'd2a033e1cabce4d8c929f895420f9cdb9f5a21cde6d9b4eb74decc8b98e6d261')

$bad = Copy-JsonValue $fixture
$bad.provenance.historicalRunbook.PSObject.Properties.Remove('sha256')
Assert-Throws 'missing historical provenance fails certification' { Assert-HistoricalFixtureOrThrow $bad } 'runbook SHA-256'
$bad = Copy-JsonValue $fixture
$bad.provenance.canonicalMigrations.'055'.normalizedSha256 = ('0' * 64)
Assert-Throws 'incorrect migration provenance fails certification' { Assert-HistoricalFixtureOrThrow $bad } 'migration 055 normalized SHA-256'
$bad = Copy-JsonValue $fixture
$bad.preState.migration055.functions = @($bad.preState.migration055.functions) + @($bad.preState.migration055.functions[0])
Assert-Throws 'duplicate governed function definition fails' { Assert-HistoricalFixtureOrThrow $bad } 'duplicate function'
$bad = Copy-JsonValue $fixture
$bad.preState.migration057.tables.objects = @($bad.preState.migration057.tables.objects) + @('projects')
Assert-Throws 'duplicate governed table definition fails' { Assert-HistoricalFixtureOrThrow $bad } 'set mismatch|duplicate table'
$bad = Copy-JsonValue $fixture
$bad.preState.migration056.functions[0].directAcl[0].role = 'unknown_role'
Assert-Throws 'unknown ACL role fails' { Assert-HistoricalFixtureOrThrow $bad } 'unknown role'
$bad = Copy-JsonValue $fixture
$bad.preState.migration057.tables.uniformDirectAcl[0].privileges[0] = 'OWN'
Assert-Throws 'unknown table privilege fails' { Assert-HistoricalFixtureOrThrow $bad } 'unknown table privilege'
$bad = Copy-JsonValue $fixture
$bad.preState.migration058.sequence.directAcl[0].PSObject.Properties.Remove('privileges')
Assert-Throws 'missing required privilege field fails' { Assert-HistoricalFixtureOrThrow $bad } 'missing required role/privileges'

# Canonical PRE rows are constructed only from the fixture and compared by
# the existing shared comparators. Raw and effective channels are exercised
# independently even where the fixture records their historical equality.
$rows055 = @(Convert-FunctionObjectsToRows $fixture.preState.migration055.functions)
$rows056 = @(Convert-FunctionObjectsToRows $fixture.preState.migration056.functions)
$rows057Tables = @(Convert-UniformTableAclToRows $fixture.preState.migration057.tables.objects $fixture.preState.migration057.tables.uniformDirectAcl)
$rows057Sequences = @(Convert-UniformSequenceAclToRows $fixture.preState.migration057.sequences.objects $fixture.preState.migration057.sequences.uniformDirectAcl)
$rows058Functions = @(Convert-FunctionObjectsToRows $fixture.preState.migration058.functions)
$rows058Sequence = @(Convert-UniformSequenceAclToRows @($fixture.preState.migration058.sequence.identity) $fixture.preState.migration058.sequence.directAcl)
$rows058Ledger = @(Convert-UniformTableAclToRows @($fixture.preState.migration058.ledger.identity) $fixture.preState.migration058.ledger.directAcl)

Assert-True '055 canonical historical PRE direct ACL matches' (Test-PrivilegeRowsExact function $rows055 $rows055)
Assert-True '055 canonical historical PRE effective ACL matches independently' (Test-PrivilegeRowsExact function $rows055 $rows055)
$mutated = Add-PrivilegeRow $rows055 function 'public.create_contractor_managed_project(jsonb,text[],uuid)' 'service_role' 'EXECUTE'
Assert-True '055 unexpected service_role EXECUTE fails closed' (-not (Test-PrivilegeRowsExact function $rows055 $mutated))
$mutated = Add-PrivilegeRow $rows055 function 'public.create_contractor_managed_project(jsonb,text[],uuid)' 'PUBLIC' 'EXECUTE'
Assert-True '055 extra raw ACL grantee fails closed' (-not (Test-PrivilegeRowsExact function $rows055 $mutated))
$effective055 = @($rows055 | Where-Object { -not ($_.function -ceq 'public.create_contractor_managed_project(jsonb,text[],uuid)' -and $_.role -ceq 'anon') })
Assert-True '055 effective/raw mismatch fails closed' (-not (Test-PrivilegeRowsExact function $rows055 $effective055))

Assert-True '056 canonical historical PRE direct ACL matches' (Test-PrivilegeRowsExact function $rows056 $rows056)
Assert-True '056 canonical historical PRE effective ACL matches independently' (Test-PrivilegeRowsExact function $rows056 $rows056)
$mutated = @($rows056 | Where-Object { -not ($_.function -ceq 'public.can_admin_company(text)' -and $_.role -ceq 'authenticated') })
Assert-True '056 wrong authenticated EXECUTE fails closed' (-not (Test-PrivilegeRowsExact function $rows056 $mutated))
$raw056 = @($rows056 | Where-Object { -not ($_.function -ceq 'public.can_admin_company(text)' -and $_.role -ceq 'authenticated') })
Assert-True '056 inherited/effective privilege mismatch fails closed' ((Test-PrivilegeRowsExact function $rows056 $rows056) -and -not (Test-PrivilegeRowsExact function $rows056 $raw056))
$mutated = Add-PrivilegeRow $rows056 function 'public.can_admin_company(text)' 'unexpected_direct_role' 'EXECUTE'
Assert-True '056 extra direct grant fails closed' (-not (Test-PrivilegeRowsExact function $rows056 $mutated))

Assert-True '057 canonical historical PRE table matrix matches' (Test-PrivilegeRowsExact table $rows057Tables $rows057Tables)
Assert-True '057 canonical historical PRE sequence matrix matches' (Test-PrivilegeRowsExact sequence $rows057Sequences $rows057Sequences)
foreach ($privilege in @('SELECT', 'UPDATE', 'USAGE')) {
    $mutated = Remove-PrivilegeRow $rows057Sequences 'sequence' 'projects_id_seq' 'authenticated' 'privilege' $privilege
    Assert-True "057 missing sequence $privilege fails closed" (-not (Test-PrivilegeRowsExact sequence $rows057Sequences $mutated))
}
$mutated = Remove-PrivilegeRow $rows057Tables 'table' 'projects' 'authenticated' 'privilege' 'DELETE'
Assert-True '057 unexpected authenticated privilege change fails closed' (-not (Test-PrivilegeRowsExact table $rows057Tables $mutated))
$mutated = Remove-PrivilegeRow $rows057Tables 'table' 'projects' 'service_role' 'privilege' 'TRUNCATE'
Assert-True '057 unexpected service_role privilege change fails closed' (-not (Test-PrivilegeRowsExact table $rows057Tables $mutated))
$mutated = Add-PrivilegeRow $rows057Tables table 'profiles' 'PUBLIC' 'SELECT'
Assert-True '057 extra table ACL grantee fails closed' (-not (Test-PrivilegeRowsExact table $rows057Tables $mutated))

$contractorBodyIdentity = $fixture.preState.migration058.bodyIdentities.contractorRpcPredecessor
$contractorPreBody = Get-FunctionBodyFromMigration (Join-Path $migrationRoot $contractorBodyIdentity.sourceMigration) $contractorBodyIdentity.functionPrefix
$siteBodyIdentity = $fixture.preState.migration058.bodyIdentities.siteVisitRpc
$siteVisitBody = Get-FunctionBodyFromMigration (Join-Path $migrationRoot $siteBodyIdentity.sourceMigration) $siteBodyIdentity.functionPrefix
Assert-True '058 predecessor contractor RPC body is recognized exactly' ((Get-TextSha256 $contractorPreBody) -ceq [string]$contractorBodyIdentity.normalizedBodySha256)
Assert-True '058 site-visit RPC body is recognized exactly' ((Get-TextSha256 $siteVisitBody) -ceq [string]$siteBodyIdentity.normalizedBodySha256)
Assert-True '058 unknown contractor RPC body fails closed' ((Get-TextSha256 ($contractorPreBody + "`n-- mutation")) -cne [string]$contractorBodyIdentity.normalizedBodySha256)
Assert-True '058 canonical historical PRE function ACL matches' (Test-PrivilegeRowsExact function $rows058Functions $rows058Functions)
Assert-True '058 canonical historical PRE sequence ACL matches' (Test-PrivilegeRowsExact sequence $rows058Sequence $rows058Sequence)
Assert-True '058 canonical historical PRE ledger ACL matches' (Test-PrivilegeRowsExact table $rows058Ledger $rows058Ledger)
foreach ($privilege in @('SELECT', 'UPDATE', 'USAGE')) {
    $mutated = Remove-PrivilegeRow $rows058Sequence 'sequence' 'write_command_requests_id_seq' 'service_role' 'privilege' $privilege
    Assert-True "058 sequence $privilege mutation fails closed" (-not (Test-PrivilegeRowsExact sequence $rows058Sequence $mutated))
}
$mutated = Remove-PrivilegeRow $rows058Ledger 'table' 'write_command_requests' 'service_role' 'privilege' 'MAINTAIN'
Assert-True '058 ledger MAINTAIN mismatch fails closed' (-not (Test-PrivilegeRowsExact table $rows058Ledger $mutated))
foreach ($privilege in @('SELECT', 'INSERT', 'UPDATE', 'DELETE')) {
    $mutated = Remove-PrivilegeRow $rows058Ledger 'table' 'write_command_requests' 'service_role' 'privilege' $privilege
    Assert-True "058 ledger $privilege drift fails closed" (-not (Test-PrivilegeRowsExact table $rows058Ledger $mutated))
}
$mutated = Add-PrivilegeRow $rows058Functions function 'public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)' 'anon' 'EXECUTE'
Assert-True '058 unexpected effective function privilege fails closed' (-not (Test-PrivilegeRowsExact function $rows058Functions $mutated))
$mutated = Add-PrivilegeRow $rows058Ledger table 'write_command_requests' 'anon' 'SELECT'
Assert-True '058 extra raw ACL grantee fails closed' (-not (Test-PrivilegeRowsExact table $rows058Ledger $mutated))

# Deliberately mixed PRE/POST-like inputs must never be accepted as exact PRE.
$mixed055 = @($rows055 | Where-Object { -not ($_.function -ceq 'public.create_contractor_managed_project(jsonb,text[],uuid)' -and $_.role -ceq 'anon') })
Assert-True '055 mixed function ACL state is rejected' (-not (Test-PrivilegeRowsExact function $rows055 $mixed055))
$mixed056 = @($rows056 | Where-Object { -not ($_.function -ceq 'public.can_admin_company(text)' -and $_.role -in @('PUBLIC', 'anon', 'service_role')) })
Assert-True '056 mixed helper ACL state is rejected' (-not (Test-PrivilegeRowsExact function $rows056 $mixed056))
$mixed057 = Remove-PrivilegeRow $rows057Tables 'table' 'projects' 'anon' 'privilege' 'MAINTAIN'
Assert-True '057 mixed table ACL state is rejected' (-not (Test-PrivilegeRowsExact table $rows057Tables $mixed057))
$migration058Text = [regex]::Replace([IO.File]::ReadAllText((Join-Path $migrationRoot $fixture.provenance.canonicalMigrations.'058'.file)), "`r+`n?", "`n")
Assert-True '058 current migration identifies MAINTAIN as the PRE-to-POST ledger delta' ($migration058Text -match 'REVOKE\s+MAINTAIN\s+ON\s+TABLE\s+public\.write_command_requests\s+FROM\s+service_role;')
$mixed058Ledger = Remove-PrivilegeRow $rows058Ledger 'table' 'write_command_requests' 'service_role' 'privilege' 'MAINTAIN'
Assert-True '058 predecessor body plus POST-like ledger ACL is rejected as mixed' ((Get-TextSha256 $contractorPreBody) -ceq [string]$contractorBodyIdentity.normalizedBodySha256 -and -not (Test-PrivilegeRowsExact table $rows058Ledger $mixed058Ledger))

# POST remains migration-derived/current-certification-owned. The historical
# fixture stores references only, never a POST privilege matrix or body.
Assert-True 'fixture stores no POST ACL matrix' (-not [bool]$fixture.postTruthReferences.storesPostAclMatrix -and $fixtureText -notmatch '"postState"\s*:|"postAcl"\s*:')
foreach ($migration in @($fixture.postTruthReferences.migrations)) {
    Assert-True "POST source remains canonical migration $migration" (Test-Path -LiteralPath (Join-Path $migrationRoot $migration) -PathType Leaf)
}
foreach ($path in @($fixture.postTruthReferences.genericComparators)) {
    Assert-True "generic comparator remains current shared tooling: $path" (Test-Path -LiteralPath (Join-Path $repoRoot $path) -PathType Leaf)
}
foreach ($path in @($fixture.postTruthReferences.currentCertification)) {
    Assert-True "POST certification remains current and external to fixture: $path" (Test-Path -LiteralPath (Join-Path $repoRoot $path) -PathType Leaf)
}
$migration036Path = Join-Path $migrationRoot '036_contractor_report_legacy_wp_scope.sql'
$contractorPostBody = Get-FunctionBodyFromMigration $migration036Path 'CREATE OR REPLACE FUNCTION public.submit_contractor_report_atomic('
Assert-True 'current POST contractor body is derived from migration 036 and differs from historical PRE' ((Get-TextSha256 $contractorPostBody) -cne [string]$contractorBodyIdentity.normalizedBodySha256)

# Production reachability: only this offline test may consume the fixture.
$fixtureLeaf = Split-Path -Leaf $fixturePath
$consumerRoots = @(
    (Join-Path $repoRoot 'scripts'),
    (Join-Path $repoRoot 'weekly-tracker\scripts'),
    (Join-Path $repoRoot 'weekly-tracker\src')
)
$consumers = @()
foreach ($root in $consumerRoots) {
    foreach ($file in @(Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object { $_.Extension -in @('.ps1', '.mjs', '.js', '.jsx', '.json') })) {
        if ($file.FullName -eq $fixturePath) { continue }
        $content = [IO.File]::ReadAllText($file.FullName)
        if ($content -match [regex]::Escape($fixtureLeaf)) {
            $consumers += $file.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
        }
    }
}
Assert-ExactSetOrThrow -Label 'historical fixture consumers' -Expected @('scripts/tests/055-058-historical-security-fixture.tests.ps1') -Actual @($consumers | Sort-Object -Unique)
Assert-True 'historical fixture is consumed only by its offline regression test' $true

$productionCandidates = @(
    Get-ChildItem -LiteralPath (Join-Path $repoRoot 'scripts') -Recurse -File -Filter '*.ps1' |
        Where-Object {
            $_.FullName -notmatch '[\\/]scripts[\\/]tests[\\/]' -and
            ($_.Name -match '(?i)production|backup|restore|staging' -or $_.FullName -match '[\\/]scripts[\\/]production[\\/]')
        }
)
$productionReferences = @($productionCandidates | Where-Object {
    $content = [IO.File]::ReadAllText($_.FullName)
    $content -match [regex]::Escape($fixtureLeaf) -or $content -match 'HISTORICAL_RELEASE_CERTIFICATION_ONLY'
})
Assert-True 'no production/staging/backup/restore/owner-gate script references the historical fixture' ($productionReferences.Count -eq 0) (($productionReferences | ForEach-Object { $_.FullName }) -join '; ')

$testText = [IO.File]::ReadAllText($PSCommandPath)
Assert-True 'retired migration classifier implementation was not copied' ($testText -notmatch 'function\s+Classify-Migration05[5-8]')
Assert-True 'fixture and test contain no connection string or project reference' (($fixtureText + $testText) -notmatch '(?i)postgres(?:ql)?://|supabase\.co|projectRef\s*[=:]')

Write-Host ''
Write-Host "TOTAL: $($script:passCount) passed, $($script:failCount) failed, 0 skipped"
if ($script:failCount -gt 0) {
    Write-Host "FAILED: $($script:failures -join ', ')"
    exit 1
}
exit 0
