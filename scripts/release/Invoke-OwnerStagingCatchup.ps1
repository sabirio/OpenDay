[CmdletBinding()]
param(
  [string]$ArtifactPath,
  [string]$SuccessMarker = 'STAGING_CATCHUP=PASS',
  [ValidateSet('staging', 'production')]
  [string]$Target = 'staging',
  [switch]$RequireBackupVerification,
  [switch]$ConnectionTestOnly,
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$stagingProjectRef = 'sdndsekarwhumdbcqxni'
$productionProjectRef = 'szgbkeqornkdngoegyso'
$releaseName = 'openday-catchup-059-146'
$targetProjectRef = if ($Target -eq 'production') { $productionProjectRef } else { $stagingProjectRef }
$rejectedProjectRef = if ($Target -eq 'production') { $stagingProjectRef } else { $productionProjectRef }
$targetDisplayName = if ($Target -eq 'production') { 'OpenDay Production' } else { 'OpenDay Staging' }

function Resolve-PsqlPath {
  $command = Get-Command 'psql.exe' -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    return $command.Source
  }

  $knownPath = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
  if (Test-Path -LiteralPath $knownPath -PathType Leaf) {
    return $knownPath
  }

  throw 'PostgreSQL client psql.exe was not found.'
}

function ConvertTo-PlainText {
  param([Parameter(Mandatory)][Security.SecureString]$SecureValue)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Get-Sha256Hex {
  param([Parameter(Mandatory)][string]$Path)

  $stream = [IO.File]::OpenRead($Path)
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $sha256.ComputeHash($stream)
    return ([BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
  }
  finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}

function Read-ValidatedConnection {
  Write-Host ''
  Write-Host "Open Supabase > $targetDisplayName > Connect > Session pooler."
  Write-Host 'Copy and paste the URI exactly as shown; [YOUR-PASSWORD] may remain.'
  Write-Host 'The URI and password are hidden and are not written to logs or command history.'

  $secureUri = Read-Host "$targetDisplayName connection URI" -AsSecureString
  $uriText = ConvertTo-PlainText -SecureValue $secureUri

  try {
    $uri = [Uri]$uriText
    if ($uri.Scheme -notin @('postgres', 'postgresql')) {
      throw 'The connection URI must start with postgres:// or postgresql://.'
    }
    if ([string]::IsNullOrWhiteSpace($uri.UserInfo)) {
      throw 'The connection URI does not contain a database user and password.'
    }

    $separatorIndex = $uri.UserInfo.IndexOf(':')
    if ($separatorIndex -lt 1) {
      throw 'The connection URI does not contain a database password.'
    }

    $username = [Uri]::UnescapeDataString($uri.UserInfo.Substring(0, $separatorIndex))
    $password = [Uri]::UnescapeDataString($uri.UserInfo.Substring($separatorIndex + 1))
    $hostName = $uri.DnsSafeHost.ToLowerInvariant()
    $database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
    $port = $uri.Port

    if ([string]::IsNullOrWhiteSpace($password) -or $password -eq '[YOUR-PASSWORD]') {
      $securePassword = Read-Host "$targetDisplayName database password" -AsSecureString
      try {
        $password = ConvertTo-PlainText -SecureValue $securePassword
      }
      finally {
        $securePassword.Dispose()
      }
    }
    if ([string]::IsNullOrWhiteSpace($password)) {
      throw "The $targetDisplayName database password cannot be empty."
    }
    if ([string]::IsNullOrWhiteSpace($database)) {
      $database = 'postgres'
    }

    $isDirect =
      $hostName -eq "db.$targetProjectRef.supabase.co" -and
      $username -eq 'postgres' -and
      $port -eq 5432

    $isSessionPooler =
      $hostName -match '^[a-z0-9-]+\.pooler\.supabase\.com$' -and
      $username -eq "postgres.$targetProjectRef" -and
      $port -eq 5432

    if ($hostName -like "*$rejectedProjectRef*" -or $username -like "*$rejectedProjectRef*") {
      throw "Wrong Supabase project rejected. Detected project $rejectedProjectRef; expected $targetProjectRef ($targetDisplayName)."
    }
    if (-not ($isDirect -or $isSessionPooler)) {
      throw "Connection rejected. Expected $targetDisplayName project $targetProjectRef on port 5432."
    }

    return [pscustomobject]@{
      Host = $hostName
      Port = $port
      Username = $username
      Password = $password
      Database = $database
    }
  }
  finally {
    $uriText = $null
    $secureUri.Dispose()
  }
}

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
if ([string]::IsNullOrWhiteSpace($ArtifactPath)) {
  $ArtifactPath = Join-Path $repositoryRoot "scripts\releases\$releaseName\$Target-catchup.sql"
}

$resolvedArtifact = (Resolve-Path -LiteralPath $ArtifactPath).Path
$hashFile = "$resolvedArtifact.sha256"
if (-not (Test-Path -LiteralPath $hashFile -PathType Leaf)) {
  throw "SHA-256 sidecar not found: $hashFile"
}

$expectedHash = ((Get-Content -LiteralPath $hashFile -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
$actualHash = Get-Sha256Hex -Path $resolvedArtifact
if ($actualHash -ne $expectedHash) {
  throw "Artifact SHA-256 mismatch. Expected $expectedHash but found $actualHash."
}

$header = (Get-Content -LiteralPath $resolvedArtifact -TotalCount 12) -join "`n"
if ($header -notmatch "-- OpenDay $Target [a-z0-9-]+ package") {
  throw "The selected SQL file is not an approved OpenDay $Target package."
}
if ($header -notmatch [regex]::Escape("-- Approved Supabase project ref: $targetProjectRef")) {
  throw "The selected SQL file is not approved for $Target project $targetProjectRef."
}
if ($header -notmatch '-- Migration count: (?<count>[0-9]+)') {
  throw 'The selected SQL file does not declare its migration count.'
}
$migrationCount = [int]$Matches['count']
if ($header -match '-- Package: (?<package>[a-z0-9-]+)') {
  $packageName = $Matches['package']
}
elseif ($header -match [regex]::Escape("-- OpenDay $Target catch-up package")) {
  $packageName = $releaseName
}
else {
  throw 'The selected SQL file does not declare a recognized package name.'
}

$psqlPath = Resolve-PsqlPath
Write-Host "Package verified: $packageName"
Write-Host "SHA-256: $actualHash"
Write-Host "Target locked: $targetDisplayName ($targetProjectRef)"
Write-Host "PostgreSQL client: $psqlPath"

if ($ValidateOnly) {
  $validationMarker = $SuccessMarker -replace '=PASS$', '_VALIDATION=PASS'
  Write-Host $validationMarker
  exit 0
}

if ($ConnectionTestOnly) {
  $connection = Read-ValidatedConnection
  $previousPassword = $env:PGPASSWORD
  $previousSslMode = $env:PGSSLMODE

  try {
    $env:PGPASSWORD = $connection.Password
    $env:PGSSLMODE = 'require'

    & $psqlPath `
      -X `
      --no-psqlrc `
      -P 'pager=off' `
      -v 'ON_ERROR_STOP=1' `
      -h $connection.Host `
      -p $connection.Port `
      -U $connection.Username `
      -d $connection.Database `
      -c 'SELECT 1 AS connection_ok;'

    if ($LASTEXITCODE -ne 0) {
      throw "$targetDisplayName connection test failed with psql exit code $LASTEXITCODE. No database changes were attempted."
    }

    Write-Host ''
    Write-Host $SuccessMarker
  }
  finally {
    $connection.Password = $null
    if ($null -eq $previousPassword) {
      Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
    else {
      $env:PGPASSWORD = $previousPassword
    }
    if ($null -eq $previousSslMode) {
      Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
    }
    else {
      $env:PGSSLMODE = $previousSslMode
    }
  }

  exit 0
}

if ($RequireBackupVerification) {
  $backupConfirmation = Read-Host 'Type BACKUP VERIFIED only after a fresh production backup has been restored and checked'
  if ($backupConfirmation.Trim() -cne 'BACKUP VERIFIED') {
    throw 'Cancelled. A restore-verified production backup is required. No database changes were attempted.'
  }
}

$confirmationPhrase = $Target.ToUpperInvariant()
$confirmation = Read-Host "Type $confirmationPhrase to apply $migrationCount migrations atomically"
if ($confirmation.Trim() -ine $confirmationPhrase) {
  throw 'Cancelled. No database changes were attempted.'
}

$connection = Read-ValidatedConnection
$previousPassword = $env:PGPASSWORD
$previousSslMode = $env:PGSSLMODE

try {
  $env:PGPASSWORD = $connection.Password
  $env:PGSSLMODE = 'require'

  & $psqlPath `
    -X `
    --no-psqlrc `
    -P 'pager=off' `
    -v 'ON_ERROR_STOP=1' `
    -h $connection.Host `
    -p $connection.Port `
    -U $connection.Username `
    -d $connection.Database `
    -f $resolvedArtifact

  if ($LASTEXITCODE -ne 0) {
    throw "$targetDisplayName package failed with psql exit code $LASTEXITCODE. The package transaction was rolled back; do not rerun before reviewing the error."
  }

  Write-Host ''
  Write-Host $SuccessMarker
}
finally {
  $connection.Password = $null
  if ($null -eq $previousPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
  else {
    $env:PGPASSWORD = $previousPassword
  }
  if ($null -eq $previousSslMode) {
    Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
  }
  else {
    $env:PGSSLMODE = $previousSslMode
  }
}
