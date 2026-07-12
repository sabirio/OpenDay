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
