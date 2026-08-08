$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$helperPath = Join-Path $repoRoot 'scripts\lib\GitIsolation.ps1'
. $helperPath

$script:passed = 0
$script:failed = 0
function A([string]$Name, [bool]$Condition) {
    if ($Condition) { $script:passed++; Write-Host "[PASS] $Name" }
    else { $script:failed++; Write-Host "[FAIL] $Name" }
}

$tokens=$null; $errors=$null
[void][Management.Automation.Language.Parser]::ParseFile($helperPath,[ref]$tokens,[ref]$errors)
A 'helper parses on Windows PowerShell 5.1' ($errors.Count -eq 0)

$source = Get-Content -LiteralPath $helperPath -Raw
A 'helper does not depend on Windows NUL' ($source -notmatch 'core\.excludesFile=NUL')
A 'helper does not depend on /dev/null' ($source -notmatch 'core\.excludesFile=/dev/null')
A 'temporary file uses CreateNew' ($source -match 'FileMode\]::CreateNew')
A 'cleanup is guaranteed by finally' ($source -match 'finally\s*\{[\s\S]*Remove-Item')

$tempRepo = Join-Path ([IO.Path]::GetTempPath()) ("openday git helper spaces {0}" -f [guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Path $tempRepo | Out-Null
    & git -C $tempRepo init --quiet
    if ($LASTEXITCODE -ne 0) { throw 'temporary git init failed' }
    [IO.File]::WriteAllText((Join-Path $tempRepo '.gitignore'), "*.secret`n", [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $tempRepo 'owner.secret'), 'ignored', [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $tempRepo 'visible.txt'), 'visible', [Text.UTF8Encoding]::new($false))

    A 'Windows-style repository path with spaces is supported' (Test-GitPathIgnored -RepoRoot $tempRepo -Path (Join-Path $tempRepo 'owner.secret'))
    A 'non-ignored path returns false deterministically' (-not (Test-GitPathIgnored -RepoRoot $tempRepo -Path (Join-Path $tempRepo 'visible.txt')))

    $success = Invoke-GitWithEmptyGlobalExcludes -ArgumentList @('-C',$tempRepo,'rev-parse','--is-inside-work-tree')
    A 'successful Git command returns exit zero' ($success.ExitCode -eq 0)
    A 'temporary excludes file is absent after success' (-not (Test-Path -LiteralPath $success.TemporaryExcludesPath))

    $failure = Invoke-GitWithEmptyGlobalExcludes -ArgumentList @('-C',$tempRepo,'definitely-not-a-command')
    A 'Git failure returns nonzero deterministically' ($failure.ExitCode -ne 0)
    A 'temporary excludes file is absent after failure' (-not (Test-Path -LiteralPath $failure.TemporaryExcludesPath))
}
finally {
    Remove-Item -LiteralPath $tempRepo -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "RESULT passed=$script:passed failed=$script:failed"
if ($script:failed -gt 0) { exit 1 }
