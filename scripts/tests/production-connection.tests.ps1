$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $repoRoot 'scripts\lib\ProductionConnection.ps1')

$script:passed=0; $script:failed=0
function A([string]$Name,[bool]$Condition){if($Condition){$script:passed++;Write-Host "[PASS] $Name"}else{$script:failed++;Write-Host "[FAIL] $Name"}}
function F([string]$Name,[scriptblock]$Action,[string]$Pattern){try{&$Action;A $Name $false}catch{A $Name ($_.Exception.Message -match $Pattern)}}
function Write-Env([string]$Path,[string]$Uri){[IO.File]::WriteAllText($Path,"PRODUCTION_DB_URL=$Uri`n",[Text.UTF8Encoding]::new($false))}

$envPath = Join-Path $repoRoot 'weekly-tracker\.env.production-connection-test.local'
$ref = 'szgbkeqornkdngoegyso'
try {
    Write-Env $envPath "postgresql://postgres.${ref}:pw@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"
    $actual = Get-ProductionConnectionFingerprint -EnvFile $envPath -RepoRoot $repoRoot -ExpectedProjectRef $ref
    A 'correct project ref passes' ($actual.User -ceq "postgres.$ref")
    A 'returned ProjectRef is exact' ($actual.ProjectRef -ceq $ref)

    Write-Env $envPath 'postgresql://postgres.WRONGREF:pw@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres'
    F 'wrong project ref is rejected' { Get-ProductionConnectionFingerprint -EnvFile $envPath -RepoRoot $repoRoot -ExpectedProjectRef $ref } 'username/project ref'

    Write-Env $envPath "postgresql://postgres.${ref}:pw@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres"
    F 'wrong port is rejected' { Get-ProductionConnectionFingerprint -EnvFile $envPath -RepoRoot $repoRoot -ExpectedProjectRef $ref } 'port'

    Write-Env $envPath "postgresql://postgres.${ref}:pw@aws-1-ap-northeast-1.pooler.supabase.com:5432/wrong"
    F 'wrong database is rejected' { Get-ProductionConnectionFingerprint -EnvFile $envPath -RepoRoot $repoRoot -ExpectedProjectRef $ref } 'database name'

    Write-Env $envPath "postgresql://postgres.${ref}:pw@database.example.com:5432/postgres"
    F 'non-Supabase pooler is rejected' { Get-ProductionConnectionFingerprint -EnvFile $envPath -RepoRoot $repoRoot -ExpectedProjectRef $ref } 'not a Supabase pooler'

    Write-Env $envPath "postgresql://postgres.${ref}:@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"
    F 'empty password is rejected' { Get-ProductionConnectionFingerprint -EnvFile $envPath -RepoRoot $repoRoot -ExpectedProjectRef $ref } 'password is empty'
}
finally { Remove-Item -LiteralPath $envPath -Force -ErrorAction SilentlyContinue }

$source = Get-Content -Raw (Join-Path $repoRoot 'scripts\lib\ProductionConnection.ps1')
A 'username/project-ref validation remains present' ($source -match '\$dbUser -ne \$expectedUser')
A 'RawUri retained pending separate hardening review' ($source -match 'RawUri = \$rawUri')
A 'EnvironmentText retained pending separate hardening review' ($source -match 'EnvironmentText = \$environmentText')

Write-Host "RESULT passed=$script:passed failed=$script:failed"
if($script:failed -gt 0){exit 1}
