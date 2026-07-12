# Certification Aggregator
#
# Pure policy layer (spec section 14): takes category comparator results
# plus pre-flight evidence-integrity flags and decides PASS / FAIL /
# BLOCKED / CONDITIONAL. Never touches a database, a file, or a CLI
# argument - the entrypoint is responsible for calling comparators and
# passing their output in.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RequiredCategories = @('structuralSchema', 'rls', 'policies', 'functions', 'roleAttributes', 'memberships', 'tablePrivileges', 'sequencePrivileges', 'functionPrivileges', 'ownership')

function Get-RequiredCertificationCategories { return ,@($script:RequiredCategories) }

function Resolve-DifferencesAgainstExceptions {
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Differences,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$AcceptedExceptions,
        [Parameter(Mandatory)][datetime]$AsOfUtc
    )

    $exceptionsById = [ordered]@{}
    foreach ($ex in $AcceptedExceptions) { $exceptionsById[$ex.exceptionId] = $ex }

    $resolved = New-Object System.Collections.Generic.List[object]
    $expiredMatches = New-Object System.Collections.Generic.List[object]

    foreach ($diff in $Differences) {
        $match = $AcceptedExceptions | Where-Object {
            $_.category -eq $diff.category -and $_.exactObjectIdentity -eq $diff.objectIdentity
        } | Select-Object -First 1

        if ($null -eq $match) { $resolved.Add($diff); continue }

        $expired = $false
        if ($match.PSObject.Properties.Name -contains 'expiresAt' -and $match.expiresAt) {
            $expiresAtUtc = [datetime]::Parse($match.expiresAt, $null, [System.Globalization.DateTimeStyles]::AdjustToUniversal -bor [System.Globalization.DateTimeStyles]::AssumeUniversal)
            if ($AsOfUtc -gt $expiresAtUtc) { $expired = $true }
        }

        if ($expired) {
            $expiredMatches.Add([pscustomobject]@{ exceptionId = $match.exceptionId; category = $diff.category; objectIdentity = $diff.objectIdentity })
            $resolved.Add($diff)
            continue
        }

        $accepted = New-SecurityDifference -Category $diff.category -ObjectIdentity $diff.objectIdentity -Classification 'ACCEPTED_EXCEPTION' -Severity $diff.severity -Expected $diff.expected -Actual $diff.actual -SourceEvidence $diff.sourceEvidence -RecommendedRemediation $diff.recommendedRemediation -AcceptedExceptionId $match.exceptionId
        $resolved.Add($accepted)
    }

    [object[]]$resolvedArray = $resolved
    [object[]]$expiredArray = $expiredMatches
    return [ordered]@{ Differences = $resolvedArray; ExpiredExceptionMatches = $expiredArray }
}

function Get-CertificationDecision {
    param(
        [Parameter(Mandatory)][hashtable]$CategoryResults,
        [Parameter(Mandatory)][bool]$ProductionInventoryValid,
        [Parameter(Mandatory)][bool]$RestoreVerificationPassed,
        [Parameter(Mandatory)][bool]$ArtifactIntegrityOk,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$ExpiredExceptionMatches,
        [string]$BlockedReason = ''
    )

    if (-not [string]::IsNullOrWhiteSpace($BlockedReason)) {
        return [ordered]@{ status = 'BLOCKED'; reason = $BlockedReason }
    }
    if (-not $ProductionInventoryValid) {
        return [ordered]@{ status = 'FAIL'; reason = 'production security inventory evidence is invalid (checksum/schema/algorithm/status check failed)' }
    }
    if (-not $RestoreVerificationPassed) {
        return [ordered]@{ status = 'FAIL'; reason = 'disposable restore verification did not pass' }
    }
    if (-not $ArtifactIntegrityOk) {
        return [ordered]@{ status = 'FAIL'; reason = 'a prior certification artifact failed integrity/self-validation' }
    }

    $missingCategories = @($script:RequiredCategories | Where-Object { -not $CategoryResults.Contains($_) })
    if ($missingCategories.Count -gt 0) {
        return [ordered]@{ status = 'FAIL'; reason = "missing required category result(s): $($missingCategories -join ', ')" }
    }

    if ($ExpiredExceptionMatches.Count -gt 0) {
        $ids = ($ExpiredExceptionMatches | ForEach-Object { $_.exceptionId }) -join ', '
        return [ordered]@{ status = 'FAIL'; reason = "expired accepted exception(s) block certification: $ids" }
    }

    $blockingDifferences = New-Object System.Collections.Generic.List[object]
    foreach ($categoryName in $script:RequiredCategories) {
        $categoryResult = $CategoryResults[$categoryName]
        foreach ($diff in $categoryResult.differences) {
            if (Test-DifferenceBlocksPass -Difference $diff) { $blockingDifferences.Add($diff) }
        }
    }

    if ($blockingDifferences.Count -gt 0) {
        [object[]]$blockingArray = $blockingDifferences
        return [ordered]@{ status = 'FAIL'; reason = "$($blockingDifferences.Count) unresolved blocking difference(s) across categories"; blockingDifferences = $blockingArray }
    }

    return [ordered]@{ status = 'PASS'; reason = '' }
}
