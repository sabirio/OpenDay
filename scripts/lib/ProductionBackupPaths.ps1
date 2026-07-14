Set-StrictMode -Version Latest

function Get-ProductionBackupFailureClassification {
    return 'SNAG LIST 030-035 PRODUCTION RELEASE: BLOCKED BEFORE APPLY - BACKUP TOOLING DEFECT'
}

function Test-PathWithinRoot {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Root)
    $comparison = if ($env:OS -eq 'Windows_NT') { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
    $rootWithSeparator = $Root.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    return $Path.StartsWith($rootWithSeparator, $comparison) -or $Path.Equals($Root, $comparison)
}

function Resolve-ProductionBackupPaths {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$ScriptPath,
        [AllowEmptyString()][string]$EnvFile,
        [AllowEmptyString()][string]$BackupRoot,
        [Parameter(Mandatory)][ValidatePattern('^\d{8}T\d{6}Z$')][string]$Timestamp
    )

    if ([string]::IsNullOrWhiteSpace($ScriptPath)) { throw 'canonical script path is empty' }
    $canonicalScript = [IO.Path]::GetFullPath($ScriptPath)
    if (-not (Test-Path -LiteralPath $canonicalScript -PathType Leaf)) { throw "canonical script path is missing: $canonicalScript" }
    $scriptRoot = Split-Path -Parent $canonicalScript
    $repoRoot = [IO.Path]::GetFullPath((Join-Path $scriptRoot '..'))
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot '.git'))) { throw "repository root is invalid: $repoRoot" }

    $canonicalBackupRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'backups\production'))
    if ([string]::IsNullOrWhiteSpace($EnvFile)) {
        $resolvedEnv = [IO.Path]::GetFullPath((Join-Path $repoRoot 'weekly-tracker\.env.production.local'))
    } elseif ([IO.Path]::IsPathRooted($EnvFile)) {
        $resolvedEnv = [IO.Path]::GetFullPath($EnvFile)
    } else {
        # Explicit relative paths are repository-relative, never CWD-relative.
        $resolvedEnv = [IO.Path]::GetFullPath((Join-Path $repoRoot $EnvFile))
    }
    if (-not (Test-Path -LiteralPath $resolvedEnv -PathType Leaf)) { throw "environment file is missing or not a file: $resolvedEnv" }
    if ((Get-Item -LiteralPath $resolvedEnv).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "environment file must not be a reparse point: $resolvedEnv" }

    if ([string]::IsNullOrWhiteSpace($BackupRoot)) {
        $resolvedBackupRoot = $canonicalBackupRoot
    } elseif ([IO.Path]::IsPathRooted($BackupRoot)) {
        $resolvedBackupRoot = [IO.Path]::GetFullPath($BackupRoot)
    } else {
        $resolvedBackupRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot $BackupRoot))
    }
    if (-not (Test-PathWithinRoot -Path $resolvedBackupRoot -Root $canonicalBackupRoot)) { throw "backup root escapes the repository-controlled production backup root: $resolvedBackupRoot" }
    if (-not (Test-Path -LiteralPath $resolvedBackupRoot -PathType Container)) { throw "backup root is missing or not a directory: $resolvedBackupRoot" }
    if ((Get-Item -LiteralPath $resolvedBackupRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "backup root must not be a reparse point: $resolvedBackupRoot" }

    $outputDirectory = [IO.Path]::GetFullPath((Join-Path $resolvedBackupRoot $Timestamp))
    if (-not (Test-PathWithinRoot -Path $outputDirectory -Root $canonicalBackupRoot)) { throw "backup output escapes the repository-controlled production backup root: $outputDirectory" }
    if (Test-Path -LiteralPath $outputDirectory) { throw "backup destination already exists; overwrite is prohibited: $outputDirectory" }

    [pscustomobject]@{
        ScriptPath = $canonicalScript
        ScriptRoot = $scriptRoot
        RepoRoot = $repoRoot
        EnvFile = $resolvedEnv
        BackupRoot = $resolvedBackupRoot
        OutputDirectory = $outputDirectory
    }
}
