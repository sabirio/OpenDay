# Shared, safe production-connection-loading pattern, extracted from
# scripts/production-backup.ps1 so every script that needs to talk to
# production (currently: production-backup.ps1 and
# production-security-inventory.ps1) validates the connection identically -
# one place that can accept a production credential, one set of fingerprint
# checks, never two copies that could quietly drift apart.
#
# Reads weekly-tracker/.env.production.local into memory only. Never echoes
# the raw URL or password. Validates the connection is genuinely production's
# Session Pooler (host suffix, port, database name, expected pooler
# username) before returning anything - callers must treat a thrown
# exception here as "do not proceed."

function Get-ProductionConnectionFingerprint {
    param(
        [Parameter(Mandatory)][string]$EnvFile,
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$ExpectedProjectRef
    )

    $expectedUser = "postgres.$ExpectedProjectRef"

    if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
        throw 'gitignored production environment file is missing'
    }

    $resolvedEnvFile = (Resolve-Path -LiteralPath $EnvFile).Path
    & git -c core.excludesFile=NUL -C $RepoRoot check-ignore -- $resolvedEnvFile 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'production environment file is not ignored by Git'
    }

    # Read into memory only. Never echo this content or the parsed credential.
    $environmentText = [IO.File]::ReadAllText($resolvedEnvFile)
    $match = [regex]::Match($environmentText, '(?m)^PRODUCTION_DB_URL\s*=\s*(.+)$')
    if (-not $match.Success) {
        throw 'PRODUCTION_DB_URL is missing'
    }

    $rawUri = $match.Groups[1].Value.Trim().Trim('"').Trim("'")
    try {
        $uri = [Uri]$rawUri
    } catch {
        throw 'PRODUCTION_DB_URL cannot be parsed'
    }

    $userInfo = $uri.UserInfo -split ':', 2
    if ($userInfo.Count -ne 2) {
        throw 'database credential components are incomplete'
    }

    $dbHost = $uri.Host
    $dbPort = $uri.Port
    $dbName = $uri.AbsolutePath.TrimStart('/')
    $dbUser = [Uri]::UnescapeDataString($userInfo[0])
    $dbPassword = [Uri]::UnescapeDataString($userInfo[1])

    if (-not $dbHost.EndsWith('.pooler.supabase.com')) { throw 'host is not a Supabase pooler' }
    if ($dbPort -ne 5432) { throw 'port does not match the approved production Session Pooler port' }
    if ($dbName -ne 'postgres') { throw 'database name does not match production' }
    if ($dbUser -ne $expectedUser) { throw 'username/project ref does not match production' }
    if ([string]::IsNullOrWhiteSpace($dbPassword)) { throw 'database password is empty' }

    return [pscustomobject]@{
        Host = $dbHost
        Port = $dbPort
        Database = $dbName
        User = $dbUser
        Password = $dbPassword
        RawUri = $rawUri
        EnvironmentText = $environmentText
    }
}

# Staging counterpart of Get-ProductionConnectionFingerprint above - same
# fail-closed shape (pooler host suffix, port, database name, expected
# pooler username), reading STAGING_DB_URL from weekly-tracker/.env.staging
# instead of PRODUCTION_DB_URL from weekly-tracker/.env.production.local.
# Never touches PRODUCTION_DB_URL or any production credential. Added for
# Simplification Phase 3E.1 (staging backup/rehearsal of migration batch
# 046-054) - Get-ProductionConnectionFingerprint itself is untouched.
function Get-StagingConnectionFingerprint {
    param(
        [Parameter(Mandatory)][string]$EnvFile,
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$ExpectedProjectRef
    )

    $expectedUser = "postgres.$ExpectedProjectRef"

    if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
        throw 'gitignored staging environment file is missing'
    }

    $resolvedEnvFile = (Resolve-Path -LiteralPath $EnvFile).Path
    & git -c core.excludesFile=NUL -C $RepoRoot check-ignore -- $resolvedEnvFile 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'staging environment file is not ignored by Git'
    }

    # Read into memory only. Never echo this content or the parsed credential.
    $environmentText = [IO.File]::ReadAllText($resolvedEnvFile)
    $match = [regex]::Match($environmentText, '(?m)^STAGING_DB_URL\s*=\s*(.+)$')
    if (-not $match.Success) {
        throw 'STAGING_DB_URL is missing'
    }

    $rawUri = $match.Groups[1].Value.Trim().Trim('"').Trim("'")
    try {
        $uri = [Uri]$rawUri
    } catch {
        throw 'STAGING_DB_URL cannot be parsed'
    }

    $userInfo = $uri.UserInfo -split ':', 2
    if ($userInfo.Count -ne 2) {
        throw 'database credential components are incomplete'
    }

    $dbHost = $uri.Host
    $dbPort = $uri.Port
    $dbName = $uri.AbsolutePath.TrimStart('/')
    $dbUser = [Uri]::UnescapeDataString($userInfo[0])
    $dbPassword = [Uri]::UnescapeDataString($userInfo[1])

    if (-not $dbHost.EndsWith('.pooler.supabase.com')) { throw 'host is not a Supabase pooler' }
    if ($dbPort -ne 5432) { throw 'port does not match the approved staging Session Pooler port' }
    if ($dbName -ne 'postgres') { throw 'database name does not match staging' }
    if ($dbUser -ne $expectedUser) { throw 'username/project ref does not match staging' }
    if ([string]::IsNullOrWhiteSpace($dbPassword)) { throw 'database password is empty' }

    return [pscustomobject]@{
        Host = $dbHost
        Port = $dbPort
        Database = $dbName
        User = $dbUser
        Password = $dbPassword
        RawUri = $rawUri
        EnvironmentText = $environmentText
    }
}
