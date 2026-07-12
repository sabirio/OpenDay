# Category-specific security contract comparators.
#
# Each Compare-* function takes already-normalized expected/actual
# evidence (plain arrays of ordered hashtables - never a database
# connection, never a CLI concern) and returns a typed result: counts plus
# a deterministically-sorted differences array built exclusively through
# New-SecurityDifference (scripts/lib/SecurityDifferenceModel.ps1), so
# every category speaks the same difference vocabulary while keeping its
# own identity/field/classification rules (spec section 13: "нельзя
# реализовывать всю логику одним Compare-Object без category semantics").

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function ConvertTo-PlainArray {
    # Category normalizer: makes every comparator input the same concrete
    # shape (a plain array of [ordered] hashtables) regardless of source -
    # some evidence arrives as PSCustomObjects from ConvertFrom-Json
    # (production inventory), other evidence is already [ordered]
    # hashtables built directly by Get-SecurityContractInventory /
    # Get-StructuralSchemaEvidence. .PSObject.Properties on a
    # Hashtable/OrderedDictionary does NOT enumerate its keys - it exposes
    # the .NET dictionary class's own members (Count, Keys, Values,
    # IsReadOnly, ...) instead, which silently produced wrong "properties"
    # for hashtable input and broke every comparator KeyFn/FieldDiffFn
    # downstream (found by a real composite run). IDictionary inputs must
    # be walked via .Keys instead of .PSObject.Properties.
    param($Value)
    $out = New-Object System.Collections.Generic.List[object]
    if ($null -eq $Value) { return ,@() }
    foreach ($item in $Value) {
        $ht = [ordered]@{}
        if ($item -is [System.Collections.IDictionary]) {
            foreach ($key in $item.Keys) { $ht[[string]$key] = $item[$key] }
        } else {
            foreach ($prop in $item.PSObject.Properties) { $ht[$prop.Name] = $prop.Value }
        }
        $out.Add($ht)
    }
    [object[]]$outArray = $out
    return ,$outArray
}

function Compare-IdentitySets {
    param(
        [Parameter(Mandatory)][string]$Category,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Expected,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Actual,
        [Parameter(Mandatory)][scriptblock]$KeyFn,
        [Parameter(Mandatory)][scriptblock]$FieldDiffFn,
        [string]$MissingClassification = 'DEFECT',
        [string]$MissingSeverity = 'HIGH',
        [string]$UnexpectedClassification = 'DEFECT',
        [string]$UnexpectedSeverity = 'HIGH',
        [string]$MismatchClassification = 'DEFECT',
        [string]$MismatchSeverity = 'HIGH',
        [string]$SourceEvidence = ''
    )

    $expectedMap = [ordered]@{}
    foreach ($item in $Expected) { $expectedMap[(& $KeyFn $item)] = $item }
    $actualMap = [ordered]@{}
    foreach ($item in $Actual) { $actualMap[(& $KeyFn $item)] = $item }

    $differences = New-Object System.Collections.Generic.List[object]
    $matchedCount = 0

    foreach ($key in $expectedMap.Keys) {
        if (-not $actualMap.Contains($key)) {
            $differences.Add((New-SecurityDifference -Category $Category -ObjectIdentity $key -Classification $MissingClassification -Severity $MissingSeverity -Expected $expectedMap[$key] -Actual $null -SourceEvidence $SourceEvidence -RecommendedRemediation "expected $Category object is missing from actual evidence"))
            continue
        }
        $fieldDiffs = & $FieldDiffFn $expectedMap[$key] $actualMap[$key]
        if ($fieldDiffs -and @($fieldDiffs).Count -gt 0) {
            $differences.Add((New-SecurityDifference -Category $Category -ObjectIdentity $key -Classification $MismatchClassification -Severity $MismatchSeverity -Expected $expectedMap[$key] -Actual $actualMap[$key] -SourceEvidence $SourceEvidence -RecommendedRemediation (($fieldDiffs) -join '; ')))
        } else {
            $matchedCount++
        }
    }
    foreach ($key in $actualMap.Keys) {
        if (-not $expectedMap.Contains($key)) {
            $differences.Add((New-SecurityDifference -Category $Category -ObjectIdentity $key -Classification $UnexpectedClassification -Severity $UnexpectedSeverity -Expected $null -Actual $actualMap[$key] -SourceEvidence $SourceEvidence -RecommendedRemediation "actual evidence contains a $Category object not present in the expected contract"))
        }
    }

    $sortedDifferences = @($differences | Sort-Object objectIdentity, classification)
    $missingCount = @($sortedDifferences | Where-Object { $_.expected -ne $null -and $_.actual -eq $null }).Count
    $unexpectedCount = @($sortedDifferences | Where-Object { $_.expected -eq $null -and $_.actual -ne $null }).Count
    $mismatchCount = $sortedDifferences.Count - $missingCount - $unexpectedCount

    return [ordered]@{
        category        = $Category
        actualSource    = $SourceEvidence
        expectedCount   = $expectedMap.Count
        actualCount     = $actualMap.Count
        matchedCount    = $matchedCount
        missingCount    = $missingCount
        unexpectedCount = $unexpectedCount
        mismatchCount   = $mismatchCount
        differenceCount = $sortedDifferences.Count
        differences     = $sortedDifferences
    }
}

function Norm2($v) {
    if ($null -eq $v) { return '' }
    if ($v -is [array]) { return (($v | ForEach-Object { [string]$_ }) -join ',') }
    return ([string]$v).Trim() -replace '\s+', ' '
}

function Compare-StructuralSchema {
    # Table-existence granularity (spec section 7 MVP boundaries) - the
    # restored clone's deeper catalog integrity (columns, constraints,
    # triggers, row counts) is independently verified by restore-verify.ps1
    # itself; this comparator adds the cross-check that isn't covered
    # anywhere else: does the *migration-derived* expected table set match
    # what's actually present in a real restored production clone.
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Expected, [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Actual)
    Compare-IdentitySets -Category 'structuralSchema' -Expected $Expected -Actual $Actual `
        -KeyFn { param($r) $r.table } `
        -FieldDiffFn { param($e, $a) @() } `
        -SourceEvidence 'restored-production-clone vs migration-derived-execution' `
        -MissingSeverity 'HIGH' -UnexpectedSeverity 'MEDIUM' -MismatchSeverity 'HIGH'
}

function Compare-RlsContract {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Expected, [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Actual)
    Compare-IdentitySets -Category 'rls' -Expected $Expected -Actual $Actual `
        -KeyFn { param($r) "$($r.schema).$($r.table)" } `
        -FieldDiffFn {
            param($e, $a)
            $diffs = @()
            if ([bool]$e.rlsEnabled -ne [bool]$a.rlsEnabled) { $diffs += "rlsEnabled expected=$($e.rlsEnabled) actual=$($a.rlsEnabled)" }
            if ([bool]$e.rlsForced -ne [bool]$a.rlsForced) { $diffs += "rlsForced expected=$($e.rlsForced) actual=$($a.rlsForced)" }
            return $diffs
        } `
        -SourceEvidence 'production-inventory vs migration-derived-execution' `
        -MissingSeverity 'CRITICAL' -UnexpectedSeverity 'MEDIUM' -MismatchSeverity 'CRITICAL'
}

function Compare-PolicyContract {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Expected, [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Actual)
    Compare-IdentitySets -Category 'policies' -Expected $Expected -Actual $Actual `
        -KeyFn { param($r) "$($r.schema).$($r.table).$($r.policyName)" } `
        -FieldDiffFn {
            param($e, $a)
            $diffs = @()
            if ((Norm2 $e.command) -ne (Norm2 $a.command)) { $diffs += "command expected='$($e.command)' actual='$($a.command)'" }
            if ((Norm2 $e.permissive) -ne (Norm2 $a.permissive)) { $diffs += "permissive expected='$($e.permissive)' actual='$($a.permissive)'" }
            if ((Norm2 $e.roles) -ne (Norm2 $a.roles)) { $diffs += "roles expected='$(Norm2 $e.roles)' actual='$(Norm2 $a.roles)'" }
            if ((Norm2 $e.qual) -ne (Norm2 $a.qual)) { $diffs += "qual expected='$($e.qual)' actual='$($a.qual)'" }
            if ((Norm2 $e.withCheck) -ne (Norm2 $a.withCheck)) { $diffs += "withCheck expected='$($e.withCheck)' actual='$($a.withCheck)'" }
            return $diffs
        } `
        -SourceEvidence 'production-inventory vs migration-derived-execution' `
        -MissingSeverity 'CRITICAL' -UnexpectedSeverity 'HIGH' -MismatchSeverity 'HIGH'
}

function Compare-FunctionDefinitions {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Expected, [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Actual)
    Compare-IdentitySets -Category 'functions' -Expected $Expected -Actual $Actual `
        -KeyFn { param($r) "$($r.schema).$($r.name)($($r.identityArguments))" } `
        -FieldDiffFn {
            param($e, $a)
            $diffs = @()
            if ((Norm2 $e.returnType) -ne (Norm2 $a.returnType)) { $diffs += "returnType expected='$($e.returnType)' actual='$($a.returnType)'" }
            if ((Norm2 $e.language) -ne (Norm2 $a.language)) { $diffs += "language expected='$($e.language)' actual='$($a.language)'" }
            if ([bool]$e.securityDefiner -ne [bool]$a.securityDefiner) { $diffs += "securityDefiner expected=$($e.securityDefiner) actual=$($a.securityDefiner)" }
            if ((Norm2 $e.config) -ne (Norm2 $a.config)) { $diffs += "config expected='$(Norm2 $e.config)' actual='$(Norm2 $a.config)'" }
            return $diffs
        } `
        -SourceEvidence 'production-inventory vs migration-derived-execution' `
        -MissingSeverity 'HIGH' -UnexpectedSeverity 'MEDIUM' -MismatchSeverity 'HIGH'
}

function Compare-RoleAttributes {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Expected, [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Actual)
    Compare-IdentitySets -Category 'roleAttributes' -Expected $Expected -Actual $Actual `
        -KeyFn { param($r) $r.role } `
        -FieldDiffFn {
            param($e, $a)
            $diffs = @()
            foreach ($f in @('canLogin', 'superuser', 'inherit', 'createRole', 'createDb', 'replication', 'bypassRls')) {
                if ([bool]$e.$f -ne [bool]$a.$f) { $diffs += "$f expected=$($e.$f) actual=$($a.$f)" }
            }
            return $diffs
        } `
        -SourceEvidence 'production-inventory vs explicit-platform-contract' `
        -MissingSeverity 'CRITICAL' -UnexpectedSeverity 'HIGH' -MismatchSeverity 'CRITICAL'
}

function Compare-RoleMemberships {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Expected, [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Actual)
    Compare-IdentitySets -Category 'memberships' -Expected $Expected -Actual $Actual `
        -KeyFn { param($r) "$($r.grantedRole)->$($r.memberRole)" } `
        -FieldDiffFn {
            param($e, $a)
            $diffs = @()
            if ([bool]$e.adminOption -ne [bool]$a.adminOption) { $diffs += "adminOption expected=$($e.adminOption) actual=$($a.adminOption)" }
            return $diffs
        } `
        -SourceEvidence 'production-inventory vs explicit-platform-contract' `
        -MissingSeverity 'HIGH' -UnexpectedSeverity 'HIGH' -MismatchSeverity 'HIGH'
}

function Compare-TablePrivileges {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Expected, [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Actual)
    Compare-IdentitySets -Category 'tablePrivileges' -Expected $Expected -Actual $Actual `
        -KeyFn { param($r) "$($r.table).$($r.role).$($r.privilege)" } `
        -FieldDiffFn {
            param($e, $a)
            $diffs = @()
            if ([bool]$e.allowed -ne [bool]$a.allowed) { $diffs += "allowed expected=$($e.allowed) actual=$($a.allowed)" }
            return $diffs
        } `
        -SourceEvidence 'production-inventory vs migration-derived-execution' `
        -MissingSeverity 'MEDIUM' -UnexpectedSeverity 'MEDIUM' -MismatchSeverity 'HIGH'
}

function Compare-SequencePrivileges {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Expected, [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Actual)
    Compare-IdentitySets -Category 'sequencePrivileges' -Expected $Expected -Actual $Actual `
        -KeyFn { param($r) "$($r.sequence).$($r.role).$($r.privilege)" } `
        -FieldDiffFn {
            param($e, $a)
            $diffs = @()
            if ([bool]$e.allowed -ne [bool]$a.allowed) { $diffs += "allowed expected=$($e.allowed) actual=$($a.allowed)" }
            return $diffs
        } `
        -SourceEvidence 'production-inventory vs migration-derived-execution' `
        -MissingSeverity 'MEDIUM' -UnexpectedSeverity 'MEDIUM' -MismatchSeverity 'HIGH'
}

function Compare-FunctionPrivileges {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Expected, [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Actual)
    Compare-IdentitySets -Category 'functionPrivileges' -Expected $Expected -Actual $Actual `
        -KeyFn { param($r) "$($r.function).$($r.role)" } `
        -FieldDiffFn {
            param($e, $a)
            $diffs = @()
            if ([bool]$e.execute -ne [bool]$a.execute) { $diffs += "execute expected=$($e.execute) actual=$($a.execute)" }
            return $diffs
        } `
        -SourceEvidence 'production-inventory vs migration-derived-execution' `
        -MissingSeverity 'MEDIUM' -UnexpectedSeverity 'HIGH' -MismatchSeverity 'HIGH'
}

function Compare-Ownership {
    # Ownership is compared against an *allowed owner set*, not a single
    # expected value - spec 8.10/9: clone ownership is never production
    # evidence, and expected ownership is "postgres, or a documented
    # platform-managed exception" rather than a hand-enumerated per-object
    # value (which would just be a copy of production's current state).
    param([Parameter(Mandatory)][object[]]$Actual, [Parameter(Mandatory)][string[]]$AllowedOwners)

    $differences = New-Object System.Collections.Generic.List[object]
    $matched = 0
    foreach ($row in $Actual) {
        $identity = "$($row.objectType):$($row.schema).$($row.identity)"
        if ($AllowedOwners -contains $row.owner) {
            $matched++
        } else {
            $differences.Add((New-SecurityDifference -Category 'ownership' -ObjectIdentity $identity -Classification 'DEFECT' -Severity 'HIGH' -Expected $AllowedOwners -Actual $row.owner -SourceEvidence 'production-inventory vs explicit-platform-contract allowedOwners' -RecommendedRemediation "owner '$($row.owner)' is not in the allowed-owner set - investigate whether an unexpected login role was granted ownership"))
        }
    }
    $sorted = @($differences | Sort-Object objectIdentity)
    return [ordered]@{
        category        = 'ownership'
        actualSource    = 'production-inventory vs explicit-platform-contract allowedOwners'
        expectedCount   = $Actual.Count
        actualCount     = $Actual.Count
        matchedCount    = $matched
        missingCount    = 0
        unexpectedCount = 0
        mismatchCount   = $sorted.Count
        differenceCount = $sorted.Count
        differences     = $sorted
    }
}
