[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SourceCommit,
    [Parameter(Mandatory)][string]$ReleaseManifestPath,
    [Parameter(Mandatory)][string]$ExpectedReleaseManifestSha256,
    [Parameter(Mandatory)][string]$ExpectedBackupScriptSha256,
    [string]$ApprovedReleaseTag,
    [string]$EnvFile,
    [string]$BackupRoot,
    [string]$PostgresImage = 'postgres:17',
    [switch]$ValidateOnly,
    [switch]$ShowResolvedPaths,
    [switch]$CertificationMode,
    [scriptblock]$ConnectionProvider
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# PowerShell 5.1 does not reliably populate $PSScriptRoot while expressions
# inside param() are being evaluated. Resolve every script-relative default
# only after parameter binding, from the actual entry-point path.
$entryPointPath = $PSCommandPath
if ([string]::IsNullOrWhiteSpace($entryPointPath)) { $entryPointPath = $MyInvocation.MyCommand.Path }
if ([string]::IsNullOrWhiteSpace($entryPointPath)) { throw 'BACKUP STOPPED: canonical script path could not be resolved' }
$scriptDirectory = Split-Path -Parent ([IO.Path]::GetFullPath($entryPointPath))
$pathHelper = Join-Path $scriptDirectory 'lib\ProductionBackupPaths.ps1'
if (-not (Test-Path -LiteralPath $pathHelper -PathType Leaf)) { throw "BACKUP STOPPED: path helper is missing: $pathHelper" }
. $pathHelper
. (Join-Path $scriptDirectory 'lib\BackupReleaseBinding.ps1')

$expectedRef = 'szgbkeqornkdngoegyso'
$expectedUser = "postgres.$expectedRef"
$startedAt = [DateTime]::UtcNow
$timestamp = $startedAt.ToString('yyyyMMddTHHmmssZ')
$paths = Resolve-ProductionBackupPaths -ScriptPath $entryPointPath -EnvFile $EnvFile -BackupRoot $BackupRoot -Timestamp $timestamp
$repoRoot = $paths.RepoRoot
$EnvFile = $paths.EnvFile
$BackupRoot = $paths.BackupRoot
$outputDirectory = $paths.OutputDirectory

# Release identity is validated before credentials, Docker execution, network,
# database access, or output-directory creation.
$releaseBinding = Resolve-BackupReleaseBinding -RepoRoot $repoRoot -CanonicalScriptPath $entryPointPath `
    -SourceCommit $SourceCommit -ReleaseManifestPath $ReleaseManifestPath `
    -ExpectedReleaseManifestSha256 $ExpectedReleaseManifestSha256 `
    -ExpectedBackupScriptSha256 $ExpectedBackupScriptSha256 -ApprovedReleaseTag $ApprovedReleaseTag

$dockerCommand = Get-Command docker -CommandType Application -ErrorAction SilentlyContinue
if (-not $dockerCommand) { throw 'BACKUP STOPPED: required tool is unavailable: docker' }

if ($ShowResolvedPaths) {
    Write-Host "Script path: $($paths.ScriptPath)"
    Write-Host "Repository root: $repoRoot"
    Write-Host "Environment file: $EnvFile"
    Write-Host "Backup root: $BackupRoot"
    Write-Host "Prospective output: $outputDirectory"
}
if ($ValidateOnly -or $ShowResolvedPaths) {
    Write-Host 'BACKUP_VALIDATE_ONLY: PASS - credentials were not loaded; Docker, network and database were not accessed; no backup directory was created'
    exit 0
}
if ($CertificationMode -xor [bool]$ConnectionProvider) { throw 'BACKUP STOPPED: CertificationMode and ConnectionProvider must be supplied together' }
if ($CertificationMode -and $env:OPENDAY_DISPOSABLE_BACKUP_CERTIFICATION -ne 'I UNDERSTAND THIS MUST BE LOOPBACK ONLY') {
    throw 'BACKUP STOPPED: disposable certification confirmation is missing'
}

function Stop-Safely([string]$Message) {
    throw "BACKUP STOPPED: $Message"
}

# 'utf8NoBOM' is a PowerShell 7+/Core-only -Encoding value; Windows PowerShell
# 5.1's Set-Content/Out-File reject it, and its 'UTF8' value writes a BOM.
# This helper writes UTF-8 without a BOM identically on 5.1 and 7+ via .NET.
function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][AllowEmptyString()][string]$Value
    )

    $resolvedPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
    $utf8NoBomEncoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($resolvedPath, $Value, $utf8NoBomEncoding)
}

. (Join-Path $scriptDirectory 'lib\ProductionConnection.ps1')

$migrationHistorySchema = 'supabase_migrations'
$migrationHistoryPresent = $false

function Invoke-ReadOnlyDump {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string[]]$ContainerArguments
    )

    Write-Host "Starting read-only dump: $Name"
    & docker @ContainerArguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        Stop-Safely "$Name failed with exit code $exitCode"
    }
    Write-Host "Completed read-only dump: $Name"
}

function Test-SchemaExists {
    param(
        [Parameter(Mandatory)][string]$SchemaName,
        [Parameter(Mandatory)][string[]]$CommonArguments
    )

    $probeArgs = $CommonArguments + @('psql', '-v', 'ON_ERROR_STOP=1', '-tAc',
        "SELECT to_regnamespace('$SchemaName') IS NOT NULL;")
    $output = & docker @probeArgs
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        Stop-Safely "migration history schema existence check failed with exit code $exitCode"
    }
    return (($output -join '').Trim() -eq 't')
}

try {
    if ($CertificationMode) {
        $conn = & $ConnectionProvider
        if ($conn.Host -notin @('127.0.0.1', 'localhost', 'host.docker.internal')) { throw 'disposable certification connection must be loopback-only' }
        if ($conn.Database -eq 'postgres' -and $conn.User -eq $expectedUser) { throw 'disposable certification identity must not equal production identity' }
    } else {
        $conn = Get-ProductionConnectionFingerprint -EnvFile $EnvFile -RepoRoot $repoRoot -ExpectedProjectRef $expectedRef
    }
} catch {
    Stop-Safely $_.Exception.Message
}
$dbHost = $conn.Host
$dbPort = $conn.Port
$dbName = $conn.Database
$dbUser = $conn.User
$dbPassword = $conn.Password
$sslMode = if ($CertificationMode) { 'disable' } else { 'require' }

Write-Host 'Production fingerprint: PASS'
Write-Host "Host: $dbHost"
Write-Host "Port: $dbPort"
Write-Host "Database: $dbName"
Write-Host "Username: $dbUser"
Write-Host "SSL mode: $sslMode"

New-Item -ItemType Directory -Path $outputDirectory | Out-Null
$outputDirectory = (Resolve-Path -LiteralPath $outputDirectory).Path
$mount = "type=bind,source=$outputDirectory,target=/backup"

# Docker receives secret material only via inherited process environment.
$env:PGHOST = $dbHost
$env:PGPORT = [string]$dbPort
$env:PGDATABASE = $dbName
$env:PGUSER = $dbUser
Set-Item -LiteralPath Env:PGPASSWORD -Value $dbPassword
$env:PGSSLMODE = $sslMode

$common = @('run', '--rm', '--network', 'bridge', '--mount', $mount,
    '--env', 'PGHOST', '--env', 'PGPORT', '--env', 'PGDATABASE',
    '--env', 'PGUSER', '--env', 'PGPASSWORD', '--env', 'PGSSLMODE', $PostgresImage)

try {
    & docker image inspect $PostgresImage *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Pulling official image: $PostgresImage"
        & docker pull $PostgresImage
        if ($LASTEXITCODE -ne 0) { Stop-Safely 'official PostgreSQL image pull failed' }
    }

    Invoke-ReadOnlyDump 'roles' ($common + @('pg_dumpall', '--roles-only', '--no-role-passwords', '--no-owner', '--file=/backup/roles.sql'))
    Invoke-ReadOnlyDump 'schema' ($common + @('pg_dump', '--schema-only', '--no-owner', '--no-privileges', "--exclude-schema=$migrationHistorySchema", '--file=/backup/schema.sql'))
    Invoke-ReadOnlyDump 'data' ($common + @('pg_dump', '--data-only', '--no-owner', '--no-privileges', "--exclude-schema=$migrationHistorySchema", '--exclude-table-data=storage.buckets_vectors', '--exclude-table-data=storage.vector_indexes', '--file=/backup/data.sql'))

    Write-Host "Checking migration history schema presence (read-only): $migrationHistorySchema"
    $migrationHistoryPresent = Test-SchemaExists -SchemaName $migrationHistorySchema -CommonArguments $common

    if ($migrationHistoryPresent) {
        Invoke-ReadOnlyDump 'migration history schema' ($common + @('pg_dump', '--schema-only', '--no-owner', '--no-privileges', "--schema=$migrationHistorySchema", '--file=/backup/migration_history_schema.sql'))
        Invoke-ReadOnlyDump 'migration history data' ($common + @('pg_dump', '--data-only', '--no-owner', '--no-privileges', "--schema=$migrationHistorySchema", '--file=/backup/migration_history_data.sql'))
        Write-Host 'Migration history: PRESENT'
    } else {
        $absentComment = @(
            "-- Migration history schema '$migrationHistorySchema' was not present in the source database at backup time.",
            '-- This is not treated as a backup failure: presence was verified read-only via to_regnamespace() before any pg_dump ran.',
            '-- No production object was created, altered, or dropped in order to produce this file.',
            '-- Intentionally contains no DDL/DML, so it is a safe no-op if ever executed via psql.'
        ) -join [Environment]::NewLine
        Write-Utf8NoBom -Path (Join-Path $outputDirectory 'migration_history_schema.sql') -Value ($absentComment + [Environment]::NewLine)
        Write-Utf8NoBom -Path (Join-Path $outputDirectory 'migration_history_data.sql') -Value ($absentComment + [Environment]::NewLine)
        Write-Host 'Migration history: NOT_PRESENT'
    }
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    $dbPassword = $null
    $conn = $null
}

$minimumBytes = @{
    'roles.sql' = 32
    'schema.sql' = 512
    'data.sql' = 32
    'migration_history_schema.sql' = 64
    'migration_history_data.sql' = 32
}

$files = @()
foreach ($name in $minimumBytes.Keys | Sort-Object) {
    $path = Join-Path $outputDirectory $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Stop-Safely "$name is missing" }
    $item = Get-Item -LiteralPath $path
    if ($item.Length -lt $minimumBytes[$name]) { Stop-Safely "$name is unexpectedly small" }
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    $files += [ordered]@{ filename = $name; bytes = $item.Length; sha256 = $hash; exit_status = 0 }
}

$checksumLines = $files | ForEach-Object { "$($_.sha256)  $($_.filename)" }
[IO.File]::WriteAllLines((Join-Path $outputDirectory 'checksums.sha256'), $checksumLines, [Text.UTF8Encoding]::new($false))

$imageId = (& docker image inspect $PostgresImage --format '{{.Id}}').Trim()
$toolVersion = (& docker run --rm $PostgresImage pg_dump --version).Trim()
$completedAt = [DateTime]::UtcNow
$manifest = [ordered]@{
    status = 'DUMP_CREATED_STATIC_VALIDATION_PASS_RELEASE_BOUND'
    sourceCommit = $releaseBinding.sourceCommit
    releaseManifestPath = $releaseBinding.releaseManifestPath
    releaseManifestSha256 = $releaseBinding.releaseManifestSha256
    manifestSha256 = $releaseBinding.manifestSha256
    scriptSha256 = $releaseBinding.scriptSha256
    backupScriptPath = $releaseBinding.backupScriptPath
    approvedReleaseTag = $releaseBinding.approvedReleaseTag
    started_at_utc = $startedAt.ToString('o')
    completed_at_utc = $completedAt.ToString('o')
    duration_seconds = [math]::Round(($completedAt - $startedAt).TotalSeconds, 3)
    production_project_ref = $expectedRef
    production_hostname = $dbHost
    postgres_image = $PostgresImage
    postgres_image_id = $imageId
    backup_tool_version = $toolVersion
    scopes = @('roles', 'database schema', 'database data', 'supabase migration history')
    known_exclusions = @('storage.buckets_vectors table data', 'storage.vector_indexes table data', 'Storage object bytes', 'external Auth provider configuration', 'Edge Functions and secrets')
    migrationHistory = [ordered]@{
        schema = $migrationHistorySchema
        status = $(if ($migrationHistoryPresent) { 'present' } else { 'not_present' })
    }
    files = $files
}
$manifestJson = $manifest | ConvertTo-Json -Depth 8
Write-Utf8NoBom -Path (Join-Path $outputDirectory 'backup-manifest.json') -Value ($manifestJson + [Environment]::NewLine)

Write-Host 'BACKUP_DUMP_CREATED'
Write-Host "Output directory: $outputDirectory"
Write-Host 'Static validation: PASS'
Write-Host 'Checksums: PASS'
Write-Host 'Restore verification: PENDING'
