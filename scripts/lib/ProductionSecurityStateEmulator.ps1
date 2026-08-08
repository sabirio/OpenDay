# Production Security State Emulator
#
# The real production backup was taken with --no-owner and --no-privileges
# (production-backup.ps1), so a plain restore of it reproduces structure
# and data but NOT the actual ACL/ownership production currently has. For
# a rehearsal to prove anything about *remediating* real ACL drift, the
# disposable clone needs to actually carry that drift first - otherwise
# "pre-remediation certification reproduces the known FAIL" would be
# unfalsifiable.
#
# This module hydrates a disposable container - already restored from the
# real backup's roles.sql (real platform roles: anon/authenticated/
# authenticator/service_role/postgres/..., with real dump-captured
# attributes, no passwords present in the dump) and schema.sql (real
# structure, no data required for ACL rehearsal purposes) - with the EXACT
# table/sequence/function privilege grants read back from the immutable,
# checksum-verified production security inventory artifact. Never a live
# production connection, never guessed, never re-creates roles (the real
# roles.sql restore already did that, more faithfully than any stub could).
# Ownership is intentionally NOT emulated (the restoring role naturally
# owns everything, matching production's dominant 'postgres' owner; the
# small number of supabase_auth_admin-owned objects are a documented,
# accepted gap - this emulator's job is ACL rehearsal, not an ownership
# mirror, and no comparator anywhere treats clone ownership as production
# evidence). No external credentials are used anywhere in this module.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ProductionActualGrantStatements {
    # Reads ONLY allowed=true / execute=true rows from the immutable
    # production inventory and turns them into GRANT statements - this
    # reproduces the actual (including over-permissive) production ACL,
    # not the intended one. Read-only over the artifact; never touches
    # production.
    param([Parameter(Mandatory)]$Inventory)

    $statements = New-Object System.Collections.Generic.List[string]
    foreach ($el in $Inventory.elements) {
        switch ($el.category) {
            'tablePrivileges' {
                if ([bool]$el.value.allowed) {
                    $statements.Add("GRANT $($el.value.privilege) ON $($el.value.schema).$($el.value.table) TO $($el.value.role);")
                }
            }
            'sequencePrivileges' {
                if ([bool]$el.value.allowed) {
                    $statements.Add("GRANT $($el.value.privilege) ON SEQUENCE $($el.value.schema).$($el.value.sequence) TO $($el.value.role);")
                }
            }
            'functionPrivileges' {
                if ([bool]$el.value.execute) {
                    $statements.Add("GRANT EXECUTE ON FUNCTION $($el.value.function) TO $($el.value.role);")
                }
            }
        }
    }
    [string[]]$out = $statements
    return ,$out
}

function New-ProductionSecurityStateHydrationScript {
    # Builds the ACL hydration script: the exact actual table/sequence/
    # function grants read from the immutable production inventory.
    #
    # Deliberately does NOT create roles - unlike migration-derived-
    # execution (which starts from a truly empty vanilla postgres:17 and
    # needs Get-SupabasePlatformRoleStubScript), the rehearsal container is
    # restored from the real backup's roles.sql, which already contains
    # every real Supabase platform role (anon/authenticated/authenticator/
    # service_role/postgres/...) with its real, dump-captured attributes -
    # more faithful than the contract-derived stub, and re-creating them
    # here would just collide with CREATE ROLE errors.
    param([Parameter(Mandatory)]$Inventory)

    $grantStatements = Get-ProductionActualGrantStatements -Inventory $Inventory
    return ($grantStatements -join [Environment]::NewLine) + [Environment]::NewLine
}

function Test-ProductionSecurityStateHydrationDeterministic {
    # Regression guard: hydrating from the same inventory twice must
    # produce byte-identical scripts (same statement set, same order).
    param([Parameter(Mandatory)]$Inventory)

    $a = New-ProductionSecurityStateHydrationScript -Inventory $Inventory
    $b = New-ProductionSecurityStateHydrationScript -Inventory $Inventory
    return ($a -eq $b)
}

function Import-P1ProductionSecurityBaseline {
    # Loads only a caller-supplied, checksum-bound local artifact. This helper
    # never opens a production connection and never accepts credentials.
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$ExpectedSha256
    )

    if ($ExpectedSha256 -cnotmatch '^[0-9a-f]{64}$') {
        throw 'P1 SECURITY BASELINE REJECTED: expected SHA-256 must be lowercase hexadecimal'
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "P1 SECURITY BASELINE REJECTED: artifact is missing: $Path"
    }
    $actualSha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -cne $ExpectedSha256) {
        throw "P1 SECURITY BASELINE REJECTED: SHA-256 mismatch (expected=$ExpectedSha256 actual=$actualSha256)"
    }

    try { $baseline = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
    catch { throw "P1 SECURITY BASELINE REJECTED: invalid JSON: $($_.Exception.Message)" }

    if ([string]$baseline.schemaVersion -cne 'openday-production-security-baseline/v1') {
        throw 'P1 SECURITY BASELINE REJECTED: unsupported schemaVersion'
    }
    if ([string]$baseline.productionProjectRef -cne 'szgbkeqornkdngoegyso') {
        throw 'P1 SECURITY BASELINE REJECTED: production project ref mismatch'
    }
    if (@($baseline.tables).Count -ne 4 -or @($baseline.sequences).Count -ne 3 -or
        @($baseline.functions).Count -ne 2 -or @($baseline.defaultPrivileges).Count -ne 6) {
        throw 'P1 SECURITY BASELINE REJECTED: required ACL inventory cardinality mismatch'
    }

    return $baseline
}

function New-P1ProductionSecurityStateHydrationScript {
    # Produces deterministic SQL for a disposable restored-backup rehearsal.
    # Direct ACLs are rebuilt from the exact owner-preflight rows. Default ACL
    # entries are rebuilt for BOTH observed grantor roles, postgres and
    # supabase_admin. The SQL returned here must never be used against a live
    # environment; this module has no connection or execution capability.
    param([Parameter(Mandatory)]$Baseline)

    $identifierPattern = '^[a-z_][a-z0-9_]*$'
    $allowedTablePrivileges = @('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
    $allowedSequencePrivileges = @('USAGE','SELECT','UPDATE')
    $allowedFunctionPrivileges = @('EXECUTE')
    $knownRoles = @('PUBLIC','anon','authenticated','service_role','postgres')
    $statements = New-Object System.Collections.Generic.List[string]

    function Assert-Identifier([string]$Value, [string]$Label) {
        if ($Value -cnotmatch $identifierPattern) { throw "P1 SECURITY BASELINE REJECTED: invalid $Label identifier: $Value" }
    }

    function Add-DirectAclStatements {
        param(
            [Parameter(Mandatory)][string]$ObjectKind,
            [Parameter(Mandatory)][string]$QualifiedName,
            [Parameter(Mandatory)]$AclRows,
            [Parameter(Mandatory)][string[]]$AllowedPrivileges
        )

        $statements.Add("REVOKE ALL PRIVILEGES ON $ObjectKind $QualifiedName FROM $($knownRoles -join ', ');")
        foreach ($group in @($AclRows | Group-Object grantee)) {
            $grantee = [string]$group.Name
            Assert-Identifier $grantee 'grantee'
            $privileges = @($group.Group | ForEach-Object {
                $privilege = ([string]$_.privilege_type).ToUpperInvariant()
                if ($AllowedPrivileges -notcontains $privilege) {
                    throw "P1 SECURITY BASELINE REJECTED: unsupported $ObjectKind privilege: $privilege"
                }
                if ([string]$_.is_grantable -cnotin @('t','f')) {
                    throw 'P1 SECURITY BASELINE REJECTED: is_grantable must preserve owner output as t or f'
                }
                $privilege
            } | Sort-Object -Unique)
            if (@($group.Group | Where-Object { [string]$_.is_grantable -eq 't' }).Count -gt 0) {
                throw 'P1 SECURITY BASELINE REJECTED: mixed/grantable ACL rows require an explicit future schema version'
            }
            $statements.Add("GRANT $($privileges -join ', ') ON $ObjectKind $QualifiedName TO $grantee;")
        }
    }

    foreach ($table in @($Baseline.tables)) {
        Assert-Identifier ([string]$table.schema) 'schema'
        Assert-Identifier ([string]$table.name) 'table'
        Add-DirectAclStatements -ObjectKind 'TABLE' -QualifiedName "$($table.schema).$($table.name)" `
            -AclRows $table.aclRows -AllowedPrivileges $allowedTablePrivileges
    }
    foreach ($sequence in @($Baseline.sequences)) {
        Assert-Identifier ([string]$sequence.schema) 'schema'
        Assert-Identifier ([string]$sequence.name) 'sequence'
        Add-DirectAclStatements -ObjectKind 'SEQUENCE' -QualifiedName "$($sequence.schema).$($sequence.name)" `
            -AclRows $sequence.aclRows -AllowedPrivileges $allowedSequencePrivileges
    }
    foreach ($function in @($Baseline.functions)) {
        Assert-Identifier ([string]$function.schema) 'schema'
        Assert-Identifier ([string]$function.name) 'function'
        if ([string]$function.identityArguments -cnotmatch '^[a-z0-9_, ]+$') {
            throw "P1 SECURITY BASELINE REJECTED: invalid function identity arguments: $($function.identityArguments)"
        }
        $signature = "$($function.schema).$($function.name)($($function.identityArguments))"
        Add-DirectAclStatements -ObjectKind 'FUNCTION' -QualifiedName $signature `
            -AclRows $function.aclRows -AllowedPrivileges $allowedFunctionPrivileges
    }

    $defaultRoles = @($Baseline.defaultPrivileges | ForEach-Object { [string]$_.grantor_role } | Sort-Object -Unique)
    if (($defaultRoles -join ',') -cne 'postgres,supabase_admin') {
        throw 'P1 SECURITY BASELINE REJECTED: default ACL grantors must be exactly postgres and supabase_admin'
    }
    foreach ($entry in @($Baseline.defaultPrivileges)) {
        $grantor = [string]$entry.grantor_role
        $schema = [string]$entry.schema_name
        Assert-Identifier $grantor 'default ACL grantor'
        Assert-Identifier $schema 'default ACL schema'

        $objectClause = switch ([string]$entry.defaclobjtype) {
            'r' { 'TABLES' }
            'S' { 'SEQUENCES' }
            'f' { 'FUNCTIONS' }
            default { throw "P1 SECURITY BASELINE REJECTED: unsupported defaclobjtype: $($entry.defaclobjtype)" }
        }
        $expectedCodes = switch ([string]$entry.defaclobjtype) {
            'r' { 'arwdDxtm' }
            'S' { 'rwU' }
            'f' { 'X' }
        }
        $grantPrivileges = switch ([string]$entry.defaclobjtype) {
            'r' { 'ALL PRIVILEGES' }
            'S' { 'SELECT, UPDATE, USAGE' }
            'f' { 'EXECUTE' }
        }

        $rawItems = @()
        foreach ($item in @($entry.aclItems)) {
            Assert-Identifier ([string]$item.grantee) 'default ACL grantee'
            Assert-Identifier ([string]$item.grantor) 'default ACL item grantor'
            if ([string]$item.grantor -cne $grantor -or [string]$item.privileges -cne $expectedCodes) {
                throw 'P1 SECURITY BASELINE REJECTED: normalized default ACL item disagrees with raw evidence'
            }
            $rawItems += "$($item.grantee)=$($item.privileges)/$($item.grantor)"
        }
        $reconstructedRaw = '{' + ($rawItems -join ',') + '}'
        if ($reconstructedRaw -cne [string]$entry.defaclacl) {
            throw 'P1 SECURITY BASELINE REJECTED: defaclacl raw array does not match its lossless item expansion'
        }

        $statements.Add("ALTER DEFAULT PRIVILEGES FOR ROLE $grantor IN SCHEMA $schema REVOKE ALL PRIVILEGES ON $objectClause FROM $($knownRoles -join ', ');")
        foreach ($item in @($entry.aclItems)) {
            $statements.Add("ALTER DEFAULT PRIVILEGES FOR ROLE $grantor IN SCHEMA $schema GRANT $grantPrivileges ON $objectClause TO $($item.grantee);")
        }
    }

    return ($statements -join [Environment]::NewLine) + [Environment]::NewLine
}

function Test-P1ProductionSecurityHydrationDeterministic {
    param([Parameter(Mandatory)]$Baseline)
    $a = New-P1ProductionSecurityStateHydrationScript -Baseline $Baseline
    $b = New-P1ProductionSecurityStateHydrationScript -Baseline $Baseline
    return ($a -ceq $b)
}

function Get-SupabaseDefaultAclFixtureScript {
    # Disposable-rehearsal-only fixture reproducing a real, platform-level
    # Postgres mechanism that a vanilla postgres:17 container does not have
    # by default: an ALTER DEFAULT PRIVILEGES rule, owned by role postgres,
    # scoped to schema public, that auto-grants broad privileges to
    # anon/authenticated/service_role on every NEW table/sequence/function
    # created in that schema from then on.
    #
    # This is not a guess - it is the literal, direct catalog fact captured
    # by a read-only production query against pg_default_acl on
    # 2026-07-12 (work/production-029-approval-evidence/
    # pg-default-acl-investigation.json): three defaclobjtype rows ('r'
    # table, 'S' sequence, 'f' function), all owned by postgres, all
    # scoped to namespace public, all granting to postgres/anon/
    # authenticated/service_role. It is independently proven non-
    # retroactive (work/production-029-approval-evidence/acl-analysis.json
    # "appliesRetroactively": false, evidenced by projects_id_seq - a
    # pre-existing sequence with zero anon ACL entries despite the rule
    # existing today) - i.e. it affects only objects created after the
    # rule was configured, which is exactly the failure mode this fixture
    # exists to reproduce for OBJECTS THE CANONICAL MIGRATION CHAIN ITSELF
    # CREATES.
    #
    # This is the fix for the rehearsal fidelity gap that let migration
    # 028's 8 ACL differences (write_command_requests_id_seq,
    # submit_contractor_report_atomic, submit_site_visit_atomic) escape
    # detection during that migration's pre-apply rehearsal: the migration
    # 028 rehearsal (production-security-remediation-rehearsal.ps1)
    # restored a real backup taken with pg_dump --no-privileges (so it
    # never carried this rule) and hydrated ACL only from a PRE-028
    # production inventory snapshot (Get-ProductionActualGrantStatements),
    # which by construction has no rows at all for objects that did not
    # exist yet. When 028 then created the sequence and both functions
    # inside that disposable container, vanilla Postgres - with no default-
    # ACL rule active - granted them nothing extra, so the rehearsal's
    # post-migration inventory looked clean even though real production
    # (which DOES have this rule, independent of anything any backup or
    # migration in this repository ever configured) did not.
    #
    # Isolation: this function only RETURNS a SQL string. It is wired into
    # scripts/production-acl-fixture-rehearsal.ps1's fresh, disposable,
    # locally-created Docker container only - never into any script that
    # holds a production connection, and never into
    # composite-security-certification.ps1's PHASE 4 "expected" (migration-
    # derived-execution) container, which must stay vanilla so it keeps
    # representing "what the migrations alone create" (the correct,
    # narrow, desired end state) rather than drifting to match whatever
    # the platform's default happens to be today.
    #
    # GRANT ALL ON TABLES covers arwdDxtm (matches production's observed
    # table defaclacl); GRANT ALL ON SEQUENCES covers rwU / SELECT+UPDATE+
    # USAGE (matches production's observed sequence defaclacl rwU); GRANT
    # EXECUTE ON FUNCTIONS covers X (matches production's observed function
    # defaclacl X). All three ALTER DEFAULT PRIVILEGES statements are
    # scoped to `FOR ROLE postgres IN SCHEMA public`, exactly matching the
    # real defaclrole/defaclnamespace values found in production - this
    # fixture does not invent a broader rule than what was actually
    # observed.
    return @'
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
'@
}

function Get-RehearsalNormalizedElements {
    # A disposable container's own postgres:17 initdb bootstrap superuser
    # can never have SUPERUSER stripped from it - this is a hard Postgres
    # rule, not a configuration choice (restore-verify.ps1 documents and
    # works around the identical limitation for its own role-restore step:
    # "Postgres hard-refuses to strip SUPERUSER from the actual bootstrap
    # superuser"). Every rehearsal container's local `postgres` role will
    # therefore always report superuser=true, regardless of migration 028's
    # correctness, and regardless of what real production's postgres role
    # actually has (already independently verified as superuser=false
    # against real production evidence in the composite certification run
    # this rehearsal is remediating). This normalizes only that one,
    # proven-non-security-relevant, container-bootstrap artifact - it does
    # not touch any other role, any privilege, or any other field, and it
    # must only ever be applied to a rehearsal container's own local catalog
    # read, never to real production evidence.
    param([Parameter(Mandatory)][object[]]$Elements)

    # $el.value may be a native [ordered] hashtable (Get-SecurityContractInventory's
    # own in-memory shape) or a PSCustomObject (if ever round-tripped through
    # JSON first) - .PSObject.Properties on a Hashtable/OrderedDictionary does
    # NOT enumerate its keys, it exposes the .NET dictionary class's own
    # members (Count/Keys/Values/...), the same bug already found and fixed
    # in ConvertTo-PlainArray. Both shapes must be walked correctly here too.
    $out = New-Object System.Collections.Generic.List[object]
    foreach ($el in $Elements) {
        if ($el.category -eq 'roleAttributes' -and $el.value.role -eq 'postgres' -and [bool]$el.value.superuser) {
            $copyValue = [ordered]@{}
            if ($el.value -is [System.Collections.IDictionary]) {
                foreach ($key in $el.value.Keys) { $copyValue[[string]$key] = $el.value[$key] }
            } else {
                foreach ($prop in $el.value.PSObject.Properties) { $copyValue[$prop.Name] = $prop.Value }
            }
            $copyValue['superuser'] = $false
            $copy = [ordered]@{ category = $el.category; key = $el.key; value = $copyValue }
            $out.Add($copy)
        } else {
            $out.Add($el)
        }
    }
    [object[]]$outArray = $out
    return ,$outArray
}
