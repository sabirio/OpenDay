Set-StrictMode -Version Latest

$script:SnagListPreflightSchemaVersion = 'snag-list-preflight/v1'
$script:SnagListPreflightMaxAgeMinutes = 30

function Get-SnagListPreflightSchemaVersion { return $script:SnagListPreflightSchemaVersion }

function New-SnagListPreflightEvidence {
    param(
        [Parameter(Mandatory)][string]$BatchId,
        [Parameter(Mandatory)][bool]$ProductionFingerprintVerified,
        [Parameter(Mandatory)][bool]$ReadOnlyVerified,
        [Parameter(Mandatory)]$Assertions,
        [datetime]$GeneratedAtUtc = [DateTime]::UtcNow
    )
    return [ordered]@{
        schemaVersion = $script:SnagListPreflightSchemaVersion
        generatedAtUtc = $GeneratedAtUtc.ToUniversalTime().ToString('o')
        batchId = $BatchId
        productionFingerprintVerified = $ProductionFingerprintVerified
        readOnlyVerified = $ReadOnlyVerified
        assertions = $Assertions
        status = $Assertions.status
    }
}

function Get-RequiredEvidenceProperty {
    param([Parameter(Mandatory)][AllowNull()]$Object, [Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][string]$EvidencePath, [Parameter(Mandatory)][string]$Schema)
    if ($null -eq $Object -or -not ($Object.PSObject.Properties.Name -contains $Name)) {
        throw "PREFLIGHT EVIDENCE REJECTED: file='$EvidencePath' schema='$Schema' missing required field '$Name'; no migration was attempted"
    }
    return $Object.$Name
}

function Import-SnagListPreflightEvidence {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$ExpectedBatchId,
        [int]$MaxAgeMinutes = $script:SnagListPreflightMaxAgeMinutes,
        [datetime]$NowUtc = [DateTime]::UtcNow
    )
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    try { $raw = Get-Content -Raw -LiteralPath $resolved | ConvertFrom-Json } catch {
        throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='unreadable' invalid JSON; no migration was attempted"
    }

    $hasVersion = $raw.PSObject.Properties.Name -contains 'schemaVersion'
    $sourceSchema = if ($hasVersion) { [string]$raw.schemaVersion } else { 'legacy-unversioned-v0' }
    if ($sourceSchema -notin @($script:SnagListPreflightSchemaVersion, 'legacy-unversioned-v0')) {
        throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' unsupported schema version; no migration was attempted"
    }

    $generatedText = [string](Get-RequiredEvidenceProperty $raw 'generatedAtUtc' $resolved $sourceSchema)
    $generated = [datetime]::MinValue
    if (-not [datetime]::TryParse($generatedText, [ref]$generated)) {
        throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' invalid field 'generatedAtUtc'; no migration was attempted"
    }
    $age = $NowUtc.ToUniversalTime() - $generated.ToUniversalTime()
    if ($age.TotalMinutes -lt -1 -or $age.TotalMinutes -gt $MaxAgeMinutes) {
        throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' stale field 'generatedAtUtc' (maxAgeMinutes=$MaxAgeMinutes); no migration was attempted"
    }

    $batchId = [string](Get-RequiredEvidenceProperty $raw 'batchId' $resolved $sourceSchema)
    if ($batchId -cne $ExpectedBatchId) { throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' invalid field 'batchId'; no migration was attempted" }
    $fingerprint = Get-RequiredEvidenceProperty $raw 'productionFingerprintVerified' $resolved $sourceSchema
    if ($fingerprint -isnot [bool] -or -not $fingerprint) { throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' failed field 'productionFingerprintVerified'; no migration was attempted" }

    # The legacy adapter is intentionally explicit: v0 was emitted only by
    # production-migration-preflight-live.ps1, whose every query is wrapped
    # in READ ONLY REPEATABLE READ. v1 records that invariant directly.
    $readOnly = if ($sourceSchema -eq 'legacy-unversioned-v0') { $true } else { Get-RequiredEvidenceProperty $raw 'readOnlyVerified' $resolved $sourceSchema }
    if ($readOnly -isnot [bool] -or -not $readOnly) { throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' failed field 'readOnlyVerified'; no migration was attempted" }

    $assertions = Get-RequiredEvidenceProperty $raw 'assertions' $resolved $sourceSchema
    $predecessor = Get-RequiredEvidenceProperty $assertions 'predecessorState' $resolved $sourceSchema
    if ($predecessor -isnot [pscustomobject] -and $predecessor -isnot [hashtable]) { throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' invalid field 'assertions.predecessorState'; no migration was attempted" }
    $classification = [string](Get-RequiredEvidenceProperty $assertions 'classification' $resolved $sourceSchema)
    $assertionStatus = [string](Get-RequiredEvidenceProperty $assertions 'status' $resolved $sourceSchema)
    $rootStatus = [string](Get-RequiredEvidenceProperty $raw 'status' $resolved $sourceSchema)
    $locks = Get-RequiredEvidenceProperty $assertions 'blockingLocks' $resolved $sourceSchema
    if ($null -eq $locks -or ($locks -isnot [pscustomobject] -and $locks -isnot [hashtable])) { throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' invalid field 'assertions.blockingLocks' (object required); no migration was attempted" }
    $count = Get-RequiredEvidenceProperty $locks 'conflictingLockCount' $resolved $sourceSchema
    $safe = Get-RequiredEvidenceProperty $locks 'safe' $resolved $sourceSchema
    if ($count -isnot [int] -and $count -isnot [long]) { throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' invalid field 'assertions.blockingLocks.conflictingLockCount'; no migration was attempted" }
    if ($count -lt 0 -or $safe -isnot [bool]) { throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' invalid field 'assertions.blockingLocks'; no migration was attempted" }
    $hasDetails = $locks.PSObject.Properties.Name -contains 'details'
    if (-not $hasDetails -and -not ($sourceSchema -eq 'legacy-unversioned-v0' -and $count -eq 0)) { throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' missing required field 'assertions.blockingLocks.details'; no migration was attempted" }
    # Windows PowerShell 5.1 ConvertFrom-Json unwraps [] to $null and a
    # one-element JSON array to its element. Property presence plus count
    # preserves the array contract without treating an absent field as zero.
    [object[]]$details = if (-not $hasDetails -or ($null -eq $locks.details -and $count -eq 0)) { @() } else { @($locks.details) }
    $invalidDetailCount = ($details | Where-Object { $_ -isnot [pscustomobject] -and $_ -isnot [hashtable] } | Measure-Object).Count
    $detailCount = ($details | Measure-Object).Count
    if ($count -gt 0 -and $invalidDetailCount -gt 0) { throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' invalid field 'assertions.blockingLocks.details' (object array required); no migration was attempted" }
    if ($detailCount -ne $count -or $safe -ne ($count -eq 0)) { throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' contradictory field 'assertions.blockingLocks'; no migration was attempted" }

    $expectedReady = "READY_FOR_$ExpectedBatchId"
    if ($classification -cne 'READY' -or $assertionStatus -cne $expectedReady -or $rootStatus -cne $expectedReady) {
        throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' state is not READY (classification=$classification status=$rootStatus); no migration was attempted"
    }
    if (-not $safe) { throw "PREFLIGHT EVIDENCE REJECTED: file='$resolved' schema='$sourceSchema' blocking locks present ($count); no migration was attempted" }

    return [pscustomobject]@{
        schemaVersion = $script:SnagListPreflightSchemaVersion
        sourceSchemaVersion = $sourceSchema
        generatedAtUtc = $generated.ToUniversalTime()
        batchId = $batchId
        productionFingerprintVerified = $true
        readOnlyVerified = $true
        predecessorState = $predecessor
        classification = $classification
        status = $rootStatus
        blockingLocks = [pscustomobject]@{ conflictingLockCount = [int]$count; safe = [bool]$safe; details = @($details) }
        evidencePath = $resolved
    }
}

function Get-SnagListReleaseFailureStatus {
    param([string]$Phase, [object[]]$Steps = @())
    $failedAttempt = @($Steps | Where-Object { $_.status -eq 'FAIL' -and $_.attempted -eq $true } | Select-Object -First 1)
    if ($failedAttempt.Count -eq 1) { return "FAILED AT MIGRATION $($failedAttempt[0].number)" }
    if ($Phase -eq 'PRE_APPLY') { return 'BLOCKED BEFORE APPLY - EXECUTOR EVIDENCE CONTRACT DEFECT' }
    return 'BLOCKED BEFORE APPLY - EXECUTOR GATE FAILURE'
}
