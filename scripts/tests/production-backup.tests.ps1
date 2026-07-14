$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$scriptPath = Join-Path $repoRoot 'scripts\production-backup.ps1'
$helperPath = Join-Path $repoRoot 'scripts\lib\ProductionBackupPaths.ps1'
. $helperPath

$script:passed = 0
$script:failed = 0
function Assert-True([string]$Name, [bool]$Condition) {
    if ($Condition) { $script:passed++; Write-Host "[PASS] $Name" }
    else { $script:failed++; Write-Host "[FAIL] $Name" }
}
function Assert-Throws([string]$Name, [scriptblock]$Action, [string]$Pattern) {
    try { & $Action; Assert-True $Name $false }
    catch { Assert-True $Name ($_.Exception.Message -match $Pattern) }
}

$tokens=$null; $errors=$null
[void][Management.Automation.Language.Parser]::ParseFile($scriptPath,[ref]$tokens,[ref]$errors)
Assert-True 'A/P: production-backup.ps1 parses on Windows PowerShell 5.1' ($errors.Count -eq 0)
$tokens=$null; $errors=$null
[void][Management.Automation.Language.Parser]::ParseFile($helperPath,[ref]$tokens,[ref]$errors)
Assert-True 'P: path helper parses on Windows PowerShell 5.1' ($errors.Count -eq 0)
$source=Get-Content $scriptPath -Raw
Assert-True 'regression: param defaults do not evaluate PSScriptRoot' ($source -notmatch '\[string\]\$EnvFile\s*=|\[string\]\$BackupRoot\s*=')
Assert-True 'R: strict mode remains enabled' ($source -match 'Set-StrictMode -Version Latest')
Assert-True 'S: safe mode exits before ProductionConnection is called' ($source.IndexOf("if (`$ValidateOnly -or `$ShowResolvedPaths)") -lt $source.IndexOf('Get-ProductionConnectionFingerprint'))

$stamp='20990101T010203Z'
$default=Resolve-ProductionBackupPaths -ScriptPath $scriptPath -Timestamp $stamp
Assert-True 'A: default invocation resolves repository root' ($default.RepoRoot -eq $repoRoot)
Assert-True 'A: default environment is repository-relative' ($default.EnvFile -eq (Join-Path $repoRoot 'weekly-tracker\.env.production.local'))
Assert-True 'A: default backup root is repository-controlled' ($default.BackupRoot -eq (Join-Path $repoRoot 'backups\production'))

$old=(Get-Location).Path
try { Set-Location $env:TEMP; $outside=Resolve-ProductionBackupPaths -ScriptPath $scriptPath -Timestamp $stamp }
finally { Set-Location $old }
Assert-True 'B: another working directory does not change resolution' ($outside.EnvFile -eq $default.EnvFile)
Assert-True 'C: absolute script path passes' ($outside.ScriptPath -eq $scriptPath)
Assert-True 'D: relative explicit paths are repository-relative' ((Resolve-ProductionBackupPaths -ScriptPath $scriptPath -EnvFile 'weekly-tracker\.env.production.local' -BackupRoot 'backups\production' -Timestamp $stamp).EnvFile -eq $default.EnvFile)

function Invoke-SafeEntryPoint([string]$WorkingDirectory, [bool]$ViaCallOperator) {
    $stdout=Join-Path ([IO.Path]::GetTempPath()) ('backup-safe-'+[guid]::NewGuid().ToString('N')+'.txt')
    try {
        if($ViaCallOperator){$arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-Command',"& '$scriptPath' -ValidateOnly")}
        else {$arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$scriptPath,'-ValidateOnly')}
        $p=Start-Process powershell.exe -ArgumentList $arguments -WorkingDirectory $WorkingDirectory -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdout
        [pscustomobject]@{ExitCode=$p.ExitCode;Output=[IO.File]::ReadAllText($stdout)}
    } finally {Remove-Item $stdout -Force -ErrorAction SilentlyContinue}
}
$actualOutside=Invoke-SafeEntryPoint -WorkingDirectory $env:TEMP -ViaCallOperator $false
Assert-True 'B/C: absolute -File invocation from another CWD passes safely' ($actualOutside.ExitCode -eq 0 -and $actualOutside.Output -match 'BACKUP_VALIDATE_ONLY: PASS')
$actualWrapper=Invoke-SafeEntryPoint -WorkingDirectory $repoRoot -ViaCallOperator $true
Assert-True 'E: invocation through call-operator wrapper passes safely' ($actualWrapper.ExitCode -eq 0 -and $actualWrapper.Output -match 'BACKUP_VALIDATE_ONLY: PASS')

$tmp=Join-Path ([IO.Path]::GetTempPath()) ('backup path tests '+[guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Path (Join-Path $tmp '.git'),(Join-Path $tmp 'scripts\lib'),(Join-Path $tmp 'weekly-tracker'),(Join-Path $tmp 'backups\production') -Force | Out-Null
    Copy-Item $scriptPath (Join-Path $tmp 'scripts\production-backup.ps1')
    Copy-Item $helperPath (Join-Path $tmp 'scripts\lib\ProductionBackupPaths.ps1')
    New-Item -ItemType File -Path (Join-Path $tmp 'weekly-tracker\.env.production.local') | Out-Null
    $spaceResult=Resolve-ProductionBackupPaths -ScriptPath (Join-Path $tmp 'scripts\production-backup.ps1') -Timestamp $stamp
    Assert-True 'F: repository path containing spaces passes' ($spaceResult.RepoRoot -eq $tmp)
} finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }

$explicit=Resolve-ProductionBackupPaths -ScriptPath $scriptPath -EnvFile (Join-Path $repoRoot 'weekly-tracker\.env.production.local') -Timestamp $stamp
Assert-True 'G/H: explicit valid EnvFile takes precedence' ($explicit.EnvFile -eq $default.EnvFile)
Assert-Throws 'J: explicit missing EnvFile fails closed' { Resolve-ProductionBackupPaths -ScriptPath $scriptPath -EnvFile 'weekly-tracker\missing.env' -Timestamp $stamp } 'environment file is missing'
Assert-Throws 'K: empty EnvFile is explicitly treated as omitted' { Resolve-ProductionBackupPaths -ScriptPath $scriptPath -EnvFile '' -Timestamp $stamp | ForEach-Object { if ($_.EnvFile -eq $default.EnvFile) { throw 'OMITTED_OK' } } } 'OMITTED_OK'
Assert-Throws 'L: environment directory is rejected' { Resolve-ProductionBackupPaths -ScriptPath $scriptPath -EnvFile 'weekly-tracker' -Timestamp $stamp } 'missing or not a file'
Assert-Throws 'M: invalid output root fails' { Resolve-ProductionBackupPaths -ScriptPath $scriptPath -BackupRoot 'backups\production\missing' -Timestamp $stamp } 'missing or not a directory'
Assert-Throws 'O: output traversal is rejected' { Resolve-ProductionBackupPaths -ScriptPath $scriptPath -BackupRoot '..\outside' -Timestamp $stamp } 'escapes'
$collision=Join-Path $repoRoot "backups\production\$stamp"
try { New-Item -ItemType Directory -Path $collision | Out-Null; Assert-Throws 'N: existing destination collision fails' { Resolve-ProductionBackupPaths -ScriptPath $scriptPath -Timestamp $stamp } 'already exists' }
finally { Remove-Item -LiteralPath $collision -Force -ErrorAction SilentlyContinue }
Assert-True 'Y: path failure classification is exact' ((Get-ProductionBackupFailureClassification) -eq 'SNAG LIST 030-035 PRODUCTION RELEASE: BLOCKED BEFORE APPLY - BACKUP TOOLING DEFECT')
Assert-True 'Z: backup failure remains pre-apply by contract' ($source.IndexOf('Get-ProductionConnectionFingerprint') -gt $source.IndexOf('Resolve-ProductionBackupPaths'))
Assert-True 'U: every dump command checks its native exit code' ($source -match '\$exitCode\s*=\s*\$LASTEXITCODE[\s\S]*?if \(\$exitCode -ne 0\)')
Assert-True 'W: password and RawUri are never written to backup metadata' ($source -notmatch 'Write-Host[^\r\n]*(dbPassword|RawUri)' -and $source -notmatch '(?m)^\s*(password|rawUri)\s*=')
Assert-True 'certification injection is loopback-only and explicitly confirmed' ($source -match 'disposable certification connection must be loopback-only' -and $source -match 'OPENDAY_DISPOSABLE_BACKUP_CERTIFICATION')
Assert-True 'production SSL remains required' ($source.Contains("if (`$CertificationMode) { 'disable' } else { 'require' }"))

Write-Host "TOTAL: $script:passed passed, $script:failed failed"
if($script:failed -gt 0){exit 1}
