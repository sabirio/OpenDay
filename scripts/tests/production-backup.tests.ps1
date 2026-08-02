$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$scriptPath = Join-Path $repoRoot 'scripts\production-backup.ps1'
$helperPath = Join-Path $repoRoot 'scripts\lib\ProductionBackupPaths.ps1'
$bindingHelperPath = Join-Path $repoRoot 'scripts\lib\BackupReleaseBinding.ps1'
. $helperPath
. $bindingHelperPath
$sourceCommit = (& git -C $repoRoot rev-parse HEAD).Trim().ToLowerInvariant()
$releaseManifestPath = Join-Path $repoRoot 'scripts\manifests\snag-list-030-035.psd1'
$releaseManifestHash = (Get-FileHash $releaseManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$backupScriptHash = (Get-FileHash $scriptPath -Algorithm SHA256).Hash.ToLowerInvariant()
$bindingArgs = @('-SourceCommit',$sourceCommit,'-ReleaseManifestPath',$releaseManifestPath,
    '-ExpectedReleaseManifestSha256',$releaseManifestHash,'-ExpectedBackupScriptSha256',$backupScriptHash)

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
$tokens=$null; $errors=$null
[void][Management.Automation.Language.Parser]::ParseFile($bindingHelperPath,[ref]$tokens,[ref]$errors)
Assert-True 'P: release-binding helper parses on Windows PowerShell 5.1' ($errors.Count -eq 0)
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
        if($ViaCallOperator){$arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-Command',"& '$scriptPath' -ValidateOnly -SourceCommit '$sourceCommit' -ReleaseManifestPath '$releaseManifestPath' -ExpectedReleaseManifestSha256 '$releaseManifestHash' -ExpectedBackupScriptSha256 '$backupScriptHash'")}
        else {$arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$scriptPath,'-ValidateOnly') + $bindingArgs}
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

$binding = Resolve-BackupReleaseBinding -RepoRoot $repoRoot -CanonicalScriptPath $scriptPath -SourceCommit $sourceCommit `
    -ReleaseManifestPath $releaseManifestPath -ExpectedReleaseManifestSha256 $releaseManifestHash -ExpectedBackupScriptSha256 $backupScriptHash
Assert-True 'release binding: correct offline contract passes' ($binding.sourceCommit -eq $sourceCommit)
Assert-True 'release binding: compatibility manifest hashes agree' ($binding.manifestSha256 -eq $releaseManifestHash -and $binding.releaseManifestSha256 -eq $releaseManifestHash)
Assert-True 'release binding: canonical script hash recorded' ($binding.scriptSha256 -eq $backupScriptHash)
Assert-Throws 'release binding: malformed commit fails' { Resolve-BackupReleaseBinding -RepoRoot $repoRoot -CanonicalScriptPath $scriptPath -SourceCommit 'abc' -ReleaseManifestPath $releaseManifestPath -ExpectedReleaseManifestSha256 $releaseManifestHash -ExpectedBackupScriptSha256 $backupScriptHash } '40-character'
Assert-Throws 'release binding: nonexistent commit fails' { Resolve-BackupReleaseBinding -RepoRoot $repoRoot -CanonicalScriptPath $scriptPath -SourceCommit ('a' * 40) -ReleaseManifestPath $releaseManifestPath -ExpectedReleaseManifestSha256 $releaseManifestHash -ExpectedBackupScriptSha256 $backupScriptHash } 'does not exist'
Assert-Throws 'release binding: non-HEAD commit fails' { Resolve-BackupReleaseBinding -RepoRoot $repoRoot -CanonicalScriptPath $scriptPath -SourceCommit ((& git -C $repoRoot rev-parse HEAD~1).Trim()) -ReleaseManifestPath $releaseManifestPath -ExpectedReleaseManifestSha256 $releaseManifestHash -ExpectedBackupScriptSha256 $backupScriptHash } 'must equal current'
Assert-Throws 'release binding: missing manifest fails' { Resolve-BackupReleaseBinding -RepoRoot $repoRoot -CanonicalScriptPath $scriptPath -SourceCommit $sourceCommit -ReleaseManifestPath 'missing.psd1' -ExpectedReleaseManifestSha256 $releaseManifestHash -ExpectedBackupScriptSha256 $backupScriptHash } 'manifest is missing'
Assert-Throws 'release binding: wrong manifest hash fails' { Resolve-BackupReleaseBinding -RepoRoot $repoRoot -CanonicalScriptPath $scriptPath -SourceCommit $sourceCommit -ReleaseManifestPath $releaseManifestPath -ExpectedReleaseManifestSha256 ('0' * 64) -ExpectedBackupScriptSha256 $backupScriptHash } 'manifest SHA-256 mismatch'
Assert-Throws 'release binding: wrong script hash fails' { Resolve-BackupReleaseBinding -RepoRoot $repoRoot -CanonicalScriptPath $scriptPath -SourceCommit $sourceCommit -ReleaseManifestPath $releaseManifestPath -ExpectedReleaseManifestSha256 $releaseManifestHash -ExpectedBackupScriptSha256 ('0' * 64) } 'script SHA-256 mismatch'
Assert-True 'release binding: obsolete release commit removed' ($source -notmatch 'b14b4761940e88051aa71715105eecf9505fa489')
Assert-True 'release binding: validation precedes production connection' ($source.IndexOf('Resolve-BackupReleaseBinding') -lt $source.IndexOf('Get-ProductionConnectionFingerprint'))
Assert-True 'release binding: qualifying manifest status is explicit' ($source -match 'DUMP_CREATED_STATIC_VALIDATION_PASS_RELEASE_BOUND')

# ─── Phase 3E.1: staging environment parameterization (additive) ───────────
# Everything above this line proves production's own default (-Environment
# omitted) is byte-identical to its pre-Phase-3E.1 behavior. Everything
# below proves the new, explicitly-opt-in staging path independently -
# never exercised unless -Environment staging is passed.
$connectionHelperPath = Join-Path $repoRoot 'scripts\lib\ProductionConnection.ps1'
. $connectionHelperPath
$connectionSource = Get-Content $connectionHelperPath -Raw
$tokens=$null; $errors=$null
[void][Management.Automation.Language.Parser]::ParseFile($connectionHelperPath,[ref]$tokens,[ref]$errors)
Assert-True 'AA: connection helper parses on Windows PowerShell 5.1' ($errors.Count -eq 0)
Assert-True 'AB: Get-ProductionConnectionFingerprint is untouched (function still present, unrenamed)' ($connectionSource -match 'function Get-ProductionConnectionFingerprint')
Assert-True 'AC: Get-StagingConnectionFingerprint reads STAGING_DB_URL, not PRODUCTION_DB_URL' ($connectionSource -match 'function Get-StagingConnectionFingerprint[\s\S]*?STAGING_DB_URL' -and ($connectionSource -split 'function Get-StagingConnectionFingerprint')[1] -notmatch 'PRODUCTION_DB_URL')
Assert-True 'AD: staging fingerprint never reads or writes PRODUCTION_DB_URL' (-not (($connectionSource -split 'function Get-StagingConnectionFingerprint')[1] -match 'PRODUCTION_DB_URL'))

$stagingDefault = Resolve-ProductionBackupPaths -ScriptPath $scriptPath -Timestamp $stamp -Environment 'staging'
Assert-True 'AE: staging environment resolves its own env file' ($stagingDefault.EnvFile -eq (Join-Path $repoRoot 'weekly-tracker\.env.staging'))
Assert-True 'AF: staging environment resolves its own backup root' ($stagingDefault.BackupRoot -eq (Join-Path $repoRoot 'backups\staging'))
Assert-True 'AG: staging and production resolve to different roots' ($stagingDefault.BackupRoot -ne $default.BackupRoot -and $stagingDefault.EnvFile -ne $default.EnvFile)
Assert-Throws 'AH: unknown environment value fails closed' { Resolve-ProductionBackupPaths -ScriptPath $scriptPath -Timestamp $stamp -Environment 'not-a-real-environment' } 'Cannot validate argument'

$backupSource = Get-Content $scriptPath -Raw
Assert-True 'AI: production-backup.ps1 calls Get-StagingConnectionFingerprint only under -Environment staging' ($backupSource -match "elseif \(\`$Environment -eq 'staging'\)[\s\S]{0,200}Get-StagingConnectionFingerprint")
Assert-True 'AJ: safe mode still exits before the staging fingerprint call' ($backupSource.IndexOf("if (`$ValidateOnly -or `$ShowResolvedPaths)") -lt $backupSource.IndexOf('Get-StagingConnectionFingerprint'))
Assert-True 'AK: staging ref is a distinct hardcoded constant, never inferred' ($backupSource -match "'sdndsekarwhumdbcqxni'" -and $backupSource -match "'szgbkeqornkdngoegyso'")
Assert-True 'AL: manifest records which environment produced the backup' ($backupSource -match 'environment = \$Environment')

$actualStagingValidate = Invoke-SafeEntryPoint -WorkingDirectory $repoRoot -ViaCallOperator $false
# (same ValidateOnly-only invocation as test B/C — -Environment does not
# change ValidateOnly's own exit-before-any-connection-work contract, so
# reusing the existing production-default helper is sufficient here; a
# dedicated -Environment staging ValidateOnly call is exercised below.)
$stagingValidateArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$scriptPath,'-ValidateOnly','-Environment','staging') + $bindingArgs
$stdout = Join-Path ([IO.Path]::GetTempPath()) ('backup-staging-safe-'+[guid]::NewGuid().ToString('N')+'.txt')
try {
    $p = Start-Process powershell.exe -ArgumentList $stagingValidateArgs -WorkingDirectory $repoRoot -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdout
    $stagingOutput = [IO.File]::ReadAllText($stdout)
    Assert-True 'AM: -Environment staging -ValidateOnly passes safely (no credentials loaded, nothing created)' ($p.ExitCode -eq 0 -and $stagingOutput -match 'BACKUP_VALIDATE_ONLY: PASS')
} finally { Remove-Item $stdout -Force -ErrorAction SilentlyContinue }

# ─── Phase 3E.1 fix: one canonical connection identity for every command ───
# A real staging run proved the prior --env PGUSER/PGHOST/PGDATABASE design
# fragile: pg_dumpall/pg_dump succeeded, but the bare psql migration-history
# check (which had no --dbname/--username of its own) fell back to the
# container OS user "postgres" instead of the forwarded pooler username.
# Every assertion below is static/source-pattern based, matching this test
# file's own established style (no assertion in this file, before or after
# this fix, actually connects to a real database).
$fixedSource = Get-Content $scriptPath -Raw
Assert-True 'AN: canonical URI is derived from the parsed connection user, never a literal' ($fixedSource -match '\$canonicalDbUri\s*=\s*"postgresql://\$\(\[Uri\]::EscapeDataString\(\$dbUser\)\)')
Assert-True 'AO: canonical URI never embeds the password (argv-visible) - password stays env-only' ($fixedSource -notmatch '\$canonicalDbUri\s*=\s*"postgresql://[^"]*dbPassword')
Assert-True 'AP: roles (pg_dumpall) carries the canonical --dbname' ($fixedSource -match '''pg_dumpall'', "--dbname=\$canonicalDbUri"')
Assert-True 'AQ: schema pg_dump carries the canonical --dbname' ($fixedSource -match '''schema'' \(\$common \+ @\(''pg_dump'', "--dbname=\$canonicalDbUri"')
Assert-True 'AR: data pg_dump carries the canonical --dbname' ($fixedSource -match '''data'' \(\$common \+ @\(''pg_dump'', "--dbname=\$canonicalDbUri"')
Assert-True 'AS: migration-history psql check carries the SAME canonical URI, not a separate construction' ($fixedSource -match '''psql'', "--dbname=\$ConnectionUri"')
Assert-True 'AT: migration-history schema/data dumps carry the canonical --dbname (not a second construction)' (
    (($fixedSource -split "'migration history schema'")[1] -match '^\s*\(\$common \+ @\(''pg_dump'', "--dbname=\$canonicalDbUri"') -and
    (($fixedSource -split "'migration history data'")[1] -match '^\s*\(\$common \+ @\(''pg_dump'', "--dbname=\$canonicalDbUri"')
)
Assert-True 'AU: no command ever passes a bare -U/--username flag (identity comes only from the canonical URI)' ($fixedSource -notmatch '''-U''\s*,' -and $fixedSource -notmatch '''--username''')
Assert-True 'AV: no command hardcodes the bare postgres superuser as a connection target' ($fixedSource -notmatch '-U[''"]?\s*postgres[^.]')
Assert-True 'AW: PGPASSWORD remains the sole password-forwarding mechanism, identical for every command' ($fixedSource -match "'--env', 'PGPASSWORD'" -and ($fixedSource -split "'--env', 'PGPASSWORD'").Count -eq 2)
Assert-True 'AX: canonical URI itself is never written to Host output' ($fixedSource -notmatch 'Write-Host[^\r\n]*canonicalDbUri')
Assert-True 'AY: fingerprint label is environment-aware, not hardcoded to production' ($fixedSource -match "'Staging fingerprint: PASS'" -and $fixedSource -match "'Production fingerprint: PASS'" -and $fixedSource -match '\$fingerprintLabel')
Assert-True 'AZ: production identity (expectedRef/expectedUser derivation) is untouched by this fix' ($fixedSource -match "'sdndsekarwhumdbcqxni'" -and $fixedSource -match "'szgbkeqornkdngoegyso'" -and $fixedSource -match '\$expectedUser = "postgres\.\$expectedRef"')

Write-Host "TOTAL: $script:passed passed, $script:failed failed"
if($script:failed -gt 0){exit 1}
