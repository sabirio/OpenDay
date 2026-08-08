$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$scriptPath = Join-Path $repoRoot 'scripts\production\Invoke-OwnerProductionPostflight.ps1'
$readOnlyGatePath = Join-Path $repoRoot 'scripts\production\Invoke-OwnerProductionReadOnlyGate.ps1'
$script:passed=0; $script:failed=0
function A([string]$Name,[bool]$Condition){if($Condition){$script:passed++;Write-Host "[PASS] $Name"}else{$script:failed++;Write-Host "[FAIL] $Name"}}

$tokens=$null;$errors=$null
[void][Management.Automation.Language.Parser]::ParseFile($scriptPath,[ref]$tokens,[ref]$errors)
A 'postflight tool parses on Windows PowerShell 5.1' ($errors.Count -eq 0)
$tokens=$null;$errors=$null
[void][Management.Automation.Language.Parser]::ParseFile($readOnlyGatePath,[ref]$tokens,[ref]$errors)
A 'owner read-only gate parses on Windows PowerShell 5.1' ($errors.Count -eq 0)

$temp = Join-Path ([IO.Path]::GetTempPath()) ("owner-postflight-{0}" -f [guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Path $temp | Out-Null
    $database = Join-Path $temp 'database.sql'
    $classifier = Join-Path $temp 'classifier.sql'
    $security = Join-Path $temp 'security.sql'
    [IO.File]::WriteAllText($database,"BEGIN TRANSACTION READ ONLY;`nSELECT 'DATABASE_POSTFLIGHT_ASSERTIONS_PASS';`nROLLBACK;`n",[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($classifier,"SELECT 'ALREADY_RECONCILED';`n",[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($security,"BEGIN TRANSACTION READ ONLY;`nSELECT 'SECURITY_POSTFLIGHT_ASSERTIONS_PASS';`nROLLBACK;`n",[Text.UTF8Encoding]::new($false))
    $arguments = @(
        '-NoProfile','-ExecutionPolicy','Bypass','-File',$scriptPath,'-ValidateOnly',
        '-DatabasePostflightSqlPath',$database,'-ExpectedDatabasePostflightSha256',(Get-FileHash $database -Algorithm SHA256).Hash,
        '-ClassifierSqlPath',$classifier,'-ExpectedClassifierSha256',(Get-FileHash $classifier -Algorithm SHA256).Hash,
        '-SecurityPostflightSqlPath',$security,'-ExpectedSecurityPostflightSha256',(Get-FileHash $security -Algorithm SHA256).Hash,
        '-ExpectedProjectRef','test-project-ref'
    )
    $output = @(& powershell.exe @arguments 2>&1)
    A 'ValidateOnly succeeds without production connection' ($LASTEXITCODE -eq 0 -and ($output -join "`n") -match 'OWNER_PRODUCTION_POSTFLIGHT_VALIDATE_ONLY=PASS')

    $readOnlyArguments = @(
        '-NoProfile','-ExecutionPolicy','Bypass','-File',$readOnlyGatePath,'-ValidateOnly',
        '-SqlPath',$database,'-ExpectedSqlSha256',(Get-FileHash $database -Algorithm SHA256).Hash,
        '-RequiredMarkers','DATABASE_POSTFLIGHT_ASSERTIONS_PASS','-ExpectedProjectRef','test-project-ref'
    )
    $readOnlyOutput = @(& powershell.exe @readOnlyArguments 2>&1)
    A 'generic owner read-only gate validates without production connection' ($LASTEXITCODE -eq 0 -and ($readOnlyOutput -join "`n") -match 'OWNER_PRODUCTION_READ_ONLY_GATE_VALIDATE_ONLY=PASS')

    [IO.File]::WriteAllText($database,"BEGIN TRANSACTION READ ONLY;`nUPDATE public.projects SET city=city;`nROLLBACK;`n",[Text.UTF8Encoding]::new($false))
    $arguments[9] = (Get-FileHash $database -Algorithm SHA256).Hash
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $rejected = @(& powershell.exe @arguments 2>&1)
        $rejectedExitCode = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $previousErrorActionPreference }
    A 'ValidateOnly rejects mutating database SQL' ($rejectedExitCode -ne 0 -and ($rejected -join "`n") -match 'mutating or callable')
}
finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }

$source = Get-Content -LiteralPath $scriptPath -Raw
A 'database, classifier, security and browser stages are separate' ($source -match 'DATABASE_POSTFLIGHT=PASS' -and $source -match 'POST_WRITE_CLASSIFIER=PASS' -and $source -match 'SECURITY_POSTFLIGHT=PASS' -and $source -match 'BROWSER_SMOKE=')
A 'post-COMMIT failure warning is explicit' ($source -match 'DO NOT RERUN RECONCILIATION')
A 'tool contains no corrective command execution path' ($source -notmatch '(?im)^\s*(?:&|Start-Process|Invoke-Expression).*(?:restore|down|reconciliation)')
A 'ValidateOnly returns before production fingerprint' ($source.IndexOf('if ($ValidateOnly)') -lt $source.IndexOf('Get-ProductionConnectionFingerprint'))

Write-Host "RESULT passed=$script:passed failed=$script:failed"
if($script:failed -gt 0){exit 1}
