$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function New-EmptyGitExcludesFile {
    [CmdletBinding()]
    param()

    $path = Join-Path ([IO.Path]::GetTempPath()) ("openday-git-excludes-{0}.tmp" -f [guid]::NewGuid().ToString('N'))
    $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $stream.Dispose()
    return $path
}

function Invoke-GitWithEmptyGlobalExcludes {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string[]]$ArgumentList
    )

    $emptyExcludesPath = $null
    try {
        $emptyExcludesPath = New-EmptyGitExcludesFile
        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $output = @(& git '-c' "core.excludesFile=$emptyExcludesPath" @ArgumentList 2>&1)
            $exitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        return [pscustomobject][ordered]@{
            ExitCode = $exitCode
            Output = $output
            TemporaryExcludesPath = $emptyExcludesPath
        }
    }
    finally {
        if ($emptyExcludesPath -and (Test-Path -LiteralPath $emptyExcludesPath)) {
            Remove-Item -LiteralPath $emptyExcludesPath -Force -ErrorAction SilentlyContinue
            if (Test-Path -LiteralPath $emptyExcludesPath) {
                throw "failed to clean up temporary Git excludes file: $emptyExcludesPath"
            }
        }
    }
}

function Test-GitPathIgnored {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$Path
    )

    $result = Invoke-GitWithEmptyGlobalExcludes -ArgumentList @('-C', $RepoRoot, 'check-ignore', '--', $Path)
    if ($result.ExitCode -eq 0) { return $true }
    if ($result.ExitCode -eq 1) { return $false }

    $detail = (@($result.Output | ForEach-Object { $_.ToString() }) -join ' | ').Trim()
    throw "git check-ignore failed with exit code $($result.ExitCode)$(if ($detail) { ": $detail" })"
}
