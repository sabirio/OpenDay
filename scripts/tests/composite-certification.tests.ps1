# Composite Security Certification - regression suite (algorithm 2.0.0)
# Plain assertion script, same pattern as security-inventory.tests.ps1 /
# restore-verify.tests.ps1 (no Pester dependency). Run:
#   powershell.exe -NoProfile -File scripts/tests/composite-certification.tests.ps1

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$script:passCount = 0
$script:failCount = 0
$script:failures = @()

function Assert-True {
    param([string]$Name, [bool]$Condition, [string]$Detail = '')
    if ($Condition) { $script:passCount++; Write-Host "[PASS] $Name" }
    else { $script:failCount++; $script:failures += $Name; Write-Host "[FAIL] $Name $(if ($Detail) { "- $Detail" })" }
}

function Assert-Throws {
    param([string]$Name, [scriptblock]$Block, [string]$MatchPattern = $null)
    try {
        & $Block
        Assert-True $Name $false 'expected an exception, none was thrown'
    } catch {
        if ($MatchPattern -and $_.Exception.Message -notmatch $MatchPattern) {
            Assert-True $Name $false "threw, but message '$($_.Exception.Message)' did not match /$MatchPattern/"
        } else {
            Assert-True $Name $true
        }
    }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$scriptsRoot = Join-Path $repoRoot 'scripts'
$contractPath = Join-Path $scriptsRoot 'contracts\canonical-security-contract.json'
$exceptionsPath = Join-Path $scriptsRoot 'contracts\accepted-exceptions.json'
$migrationsRoot = Join-Path $repoRoot 'weekly-tracker\src\migrations'
$entrypointPath = Join-Path $scriptsRoot 'composite-security-certification.ps1'

. (Join-Path $scriptsRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $scriptsRoot 'lib\SecurityContractInventory.ps1')
. (Join-Path $scriptsRoot 'lib\MigrationContractExtractor.ps1')
. (Join-Path $scriptsRoot 'lib\SecurityDifferenceModel.ps1')
. (Join-Path $scriptsRoot 'lib\SecurityContractComparators.ps1')
. (Join-Path $scriptsRoot 'lib\CertificationAggregator.ps1')

# ===========================================================================
# 1. AST parse / PS 5.1 compatibility of every new file
# ===========================================================================
foreach ($f in @('lib\MigrationContractExtractor.ps1', 'lib\SecurityDifferenceModel.ps1', 'lib\SecurityContractComparators.ps1', 'lib\CertificationAggregator.ps1', 'composite-security-certification.ps1')) {
    $full = Join-Path $scriptsRoot $f
    $tokens = $null; $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($full, [ref]$tokens, [ref]$errors) | Out-Null
    Assert-True "AST parse: $f" ($errors.Count -eq 0)
    $text = Get-Content -LiteralPath $full -Raw
    Assert-True "$f : no -Encoding utf8NoBOM" ($text -notmatch '-Encoding\s+[''"]?utf8NoBOM')
    Assert-True "$f : no PS7-only ?? operator" ($text -notmatch '(?<!\?)\?\?(?!\?)')
    Assert-True "$f : no PS7-only ?. operator" ($text -notmatch '\?\.')
}

# ===========================================================================
# 2. Contract / exceptions schema validation
# ===========================================================================
$contract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
Assert-True 'canonical contract has schema version 1.0.0' ($contract.contractSchemaVersion -eq '1.0.0')
Assert-True 'canonical contract lists exactly 5 application roles' (@($contract.applicationRoles).Count -eq 5)
Assert-True 'canonical contract roleAttributes has 5 rules (one per role)' (@($contract.roleAttributes.rules).Count -eq 5)
Assert-True 'canonical contract memberships has 7 rules' (@($contract.memberships.rules).Count -eq 7)
Assert-True 'canonical contract postgres role expects superuser=false (Supabase hardening)' (($contract.roleAttributes.rules | Where-Object { $_.role -eq 'postgres' }).superuser -eq $false)
Assert-True 'canonical contract excludes 001-009 historical migrations from the fresh path' (@($contract.canonicalMigrationPath.included) -notcontains '001_initial_schema.sql')
Assert-True 'canonical contract excludes 011_ownership_uuid.sql from the fresh path (confirmed broken-on-fresh by README)' (@($contract.canonicalMigrationPath.included) -notcontains '011_ownership_uuid.sql')
Assert-True 'canonical contract includes 010_rls_by_roles.sql despite its own stale HISTORICAL header' (@($contract.canonicalMigrationPath.included) -contains '010_rls_by_roles.sql')
Assert-True 'canonical contract includes 026_grant_authenticated_table_privileges.sql' (@($contract.canonicalMigrationPath.included) -contains '026_grant_authenticated_table_privileges.sql')

$exceptionsDoc = Get-Content -LiteralPath $exceptionsPath -Raw | ConvertFrom-Json
Assert-True 'accepted-exceptions has schema version 1.0.0' ($exceptionsDoc.exceptionsSchemaVersion -eq '1.0.0')
Assert-True 'accepted-exceptions starts empty' (@($exceptionsDoc.exceptions).Count -eq 0)

# ===========================================================================
# 3. Migration contract extractor
# ===========================================================================
$migrationFiles = Get-CanonicalMigrationFileList -ContractPath $contractPath -MigrationsRoot $migrationsRoot
Assert-True 'Get-CanonicalMigrationFileList resolves 20 files (18 original + 028 production security reconciliation + 029 production ACL followup)' ($migrationFiles.Count -eq 20)
Assert-True 'Get-CanonicalMigrationFileList every resolved file actually exists on disk' (@($migrationFiles | Where-Object { -not (Test-Path -LiteralPath $_.FullPath) }).Count -eq 0)
Assert-Throws 'Get-CanonicalMigrationFileList fails closed on unknown contract schema version' {
    $tmp = Join-Path ([IO.Path]::GetTempPath()) "bad-contract-$([guid]::NewGuid().ToString('N')).json"
    '{"contractSchemaVersion":"9.9.9","canonicalMigrationPath":{"included":["000_baseline.sql"]}}' | Set-Content -LiteralPath $tmp
    try { Get-CanonicalMigrationFileList -ContractPath $tmp -MigrationsRoot $migrationsRoot } finally { Remove-Item -LiteralPath $tmp -Force }
} 'unknown canonical security contract schema version'

Assert-True 'Test-NoOwnershipOrRoleStatementsInMigrations is true for the current repository (contract assumption holds)' (Test-NoOwnershipOrRoleStatementsInMigrations -MigrationsRoot $migrationsRoot)

# Regression: migration 026's exact GRANT scope, reused from SecurityContractInventory.ps1
$m026 = Get-Migration026Targets -MigrationPath (Join-Path $migrationsRoot '026_grant_authenticated_table_privileges.sql')
Assert-True '026 target extraction includes previously-missing site_visit_wps' ($m026.AllTargetTables -contains 'site_visit_wps')
Assert-True '026 target extraction includes previously-missing site_visit_discrepancies' ($m026.AllTargetTables -contains 'site_visit_discrepancies')
Assert-True '026 target extraction includes previously-missing pending_invites' ($m026.AllTargetTables -contains 'pending_invites')
Assert-True '026 target extraction totals exactly 15 tables (14 full-CRUD + audit_log SELECT-only)' (@($m026.AllTargetTables | Select-Object -Unique).Count -eq 15)

# Regression: real composite run against a vanilla postgres:17 container found
# that 000_baseline.sql and 10 of the 18 canonical migrations reference
# auth.uid()/auth.users(id) - a schema this repository's own migrations never
# create (it's Supabase Auth-service-provisioned on a real project). Without
# a stub, the canonical migration chain fails outright on the very first file.
$stubScript = Get-SupabasePlatformSchemaStubScript
Assert-True 'Supabase platform schema stub creates the auth schema' ($stubScript -match '(?i)CREATE SCHEMA IF NOT EXISTS auth')
Assert-True 'Supabase platform schema stub creates auth.users(id) for FK targets (visited_by/submitted_by REFERENCES auth.users(id))' ($stubScript -match '(?i)CREATE TABLE IF NOT EXISTS auth\.users\s*\(id uuid PRIMARY KEY\)')
Assert-True 'Supabase platform schema stub creates auth.uid() returning uuid' ($stubScript -match '(?i)FUNCTION auth\.uid\(\) RETURNS uuid')
$unstubbedReferences = @()
foreach ($mf in $migrationFiles) {
    $text = Get-Content -LiteralPath $mf.FullPath -Raw
    $refs = [regex]::Matches($text, 'auth\.[a-zA-Z_]+') | ForEach-Object { $_.Value } | Select-Object -Unique
    foreach ($r in $refs) { if ($r -ne 'auth.uid' -and $r -ne 'auth.users') { $unstubbedReferences += "$($mf.FileName):$r" } }
}
Assert-True 'every canonical migration file that references auth.* is satisfied by the stub (auth.uid or auth.users only, nothing else)' ($unstubbedReferences.Count -eq 0) ($unstubbedReferences -join ', ')
Assert-True 'entrypoint applies the platform schema stub before the canonical migration chain' (
    (Get-Content -LiteralPath $entrypointPath -Raw) -match '(?s)Get-SupabasePlatformSchemaStubScript.*Invoke-CanonicalMigrationChain'
)

# Regression: real composite run found that 010_rls_by_roles.sql's
# `CREATE POLICY ... TO authenticated` (and every migration after it) fails
# with "role authenticated does not exist" on a vanilla postgres:17
# container, because this repository's migrations never CREATE ROLE for
# anon/authenticated/authenticator/service_role (platform-provisioned on a
# real Supabase project). The role stub must be generated from the contract
# (not hand-duplicated) and applied before the migration chain.
$roleStubScript = Get-SupabasePlatformRoleStubScript -Contract $contract
foreach ($roleName in @('anon', 'authenticated', 'authenticator', 'service_role')) {
    Assert-True "Supabase platform role stub creates role '$roleName'" ($roleStubScript -match "CREATE ROLE $roleName\b")
}
Assert-True 'Supabase platform role stub does not attempt to (re)create postgres (already exists via postgres:17 initdb bootstrap)' ($roleStubScript -notmatch 'CREATE ROLE postgres\b')
Assert-True 'Supabase platform role stub grants exactly the 7 contract memberships' (@([regex]::Matches($roleStubScript, '(?m)^GRANT ')).Count -eq 7)
Assert-True 'entrypoint applies the role stub before the schema stub and before the canonical migration chain' (
    (Get-Content -LiteralPath $entrypointPath -Raw) -match '(?s)Get-SupabasePlatformRoleStubScript.*Get-SupabasePlatformSchemaStubScript.*Invoke-CanonicalMigrationChain'
)

# Regression: real composite run found that 014/017 (both headed "NOT
# applied automatically ... review and run this yourself" - an operational
# manual-review flag, not an exclusion from the canonical security
# contract; README's fresh-install table still lists both as canonical
# steps) fail on a vanilla postgres:17 container with "relation
# storage.buckets does not exist" - the Storage-service schema, like auth,
# is platform-provisioned and never created by this repository.
$storageStubScript = Get-SupabaseStorageSchemaStubScript
Assert-True 'Supabase storage schema stub creates the storage schema' ($storageStubScript -match '(?i)CREATE SCHEMA IF NOT EXISTS storage')
Assert-True 'Supabase storage schema stub creates storage.buckets with the columns 014/017 INSERT into (id, name, public, file_size_limit, allowed_mime_types)' ($storageStubScript -match '(?i)CREATE TABLE IF NOT EXISTS storage\.buckets')
Assert-True 'Supabase storage schema stub creates storage.objects with bucket_id/name/owner (what the RLS policies reference)' ($storageStubScript -match '(?i)CREATE TABLE IF NOT EXISTS storage\.objects')
Assert-True 'Supabase storage schema stub creates storage.foldername()' ($storageStubScript -match '(?i)FUNCTION storage\.foldername\(name text\) RETURNS text\[\]')
Assert-True 'Supabase storage schema stub creates storage.filename()' ($storageStubScript -match '(?i)FUNCTION storage\.filename\(name text\) RETURNS text\b')
Assert-True 'entrypoint applies the storage stub after auth stub and before the canonical migration chain' (
    (Get-Content -LiteralPath $entrypointPath -Raw) -match '(?s)Get-SupabasePlatformSchemaStubScript.*Get-SupabaseStorageSchemaStubScript.*Invoke-CanonicalMigrationChain'
)

# Regression: real composite run found Get-StructuralSchemaEvidence wrapped
# its SQL via New-ReadOnlyCatalogScript itself, then handed that already-
# wrapped text to the $Query callback - which is the SAME callback
# convention used everywhere else (Get-SecurityContractInventory's queryFn,
# the real-psql test in security-inventory.tests.ps1), and that convention
# wraps raw SQL itself. The result was a double-wrap: the second
# New-ReadOnlyCatalogScript call saw literal \set/\pset lines from the first
# wrap and rejected them as psql meta-commands. Get-StructuralSchemaEvidence
# must hand the callback raw SQL, exactly once.
$capturedSql = $null
$echoQuery = { param([string]$sql) $script:capturedSql = $sql; return '' }
Get-StructuralSchemaEvidence -Query $echoQuery -Tables @('projects') | Out-Null
Assert-True 'Get-StructuralSchemaEvidence passes RAW SQL to the query callback (not pre-wrapped)' ($null -ne $script:capturedSql -and $script:capturedSql -notmatch '\\set' -and $script:capturedSql -match '(?i)^SELECT table_name')
$doubleWrapProbe = { param([string]$sql) return (New-ReadOnlyCatalogScript -CatalogQuery $sql) }
try {
    & $doubleWrapProbe $script:capturedSql | Out-Null
    Assert-True 'wrapping Get-StructuralSchemaEvidence''s callback-received SQL exactly once succeeds (proves no pre-wrap remains)' $true
} catch {
    Assert-True 'wrapping Get-StructuralSchemaEvidence''s callback-received SQL exactly once succeeds (proves no pre-wrap remains)' $false $_.Exception.Message
}

# Regression: real composite run found ConvertTo-PlainArray's
# .PSObject.Properties enumeration silently returns the WRONG thing for
# [ordered] hashtable input (Count/Keys/Values/IsReadOnly - the .NET
# dictionary class's own members - never the caller's actual keys like
# "table"/"exists"), because half of the comparator inputs are PSCustomObject
# (from ConvertFrom-Json) and half are already [ordered] hashtables built
# directly by Get-SecurityContractInventory/Get-StructuralSchemaEvidence.
# Every downstream comparator KeyFn (e.g. Compare-StructuralSchema's
# "$r.table") failed with "'table' cannot be found on this object" as a
# result. This must work correctly for BOTH input shapes.
$hashtableInput = @([ordered]@{ table = 'projects'; exists = $true })
$plainFromHashtable = ConvertTo-PlainArray $hashtableInput
Assert-True 'ConvertTo-PlainArray correctly preserves keys from [ordered] hashtable input (not Count/Keys/Values)' (
    $plainFromHashtable.Count -eq 1 -and $plainFromHashtable[0].Contains('table') -and $plainFromHashtable[0]['table'] -eq 'projects' -and -not $plainFromHashtable[0].Contains('Keys')
)
$jsonInput = @('{"table":"projects","exists":true}' | ConvertFrom-Json)
$plainFromJson = ConvertTo-PlainArray $jsonInput
Assert-True 'ConvertTo-PlainArray correctly preserves properties from PSCustomObject (ConvertFrom-Json) input' (
    $plainFromJson.Count -eq 1 -and $plainFromJson[0].Contains('table') -and $plainFromJson[0]['table'] -eq 'projects'
)
Assert-True 'ConvertTo-PlainArray of $null returns an empty array, not $null or a 1-element array' ((ConvertTo-PlainArray $null).Count -eq 0)
$compareResult = Compare-StructuralSchema -Expected $plainFromHashtable -Actual $plainFromHashtable
Assert-True 'Compare-StructuralSchema KeyFn ($r.table) works end-to-end on ConvertTo-PlainArray output from hashtable input' ($compareResult.matchedCount -eq 1 -and $compareResult.differences.Count -eq 0)

# ===========================================================================
# 4. Difference model
# ===========================================================================
Assert-Throws 'New-SecurityDifference rejects an unknown classification' { New-SecurityDifference -Category 'x' -ObjectIdentity 'y' -Classification 'NOT_A_REAL_CLASSIFICATION' -Severity 'LOW' } 'unknown difference classification'
Assert-Throws 'New-SecurityDifference rejects an unknown severity' { New-SecurityDifference -Category 'x' -ObjectIdentity 'y' -Classification 'DEFECT' -Severity 'NOT_A_REAL_SEVERITY' } 'unknown difference severity'
Assert-Throws 'New-SecurityDifference requires AcceptedExceptionId for ACCEPTED_EXCEPTION' { New-SecurityDifference -Category 'x' -ObjectIdentity 'y' -Classification 'ACCEPTED_EXCEPTION' -Severity 'LOW' } 'requires a non-empty AcceptedExceptionId'

$defect = New-SecurityDifference -Category 'x' -ObjectIdentity 'y' -Classification 'DEFECT' -Severity 'HIGH'
Assert-True 'DEFECT always blocks PASS' (Test-DifferenceBlocksPass -Difference $defect)
$stale = New-SecurityDifference -Category 'x' -ObjectIdentity 'y' -Classification 'STALE_EXPECTATION' -Severity 'LOW'
Assert-True 'STALE_EXPECTATION blocks PASS regardless of severity' (Test-DifferenceBlocksPass -Difference $stale)
$envDiff = New-SecurityDifference -Category 'x' -ObjectIdentity 'y' -Classification 'EXPECTED_ENVIRONMENT_DIFFERENCE' -Severity 'CRITICAL'
Assert-True 'EXPECTED_ENVIRONMENT_DIFFERENCE never blocks PASS, even at CRITICAL severity' (-not (Test-DifferenceBlocksPass -Difference $envDiff))
$accepted = New-SecurityDifference -Category 'x' -ObjectIdentity 'y' -Classification 'ACCEPTED_EXCEPTION' -Severity 'HIGH' -AcceptedExceptionId 'EXC-1'
Assert-True 'ACCEPTED_EXCEPTION does not block PASS' (-not (Test-DifferenceBlocksPass -Difference $accepted))

# ===========================================================================
# 5. Comparators - scalar collapse (0 / 1 / N) and identity-set semantics
# ===========================================================================
$r0 = Compare-RoleMemberships -Expected @() -Actual @()
Assert-True 'Compare-RoleMemberships: 0/0 -> empty differences array' ($r0.differences.Count -eq 0 -and $r0.differenceCount -eq 0)

$oneExpected = @([ordered]@{ grantedRole = 'anon'; memberRole = 'authenticator'; adminOption = $false })
$r1missing = Compare-RoleMemberships -Expected $oneExpected -Actual @()
Assert-True 'Compare-RoleMemberships: 1 expected / 0 actual -> exactly 1 missing difference (not collapsed to scalar)' ($r1missing.differences.Count -eq 1 -and $r1missing.missingCount -eq 1)
Assert-True 'Compare-RoleMemberships: missing difference has expected populated and actual null' ($null -ne $r1missing.differences[0].expected -and $null -eq $r1missing.differences[0].actual)

$twoExpected = @(
    [ordered]@{ grantedRole = 'anon'; memberRole = 'authenticator'; adminOption = $false },
    [ordered]@{ grantedRole = 'authenticated'; memberRole = 'authenticator'; adminOption = $false }
)
$rN = Compare-RoleMemberships -Expected $twoExpected -Actual @()
Assert-True 'Compare-RoleMemberships: 2 expected / 0 actual -> exactly 2 missing differences' ($rN.differences.Count -eq 2)

$matchActual = @([ordered]@{ grantedRole = 'anon'; memberRole = 'authenticator'; adminOption = $false })
$rMatch = Compare-RoleMemberships -Expected $oneExpected -Actual $matchActual
Assert-True 'Compare-RoleMemberships: identical single row -> 0 differences, 1 matched' ($rMatch.differences.Count -eq 0 -and $rMatch.matchedCount -eq 1)

$mismatchActual = @([ordered]@{ grantedRole = 'anon'; memberRole = 'authenticator'; adminOption = $true })
$rMismatch = Compare-RoleMemberships -Expected $oneExpected -Actual $mismatchActual
Assert-True 'Compare-RoleMemberships: adminOption flip -> 1 mismatch difference classified DEFECT/HIGH' ($rMismatch.differences.Count -eq 1 -and $rMismatch.differences[0].classification -eq 'DEFECT' -and $rMismatch.differences[0].severity -eq 'HIGH')

$unexpectedActual = @(
    [ordered]@{ grantedRole = 'anon'; memberRole = 'authenticator'; adminOption = $false },
    [ordered]@{ grantedRole = 'service_role'; memberRole = 'anon'; adminOption = $true }
)
$rUnexpected = Compare-RoleMemberships -Expected $oneExpected -Actual $unexpectedActual
Assert-True 'Compare-RoleMemberships: extra real membership (privilege escalation path) is flagged unexpected' ($rUnexpected.unexpectedCount -eq 1 -and $rUnexpected.differences[0].category -eq 'memberships')

# Role escalation: superuser flip must be CRITICAL and must block PASS
$expectedRole = @([ordered]@{ role = 'postgres'; canLogin = $true; superuser = $false; inherit = $true; createRole = $true; createDb = $true; replication = $true; bypassRls = $true })
$actualRoleEscalated = @([ordered]@{ role = 'postgres'; canLogin = $true; superuser = $true; inherit = $true; createRole = $true; createDb = $true; replication = $true; bypassRls = $true })
$rEscalation = Compare-RoleAttributes -Expected $expectedRole -Actual $actualRoleEscalated
Assert-True 'Compare-RoleAttributes: superuser=true when contract forbids it -> CRITICAL' ($rEscalation.differences.Count -eq 1 -and $rEscalation.differences[0].severity -eq 'CRITICAL')
Assert-True 'Role escalation difference blocks PASS' (Test-DifferenceBlocksPass -Difference $rEscalation.differences[0])

# Sequence privilege: each of USAGE/SELECT/UPDATE compared independently
$seqExpected = @(
    [ordered]@{ sequence = 'projects_id_seq'; role = 'authenticated'; privilege = 'USAGE'; allowed = $true },
    [ordered]@{ sequence = 'projects_id_seq'; role = 'authenticated'; privilege = 'SELECT'; allowed = $true },
    [ordered]@{ sequence = 'projects_id_seq'; role = 'authenticated'; privilege = 'UPDATE'; allowed = $true }
)
$seqActualMissingOne = @(
    [ordered]@{ sequence = 'projects_id_seq'; role = 'authenticated'; privilege = 'USAGE'; allowed = $true },
    [ordered]@{ sequence = 'projects_id_seq'; role = 'authenticated'; privilege = 'SELECT'; allowed = $true },
    [ordered]@{ sequence = 'projects_id_seq'; role = 'authenticated'; privilege = 'UPDATE'; allowed = $false }
)
$rSeq = Compare-SequencePrivileges -Expected $seqExpected -Actual $seqActualMissingOne
Assert-True 'Compare-SequencePrivileges: only the UPDATE row mismatches, USAGE/SELECT stay matched' ($rSeq.differences.Count -eq 1 -and $rSeq.differences[0].objectIdentity -match 'UPDATE')

# Function privilege overload independence: same name, different signature
$fnExpected = @(
    [ordered]@{ function = 'public.can_access_project(bigint)'; role = 'authenticated'; execute = $true },
    [ordered]@{ function = 'public.can_access_project(bigint,text)'; role = 'authenticated'; execute = $false }
)
$fnActual = @(
    [ordered]@{ function = 'public.can_access_project(bigint)'; role = 'authenticated'; execute = $true },
    [ordered]@{ function = 'public.can_access_project(bigint,text)'; role = 'authenticated'; execute = $true }
)
$rFn = Compare-FunctionPrivileges -Expected $fnExpected -Actual $fnActual
Assert-True 'Compare-FunctionPrivileges: two overloads of the same function name compared independently, only the 2-arg overload flagged (unexpected PUBLIC-reachable EXECUTE)' ($rFn.differences.Count -eq 1 -and $rFn.differences[0].objectIdentity -match 'bigint,text')

# Table privilege: unexpected allowed=true (DEFECT) vs missing allowed=true (DEFECT)
$tpExpected = @([ordered]@{ table = 'projects'; role = 'authenticated'; privilege = 'DELETE'; allowed = $false })
$tpActualUnexpectedTrue = @([ordered]@{ table = 'projects'; role = 'authenticated'; privilege = 'DELETE'; allowed = $true })
$rTp1 = Compare-TablePrivileges -Expected $tpExpected -Actual $tpActualUnexpectedTrue
Assert-True 'Compare-TablePrivileges: contract forbids DELETE but production allows it -> DEFECT/HIGH' ($rTp1.differences.Count -eq 1 -and $rTp1.differences[0].classification -eq 'DEFECT' -and $rTp1.differences[0].severity -eq 'HIGH')

$tpExpectedRequired = @([ordered]@{ table = 'projects'; role = 'authenticated'; privilege = 'SELECT'; allowed = $true })
$tpActualDenied = @([ordered]@{ table = 'projects'; role = 'authenticated'; privilege = 'SELECT'; allowed = $false })
$rTp2 = Compare-TablePrivileges -Expected $tpExpectedRequired -Actual $tpActualDenied
Assert-True 'Compare-TablePrivileges: contract requires SELECT but production denies it -> DEFECT (app-breaking, not just informational)' ($rTp2.differences.Count -eq 1 -and $rTp2.differences[0].classification -eq 'DEFECT')

# Ownership: clone is never consulted; only allowedOwners set matters
$ownActual = @(
    [ordered]@{ objectType = 'table'; schema = 'public'; identity = 'projects'; owner = 'postgres' },
    [ordered]@{ objectType = 'table'; schema = 'public'; identity = 'audit_log'; owner = 'supabase_auth_admin' },
    [ordered]@{ objectType = 'table'; schema = 'public'; identity = 'reports'; owner = 'some_unexpected_login_role' }
)
$rOwn = Compare-Ownership -Actual $ownActual -AllowedOwners @('postgres', 'supabase_auth_admin')
Assert-True 'Compare-Ownership: postgres and supabase_auth_admin owners pass, unexpected owner flagged' ($rOwn.matchedCount -eq 2 -and $rOwn.differences.Count -eq 1 -and $rOwn.differences[0].objectIdentity -match 'reports')
Assert-True 'Compare-Ownership function signature has no Expected/clone parameter at all (clone ownership structurally cannot leak in as evidence)' (-not (Get-Command Compare-Ownership).Parameters.ContainsKey('Expected'))

# ===========================================================================
# 6. Determinism: identical input -> identical output ordering and content
# ===========================================================================
$detExpected = @(
    [ordered]@{ table = 'projects'; role = 'authenticated'; privilege = 'SELECT'; allowed = $true },
    [ordered]@{ table = 'audit_log'; role = 'authenticated'; privilege = 'SELECT'; allowed = $true }
)
$detActual = @(
    [ordered]@{ table = 'projects'; role = 'authenticated'; privilege = 'SELECT'; allowed = $false },
    [ordered]@{ table = 'audit_log'; role = 'authenticated'; privilege = 'SELECT'; allowed = $false }
)
$det1 = Compare-TablePrivileges -Expected $detExpected -Actual $detActual
$det2 = Compare-TablePrivileges -Expected $detExpected -Actual $detActual
$keys1 = ($det1.differences | ForEach-Object { $_.objectIdentity }) -join '|'
$keys2 = ($det2.differences | ForEach-Object { $_.objectIdentity }) -join '|'
Assert-True 'Compare-TablePrivileges: two runs of identical input produce identical difference ordering' ($keys1 -eq $keys2)
Assert-True 'Compare-TablePrivileges: difference ordering is alphabetical by objectIdentity (audit_log before projects)' ($det1.differences[0].objectIdentity -match '^audit_log')

# ===========================================================================
# 7. Aggregator
# ===========================================================================
function New-EmptyPassingResult($name) { return [ordered]@{ category = $name; expectedCount = 0; actualCount = 0; matchedCount = 0; missingCount = 0; unexpectedCount = 0; mismatchCount = 0; differenceCount = 0; differences = @() } }
$requiredCats = Get-RequiredCertificationCategories
Assert-True 'Get-RequiredCertificationCategories returns exactly 10 categories' ($requiredCats.Count -eq 10)

$allPassingResults = @{}
foreach ($c in $requiredCats) { $allPassingResults[$c] = New-EmptyPassingResult $c }
$decisionPass = Get-CertificationDecision -CategoryResults $allPassingResults -ProductionInventoryValid $true -RestoreVerificationPassed $true -ArtifactIntegrityOk $true -ExpiredExceptionMatches @()
Assert-True 'Get-CertificationDecision: all 10 categories clean, restore passed -> PASS' ($decisionPass.status -eq 'PASS')

$missingOneCategory = @{}
foreach ($c in ($requiredCats | Select-Object -Skip 1)) { $missingOneCategory[$c] = New-EmptyPassingResult $c }
$decisionMissingCat = Get-CertificationDecision -CategoryResults $missingOneCategory -ProductionInventoryValid $true -RestoreVerificationPassed $true -ArtifactIntegrityOk $true -ExpiredExceptionMatches @()
Assert-True 'Get-CertificationDecision: missing required category -> FAIL, never a silent PASS' ($decisionMissingCat.status -eq 'FAIL')

$decisionRestoreFail = Get-CertificationDecision -CategoryResults $allPassingResults -ProductionInventoryValid $true -RestoreVerificationPassed $false -ArtifactIntegrityOk $true -ExpiredExceptionMatches @()
Assert-True 'Get-CertificationDecision: restore verification failed -> FAIL' ($decisionRestoreFail.status -eq 'FAIL')

$decisionInvalidInventory = Get-CertificationDecision -CategoryResults $allPassingResults -ProductionInventoryValid $false -RestoreVerificationPassed $true -ArtifactIntegrityOk $true -ExpiredExceptionMatches @()
Assert-True 'Get-CertificationDecision: invalid production inventory -> FAIL' ($decisionInvalidInventory.status -eq 'FAIL')

$decisionBlocked = Get-CertificationDecision -CategoryResults $allPassingResults -ProductionInventoryValid $true -RestoreVerificationPassed $true -ArtifactIntegrityOk $true -ExpiredExceptionMatches @() -BlockedReason 'Docker daemon unavailable'
Assert-True 'Get-CertificationDecision: explicit blocked reason -> BLOCKED, not silently PASS/FAIL' ($decisionBlocked.status -eq 'BLOCKED')

$decisionExpired = Get-CertificationDecision -CategoryResults $allPassingResults -ProductionInventoryValid $true -RestoreVerificationPassed $true -ArtifactIntegrityOk $true -ExpiredExceptionMatches @([pscustomobject]@{ exceptionId = 'EXC-1' })
Assert-True 'Get-CertificationDecision: an expired accepted exception blocks PASS' ($decisionExpired.status -eq 'FAIL')

$withDefect = @{}
foreach ($c in $requiredCats) { $withDefect[$c] = New-EmptyPassingResult $c }
$withDefect['ownership'] = [ordered]@{ category = 'ownership'; expectedCount = 1; actualCount = 1; matchedCount = 0; missingCount = 0; unexpectedCount = 0; mismatchCount = 1; differenceCount = 1; differences = @((New-SecurityDifference -Category 'ownership' -ObjectIdentity 'table:public.reports' -Classification 'DEFECT' -Severity 'HIGH')) }
$decisionDefect = Get-CertificationDecision -CategoryResults $withDefect -ProductionInventoryValid $true -RestoreVerificationPassed $true -ArtifactIntegrityOk $true -ExpiredExceptionMatches @()
Assert-True 'Get-CertificationDecision: a single unresolved DEFECT anywhere blocks PASS' ($decisionDefect.status -eq 'FAIL')

$withNonBlocking = @{}
foreach ($c in $requiredCats) { $withNonBlocking[$c] = New-EmptyPassingResult $c }
$withNonBlocking['structuralSchema'] = [ordered]@{ category = 'structuralSchema'; expectedCount = 1; actualCount = 1; matchedCount = 0; missingCount = 0; unexpectedCount = 0; mismatchCount = 1; differenceCount = 1; differences = @((New-SecurityDifference -Category 'structuralSchema' -ObjectIdentity 'x' -Classification 'PLATFORM_MANAGED_DIFFERENCE' -Severity 'LOW')) }
$decisionNonBlocking = Get-CertificationDecision -CategoryResults $withNonBlocking -ProductionInventoryValid $true -RestoreVerificationPassed $true -ArtifactIntegrityOk $true -ExpiredExceptionMatches @()
Assert-True 'Get-CertificationDecision: a PLATFORM_MANAGED_DIFFERENCE alone does not block PASS' ($decisionNonBlocking.status -eq 'PASS')

# ===========================================================================
# 8. Exception resolution: accepted vs expired, exact-identity only
# ===========================================================================
$rawDiff = New-SecurityDifference -Category 'ownership' -ObjectIdentity 'table:public.reports' -Classification 'DEFECT' -Severity 'HIGH'
$activeException = [pscustomobject]@{ exceptionId = 'EXC-1'; category = 'ownership'; exactObjectIdentity = 'table:public.reports'; expiresAt = ([DateTime]::UtcNow.AddDays(30)).ToString('o') }
$resActive = Resolve-DifferencesAgainstExceptions -Differences @($rawDiff) -AcceptedExceptions @($activeException) -AsOfUtc ([DateTime]::UtcNow)
Assert-True 'Resolve-DifferencesAgainstExceptions: active (non-expired) exception reclassifies the difference to ACCEPTED_EXCEPTION' ($resActive.Differences[0].classification -eq 'ACCEPTED_EXCEPTION' -and $resActive.ExpiredExceptionMatches.Count -eq 0)

$expiredException = [pscustomobject]@{ exceptionId = 'EXC-2'; category = 'ownership'; exactObjectIdentity = 'table:public.reports'; expiresAt = ([DateTime]::UtcNow.AddDays(-1)).ToString('o') }
$resExpired = Resolve-DifferencesAgainstExceptions -Differences @($rawDiff) -AcceptedExceptions @($expiredException) -AsOfUtc ([DateTime]::UtcNow)
Assert-True 'Resolve-DifferencesAgainstExceptions: expired exception leaves the difference DEFECT and is reported as expired' ($resExpired.Differences[0].classification -eq 'DEFECT' -and $resExpired.ExpiredExceptionMatches.Count -eq 1)

$wrongIdentityException = [pscustomobject]@{ exceptionId = 'EXC-3'; category = 'ownership'; exactObjectIdentity = 'table:public.some_other_table'; expiresAt = $null }
$resWrongIdentity = Resolve-DifferencesAgainstExceptions -Differences @($rawDiff) -AcceptedExceptions @($wrongIdentityException) -AsOfUtc ([DateTime]::UtcNow)
Assert-True 'Resolve-DifferencesAgainstExceptions: exact-identity mismatch does not accidentally match (no wildcard behavior)' ($resWrongIdentity.Differences[0].classification -eq 'DEFECT')

# ===========================================================================
# 9. Entrypoint: parameter contract and safety-relevant structure
# ===========================================================================
$entryText = Get-Content -LiteralPath $entrypointPath -Raw
Assert-True 'entrypoint requires -BackupPath' ($entryText -match '\[Parameter\(Mandatory\)\]\[string\]\$BackupPath')
Assert-True 'entrypoint requires -ProductionInventoryPath' ($entryText -match '\[Parameter\(Mandatory\)\]\[string\]\$ProductionInventoryPath')
Assert-True 'entrypoint requires -ProductionInventoryChecksumPath' ($entryText -match '\[Parameter\(Mandatory\)\]\[string\]\$ProductionInventoryChecksumPath')
Assert-True 'entrypoint never accepts a database URI or password parameter' ($entryText -notmatch '\$(?:DbUrl|DatabaseUrl|Password|ConnectionString)\b')
Assert-True 'entrypoint never dot-sources ProductionConnection.ps1 (no production reconnection path exists at all)' ($entryText -notmatch 'ProductionConnection\.ps1')
Assert-True 'entrypoint validates production inventory checksum before trusting it' ($entryText -match 'checksum mismatch')
Assert-True 'entrypoint validates productionChanged=false before certifying' ($entryText -match 'productionChanged -ne \$false')
Assert-True 'entrypoint delegates restore verification to the existing restore-verify.ps1 rather than re-implementing restore' ($entryText -match "'restore-verify\.ps1'")
Assert-True 'entrypoint writes the artifact through a .tmp + Move-Item atomic pattern' ($entryText -match '\$artifactTempPath' -and $entryText -match 'Move-Item -LiteralPath \$artifactTempPath')
Assert-True 'entrypoint re-parses and self-validates the written artifact before publishing' ($entryText -match 'artifact self-validation failed')
Assert-True 'entrypoint only writes the baseline manifest inside an if ($diag.status -eq ''PASS'') block' ($entryText -match "if \(\`$diag\.status -eq 'PASS'\)")
Assert-True 'entrypoint cleans up the disposable container/volume/tempdir in a finally block' ($entryText -match "(?s)\} finally \{.*docker.*rm.*container")
Assert-True 'entrypoint uses distinct exit codes for PASS/FAIL/invalid-input/blocked/internal-error' (
    $entryText -match 'exit 0' -and $entryText -match 'exit 1' -and $entryText -match 'exitCode = 2' -and $entryText -match 'exitCode = 3' -and $entryText -match 'exitCode = 4'
)

# Regression: a real composite run found that chaining "(A -join ',') -ne (B -join ',')"
# on one line silently always evaluates true, because -join and -ne share the
# same PowerShell operator precedence tier and evaluate strictly left-to-right
# (it parses as "((A -join ',') -ne B) -join ','", not the intended
# comparison) - the scope-drift guard must assign each side to an
# intermediate variable before comparing.
Assert-True 'entrypoint scope-drift checks never chain -join directly into -ne/-eq on one line (operator-precedence trap that always evaluates truthy)' (
    $entryText -notmatch "-join\s+[^\r\n]*?-(?:ne|eq)\s+\("
)
Assert-True 'entrypoint scopeRules.tables drift check assigns to an intermediate variable before comparing' ($entryText -match '\$scopeTablesSorted -ne \$localTablesSorted')
Assert-True 'entrypoint scopeRules.roles drift check assigns to an intermediate variable before comparing' ($entryText -match '\$scopeRolesSorted -ne \$localRolesSorted')

# -AdditionalVerifiedStructuralTables: added for the remediation rehearsal
# (a real end-to-end run found structuralSchema always independently
# re-derives "actual" from a fresh restore of the *original* backup, so a
# rehearsal's post-migration table can never be seen by it otherwise).
# Backward-compatible: defaults to empty, so every existing real-production
# call site (which never passes it) is byte-for-byte unaffected.
Assert-True 'entrypoint AdditionalVerifiedStructuralTables defaults to an empty array (real production certification calls are unaffected)' ($entryText -match '\[string\[\]\]\$AdditionalVerifiedStructuralTables = @\(\)')
Assert-True 'entrypoint only accepts an additional table if it is already within contract scope (cannot inject an arbitrary/out-of-scope table)' ($entryText -match '\$scopeTables -contains \$extraTable')
Assert-True 'entrypoint never adds a duplicate entry for a table restore-verify.ps1 already found' ($entryText -match '\$cloneStructuralTableNames -notcontains \$extraTable')

# Regression: real composite run found `@($resolvedByCategory[$catName])`
# (wrapping an already-instantiated System.Collections.Generic.List[object]
# indexer result directly with @(...)) throws "Argument types do not match"
# under Windows PowerShell 5.1 + Set-StrictMode -Version Latest - the same
# PSToObjectArrayBinder bug documented and fixed repeatedly elsewhere in
# this project. The earlier project-wide sweep for this pattern used a
# regex requiring the parens to contain a bare variable name with nothing
# else, so it missed this indexed-access variant entirely - confirmed only
# by the real end-to-end run actually exercising this code path. Fixed by
# assigning to an [object[]]-typed intermediate variable instead.
Assert-True 'entrypoint never wraps an indexed/property-accessed collection directly with @(...) (the PSToObjectArrayBinder trap, indexed variant)' (
    $entryText -notmatch '@\(\$resolvedByCategory\['
)
Assert-True 'entrypoint assigns resolvedByCategory[$catName] to an [object[]] intermediate before use' ($entryText -match '\[object\[\]\]\$catDiffs = \$resolvedByCategory\[\$catName\]')

# Regression: a real composite run against real production evidence found
# ~150 false-positive DEFECT differences because service_role's table/
# sequence/function privileges were modeled the same way as authenticated's
# (expected allowed=false unless migration 026 says otherwise). service_role
# is Supabase's always-bypasses-everything platform role - no migration in
# this repository grants it anything, but it legitimately has full ACL on
# every in-scope object by platform design (already correctly modeled for
# its bypassRls roleAttributes rule; the privilege categories were the gap).
$srRows = @(
    [ordered]@{ table = 'projects'; role = 'service_role'; privilege = 'SELECT'; allowed = $false },
    [ordered]@{ table = 'projects'; role = 'authenticated'; privilege = 'SELECT'; allowed = $true }
)
$srFixed = Set-ServiceRolePlatformPrivilegeDefaults -Rows $srRows -ValueField 'allowed'
Assert-True 'Set-ServiceRolePlatformPrivilegeDefaults forces service_role rows to allowed=true' (($srFixed | Where-Object { $_.role -eq 'service_role' }).allowed -eq $true)
Assert-True 'Set-ServiceRolePlatformPrivilegeDefaults leaves non-service_role rows untouched' (($srFixed | Where-Object { $_.role -eq 'authenticated' }).allowed -eq $true -and $srRows[1].allowed -eq $true)
Assert-True 'Set-ServiceRolePlatformPrivilegeDefaults preserves row count (no rows added or dropped)' ($srFixed.Count -eq $srRows.Count)
Assert-True 'Set-ServiceRolePlatformPrivilegeDefaults never fabricates a new object identity (table/role/privilege keys preserved verbatim)' (
    (($srFixed | Where-Object { $_.role -eq 'service_role' }).table -eq 'projects') -and (($srFixed | Where-Object { $_.role -eq 'service_role' }).privilege -eq 'SELECT')
)
$srExecRows = @([ordered]@{ function = 'public.can_access_project(bigint)'; role = 'service_role'; execute = $false })
$srExecFixed = Set-ServiceRolePlatformPrivilegeDefaults -Rows $srExecRows -ValueField 'execute'
Assert-True 'Set-ServiceRolePlatformPrivilegeDefaults works for the execute field too (functionPrivileges)' (($srExecFixed | Select-Object -First 1).execute -eq $true)
Assert-True 'entrypoint applies the service_role privilege fix to tablePrivileges, sequencePrivileges, and functionPrivileges' (
    $entryText -match "Set-ServiceRolePlatformPrivilegeDefaults -Rows \`$migrationDerived\.categories\.tablePrivileges -ValueField 'allowed'" -and
    $entryText -match "Set-ServiceRolePlatformPrivilegeDefaults -Rows \`$migrationDerived\.categories\.sequencePrivileges -ValueField 'allowed'" -and
    $entryText -match "Set-ServiceRolePlatformPrivilegeDefaults -Rows \`$migrationDerived\.categories\.functionPrivileges -ValueField 'execute'"
)
Assert-True 'Supabase platform schema stub includes auth.role() alongside auth.uid() (production has it; a real run found it missing caused spurious unexpected-function noise)' ((Get-SupabasePlatformSchemaStubScript) -match '(?i)FUNCTION auth\.role\(\) RETURNS text')

# Regression: a real composite run found migration-derived sequencePrivileges
# modeled every role's USAGE as false, but migration 019_primary_key_defaults.sql
# exists precisely because the app inserts into bigserial-backed tables
# without supplying an id - Postgres requires sequence USAGE for the
# implicit nextval()-via-DEFAULT to succeed. authenticated legitimately
# needs USAGE on every sequence backing a table it can INSERT into.
$tpRows = @(
    [ordered]@{ schema = 'public'; table = 'projects'; role = 'authenticated'; privilege = 'INSERT'; allowed = $true },
    [ordered]@{ schema = 'public'; table = 'audit_log'; role = 'authenticated'; privilege = 'INSERT'; allowed = $false }
)
$seqRows = @(
    [ordered]@{ schema = 'public'; sequence = 'projects_id_seq'; role = 'authenticated'; privilege = 'USAGE'; allowed = $false },
    [ordered]@{ schema = 'public'; sequence = 'projects_id_seq'; role = 'authenticated'; privilege = 'SELECT'; allowed = $false },
    [ordered]@{ schema = 'public'; sequence = 'audit_log_id_seq'; role = 'authenticated'; privilege = 'USAGE'; allowed = $false },
    [ordered]@{ schema = 'public'; sequence = 'projects_id_seq'; role = 'anon'; privilege = 'USAGE'; allowed = $false }
)
$seqFixed = Set-InsertRoleSequenceUsageDefaults -TablePrivilegeRows $tpRows -SequencePrivilegeRows $seqRows
Assert-True 'Set-InsertRoleSequenceUsageDefaults sets USAGE=true for authenticated on a sequence backing a table it can INSERT into' ((($seqFixed | Where-Object { $_.sequence -eq 'projects_id_seq' -and $_.role -eq 'authenticated' -and $_.privilege -eq 'USAGE' }).allowed) -eq $true)
Assert-True 'Set-InsertRoleSequenceUsageDefaults leaves SELECT untouched (only USAGE is runtime-required for nextval() via DEFAULT)' ((($seqFixed | Where-Object { $_.sequence -eq 'projects_id_seq' -and $_.role -eq 'authenticated' -and $_.privilege -eq 'SELECT' }).allowed) -eq $false)
Assert-True 'Set-InsertRoleSequenceUsageDefaults leaves audit_log_id_seq USAGE=false for authenticated (no INSERT privilege on audit_log at all)' ((($seqFixed | Where-Object { $_.sequence -eq 'audit_log_id_seq' -and $_.role -eq 'authenticated' }).allowed) -eq $false)
Assert-True 'Set-InsertRoleSequenceUsageDefaults leaves anon USAGE=false (anon cannot INSERT into projects)' ((($seqFixed | Where-Object { $_.sequence -eq 'projects_id_seq' -and $_.role -eq 'anon' }).allowed) -eq $false)
Assert-True 'Set-InsertRoleSequenceUsageDefaults preserves row count' ($seqFixed.Count -eq $seqRows.Count)
Assert-True 'entrypoint applies the sequence-usage fix after service_role correction' ($entryText -match 'Set-InsertRoleSequenceUsageDefaults -TablePrivilegeRows \$migrationDerived\.categories\.tablePrivileges -SequencePrivilegeRows \$migrationDerived\.categories\.sequencePrivileges')

# Regression: a real two-run determinism proof (scripts/production-acl-
# fixture-rehearsal.ps1, migration 029 positive control run 1 vs run 2)
# found that two rehearsals with byte-identical differences (0/0) and
# identical status (PASS) still produced two DIFFERENT canonicalPayloadHash
# values, because the hash payload included productionInventoryPath - an
# absolute local file path that differs any time this script is invoked
# from a different working/output directory, not part of the certification's
# actual security evidence or decision.
Assert-True 'entrypoint excludes productionInventoryPath from the canonical hash payload (same treatment as generatedAt - a run-environment fact, not evidence)' ($entryText -match "\`$excludedFromHash = @\('generatedAt', 'productionInventoryPath'\)")
Assert-True 'entrypoint still writes the real productionInventoryPath into the artifact itself (only excluded from the HASH, not from the artifact)' ($entryText -match '\$diag\.productionInventoryPath\s*=\s*\$ProductionInventoryPath' -or $entryText -match "productionInventoryPath = \`$ProductionInventoryPath")

Write-Host ''
Write-Host "TOTAL: $($script:passCount) passed, $($script:failCount) failed"
if ($script:failCount -gt 0) {
    Write-Host "FAILED: $($script:failures -join ', ')"
    exit 1
}
exit 0
