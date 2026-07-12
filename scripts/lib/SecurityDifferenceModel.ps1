# Security Difference Model
#
# Single versioned shape for every difference the composite certification
# engine can report, plus the fixed classification/severity vocabularies and
# the PASS-blocking rule (section 11 of the composite-certification spec).
# Comparators only ever construct differences through New-SecurityDifference,
# so the vocabulary can't drift between category comparators.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:AllowedDifferenceClassifications = @(
    'DEFECT',
    'EXPECTED_ENVIRONMENT_DIFFERENCE',
    'BACKUP_TRANSPORT_LIMITATION',
    'PLATFORM_MANAGED_DIFFERENCE',
    'ACCEPTED_EXCEPTION',
    'OUT_OF_SCOPE_SYSTEM_OBJECT',
    'PARSER_OR_COMPARATOR_BUG',
    'STALE_EXPECTATION'
)

$script:AllowedDifferenceSeverities = @('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')

function Get-AllowedDifferenceClassifications { return ,@($script:AllowedDifferenceClassifications) }
function Get-AllowedDifferenceSeverities { return ,@($script:AllowedDifferenceSeverities) }

function New-SecurityDifference {
    param(
        [Parameter(Mandatory)][string]$Category,
        [Parameter(Mandatory)][string]$ObjectIdentity,
        [Parameter(Mandatory)][string]$Classification,
        [Parameter(Mandatory)][string]$Severity,
        $Expected,
        $Actual,
        [string]$SourceEvidence = '',
        [string]$RecommendedRemediation = '',
        [string]$AcceptedExceptionId = ''
    )

    if ($script:AllowedDifferenceClassifications -notcontains $Classification) {
        throw "unknown difference classification '$Classification' - fail closed rather than emit an unclassified difference"
    }
    if ($script:AllowedDifferenceSeverities -notcontains $Severity) {
        throw "unknown difference severity '$Severity'"
    }
    if ($Classification -eq 'ACCEPTED_EXCEPTION' -and [string]::IsNullOrWhiteSpace($AcceptedExceptionId)) {
        throw 'ACCEPTED_EXCEPTION classification requires a non-empty AcceptedExceptionId'
    }

    return [ordered]@{
        differenceId            = "$Category::$ObjectIdentity"
        category                = $Category
        objectIdentity           = $ObjectIdentity
        classification           = $Classification
        expected                 = $Expected
        actual                   = $Actual
        severity                 = $Severity
        sourceEvidence           = $SourceEvidence
        recommendedRemediation   = $RecommendedRemediation
        acceptedExceptionId      = $AcceptedExceptionId
    }
}

function Test-DifferenceBlocksPass {
    # A single difference blocks PASS unless it is explicitly classified as
    # a non-defect category. Section 11: "необъяснённый HIGH или CRITICAL
    # difference блокирует PASS" and "необъяснённый MEDIUM difference также
    # должен блокировать PASS, если contract не разрешает иное" - here
    # "explained" means classified as anything other than DEFECT/
    # PARSER_OR_COMPARATOR_BUG/STALE_EXPECTATION, all three of which always
    # block regardless of severity (a stale expectation or comparator bug is
    # never proof of a passing security posture).
    param([Parameter(Mandatory)][hashtable]$Difference)

    $alwaysBlocking = @('DEFECT', 'PARSER_OR_COMPARATOR_BUG', 'STALE_EXPECTATION')
    if ($alwaysBlocking -contains $Difference.classification) { return $true }

    $nonBlocking = @('EXPECTED_ENVIRONMENT_DIFFERENCE', 'BACKUP_TRANSPORT_LIMITATION', 'PLATFORM_MANAGED_DIFFERENCE', 'ACCEPTED_EXCEPTION', 'OUT_OF_SCOPE_SYSTEM_OBJECT')
    if ($nonBlocking -contains $Difference.classification) { return $false }

    # Unreachable given New-SecurityDifference's validation, but fail closed.
    return $true
}
