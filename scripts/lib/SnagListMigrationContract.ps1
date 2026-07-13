# Batch-specific (Snag List 030-034) read-only assertions, kept separate
# from the generic manifest/connection layers so they can be unit-tested
# against a disposable clone and reused, unmodified, by both the live
# production preflight and postflight scripts - same convention as
# lib/RemediationPreflightPostflight.ps1's $Query-callback pattern.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:SnagListTables = @('snags', 'snag_events', 'snag_evidence', 'snag_plan_versions', 'snag_command_requests', 'snag_evidence_upload_intents')
$script:SnagListFunctions = @(
    @{ name = 'execute_snag_command'; args = 'jsonb,uuid,integer' },
    @{ name = 'execute_snag_plan_command'; args = 'jsonb,uuid,integer' },
    @{ name = 'authorize_snag_evidence_upload'; args = 'bigint,uuid,uuid,uuid,integer,jsonb' },
    @{ name = 'register_snag_evidence'; args = 'uuid' },
    @{ name = 'get_snag_evidence_policy'; args = 'bigint' },
    @{ name = 'get_snag_closeout'; args = 'bigint,uuid' },
    @{ name = 'list_snag_project_contractors'; args = 'bigint' },
    @{ name = 'create_snag_plan_upload_intent'; args = 'bigint,uuid' },
    @{ name = 'register_snag_plan_version'; args = 'bigint,uuid,text,text,text,integer' },
    @{ name = 'set_snag_plan_lifecycle'; args = 'uuid,text' }
)
$script:SnagListBuckets = @('snag-plans', 'snag-evidence')

# ---------------------------------------------------------------------------
# Inventories every Snag List object's existence. Returns booleans only -
# never row content - so this is safe to run against production read-only.
# ---------------------------------------------------------------------------
function Get-SnagListObjectInventory {
    param([Parameter(Mandatory)][scriptblock]$Query)

    $inventory = [ordered]@{ tables = [ordered]@{}; functions = [ordered]@{}; buckets = [ordered]@{} }
    foreach ($t in $script:SnagListTables) {
        $sql = "SELECT to_regclass('public.$t') IS NOT NULL"
        $inventory.tables[$t] = ((& $Query $sql).Trim() -eq 't')
    }
    foreach ($fn in $script:SnagListFunctions) {
        $sql = "SELECT to_regprocedure('public.$($fn.name)($($fn.args))') IS NOT NULL"
        $inventory.functions[$fn.name] = ((& $Query $sql).Trim() -eq 't')
    }
    foreach ($b in $script:SnagListBuckets) {
        $sql = "SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id='$b')"
        $inventory.buckets[$b] = ((& $Query $sql).Trim() -eq 't')
    }
    return $inventory
}

# ---------------------------------------------------------------------------
# Confirms the predecessor state this batch needs: the platform tables/
# functions migrations 030-034 depend on (projects, profiles, auth.users,
# can_access_project, can_write_project) already exist.
# ---------------------------------------------------------------------------
function Test-SnagListPredecessorState {
    param([Parameter(Mandatory)][scriptblock]$Query)

    $checks = [ordered]@{
        'public.projects' = "SELECT to_regclass('public.projects') IS NOT NULL"
        'public.profiles' = "SELECT to_regclass('public.profiles') IS NOT NULL"
        'auth.users' = "SELECT to_regclass('auth.users') IS NOT NULL"
        'public.can_access_project(bigint)' = "SELECT to_regprocedure('public.can_access_project(bigint)') IS NOT NULL"
        'public.can_write_project(bigint)' = "SELECT to_regprocedure('public.can_write_project(bigint)') IS NOT NULL"
    }
    $result = [ordered]@{}
    foreach ($k in $checks.Keys) { $result[$k] = ((& $Query $checks[$k]).Trim() -eq 't') }
    return $result
}

# ---------------------------------------------------------------------------
# PRE-apply assertion: every Snag List object must be absent, predecessor
# state must be present, and there must be no blocking lock on the
# predecessor tables. Returns a status the apply script's preflight-approval
# check compares against literally: "READY_FOR_<batchId>".
# ---------------------------------------------------------------------------
function Test-SnagListPreflightAssertions {
    param(
        [Parameter(Mandatory)][scriptblock]$Query,
        [Parameter(Mandatory)][string]$BatchId
    )

    $result = [ordered]@{
        inventory = $null
        predecessorState = $null
        blockingLocks = [ordered]@{ conflictingLockCount = -1; safe = $false }
        reasons = @()
        status = 'NOT_READY'
    }

    $inventory = Get-SnagListObjectInventory -Query $Query
    $result.inventory = $inventory
    $anyPresent = ($inventory.tables.Values + $inventory.functions.Values + $inventory.buckets.Values) -contains $true
    $allPresent = -not (($inventory.tables.Values + $inventory.functions.Values + $inventory.buckets.Values) -contains $false)
    if ($anyPresent -and -not $allPresent) {
        $result.reasons += 'partial Snag List object presence detected - some objects exist, some do not; this is drift or a partial prior apply, not a clean starting point'
    } elseif ($allPresent) {
        $result.reasons += 'every Snag List object already exists - batch appears already applied'
    }

    $predecessor = Test-SnagListPredecessorState -Query $Query
    $result.predecessorState = $predecessor
    if ($predecessor.Values -contains $false) {
        $result.reasons += 'one or more predecessor objects (projects/profiles/auth.users/can_access_project/can_write_project) is missing - migrations 030-034 cannot apply cleanly'
    }

    $lockSql = @"
SELECT count(*) FROM pg_locks l
JOIN pg_class c ON c.oid = l.relation
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('projects','profiles')
  AND l.mode IN ('AccessExclusiveLock','ExclusiveLock','ShareRowExclusiveLock')
"@
    $lockRaw = (& $Query $lockSql).Trim()
    $blockingLockCount = if ([string]::IsNullOrWhiteSpace($lockRaw)) { 0 } else { [int]$lockRaw }
    $result.blockingLocks = [ordered]@{ conflictingLockCount = $blockingLockCount; safe = ($blockingLockCount -eq 0) }
    if ($blockingLockCount -ne 0) { $result.reasons += "found $blockingLockCount conflicting lock(s) on predecessor tables" }

    if ($result.reasons.Count -eq 0 -and -not $anyPresent) {
        $result.status = "READY_FOR_$BatchId"
    } else {
        $result.status = 'NOT_READY'
    }
    return $result
}

# ---------------------------------------------------------------------------
# POST-apply assertion: every Snag List object must now exist with the
# expected contract (bucket privacy/size limits, RLS enabled, no PUBLIC/anon
# execute grants). Read-only - never calls a business RPC, never inserts a
# row.
# ---------------------------------------------------------------------------
function Test-SnagListPostflightAssertions {
    param([Parameter(Mandatory)][scriptblock]$Query)

    $result = [ordered]@{
        inventory = $null
        rlsEnabled = [ordered]@{}
        bucketContract = [ordered]@{}
        noPublicOrAnonExecute = [ordered]@{}
        reasons = @()
        status = 'FAIL'
    }

    $inventory = Get-SnagListObjectInventory -Query $Query
    $result.inventory = $inventory
    $allTablesPresent = -not ($inventory.tables.Values -contains $false)
    $allFunctionsPresent = -not ($inventory.functions.Values -contains $false)
    $allBucketsPresent = -not ($inventory.buckets.Values -contains $false)
    if (-not $allTablesPresent) { $result.reasons += 'one or more expected Snag List tables is missing after apply' }
    if (-not $allFunctionsPresent) { $result.reasons += 'one or more expected Snag List functions is missing after apply' }
    if (-not $allBucketsPresent) { $result.reasons += 'one or more expected Snag List buckets is missing after apply' }

    foreach ($t in $script:SnagListTables) {
        $sql = "SELECT relrowsecurity AND relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='$t'"
        # relforcerowsecurity does not apply to the table owner; RLS enabled (relrowsecurity) is the meaningful signal here.
        $sql = "SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='$t'"
        $enabled = ((& $Query $sql).Trim() -eq 't')
        $result.rlsEnabled[$t] = $enabled
        if (-not $enabled) { $result.reasons += "RLS is not enabled on public.$t" }
    }

    foreach ($b in $script:SnagListBuckets) {
        $sql = "SELECT public||'|'||coalesce(file_size_limit::text,'') FROM storage.buckets WHERE id='$b'"
        $raw = (& $Query $sql).Trim()
        $parts = $raw -split '\|', 2
        $isPublic = if ($parts.Count -gt 0) { $parts[0] } else { '' }
        $sizeLimit = if ($parts.Count -gt 1) { $parts[1] } else { '' }
        $result.bucketContract[$b] = [ordered]@{ public = $isPublic; fileSizeLimit = $sizeLimit }
        if ($isPublic -ne 'f' -and $isPublic -ne 'false') { $result.reasons += "bucket $b is not private (public=$isPublic)" }
    }

    foreach ($fn in $script:SnagListFunctions) {
        $sql = "SELECT has_function_privilege('anon','public.$($fn.name)($($fn.args))','EXECUTE')"
        $anonExecute = ((& $Query $sql).Trim() -eq 't')
        $result.noPublicOrAnonExecute[$fn.name] = [ordered]@{ anonExecute = $anonExecute }
        if ($anonExecute) { $result.reasons += "anon has unexpected EXECUTE on public.$($fn.name)" }
    }

    $result.status = if ($result.reasons.Count -eq 0) { 'PASS' } else { 'FAIL' }
    return $result
}
