Set-StrictMode -Version Latest

# ---------------------------------------------------------------------------
# 1.1.0 change log (see backups/production/20260711T084934Z/composite-security-certification.json
# remainingConditions for the defects this version fixes):
#   - $tables was missing 3 of migration 026's actual GRANT targets
#     (site_visit_wps, site_visit_discrepancies, pending_invites) - found by
#     Get-Migration026Targets parsing the migration file directly, not by
#     re-reading a prior summary. scripts/tests/security-inventory.tests.ps1
#     regression-tests that every 026 target is in $tables going forward.
#   - tablePrivileges/sequencePrivileges/functionPrivileges/ownership are
#     ACL/ownership facts. production-backup.ps1 dumps schema.sql/data.sql
#     with --no-owner --no-privileges, so a restored clone's ACL/ownership
#     state reflects only whatever migrations 024-027 themselves granted in
#     THIS run, never production's real, complete, historical grant/owner
#     state (Supabase bootstrap grants, anything pre-dating 026, etc.). The
#     1.0.0 algorithm queried and compared these categories as if the clone
#     were a full-fidelity mirror - it never can be, for these 4 categories
#     specifically. 1.1.0 marks them evidenceStatus=SOURCE_NOT_AVAILABLE_FROM_BACKUP
#     with zero elements whenever EvidenceSource=clone, instead of silently
#     emitting comparable-looking MATCH/MISMATCH data that was never
#     actually comparable. rls/policies/functions/memberships/roleAttributes
#     do not depend on --no-owner/--no-privileges and remain fully
#     clone-verifiable.
#
# 1.1.1 change log:
#   - New-ReadOnlyCatalogScript set `\pset format unaligned` but never set
#     `\pset fieldsep`, so real psql fell back to its actual default
#     unaligned-mode separator, '|' (pipe) - confirmed empirically against a
#     disposable postgres:17 container (`postgres|t|t`, not a tab). Rows()
#     splits on a literal tab character, so every real catalog row failed
#     its field-count check on the very first owner-executed production run
#     ("Output parsing: FAIL", zero rows ever parsed) - this was invisible
#     to every prior offline test because they all drove Get-SecurityContractInventory
#     through a hand-built mock $Query scriptblock that returned tab-
#     separated strings directly, never through a real psql process. Fixed
#     by explicitly setting `\pset fieldsep '\t'`; a new integration test
#     (security-inventory.tests.ps1) now runs the actual generated script
#     through a disposable local postgres:17 container - not a mock - so a
#     regression here fails offline instead of only on a live production run.
#   - That same new integration test immediately surfaced a second, related
#     defect: New-ReadOnlyCatalogScript's forbidden-write-keyword guard
#     matched INSERT/UPDATE/DELETE/TRUNCATE as plain unquoted keywords, so it
#     false-positived on the tablePrivileges/sequencePrivileges category
#     queries themselves - both legitimately pass those exact words as
#     single-quoted privilege-NAME string-literal arguments to
#     has_table_privilege()/has_sequence_privilege() (e.g.
#     `unnest(ARRAY['SELECT','INSERT','UPDATE',...])`). Fixed by stripping
#     single-quoted string literals before the keyword check; an actual
#     attempt to smuggle a real write statement stays fully unquoted and is
#     still caught.
# ---------------------------------------------------------------------------

$script:SecurityContractAlgorithmVersion = '1.1.1'

# Single source of truth for the algorithm version - callers (e.g.
# production-security-inventory.ps1) must call this rather than hardcoding
# a second '1.1.x' literal that could silently drift from this file's own.
function Get-SecurityContractAlgorithmVersion {
    return $script:SecurityContractAlgorithmVersion
}

# Categories that --no-owner --no-privileges makes structurally untrustworthy
# when read from a restored clone (see change log above). Everywhere else in
# this file, "clone-verifiable" categories are just everything not in this list.
$script:ProductionCatalogRequiredCategories = @('tablePrivileges', 'sequencePrivileges', 'functionPrivileges', 'ownership')

function New-ReadOnlyCatalogScript {
    param([Parameter(Mandatory)][string]$CatalogQuery)

    $query = $CatalogQuery.Trim()
    if ([string]::IsNullOrWhiteSpace($query)) { throw 'catalog query is empty' }
    if ($query -match '(?m)^\s*\\') { throw 'psql meta-commands are not allowed inside the catalog query' }
    # Privilege-check queries legitimately pass privilege NAMES like 'INSERT'/
    # 'UPDATE'/'DELETE'/'TRUNCATE' as single-quoted string-literal arguments
    # to has_table_privilege()/has_sequence_privilege() (e.g.
    # `unnest(ARRAY['SELECT','INSERT','UPDATE',...])`) - strip string
    # literals before checking for a real (unquoted, live) SQL keyword, so
    # this guard can't false-positive on the tablePrivileges/
    # sequencePrivileges category queries themselves. Any actual attempt to
    # smuggle a write statement remains fully unquoted and still matches.
    $queryWithoutStringLiterals = $query -replace "'[^']*'", "''"
    if ($queryWithoutStringLiterals -match '(?i)\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|SET\s+ROLE)\b') {
        throw 'catalog query contains a forbidden write or role statement'
    }
    if ($query -match '(?is)\bCOPY\s*\(') { throw 'COPY wrappers are not accepted by this execution path' }
    $query = $query.TrimEnd().TrimEnd(';').TrimEnd()
    if ([string]::IsNullOrWhiteSpace($query)) { throw 'catalog query has no executable statement' }

    return @"
\set ON_ERROR_STOP on
\pset format unaligned
\pset fieldsep '\t'
\pset tuples_only on
\pset pager off
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
$query;
ROLLBACK;
"@
}

# ---------------------------------------------------------------------------
# Parses migration 026's actual `GRANT <privileges> ON <tables> TO <role>;`
# statements directly from the SQL file - the source of truth for which
# tables/privileges/role must be in the common inventory scope. Never
# hand-maintain this list separately from the migration file itself.
# ---------------------------------------------------------------------------
function Get-Migration026Targets {
    param([Parameter(Mandatory)][string]$MigrationPath)

    $text = [System.IO.File]::ReadAllText($MigrationPath)
    # Strip line comments so a table name mentioned only in a header/rollback
    # comment can never be mistaken for a live GRANT target.
    $withoutComments = ($text -split "`n" | Where-Object { $_ -notmatch '^\s*--' }) -join "`n"

    $grantPattern = 'GRANT\s+([A-Z, ]+?)\s+ON\s+([\s\S]+?)\s+TO\s+(\w+);'
    $matches = [regex]::Matches($withoutComments, $grantPattern)
    if ($matches.Count -eq 0) {
        throw "Get-Migration026Targets: no GRANT statements found in $MigrationPath - migration file format may have changed"
    }

    $grants = New-Object System.Collections.Generic.List[object]
    foreach ($m in $matches) {
        $privileges = @(($m.Groups[1].Value -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        $tableList = $m.Groups[2].Value
        $tables = @(($tableList -split ',') | ForEach-Object {
            $t = $_.Trim()
            if ($t -match '^public\.(\w+)$') { $Matches[1] } else { $null }
        } | Where-Object { $_ })
        $role = $m.Groups[3].Value.Trim()
        if ($tables.Count -eq 0) {
            throw "Get-Migration026Targets: a GRANT statement in $MigrationPath did not parse into any public.<table> targets - regex may not match this statement's shape: $($m.Value.Substring(0, [Math]::Min(80, $m.Value.Length)))"
        }
        $grants.Add([pscustomobject]@{ Privileges = $privileges; Tables = $tables; Role = $role })
    }

    $allTables = @($grants | ForEach-Object { $_.Tables } | Sort-Object -Unique)
    $roles = @($grants | ForEach-Object { $_.Role } | Sort-Object -Unique)

    return [pscustomobject]@{
        Grants = $grants
        AllTargetTables = $allTables
        Roles = $roles
    }
}

# Single source of truth for the inventory's table scope - every application
# table with a security contract (RLS/policies/privileges). Must be a
# superset of every migration 026 GRANT target; exposed as its own function
# (rather than inlined only inside Get-SecurityContractInventory) so callers
# that need to scope-check *before* running any query - e.g.
# production-security-inventory.ps1's pre-flight migration-026 check - never
# have to hand-maintain a second copy of this list.
function Get-SecurityContractTables {
    return @('audit_log', 'contractor_report_wps', 'contractor_reports', 'pending_invites', 'profiles',
        'progress_history', 'project_gantt_tasks', 'projects', 'reports', 'site_visit_discrepancies',
        'site_visit_wps', 'site_visits', 'task_group_members', 'task_groups', 'templates', 'write_command_requests')
}

function Get-SecurityContractRoles {
    return @('anon', 'authenticated', 'authenticator', 'service_role', 'postgres')
}

function Get-SecurityContractInventory {
    param(
        [Parameter(Mandatory)][scriptblock]$Query,
        [Parameter(Mandatory)][string]$Environment,
        [Parameter(Mandatory)][ValidateSet('production', 'clone', 'local')][string]$EvidenceSource
    )

    $tables = Get-SecurityContractTables
    $roles = Get-SecurityContractRoles
    $tableSql = ($tables | ForEach-Object { "'$_'" }) -join ','
    $roleSql = ($roles | ForEach-Object { "'$_'" }) -join ','

    # NOTE (1.1.0 fix): `return ,$p` from inside a piped ForEach-Object body
    # does not survive the pipeline boundary - PowerShell auto-enumerates
    # the array on the way out, silently flattening every multi-field row
    # into individual scalar strings (and further into individual
    # characters once callers did $_[0]/$_[N] on what they assumed was a
    # per-row array). This was already present in the 1.0.0 helper and
    # affected every category with more than one field per row - i.e. all
    # of them. Fixed by accumulating explicitly into a List and returning
    # it with the unary comma at the FUNCTION's own return boundary only
    # (the one place that pattern is actually safe - see the matching note
    # in RestoreVerifyHelpers.ps1's Get-CopyBlockInventory).
    function Rows([string]$Sql, [int]$Fields) {
        $raw = & $Query $Sql
        if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
        $lines = @(($raw -split "`r?`n") | Where-Object { $_ })
        $result = New-Object System.Collections.Generic.List[object]
        foreach ($line in $lines) {
            $p = $line -split "`t", $Fields
            if ($p.Count -ne $Fields) { throw "inventory row field-count mismatch: expected $Fields, got $($p.Count)" }
            $result.Add($p)
        }
        return ,$result
    }
    function B([string]$v) { return $v -eq 't' }
    function Norm([string]$v) { return (($v -replace '\s+', ' ').Trim()) }

    # NOTE (1.1.0 fix, same root cause as Rows above): piping a List
    # returned by Rows directly into `| ForEach-Object` does not reliably
    # re-enumerate its elements either - once a value has been comma-
    # protected crossing one function-return boundary, PowerShell treats it
    # as a single opaque unit for the rest of that pipeline, so `$_` inside
    # the ForEach-Object body ended up being the *entire* Rows list, not one
    # row. MapRows sidesteps pipeline semantics entirely: a plain `foreach`
    # over the List's own enumerator, called directly (not via `|`).
    # Bare `foreach { & $Mapper $row } ` relies on implicit output capture
    # during assignment - PowerShell only auto-collects that into a true
    # array when 2+ objects are produced; for a category with exactly one
    # matching row, `$categories.rls = MapRows ...` would bind the single
    # mapped [ordered]@{} hashtable directly (unwrapped), and a later
    # `foreach ($item in $categories[$category])` would then iterate that
    # hashtable's own key/value pairs instead of treating it as one row.
    # Explicit accumulation + the unary comma at this function's own return
    # boundary is the one place that's actually safe (see Rows() above).
    function MapRows($RowsList, [scriptblock]$Mapper) {
        $out = New-Object System.Collections.Generic.List[object]
        foreach ($row in $RowsList) { $out.Add((& $Mapper $row)) }
        return ,$out
    }

    $isCloneRestricted = ($EvidenceSource -eq 'clone')

    $categories = [ordered]@{}
    $evidenceStatus = [ordered]@{}

    # --- clone-verifiable categories: identical query/logic in every environment ---
    $categories.rls = MapRows (Rows "SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ($tableSql) AND c.relkind IN ('r','p') ORDER BY 1,2" 4) { param($r) [ordered]@{schema=$r[0];table=$r[1];rlsEnabled=(B $r[2]);rlsForced=(B $r[3])} }
    $evidenceStatus.rls = 'VERIFIED'

    $categories.policies = MapRows (Rows "SELECT schemaname,tablename,policyname,cmd,permissive,roles::text,coalesce(qual,''),coalesce(with_check,'') FROM pg_policies WHERE schemaname='public' AND tablename IN ($tableSql) ORDER BY 1,2,3" 8) { param($r) [ordered]@{schema=$r[0];table=$r[1];policyName=$r[2];command=$r[3];permissive=$r[4];roles=(($r[5].Trim('{}') -split ',')|Sort-Object);qual=(Norm $r[6]);withCheck=(Norm $r[7])} }
    $evidenceStatus.policies = 'VERIFIED'

    $functionRows = Rows "SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),l.lanname,p.provolatile,p.proisstrict,p.prosecdef,p.proleakproof,r.rolname,coalesce(array_to_string(p.proconfig,','),''),regexp_replace(pg_get_functiondef(p.oid),'[[:space:]]+',' ','g') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname IN ('auth','public') AND (p.prosecdef OR p.proname IN ('uid','role','can_access_project','can_write_project','is_global_admin','can_view_own_project_row','submit_contractor_report_atomic','submit_site_visit_atomic')) ORDER BY 1,2,3" 12
    # function OWNER is intentionally excluded from the clone-verifiable
    # "functions" category identity/equality surface - ownership as a
    # concept is production-catalog-required (see change log). It is still
    # captured raw here only to feed the (separately gated) ownership
    # category below, not exposed as part of a function element's identity.
    $categories.functions = MapRows $functionRows { param($r) [ordered]@{schema=$r[0];name=$r[1];identityArguments=$r[2];returnType=$r[3];language=$r[4];volatility=$r[5];strict=(B $r[6]);securityDefiner=(B $r[7]);leakproof=(B $r[8]);config=(($r[10] -split ',')|Where-Object{$_}|Sort-Object);definition=(Norm $r[11])} }
    $evidenceStatus.functions = 'VERIFIED'

    $categories.memberships = MapRows (Rows "SELECT r.rolname,m.rolname,am.admin_option,am.inherit_option,am.set_option FROM pg_auth_members am JOIN pg_roles r ON r.oid=am.roleid JOIN pg_roles m ON m.oid=am.member WHERE r.rolname IN ($roleSql) AND m.rolname IN ($roleSql) ORDER BY 1,2" 5) { param($r) [ordered]@{grantedRole=$r[0];memberRole=$r[1];adminOption=(B $r[2]);inheritOption=(B $r[3]);setOption=(B $r[4])} }
    $evidenceStatus.memberships = 'VERIFIED'
    # grantor is deliberately never queried/included above - already
    # documented normalization (see restore-verify.ps1's roles.sql GRANTED
    # BY handling): the connecting/migrating role is not production's real
    # grantor and must never affect the equality fingerprint.

    $categories.roleAttributes = MapRows (Rows "SELECT rolname,rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolconnlimit,coalesce(array_to_string(rolconfig,','),'') FROM pg_roles WHERE rolname IN ($roleSql) ORDER BY 1" 10) { param($r) [ordered]@{role=$r[0];canLogin=(B $r[1]);superuser=(B $r[2]);inherit=(B $r[3]);createRole=(B $r[4]);createDb=(B $r[5]);replication=(B $r[6]);bypassRls=(B $r[7]);connectionLimit=[int]$r[8];config=(($r[9] -split ',')|Where-Object{$_ -match '^(statement_timeout|session_preload_libraries|search_path)='}|Sort-Object)} }
    $evidenceStatus.roleAttributes = 'VERIFIED'
    # No password/password-hash column is ever selected in any query above.

    # --- production-catalog-required categories: gated by EvidenceSource ---
    if ($isCloneRestricted) {
        foreach ($cat in $script:ProductionCatalogRequiredCategories) {
            $categories[$cat] = @()
            $evidenceStatus[$cat] = 'SOURCE_NOT_AVAILABLE_FROM_BACKUP'
        }
    } else {
        $categories.tablePrivileges = MapRows (Rows "SELECT t,rol,p,has_table_privilege(rol,'public.'||quote_ident(t),p) FROM unnest(ARRAY[$tableSql]) t CROSS JOIN unnest(ARRAY[$roleSql]) rol CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE to_regclass('public.'||quote_ident(t)) IS NOT NULL ORDER BY 1,2,3" 4) { param($r) [ordered]@{schema='public';table=$r[0];role=$r[1];privilege=$r[2];allowed=(B $r[3])} }
        $evidenceStatus.tablePrivileges = 'VERIFIED'

        $categories.sequencePrivileges = MapRows (Rows "SELECT n.nspname,c.relname,rol,p,has_sequence_privilege(rol,c.oid,p) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN unnest(ARRAY[$roleSql]) rol CROSS JOIN unnest(ARRAY['USAGE','SELECT','UPDATE']) p WHERE n.nspname='public' AND c.relkind='S' ORDER BY 1,2,3,4" 5) { param($r) [ordered]@{schema=$r[0];sequence=$r[1];role=$r[2];privilege=$r[3];allowed=(B $r[4])} }
        $evidenceStatus.sequencePrivileges = 'VERIFIED'

        $categories.functionPrivileges = MapRows (Rows "SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',rol,has_function_privilege(rol,p.oid,'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN unnest(ARRAY[$roleSql]) rol WHERE n.nspname IN ('auth','public') AND (p.prosecdef OR p.proname IN ('uid','role','can_access_project','can_write_project','is_global_admin','can_view_own_project_row','submit_contractor_report_atomic','submit_site_visit_atomic')) ORDER BY 1,2" 3) { param($r) [ordered]@{function=$r[0];role=$r[1];execute=(B $r[2])} }
        $evidenceStatus.functionPrivileges = 'VERIFIED'

        $ownershipTables = MapRows (Rows "SELECT CASE c.relkind WHEN 'S' THEN 'sequence' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' ELSE 'table' END,n.nspname,c.relname,r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='public' AND (c.relname IN ($tableSql) OR c.relkind='S') ORDER BY 1,2,3" 4) { param($r) [ordered]@{objectType=$r[0];schema=$r[1];identity=$r[2];owner=$r[3]} }
        $ownershipFunctions = MapRows $functionRows { param($r) [ordered]@{objectType='function';schema=$r[0];identity="$($r[1])($($r[2]))";owner=$r[9]} }
        $ownershipCombined = New-Object System.Collections.Generic.List[object]
        foreach ($x in $ownershipTables) { $ownershipCombined.Add($x) }
        foreach ($x in $ownershipFunctions) { $ownershipCombined.Add($x) }
        $categories.ownership = @($ownershipCombined | ForEach-Object { $_ })
        $evidenceStatus.ownership = 'VERIFIED'
    }

    $elementList = New-Object System.Collections.Generic.List[object]
    foreach ($category in $categories.Keys) {
        foreach ($item in $categories[$category]) {
            $elementList.Add([ordered]@{ category = $category; key = (($item.Values | ForEach-Object { if ($_ -is [array]) { $_ -join ',' } else { [string]$_ } }) -join '|'); value = $item })
        }
    }
    [object[]]$elementArray = $elementList
    $elements = @($elementArray | Sort-Object category, key)

    $payload = [ordered]@{
        algorithmVersion = $script:SecurityContractAlgorithmVersion
        scope = 'openday-application-security-contract'
        evidenceSource = $EvidenceSource
        evidenceStatus = $evidenceStatus
        categories = $categories
        elements = $elements
    }
    $json = $payload | ConvertTo-Json -Depth 12 -Compress
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($json)))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }

    return [ordered]@{
        algorithmVersion = $script:SecurityContractAlgorithmVersion
        environment = $Environment
        evidenceSource = $EvidenceSource
        evidenceStatus = $evidenceStatus
        elementCount = $elements.Count
        canonicalPayloadHash = $hash
        categories = $categories
        elements = $elements
        tablesInScope = $tables
    }
}
