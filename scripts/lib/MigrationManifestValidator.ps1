# Pure(-ish), testable validation functions for manifest-driven production
# migration batches. Dot-sourcing this file never touches Docker, a network,
# or a production credential - every function here either reads local
# repository files or performs in-memory checks. The one exception,
# Test-RepositoryIdentity, shells out to `git rev-parse HEAD` (read-only,
# local).
#
# Design intent: scripts/production-migration-apply.ps1 (and its preflight/
# postflight siblings) call these functions to decide GO/NO-GO *before* ever
# opening a production connection. Every function throws on the first
# violation rather than accumulating a report, so a caller that doesn't
# catch the exception can never proceed past an invalid manifest.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:ManifestMigrationFilePattern = '^\d{3}_[a-z0-9_]+\.sql$'

# ---------------------------------------------------------------------------
# Loads a .psd1 manifest and validates its shape. Does not touch the
# filesystem beyond the manifest file itself - path/checksum/order
# validation happen in separate functions below.
# ---------------------------------------------------------------------------
function Import-MigrationManifest {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "manifest not found: $Path"
    }
    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    try {
        $manifest = Import-PowerShellDataFile -LiteralPath $resolvedPath
    } catch {
        throw "manifest is not a valid PowerShell data file: $($_.Exception.Message)"
    }

    foreach ($requiredKey in @('schemaVersion', 'batchId', 'approvedProjectRef', 'authoritativeCommit', 'migrationsDirectory', 'migrations')) {
        if (-not $manifest.Contains($requiredKey)) { throw "manifest is missing required key: $requiredKey" }
    }
    if ($manifest.schemaVersion -ne 1) { throw "unsupported manifest schemaVersion: $($manifest.schemaVersion)" }
    if ([string]::IsNullOrWhiteSpace($manifest.batchId)) { throw 'manifest batchId is empty' }
    if ($manifest.approvedProjectRef -notmatch '^[a-z0-9]{15,25}$') { throw "manifest approvedProjectRef does not look like a Supabase project ref: $($manifest.approvedProjectRef)" }
    if ($manifest.authoritativeCommit -notmatch '^[0-9a-f]{40}$') { throw "manifest authoritativeCommit is not a full 40-character SHA: $($manifest.authoritativeCommit)" }
    if (-not $manifest.migrations -or $manifest.migrations.Count -eq 0) { throw 'manifest declares zero migrations' }

    foreach ($m in $manifest.migrations) {
        foreach ($requiredField in @('number', 'file', 'sha256')) {
            if (-not $m.Contains($requiredField) -or [string]::IsNullOrWhiteSpace([string]$m[$requiredField])) {
                throw "manifest migration entry is missing required field '$requiredField': $($m | Out-String)"
            }
        }
        if ($m.file -notmatch $script:ManifestMigrationFilePattern) { throw "manifest migration filename does not match the expected NNN_snake_case.sql pattern: $($m.file)" }
        if ($m.sha256 -notmatch '^[0-9a-f]{64}$') { throw "manifest migration sha256 is not a 64-character lowercase hex string: $($m.file)" }
    }

    return $manifest
}

# ---------------------------------------------------------------------------
# Ascending, no duplicates, and - when the manifest declares
# contiguousSequence = $true - no gaps between consecutive entries.
# ---------------------------------------------------------------------------
function Test-ManifestMigrationOrder {
    param([Parameter(Mandatory)][hashtable]$Manifest)

    $numbers = @($Manifest.migrations | ForEach-Object { [int]$_.number })
    if (($numbers | Select-Object -Unique).Count -ne $numbers.Count) {
        throw "manifest contains duplicate migration numbers: $($numbers -join ',')"
    }
    $sorted = @($numbers | Sort-Object)
    for ($i = 0; $i -lt $sorted.Count; $i++) {
        if ($sorted[$i] -ne $numbers[$i]) {
            throw "manifest migrations are not listed in strict ascending order: $($numbers -join ',')"
        }
    }
    if ($Manifest.Contains('contiguousSequence') -and $Manifest.contiguousSequence) {
        for ($i = 1; $i -lt $sorted.Count; $i++) {
            if ($sorted[$i] -ne ($sorted[$i - 1] + 1)) {
                throw "manifest requires a contiguous sequence but has a gap between $($sorted[$i-1]) and $($sorted[$i])"
            }
        }
    }
    return $true
}

# ---------------------------------------------------------------------------
# Resolves one migration entry's path, refusing anything outside the
# manifest's declared migrationsDirectory (blocks path traversal / absolute
# paths / symlink escapes) and anything that doesn't exist.
# ---------------------------------------------------------------------------
function Resolve-ManifestMigrationPath {
    param(
        [Parameter(Mandatory)][hashtable]$Manifest,
        [Parameter(Mandatory)][hashtable]$Migration,
        [Parameter(Mandatory)][string]$RepoRoot
    )

    if ($Migration.file -notmatch $script:ManifestMigrationFilePattern) {
        throw "migration filename does not match the expected NNN_snake_case.sql pattern: $($Migration.file)"
    }
    if ([IO.Path]::IsPathRooted($Migration.file) -or $Migration.file.Contains('..') -or $Migration.file.Contains('/') -or $Migration.file.Contains('\')) {
        throw "migration filename must be a bare filename, not a path: $($Migration.file)"
    }

    $approvedDir = (Resolve-Path -LiteralPath (Join-Path $RepoRoot $Manifest.migrationsDirectory)).Path.TrimEnd('\', '/')
    $candidate = Join-Path $approvedDir $Migration.file
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        throw "migration file does not exist: $candidate"
    }
    $resolved = (Resolve-Path -LiteralPath $candidate).Path
    $resolvedDir = (Split-Path -Parent $resolved).TrimEnd('\', '/')
    if ($resolvedDir -ne $approvedDir) {
        throw "migration file resolved outside the approved migrations directory: $resolved (expected under $approvedDir)"
    }
    return $resolved
}

# ---------------------------------------------------------------------------
# For every migration in the manifest: resolve its path, compute its actual
# SHA-256, and compare against the manifest's declared hash. Returns an
# ordered array of per-migration results; throws on the first mismatch
# (fail-closed - a caller must not partially trust a manifest).
# ---------------------------------------------------------------------------
function Test-ManifestMigrationChecksums {
    param(
        [Parameter(Mandatory)][hashtable]$Manifest,
        [Parameter(Mandatory)][string]$RepoRoot
    )

    $results = @()
    foreach ($m in $Manifest.migrations) {
        $path = Resolve-ManifestMigrationPath -Manifest $Manifest -Migration $m -RepoRoot $RepoRoot
        $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        $expected = $m.sha256.ToLowerInvariant()
        if ($actual -ne $expected) {
            throw "PRODUCTION APPLY BLOCKED - MIGRATION HASH MISMATCH: $($m.file) expected=$expected actual=$actual"
        }
        $results += [ordered]@{ number = $m.number; file = $m.file; path = $path; sha256 = $actual; byteIdentical = $true }
    }
    return $results
}

# ---------------------------------------------------------------------------
# Confirms the checked-out repository HEAD matches the manifest's
# authoritativeCommit. Local, read-only `git rev-parse`.
# ---------------------------------------------------------------------------
function Test-RepositoryIdentity {
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$ExpectedCommit
    )
    $head = (& git -C $RepoRoot rev-parse HEAD 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'git rev-parse HEAD failed - is this a git repository?' }
    $head = $head.Trim()
    if ($head -ne $ExpectedCommit) {
        throw "repository HEAD ($head) does not match the manifest's authoritative commit ($ExpectedCommit)"
    }
    return $head
}

# ---------------------------------------------------------------------------
# The one, deterministic confirmation phrase for a given manifest. Computed
# from manifest content (never accepted as free-form caller input), so an
# operator's typed confirmation is always checked against what the manifest
# itself declares - not against a string the invoker could vary.
# ---------------------------------------------------------------------------
function Get-ManifestApprovalPhrase {
    param([Parameter(Mandatory)][hashtable]$Manifest)
    return "APPLY $($Manifest.batchId) TO $($Manifest.approvedProjectRef)"
}

# ---------------------------------------------------------------------------
# Redacts anything that looks like a connection string, bearer/JWT token, or
# a PG*=<value> environment assignment from a block of text before it is
# ever written to a log or printed to the console.
# ---------------------------------------------------------------------------
function Get-RedactedOutput {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Text)
    return ($Text `
            -replace 'postgres(?:ql)?://[^\s"'']+', '[REDACTED_URI]' `
            -replace '(?i)PG(HOST|PORT|DATABASE|USER|PASSWORD|SSLMODE)\s*=\s*\S+', 'PG$1=[REDACTED]' `
            -replace 'eyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,}){0,2}', '[REDACTED_TOKEN]')
}

# ---------------------------------------------------------------------------
# Throws if the given text still contains anything that looks like a secret
# after redaction was supposed to have already happened - a last-line
# defense before a write to disk or stdout.
# ---------------------------------------------------------------------------
function Assert-NoSecretLeak {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Text)
    if ($Text -match 'postgres(?:ql)?://[a-zA-Z0-9._%+-]+:[^@\s]+@' -or $Text -match 'eyJ[A-Za-z0-9_-]{10,}' -or $Text -match '(?i)PGPASSWORD\s*=\s*(?!\[REDACTED\])\S+') {
        throw 'REDACTION_CHECK: FAIL - text contains what looks like an unredacted secret'
    }
    return $true
}

# ---------------------------------------------------------------------------
# Builds the exact docker/psql argument array used to apply ONE migration
# file over a set of PG* connection values already present in $env:. Pure
# array construction - never invoked here, never touches Docker itself.
# Deliberately takes no arbitrary -Sql/-Query parameter: the only thing this
# can ever execute is the named migration file passed to -MigrationHostPath.
# ---------------------------------------------------------------------------
function New-ManifestApplyCommandArgs {
    param(
        [Parameter(Mandatory)][string]$PostgresImage,
        [Parameter(Mandatory)][string]$MigrationDirectory,
        [Parameter(Mandatory)][string]$MigrationFileName,
        [Parameter(Mandatory)][string]$PgUser
    )
    $mount = "type=bind,source=$MigrationDirectory,target=/apply,readonly"
    return @(
        'run', '--rm', '--network', 'bridge', '--mount', $mount,
        '--env', 'PGHOST', '--env', 'PGPORT', '--env', 'PGDATABASE',
        '--env', 'PGUSER', '--env', 'PGPASSWORD', '--env', 'PGSSLMODE', $PostgresImage,
        'psql', '-X', '-U', $PgUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '--file', "/apply/$MigrationFileName"
    )
}
