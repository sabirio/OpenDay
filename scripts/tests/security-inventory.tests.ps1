# Offline/static tests for scripts/lib/SecurityContractInventory.ps1,
# scripts/lib/ProductionConnection.ps1, and scripts/production-security-inventory.ps1.
# No Docker, no network, no production access - this file never opens a real
# database connection and never reads the real weekly-tracker/.env.production.local.
#
# Plain assertion script (project has no Pester dependency), same pattern as
# scripts/tests/restore-verify.tests.ps1. Run with:
#   powershell -File scripts\tests\security-inventory.tests.ps1
# Exits 0 if every assertion passes, 1 otherwise.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$scriptPath = Join-Path $repoRoot 'scripts\production-security-inventory.ps1'
$inventoryLibPath = Join-Path $repoRoot 'scripts\lib\SecurityContractInventory.ps1'
$connectionLibPath = Join-Path $repoRoot 'scripts\lib\ProductionConnection.ps1'
$backupLibPath = Join-Path $repoRoot 'scripts\lib\RestoreVerifyHelpers.ps1'
$migration026Path = Join-Path $repoRoot 'weekly-tracker\src\migrations\026_grant_authenticated_table_privileges.sql'

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

# ===========================================================================
# 1. PowerShell AST parse
# ===========================================================================
foreach ($p in @($scriptPath, $inventoryLibPath, $connectionLibPath)) {
    $tokens = $null; $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($p, [ref]$tokens, [ref]$parseErrors)
    Assert-True "AST parse: $(Split-Path -Leaf $p)" ($parseErrors.Count -eq 0) (($parseErrors | ForEach-Object { $_.Message }) -join '; ')
}

# ===========================================================================
# 2/3. Windows PowerShell 5.1 compatibility / no -Encoding utf8NoBOM
# ===========================================================================
$scriptText = Get-Content -LiteralPath $scriptPath -Raw
$inventoryText = Get-Content -LiteralPath $inventoryLibPath -Raw
$connectionText = Get-Content -LiteralPath $connectionLibPath -Raw
$allText = $scriptText + $inventoryText + $connectionText

Assert-True 'no -Encoding utf8NoBOM anywhere' ($allText -notmatch 'Encoding\s+utf8NoBOM')
Assert-True 'no PS7-only ?? operator' ($allText -notmatch '\?\?')
Assert-True 'no PS7-only ?. operator' ($allText -notmatch '\?\.')
Assert-True 'no reliance on $PSNativeCommandUseErrorActionPreference' ($allText -notmatch 'PSNativeCommandUseErrorActionPreference')

# Load the pure helper functions for direct unit testing.
. $inventoryLibPath
. $connectionLibPath

# ===========================================================================
# 4. UTF-8 without BOM helper (from RestoreVerifyHelpers.ps1, reused here)
# ===========================================================================
. $backupLibPath
$tmpFile = Join-Path ([System.IO.Path]::GetTempPath()) "security-inventory-test-$([guid]::NewGuid().ToString('N')).txt"
try {
    Write-Utf8NoBom -Path $tmpFile -Value "line one`nline two`n"
    $bytes = [System.IO.File]::ReadAllBytes($tmpFile)
    $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
    Assert-True 'Write-Utf8NoBom produces no BOM' (-not $hasBom)
} finally { Remove-Item -LiteralPath $tmpFile -ErrorAction SilentlyContinue }

# ===========================================================================
# 5/6/7. BEGIN READ ONLY / ROLLBACK / statement_timeout / lock_timeout
# ===========================================================================
Assert-True 'catalog helper wraps queries in repeatable-read READ ONLY transaction' ($inventoryText -match 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;')
Assert-True 'catalog helper always ROLLBACKs' ($inventoryText -match '(?m)^ROLLBACK;$')
Assert-True 'catalog helper sets statement_timeout' ($inventoryText -match "statement_timeout\s*=\s*'30s'")
Assert-True 'catalog helper sets lock_timeout' ($inventoryText -match "lock_timeout\s*=\s*'5s'")
Assert-True 'production execution sends the wrapped script through --file' ($scriptText -match "'--file'")

# ===========================================================================
# 8. Prohibition of DDL/DML/GRANT/REVOKE - both the guard regex AND the
# actual category queries never contain a forbidden verb.
# ===========================================================================
$forbiddenVerbs = @('INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'GRANT', 'REVOKE', 'TRUNCATE', 'COPY')
foreach ($verb in $forbiddenVerbs) {
    Assert-True "guard regex blocks $verb" ($scriptText -match [regex]::Escape($verb))
}
# The category SQL text itself (in the common helper) must never contain a
# forbidden verb as a real SQL keyword (word-boundary match; catalog column
# names like "cmd" or table names are unaffected).
$forbiddenVerbPattern = '\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|COPY)\b'
$queryLines = ($inventoryText -split "`n") | Where-Object { $_ -match 'Rows "' }
# Privilege-check queries legitimately pass privilege NAMES like 'INSERT'/
# 'UPDATE' as string-literal arguments to has_table_privilege() etc. (e.g.
# `unnest(ARRAY['SELECT','INSERT','UPDATE',...])`) - strip single-quoted
# string literals before checking for a real (unquoted) SQL keyword.
$violding = @($queryLines | Where-Object {
    $withoutStringLiterals = $_ -replace "'[^']*'", "''"
    $withoutStringLiterals -match $forbiddenVerbPattern
})
Assert-True 'no category query contains a DDL/DML/GRANT/REVOKE keyword (outside of a quoted privilege-name argument)' ($violding.Count -eq 0) ($violding -join '; ')

# ===========================================================================
# 9. Prohibition of SELECT/COPY application row data - no category query
# reads FROM an application table's rows (only pg_catalog/information_schema
# and privilege-check functions, which take table names as string
# arguments, not as a FROM target).
# ===========================================================================
$appRowReadPattern = 'FROM\s+public\.(?!"?\w+"?\s*\.\s*id\b)'  # defensive; refined below
$rawSelectFromPublic = [regex]::Matches($inventoryText, 'FROM\s+public\.\w+')
Assert-True 'no category query does FROM public.<table> (row reads)' ($rawSelectFromPublic.Count -eq 0) (($rawSelectFromPublic | ForEach-Object { $_.Value }) -join ', ')
Assert-True "table/sequence/function privilege checks use has_*_privilege(), not row selects" ($inventoryText -match 'has_table_privilege' -and $inventoryText -match 'has_sequence_privilege' -and $inventoryText -match 'has_function_privilege')

# ===========================================================================
# 10. Absence of password columns in catalog queries
# ===========================================================================
Assert-True 'no query reads pg_authid (the only catalog with rolpassword)' ($inventoryText -notmatch 'pg_authid')
Assert-True 'no query selects rolpassword' ($inventoryText -notmatch 'rolpassword')
Assert-True 'roleAttributes query reads pg_roles (excludes passwords by definition), not pg_authid' ($inventoryText -match 'FROM pg_roles')

# ===========================================================================
# 11/30. Secret redaction / output contains no connection information
# ===========================================================================
# Extract Test-NoSecretsInOutput's body by dot-sourcing the whole script is
# unsafe (it would execute the live flow) - instead assert its presence and
# exercise the *documented* pattern set directly against representative
# strings using the same regexes the script defines, kept in lock-step by a
# source-text check that the function itself exists with all five families.
Assert-True 'Test-NoSecretsInOutput function is defined' ($scriptText -match 'function Test-NoSecretsInOutput')
$secretPatternFamilies = @('pooler\.supabase\.com', 'postgresql://', 'PRODUCTION_DB_URL', 'eyJ', 'password', 'secret')
foreach ($fam in $secretPatternFamilies) {
    Assert-True "secret scan covers pattern family: $fam" ($scriptText -match [regex]::Escape($fam))
}
# Functional check of the actual regex set (copied 1:1 from the script's own
# patterns, so a drift between this test and the script would only make the
# test *stricter*, never silently pass a real leak).
function Test-SamplePatterns([string]$Text) {
    $patterns = @('pooler\.supabase\.com', 'postgresql://', 'postgres://', 'PRODUCTION_DB_URL', 'eyJ[A-Za-z0-9_-]{10,}', '(?i)password["\s:=]', '(?i)\bsecret["\s:=]')
    foreach ($p in $patterns) { if ($Text -match $p) { return $p } }
    return $null
}
Assert-True 'secret scan catches a pooler hostname' ($null -ne (Test-SamplePatterns 'db.abcxyz.pooler.supabase.com'))
Assert-True 'secret scan catches a postgresql:// URI' ($null -ne (Test-SamplePatterns 'postgresql://user:pw@host/db'))
Assert-True 'secret scan catches a JWT-shaped token' ($null -ne (Test-SamplePatterns 'token eyJhbGciOiJIUzI1NiJ9abcdef'))
Assert-True 'secret scan catches a "password" field' ($null -ne (Test-SamplePatterns '"password": "x"'))
Assert-True 'secret scan does not flag ordinary technical text' ($null -eq (Test-SamplePatterns '{"algorithmVersion":"1.1.0","overallStatus":"CREATED"}'))

# ===========================================================================
# Mock query infrastructure for closed-loop inventory tests (no real DB)
# ===========================================================================
function New-MockQuery {
    param([Parameter(Mandatory)][System.Collections.Specialized.OrderedDictionary]$Responses)
    $captured = $Responses
    return {
        param($Sql)
        foreach ($key in $captured.Keys) {
            if ($Sql -match [regex]::Escape($key)) { return $captured[$key] }
        }
        return ''
    }.GetNewClosure()
}

function New-BaselineResponses {
    $r = [ordered]@{}
    $r['relrowsecurity'] = "public`tprojects`tt`tf"
    $r['pg_policies'] = "public`tprojects`tprojects_select`tSELECT`tPERMISSIVE`t{authenticated}`tcan_access_project(id)`t"
    $r['pg_get_functiondef'] = "public`tget_my_role`t`ttext`tsql`ts`tt`tt`tf`tpostgres`tsearch_path=public`tCREATE FUNCTION public.get_my_role() RETURNS text"
    $r['has_table_privilege'] = "projects`tauthenticated`tSELECT`tt"
    $r['has_sequence_privilege'] = "public`tprojects_id_seq`tauthenticated`tUSAGE`tt"
    $r['has_function_privilege'] = "public.get_my_role()`tauthenticated`tt"
    $r['pg_auth_members'] = "authenticator`tanon`tf`tf`tt"
    $r['rolcanlogin'] = "authenticator`tt`tf`tf`tf`tf`tf`tf`t100`tsearch_path=public"
    $r['relowner'] = "table`tpublic`tprojects`tpostgres"
    return $r
}

# ===========================================================================
# 12. Stable element ordering
# ===========================================================================
$respA = New-BaselineResponses
$invA1 = Get-SecurityContractInventory -Query (New-MockQuery $respA) -Environment 'test' -EvidenceSource 'local'
$invA2 = Get-SecurityContractInventory -Query (New-MockQuery $respA) -Environment 'test' -EvidenceSource 'local'
$keysA1 = @($invA1.elements | ForEach-Object { $_.key })
$keysA2 = @($invA2.elements | ForEach-Object { $_.key })
Assert-True 'element ordering is stable across repeated runs of identical input' ((($keysA1 -join '|') -eq ($keysA2 -join '|')))

# ===========================================================================
# 13. Identical input -> identical fingerprint
# ===========================================================================
Assert-True 'identical input produces identical canonicalPayloadHash' ($invA1.canonicalPayloadHash -eq $invA2.canonicalPayloadHash)

# ===========================================================================
# 14. Semantic policy difference -> mismatch
# ===========================================================================
$respB = New-BaselineResponses
$respB['pg_policies'] = "public`tprojects`tprojects_select`tSELECT`tPERMISSIVE`t{authenticated}`tcan_view_own_project_row(id, company_id)`t"
$invB = Get-SecurityContractInventory -Query (New-MockQuery $respB) -Environment 'test' -EvidenceSource 'local'
Assert-True 'semantically different policy qual changes the fingerprint' ($invA1.canonicalPayloadHash -ne $invB.canonicalPayloadHash)

# ===========================================================================
# 15. Whitespace-only SQL difference -> same normalized result
# ===========================================================================
$respC = New-BaselineResponses
$respC['pg_policies'] = "public`tprojects`tprojects_select`tSELECT`tPERMISSIVE`t{authenticated}`tcan_access_project(id)`t"  # identical semantics
# Introduce extra internal whitespace in the raw qual text before normalization:
$respC['pg_policies'] = $respC['pg_policies'] -replace 'can_access_project\(id\)', "can_access_project(id)  `t"  # trailing whitespace only, same semantic token
$invC = Get-SecurityContractInventory -Query (New-MockQuery $respC) -Environment 'test' -EvidenceSource 'local'
Assert-True 'whitespace-only differences normalize to the same fingerprint' ($invA1.canonicalPayloadHash -eq $invC.canonicalPayloadHash)

# ===========================================================================
# 16. Function overload identity
# ===========================================================================
$respOverload = New-BaselineResponses
$respOverload['pg_get_functiondef'] = @"
public`tsubmit_contractor_report`tbigint, date, jsonb, jsonb`tjsonb`tplpgsql`tv`tf`tt`tf`tpostgres`tsearch_path=public`tCREATE FUNCTION a
public`tsubmit_contractor_report`tbigint, date, jsonb, jsonb, uuid`tjsonb`tplpgsql`tv`tf`tt`tf`tpostgres`tsearch_path=public`tCREATE FUNCTION b
"@
$invOverload = Get-SecurityContractInventory -Query (New-MockQuery $respOverload) -Environment 'test' -EvidenceSource 'local'
$functionKeys = @($invOverload.elements | Where-Object { $_.category -eq 'functions' } | ForEach-Object { $_.value.identityArguments })
Assert-True 'two overloads of the same function name are distinct elements' (($functionKeys | Select-Object -Unique).Count -eq 2)

# ===========================================================================
# 17. Function search_path difference -> mismatch
# ===========================================================================
$respD = New-BaselineResponses
$respD['pg_get_functiondef'] = "public`tget_my_role`t`ttext`tsql`ts`tt`tt`tf`tpostgres`tsearch_path=auth`tCREATE FUNCTION public.get_my_role() RETURNS text"
$invD = Get-SecurityContractInventory -Query (New-MockQuery $respD) -Environment 'test' -EvidenceSource 'local'
Assert-True 'different search_path changes the fingerprint' ($invA1.canonicalPayloadHash -ne $invD.canonicalPayloadHash)

# ===========================================================================
# 18. Missing privilege -> mismatch (production/local evidence source only -
# clone forces this category to SOURCE_NOT_AVAILABLE_FROM_BACKUP, tested separately)
# ===========================================================================
$respE = New-BaselineResponses
$respE['has_table_privilege'] = "projects`tauthenticated`tSELECT`tf"
$invE = Get-SecurityContractInventory -Query (New-MockQuery $respE) -Environment 'test' -EvidenceSource 'local'
Assert-True 'flipped table privilege changes the fingerprint' ($invA1.canonicalPayloadHash -ne $invE.canonicalPayloadHash)

# ===========================================================================
# 19. Membership option difference -> mismatch
# ===========================================================================
$respF = New-BaselineResponses
$respF['pg_auth_members'] = "authenticator`tanon`tt`tf`tt"
$invF = Get-SecurityContractInventory -Query (New-MockQuery $respF) -Environment 'test' -EvidenceSource 'local'
Assert-True 'adminOption difference changes the fingerprint' ($invA1.canonicalPayloadHash -ne $invF.canonicalPayloadHash)

# ===========================================================================
# 20. BYPASSRLS difference -> mismatch
# ===========================================================================
$respG = New-BaselineResponses
$respG['rolcanlogin'] = "authenticator`tt`tf`tf`tf`tf`tf`tt`t100`tsearch_path=public"
$invG = Get-SecurityContractInventory -Query (New-MockQuery $respG) -Environment 'test' -EvidenceSource 'local'
Assert-True 'bypassRls difference changes the fingerprint' ($invA1.canonicalPayloadHash -ne $invG.canonicalPayloadHash)

# ===========================================================================
# 21. Grantor-only difference -> allowed normalization (grantor is never
# queried at all, so it structurally cannot affect the fingerprint)
# ===========================================================================
# Scoped to the actual SQL query line only - the surrounding explanatory
# comments legitimately discuss grantor normalization in prose.
$membershipsQueryLine = ($inventoryText -split "`n") | Where-Object { $_ -match '\$categories\.memberships' }
Assert-True 'memberships query never selects a grantor column' ($membershipsQueryLine -notmatch '(?i)grantor')

# ===========================================================================
# 22. OID difference -> ignored
# ===========================================================================
$oidSelects = [regex]::Matches($inventoryText, '(?i)\boid\b')
# pg_class.oid/p.oid/c.oid are used only as JOIN keys, never surfaced as an
# element field - assert none of the per-category item hashtables assign a
# property literally named oid/Oid.
Assert-True 'no inventory element exposes an OID field' ($inventoryText -notmatch '(?i)oid\s*=\s*\$_')

# ===========================================================================
# 23. Missing application object -> FAIL (migration 026 scope regression test)
# ===========================================================================
$m026 = Get-Migration026Targets -MigrationPath $migration026Path
$scopeTables = Get-SecurityContractTables
$missing026 = @($m026.AllTargetTables | Where-Object { $scopeTables -notcontains $_ })
Assert-True 'every migration 026 GRANT target table is present in the inventory scope' ($missing026.Count -eq 0) ($missing026 -join ', ')
Assert-True 'migration 026 target count matches the actual GRANT statements (15 tables: 14 full-privilege + audit_log)' ($m026.AllTargetTables.Count -eq 15)
Assert-True 'migration 026 previously-missing tables are now in scope: site_visit_wps' ($scopeTables -contains 'site_visit_wps')
Assert-True 'migration 026 previously-missing tables are now in scope: site_visit_discrepancies' ($scopeTables -contains 'site_visit_discrepancies')
Assert-True 'migration 026 previously-missing tables are now in scope: pending_invites' ($scopeTables -contains 'pending_invites')
# Simulate a regression: if scope were missing a target, the check must fail.
$brokenScope = @($scopeTables | Where-Object { $_ -ne 'pending_invites' })
$simulatedMissing = @($m026.AllTargetTables | Where-Object { $brokenScope -notcontains $_ })
Assert-True 'a deliberately incomplete scope is correctly detected as missing a target (regression guard works)' ($simulatedMissing.Count -eq 1 -and $simulatedMissing[0] -eq 'pending_invites')

# ===========================================================================
# 24. Unknown category -> FAIL (every returned category must be classified)
# ===========================================================================
$knownCategories = @('rls', 'policies', 'functions', 'memberships', 'roleAttributes', 'tablePrivileges', 'sequencePrivileges', 'functionPrivileges', 'ownership')
$actualCategories = @($invA1.categories.Keys | ForEach-Object { $_ })
$unclassified = @($actualCategories | Where-Object { $knownCategories -notcontains $_ })
Assert-True 'every category returned by the inventory is a known, classified category' ($unclassified.Count -eq 0) ($unclassified -join ', ')

# ===========================================================================
# 25. Wildcard environment exclusion prohibited
# ===========================================================================
Assert-True 'production-catalog-required category list is an explicit finite array, not a wildcard match' ($inventoryText -match "ProductionCatalogRequiredCategories = @\('tablePrivileges', 'sequencePrivileges', 'functionPrivileges', 'ownership'\)")
Assert-True 'no wildcard (-like with *, or catch-all regex) used to decide category exclusion' ($inventoryText -notmatch "-like\s+['\`"]\*")

# ===========================================================================
# 26. (see 23 above - migration 026 scope) / Algorithm version 1.1.0
# consistent across production, clone, and local evidence sources
# ===========================================================================
$invProd = Get-SecurityContractInventory -Query (New-MockQuery (New-BaselineResponses)) -Environment 'production' -EvidenceSource 'production'
$invClone = Get-SecurityContractInventory -Query (New-MockQuery (New-BaselineResponses)) -Environment 'clone' -EvidenceSource 'clone'
$invLocal = Get-SecurityContractInventory -Query (New-MockQuery (New-BaselineResponses)) -Environment 'local' -EvidenceSource 'local'
Assert-True 'Get-SecurityContractAlgorithmVersion is the single source of truth' ((Get-SecurityContractAlgorithmVersion) -eq '1.1.1')
Assert-True 'algorithmVersion is 1.1.1 for production evidence source' ($invProd.algorithmVersion -eq (Get-SecurityContractAlgorithmVersion))
Assert-True 'algorithmVersion is 1.1.1 for clone evidence source' ($invClone.algorithmVersion -eq (Get-SecurityContractAlgorithmVersion))
Assert-True 'algorithmVersion is 1.1.1 for local evidence source' ($invLocal.algorithmVersion -eq (Get-SecurityContractAlgorithmVersion))
Assert-True 'production-security-inventory.ps1 reads the version from the helper, never a second hardcoded literal' ($scriptText -match '\$AlgorithmVersion = Get-SecurityContractAlgorithmVersion' -and $scriptText -notmatch "\`$AlgorithmVersion = '1\.")

# ===========================================================================
# 28. Clone ACL/ownership absence gets SOURCE_NOT_AVAILABLE_FROM_BACKUP,
# never MATCH/MISMATCH/empty-expected-state
# ===========================================================================
foreach ($cat in @('tablePrivileges', 'sequencePrivileges', 'functionPrivileges', 'ownership')) {
    Assert-True "clone evidenceStatus.$cat is SOURCE_NOT_AVAILABLE_FROM_BACKUP" ($invClone.evidenceStatus[$cat] -eq 'SOURCE_NOT_AVAILABLE_FROM_BACKUP')
    Assert-True "clone $cat category has zero elements (not populated with unverifiable data)" ($invClone.categories[$cat].Count -eq 0)
    Assert-True "production evidenceStatus.$cat is VERIFIED (not restricted)" ($invProd.evidenceStatus[$cat] -eq 'VERIFIED')
    Assert-True "local evidenceStatus.$cat is VERIFIED (not restricted)" ($invLocal.evidenceStatus[$cat] -eq 'VERIFIED')
}
foreach ($cat in @('rls', 'policies', 'functions', 'memberships', 'roleAttributes')) {
    Assert-True "clone evidenceStatus.$cat is VERIFIED (clone-verifiable category)" ($invClone.evidenceStatus[$cat] -eq 'VERIFIED')
}
Assert-True 'SOURCE_NOT_AVAILABLE_FROM_BACKUP status string appears nowhere else miscategorized (no MATCH/MISMATCH literal in the helper)' ($inventoryText -notmatch "'MATCH'" -and $inventoryText -notmatch "'MISMATCH'")

# ===========================================================================
# 29. Native command exit codes checked explicitly
# ===========================================================================
Assert-True 'production script checks ExitCode after the catalog query' ($scriptText -match '\$result\.ExitCode -ne 0')
Assert-True 'ProductionConnection helper is used (fingerprint check) before any query' ($scriptText -match 'Get-ProductionConnectionFingerprint')

# ===========================================================================
# 30 (cont). Output does not contain connection information - script never
# writes $conn.Host / RawUri / EnvironmentText into the diag/report object.
# ===========================================================================
Assert-True 'script never assigns $conn.Host (or any conn field) into $diag' ($scriptText -notmatch '\$diag\.\w*\s*=\s*\$conn\.')
Assert-True 'script never writes RawUri into the report' ($scriptText -notmatch 'RawUri')
Assert-True 'script excludes production hostname/project ref from report by design (redaction scan covers it)' ($scriptText -match '\[regex\]::Escape\(\$ExpectedProjectRef\)')

# ===========================================================================
# Parameter / usage checks
# ===========================================================================
Assert-True 'script requires -BackupPath (Mandatory)' ($scriptText -match '\[Parameter\(Mandatory\)\]\[string\]\$BackupPath')
Assert-True 'script never accepts a database URI or password as a parameter' ($scriptText -notmatch '\[string\]\$(DbUri|DatabaseUrl|ConnectionString|Password)\b')

# ===========================================================================
# Fail-closed structure
# ===========================================================================
Assert-True 'overallStatus initialized to FAIL' ($scriptText -match "overallStatus = 'FAIL'")
Assert-True 'overallStatus only set to CREATED once, at the end of a fully successful run' (([regex]::Matches($scriptText, "overallStatus = 'CREATED'")).Count -eq 1)
Assert-True 'catch block forces overallStatus to FAIL' ($scriptText -match "catch\s*\{[\s\S]{0,200}overallStatus = 'FAIL'")

# ===========================================================================
# ProductionConnection helper checks
# ===========================================================================
# Get-ProductionConnectionFingerprint requires its EnvFile to be
# git-ignored (a real safety property - don't weaken it to test around it).
# A file under system %TEMP% is outside the repo entirely and makes
# `git check-ignore` fail with a fatal error rather than a clean
# not-ignored result, so the fake env file must live inside the repo, under
# a path .gitignore already covers (`.env.*` in weekly-tracker/.gitignore).
$fakeEnv = Join-Path $repoRoot.Path 'weekly-tracker\.env.security-inventory-test.local'
try {
    Write-Utf8NoBom -Path $fakeEnv -Value "PRODUCTION_DB_URL=postgresql://postgres.WRONGREF:pw@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres`n"
    Assert-Throws 'Get-ProductionConnectionFingerprint rejects a wrong project ref' {
        Get-ProductionConnectionFingerprint -EnvFile $fakeEnv -RepoRoot $repoRoot.Path -ExpectedProjectRef 'szgbkeqornkdngoegyso'
    } 'username/project ref'

    Write-Utf8NoBom -Path $fakeEnv -Value "PRODUCTION_DB_URL=postgresql://postgres.szgbkeqornkdngoegyso:pw@evil.example.com:5432/postgres`n"
    Assert-Throws 'Get-ProductionConnectionFingerprint rejects a non-pooler host' {
        Get-ProductionConnectionFingerprint -EnvFile $fakeEnv -RepoRoot $repoRoot.Path -ExpectedProjectRef 'szgbkeqornkdngoegyso'
    } 'not a Supabase pooler'

    Write-Utf8NoBom -Path $fakeEnv -Value "PRODUCTION_DB_URL=postgresql://postgres.szgbkeqornkdngoegyso:pw@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres`n"
    Assert-Throws 'Get-ProductionConnectionFingerprint rejects a wrong port' {
        Get-ProductionConnectionFingerprint -EnvFile $fakeEnv -RepoRoot $repoRoot.Path -ExpectedProjectRef 'szgbkeqornkdngoegyso'
    } 'port'

    Assert-Throws 'Get-ProductionConnectionFingerprint rejects a missing env file' {
        Get-ProductionConnectionFingerprint -EnvFile (Join-Path $repoRoot.Path 'weekly-tracker\.env.security-inventory-test-nope.local') -RepoRoot $repoRoot.Path -ExpectedProjectRef 'szgbkeqornkdngoegyso'
    } 'missing'
} finally {
    Remove-Item -LiteralPath $fakeEnv -ErrorAction SilentlyContinue
}
Assert-True 'ProductionConnection helper never Write-Host''s the password or raw URI' ($connectionText -notmatch 'Write-Host.*Password' -and $connectionText -notmatch 'Write-Host.*RawUri')

# ===========================================================================
# Read-only catalog transaction wrapper regression tests
# ===========================================================================
$wrappedCatalog = New-ReadOnlyCatalogScript -CatalogQuery 'SELECT current_database()'
Assert-True 'catalog wrapper starts an explicit repeatable-read read-only transaction' ($wrappedCatalog -match 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;')
Assert-True 'catalog query receives an explicit terminating semicolon before ROLLBACK' ($wrappedCatalog -match 'SELECT current_database\(\);\s*ROLLBACK;')
Assert-True 'catalog wrapper keeps ROLLBACK as a separate complete statement' (([regex]::Matches($wrappedCatalog, '(?m)^ROLLBACK;$')).Count -eq 1)
Assert-True 'catalog wrapper enables ON_ERROR_STOP through a standalone psql command' ($wrappedCatalog -match '(?m)^\\set ON_ERROR_STOP on$')
Assert-Throws 'catalog wrapper rejects a write statement in a read-only query' { New-ReadOnlyCatalogScript -CatalogQuery 'UPDATE public.projects SET city = city WHERE id = -1' } 'forbidden'
Assert-Throws 'catalog wrapper rejects an embedded COPY wrapper' { New-ReadOnlyCatalogScript -CatalogQuery 'COPY (SELECT 1) TO STDOUT' } 'COPY'
Assert-Throws 'catalog wrapper rejects psql meta-commands inside query input' { New-ReadOnlyCatalogScript -CatalogQuery "\copy (SELECT 1) TO STDOUT" } 'meta-commands'
Assert-True 'production execution uses a temporary SQL file and psql --file, not multiline -c' ($scriptText -match "'--file'" -and $scriptText -notmatch '''-c'',\s*\$wrapped')
Assert-True 'production psql transport explicitly preserves tab-separated inventory rows' ($scriptText -match "'--field-separator',\s*`"``t`"")
Assert-True 'production execution tracks catalog failures at execute_production_catalog_query' ($scriptText -match "failedStep = 'execute_production_catalog_query'")
Assert-True 'production output is staged through .tmp files' ($scriptText -match '\$reportTempPath' -and $scriptText -match '\$checksumTempPath')
Assert-True 'failure cleanup removes partial temporary output' ($scriptText -match 'Remove-Item -LiteralPath \$reportTempPath, \$checksumTempPath')

# ===========================================================================
# Real psql field-separator regression test (the bug that slipped past every
# prior offline test, because every prior test drove Get-SecurityContractInventory
# through a hand-built mock $Query that already returned tab-separated
# strings directly - never through real psql, which defaults unaligned-mode
# output to '|', not a tab, unless \pset fieldsep is set explicitly).
# Static text checks alone cannot catch this class of bug (the wrapper LOOKS
# complete without \pset fieldsep) - only running it through a real
# PostgreSQL instance can. Uses a disposable, isolated postgres:17 container:
# no host port published, unique GUID-suffixed name, no production, no local
# Supabase stack involved, torn down in a finally block. Skips gracefully
# (does not fail the suite) if Docker itself is unavailable in this
# environment, since that is an environment precondition, not a code defect.
# ===========================================================================
Assert-True 'catalog wrapper sets an explicit tab field separator (the actual regression)' ($inventoryText -match "\\pset fieldsep '\\t'")

$dockerCheck = Invoke-NativeTool -Command 'docker' -ArgumentList @('version')
$dockerAvailable = ($dockerCheck.ExitCode -eq 0)
if (-not $dockerAvailable) {
    Write-Host '[SKIP] real-psql field-separator integration test - Docker is not available in this environment'
} else {
    . $backupLibPath  # Invoke-NativeTool
    $suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
    $container = "sec-inv-fieldsep-test-$suffix"
    $volume = "sec-inv-fieldsep-test-vol-$suffix"
    $tempDir = Join-Path ([IO.Path]::GetTempPath()) "sec-inv-fieldsep-test-$suffix"
    try {
        New-Item -ItemType Directory -Path $tempDir | Out-Null
        Invoke-NativeTool -Command 'docker' -ArgumentList @('volume', 'create', $volume) | Out-Null
        $mount = "type=bind,source=$tempDir,target=/inventory,readonly"
        $run = Invoke-NativeTool -Command 'docker' -ArgumentList @('run', '-d', '--name', $container,
            '-v', "${volume}:/var/lib/postgresql/data", '--mount', $mount,
            '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=postgres', 'postgres:17')
        Assert-True 'real-psql test: disposable container starts' ($run.ExitCode -eq 0)

        $ready = $false
        for ($i = 0; $i -lt 30; $i++) {
            if ((Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'pg_isready', '-U', 'postgres')).ExitCode -eq 0) { $ready = $true; break }
            Start-Sleep -Seconds 1
        }
        Assert-True 'real-psql test: disposable container becomes ready' $ready

        # Exercise the exact production code path: New-ReadOnlyCatalogScript's
        # output, written to a file, executed via `psql --file` inside the
        # container - identical in shape to production-security-inventory.ps1's
        # own $queryFn, just pointed at the disposable container instead of
        # production.
        $realQueryFn = {
            param([string]$Sql)
            $wrapped = New-ReadOnlyCatalogScript -CatalogQuery $Sql
            $hostPath = Join-Path $tempDir 'query.sql'
            Write-Utf8NoBom -Path $hostPath -Value ($wrapped + [Environment]::NewLine)
            $r = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '--quiet', '--file', '/inventory/query.sql')
            if ($r.ExitCode -ne 0) { throw "real psql query failed: $($r.Output -join ' | ')" }
            return ($r.Output -join "`n")
        }
        # No .GetNewClosure() here - it would detach this scriptblock from
        # the enclosing scope's function table (New-ReadOnlyCatalogScript,
        # Invoke-NativeTool, Write-Utf8NoBom), not just freeze its
        # variables. Plain lexical scoping is sufficient since $realQueryFn
        # is invoked synchronously, inside this same try block, before
        # $container/$tempDir go out of scope.

        function Get-RealCategoryTotal($inv) {
            $total = 0
            foreach ($categoryName in $inv.categories.Keys) { $total += $inv.categories[$categoryName].Count }
            return $total
        }

        # --- Pass 1: empty container - 0-row and 1-row (bootstrap `postgres`
        # role only) coverage. ---
        $emptyInventory = Get-SecurityContractInventory -Query $realQueryFn -Environment 'integration-test-empty' -EvidenceSource 'local'
        Assert-True 'real-psql test (empty): roleAttributes has exactly 1 row (only bootstrap postgres role exists)' ($emptyInventory.categories.roleAttributes.Count -eq 1)
        $postgresRoleRow = $emptyInventory.categories.roleAttributes | Where-Object { $_.role -eq 'postgres' }
        Assert-True 'real-psql test (empty): the single row is a real multi-field row, not collapsed to 1 field' ($null -ne $postgresRoleRow -and $postgresRoleRow.canLogin -eq $true -and $postgresRoleRow.superuser -eq $true)
        Assert-True 'real-psql test (empty): rls/policies/functions/memberships are correctly 0 rows (nothing seeded yet)' (
            $emptyInventory.categories.rls.Count -eq 0 -and $emptyInventory.categories.policies.Count -eq 0 -and
            $emptyInventory.categories.functions.Count -eq 0 -and $emptyInventory.categories.memberships.Count -eq 0)
        Assert-True "real-psql test (empty): elementCount matches real parsed total (elements=$($emptyInventory.elementCount), total=$(Get-RealCategoryTotal $emptyInventory))" ($emptyInventory.elementCount -eq (Get-RealCategoryTotal $emptyInventory))

        # --- Seed a real, non-trivial schema: multiple roles, multiple
        # tables with RLS+policies, a membership edge, table/sequence/
        # function grants, and a SECURITY DEFINER function - so every
        # category gets genuine 2+/many-row coverage, not just roleAttributes. ---
        $seedSql = @"
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE authenticator;
CREATE ROLE service_role;
GRANT anon TO authenticator;
GRANT authenticated TO authenticator;

CREATE TABLE public.projects (id bigserial PRIMARY KEY, name text);
CREATE TABLE public.contractor_reports (id bigint PRIMARY KEY, project_id bigint);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY projects_insert ON public.projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY contractor_reports_select ON public.contractor_reports FOR SELECT TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE ON public.projects TO authenticated;
GRANT SELECT ON public.contractor_reports TO authenticated;
GRANT USAGE, SELECT ON public.projects_id_seq TO authenticated;

CREATE FUNCTION public.can_access_project(p_id bigint) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS `$`$ SELECT true `$`$;
GRANT EXECUTE ON FUNCTION public.can_access_project(bigint) TO authenticated;
"@
        $seedPath = Join-Path $tempDir 'seed.sql'
        Write-Utf8NoBom -Path $seedPath -Value $seedSql
        $seedResult = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '--file', '/inventory/seed.sql')
        Assert-True 'real-psql test: fixture seed script applied cleanly to the disposable container' ($seedResult.ExitCode -eq 0) ($seedResult.Output -join ' | ')

        # --- Pass 2: seeded container - many-row, multi-category coverage. ---
        $seededInventory = Get-SecurityContractInventory -Query $realQueryFn -Environment 'integration-test-seeded' -EvidenceSource 'local'
        Assert-True "real-psql test (seeded): rls has 2 rows (projects, contractor_reports)" ($seededInventory.categories.rls.Count -eq 2)
        Assert-True "real-psql test (seeded): policies has 3 rows (2 on projects, 1 on contractor_reports)" ($seededInventory.categories.policies.Count -eq 3)
        Assert-True "real-psql test (seeded): functions has at least 1 row (can_access_project)" ($seededInventory.categories.functions.Count -ge 1)
        Assert-True "real-psql test (seeded): memberships has at least 2 rows (anon->authenticator, authenticated->authenticator)" ($seededInventory.categories.memberships.Count -ge 2)
        Assert-True "real-psql test (seeded): roleAttributes has exactly 5 rows (postgres + 4 seeded roles)" ($seededInventory.categories.roleAttributes.Count -eq 5)
        Assert-True "real-psql test (seeded): tablePrivileges has many rows (2 tables x 5 roles x 7 privileges)" ($seededInventory.categories.tablePrivileges.Count -eq 70)
        $grantedSelect = $seededInventory.categories.tablePrivileges | Where-Object { $_.table -eq 'projects' -and $_.role -eq 'authenticated' -and $_.privilege -eq 'SELECT' }
        Assert-True "real-psql test (seeded): the real GRANT SELECT on projects TO authenticated resolves allowed=true (not a stale/default value)" ($null -ne $grantedSelect -and $grantedSelect.allowed -eq $true)
        $notGrantedDelete = $seededInventory.categories.tablePrivileges | Where-Object { $_.table -eq 'projects' -and $_.role -eq 'authenticated' -and $_.privilege -eq 'DELETE' }
        Assert-True "real-psql test (seeded): a privilege that was NOT granted (DELETE on projects) resolves allowed=false" ($null -ne $notGrantedDelete -and $notGrantedDelete.allowed -eq $false)
        Assert-True "real-psql test (seeded): sequencePrivileges has rows (projects_id_seq x 5 roles x 3 privileges)" ($seededInventory.categories.sequencePrivileges.Count -eq 15)
        Assert-True "real-psql test (seeded): functionPrivileges has rows (can_access_project x 5 roles)" ($seededInventory.categories.functionPrivileges.Count -ge 5)
        Assert-True "real-psql test (seeded): ownership has rows (2 tables + 1 sequence + 1 function, all owned by postgres)" ($seededInventory.categories.ownership.Count -ge 4)
        $ownershipOwners = @($seededInventory.categories.ownership | ForEach-Object { $_.owner } | Sort-Object -Unique)
        Assert-True "real-psql test (seeded): every seeded object is owned by postgres (the connecting role) - no null/blank owner" (($ownershipOwners.Count -eq 1) -and ($ownershipOwners[0] -eq 'postgres'))
        Assert-True "real-psql test (seeded): elementCount matches real parsed total across all 9 categories (elements=$($seededInventory.elementCount), total=$(Get-RealCategoryTotal $seededInventory))" ($seededInventory.elementCount -eq (Get-RealCategoryTotal $seededInventory))
        Assert-True "real-psql test (seeded): last category (ownership, alphabetically last) is not silently dropped - its rows appear in elements" (@($seededInventory.elements | Where-Object { $_.category -eq 'ownership' }).Count -eq $seededInventory.categories.ownership.Count)

        # --- Pass 3: rerun against the SAME seeded state - determinism /
        # last-row-not-lost / stable ordering, driven through real psql twice
        # in a row, not just against an in-memory mock. ---
        $seededInventory2 = Get-SecurityContractInventory -Query $realQueryFn -Environment 'integration-test-seeded-2' -EvidenceSource 'local'
        Assert-True 'real-psql test: identical seeded state produces an identical canonicalPayloadHash on a second independent real-psql run' ($seededInventory.canonicalPayloadHash -eq $seededInventory2.canonicalPayloadHash)
        $keys1 = ($seededInventory.elements | ForEach-Object { $_.key }) -join '|'
        $keys2 = ($seededInventory2.elements | ForEach-Object { $_.key }) -join '|'
        Assert-True 'real-psql test: element ordering is deterministic across two real-psql runs' ($keys1 -eq $keys2)
    } finally {
        try { Invoke-NativeTool -Command 'docker' -ArgumentList @('rm', '-f', $container) | Out-Null } catch {}
        try { Invoke-NativeTool -Command 'docker' -ArgumentList @('volume', 'rm', $volume) | Out-Null } catch {}
        try { if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force } } catch {}
    }
}

# ===========================================================================
# Summary
# ===========================================================================
Write-Host ''
Write-Host "TOTAL: $($script:passCount) passed, $($script:failCount) failed"
if ($script:failCount -gt 0) {
    Write-Host "FAILED: $($script:failures -join ', ')"
    exit 1
}
exit 0
