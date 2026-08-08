$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-ProductionSqlArtifact {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$ExpectedSha256,
        [Parameter(Mandatory)][string]$Label,
        [switch]$RequireTransaction,
        [switch]$AllowProceduralAssertions
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Label is missing" }
    if ($ExpectedSha256 -cnotmatch '^[0-9a-fA-F]{64}$') { throw "$Label expected SHA-256 is malformed" }
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -cne $ExpectedSha256.ToLowerInvariant()) { throw "$Label SHA-256 mismatch" }

    $text = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path).Path)
    if ($text -match '(?im)^\s*\\(?:copy|include|ir|i|o|out|!|setenv)\b') {
        throw "$Label contains a forbidden psql meta-command"
    }
    if ($text -match '(?im)^\s*(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|COPY|VACUUM|ANALYZE|REFRESH|REINDEX|CLUSTER|COMMENT|SECURITY\s+LABEL)\b') {
        throw "$Label contains a mutating or callable statement"
    }
    if (-not $AllowProceduralAssertions -and $text -match '(?im)^\s*DO\b') {
        throw "$Label contains a procedural assertion block that was not explicitly allowed"
    }
    if ($RequireTransaction) {
        if ($text -cnotmatch '(?im)^\s*BEGIN\s+TRANSACTION\s+READ\s+ONLY\s*;\s*$') {
            throw "$Label lacks an explicit read-only transaction"
        }
        if ($text -cnotmatch '(?im)^\s*ROLLBACK\s*;\s*$') {
            throw "$Label lacks an explicit ROLLBACK"
        }
    }

    return [pscustomobject][ordered]@{
        Path = (Resolve-Path -LiteralPath $Path).Path
        Sha256 = $actual
        Text = $text
        ReadOnly = $true
        ExplicitReadOnlyTransaction = [bool]$RequireTransaction
        ProceduralAssertionsAllowed = [bool]$AllowProceduralAssertions
    }
}

function Test-ProductionTranscriptMarkers {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Transcript,
        [Parameter(Mandatory)][string[]]$RequiredMarkers
    )

    $text = (($Transcript | ForEach-Object { [string]$_ }) -join "`n") -replace "`r`n?", "`n"
    $lines = @($text -split "`n" | ForEach-Object { $_.Trim() })
    $counts = [ordered]@{}
    foreach ($marker in $RequiredMarkers) {
        $counts[$marker] = @($lines | Where-Object { $_ -ceq $marker }).Count
    }
    return [pscustomobject][ordered]@{
        Passed = (@($counts.GetEnumerator() | Where-Object { $_.Value -ne 1 }).Count -eq 0)
        Counts = $counts
    }
}
