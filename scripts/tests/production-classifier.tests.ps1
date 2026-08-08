$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $repoRoot 'scripts\lib\ProductionClassifier.ps1')

$script:passed = 0
$script:failed = 0
function A([string]$Name, [bool]$Condition) {
    if ($Condition) { $script:passed++; Write-Host "[PASS] $Name" }
    else { $script:failed++; Write-Host "[FAIL] $Name" }
}
function F([string]$Name, [scriptblock]$Action) {
    try { & $Action; A $Name $false } catch { A $Name $true }
}

$ready = ConvertFrom-ProductionClassifierOutput @('READY')
A 'READY parses' ($ready.State -ceq 'READY' -and $ready.DuplicateCount -eq 0)
$readyDuplicate = ConvertFrom-ProductionClassifierOutput @('READY','READY')
A 'duplicate READY is one semantic state' ($readyDuplicate.State -ceq 'READY' -and $readyDuplicate.RecognizedCount -eq 2 -and $readyDuplicate.DuplicateCount -eq 1)
$already = ConvertFrom-ProductionClassifierOutput @('ALREADY_RECONCILED')
A 'ALREADY_RECONCILED parses' ($already.State -ceq 'ALREADY_RECONCILED' -and $already.DuplicateCount -eq 0)
$alreadyDuplicate = ConvertFrom-ProductionClassifierOutput @('ALREADY_RECONCILED','ALREADY_RECONCILED')
A 'duplicate ALREADY_RECONCILED is accepted informationally' ($alreadyDuplicate.State -ceq 'ALREADY_RECONCILED' -and $alreadyDuplicate.DuplicateCount -eq 1)
$notApplicable = ConvertFrom-ProductionClassifierOutput @('NOT_APPLICABLE')
A 'NOT_APPLICABLE parses' ($notApplicable.State -ceq 'NOT_APPLICABLE')
F 'conflicting states fail closed' { ConvertFrom-ProductionClassifierOutput @('READY','ALREADY_RECONCILED') }
F 'no recognized marker fails closed' { ConvertFrom-ProductionClassifierOutput @('noise','rows=1') }
$noise = ConvertFrom-ProductionClassifierOutput @('NOTICE: read only', ' READY ', 'count=2')
A 'noise surrounding a valid marker is ignored' ($noise.State -ceq 'READY' -and $noise.RecognizedCount -eq 1)
$lineEndings = ConvertFrom-ProductionClassifierOutput @("noise`r`nALREADY_RECONCILED`r`nALREADY_RECONCILED`n")
A 'CRLF and LF normalize identically' ($lineEndings.State -ceq 'ALREADY_RECONCILED' -and $lineEndings.DuplicateCount -eq 1)

Write-Host "RESULT passed=$script:passed failed=$script:failed"
if ($script:failed -gt 0) { exit 1 }
