$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function ConvertFrom-ProductionClassifierOutput {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Output
    )

    $recognizedStates = @('READY', 'ALREADY_RECONCILED', 'NOT_APPLICABLE')
    $text = (($Output | ForEach-Object { [string]$_ }) -join "`n") -replace "`r`n?", "`n"
    $matches = @(
        $text -split "`n" |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -cin $recognizedStates }
    )

    if ($matches.Count -eq 0) {
        throw 'classifier output contains no recognized state'
    }

    $uniqueStates = @($matches | Sort-Object -Unique)
    if ($uniqueStates.Count -ne 1) {
        throw "classifier output contains conflicting states: $($uniqueStates -join ', ')"
    }

    return [pscustomobject][ordered]@{
        State = $uniqueStates[0]
        RecognizedCount = $matches.Count
        DuplicateCount = $matches.Count - 1
    }
}
