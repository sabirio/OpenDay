# Connection-agnostic migration-sequence execution engine. Takes PG*
# connection values already resolved by the caller (disposable container OR
# real production - this module never opens a connection itself and never
# accepts a connection string) and a validated manifest, and applies each
# migration file in order via a dockerized `psql -X ... -v ON_ERROR_STOP=1`
# invocation per file.
#
# This is the one piece of the whole executor design that is actually
# exercised end-to-end in scripts/tests/manifest-migration-disposable-
# certification.ps1: the SAME function, unmodified, is what
# production-migration-apply.ps1 calls after all of its production-specific
# safety gates (backup/preflight/approval/fingerprint) have already passed.
#
# Deliberately has no retry loop and no partial-continue path: the first
# non-zero exit code stops the sequence immediately and every remaining
# migration is reported NOT_ATTEMPTED.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Applies every migration in $Manifest.migrations, in the order they appear
# (callers must have already run Test-ManifestMigrationOrder), against the
# connection described by $PgConnection. Stops on the first failure.
#
# $PgConnection: [pscustomobject]@{ Host; Port; Database; User; Password; SslMode }
# $ChecksumResults: output of Test-ManifestMigrationChecksums (path + hash
#   already verified) - re-passed here rather than re-resolved, so this
#   function can never silently pick up a different file than what was
#   hash-checked immediately before.
#
# Returns [ordered]@{ overallStatus; steps=@(...); failedAt }
# ---------------------------------------------------------------------------
function Invoke-ManifestMigrationSequence {
    param(
        [Parameter(Mandatory)][hashtable]$Manifest,
        [Parameter(Mandatory)][array]$ChecksumResults,
        [Parameter(Mandatory)][pscustomobject]$PgConnection,
        [Parameter(Mandatory)][string]$PostgresImage
    )

    if ($ChecksumResults.Count -ne $Manifest.migrations.Count) {
        throw 'checksum results do not match the manifest migration count - refusing to apply against a mismatched validation set'
    }

    $result = [ordered]@{
        overallStatus = 'NOT_RUN'
        steps = @()
        failedAt = $null
    }

    $env:PGHOST = $PgConnection.Host
    $env:PGPORT = [string]$PgConnection.Port
    $env:PGDATABASE = $PgConnection.Database
    $env:PGUSER = $PgConnection.User
    $env:PGPASSWORD = $PgConnection.Password
    $env:PGSSLMODE = if ($PgConnection.PSObject.Properties.Match('SslMode').Count -and $PgConnection.SslMode) { $PgConnection.SslMode } else { 'prefer' }

    try {
        $stopped = $false
        foreach ($checksum in $ChecksumResults) {
            $step = [ordered]@{
                number = $checksum.number
                file = $checksum.file
                sha256 = $checksum.sha256
                startedAtUtc = $null
                completedAtUtc = $null
                durationSeconds = $null
                exitCode = -1
                status = 'NOT_ATTEMPTED'
                outputRedacted = $null
            }

            if ($stopped) {
                $result.steps += $step
                continue
            }

            $migrationDirectory = Split-Path -Parent $checksum.path
            $migrationFileName = Split-Path -Leaf $checksum.path
            $argumentList = New-ManifestApplyCommandArgs -PostgresImage $PostgresImage -MigrationDirectory $migrationDirectory -MigrationFileName $migrationFileName -PgUser $env:PGUSER

            $step.startedAtUtc = [DateTime]::UtcNow.ToString('o')
            $sw = [Diagnostics.Stopwatch]::StartNew()
            $applyResult = Invoke-NativeTool -Command 'docker' -ArgumentList $argumentList
            $sw.Stop()
            $step.completedAtUtc = [DateTime]::UtcNow.ToString('o')
            $step.durationSeconds = [math]::Round($sw.Elapsed.TotalSeconds, 3)
            $step.exitCode = $applyResult.ExitCode
            $step.status = if ($applyResult.ExitCode -eq 0) { 'PASS' } else { 'FAIL' }
            $step.outputRedacted = Get-RedactedOutput -Text ($applyResult.Output -join "`n")

            $result.steps += $step

            if ($applyResult.ExitCode -ne 0) {
                $stopped = $true
                $result.failedAt = $checksum.file
            }
        }
    } finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        Remove-Item Env:PGHOST, Env:PGPORT, Env:PGDATABASE, Env:PGUSER, Env:PGSSLMODE -ErrorAction SilentlyContinue
    }

    $allPass = -not ($result.steps | Where-Object { $_.status -ne 'PASS' })
    $result.overallStatus = if ($allPass) { 'PASS' } else { 'FAIL' }
    return $result
}
