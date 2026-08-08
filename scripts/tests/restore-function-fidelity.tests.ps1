# Docker-backed regression for byte-faithful schema preprocessing.
# Uses only a fresh local postgres:17 container with no host port.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$helperPath = Join-Path $repoRoot 'scripts\lib\RestoreVerifyHelpers.ps1'
$migrationPath = Join-Path $repoRoot 'weekly-tracker\src\migrations\028_production_security_reconciliation.sql'
. $helperPath

$script:passed = 0
function Assert-True([string]$Name, [bool]$Condition) {
    if (-not $Condition) { throw "[FAIL] $Name" }
    $script:passed++
    Write-Host "[PASS] $Name"
}

function Get-Md5Utf8([string]$Text) {
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($Text)
    $md5 = [System.Security.Cryptography.MD5]::Create()
    try { return ([BitConverter]::ToString($md5.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $md5.Dispose() }
}

function Get-FunctionBody([string]$Text, [string]$Name) {
    $pattern = '(?s)CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.' + [regex]::Escape($Name) + '\s*\(.*?\)\s*RETURNS\s+.*?\bAS\s+\$\$(?<body>.*?)\$\$;'
    $match = [regex]::Match($Text, $pattern)
    if (-not $match.Success) { throw "function body not found: $Name" }
    return $match.Groups['body'].Value
}

function ConvertTo-Lf([string]$Text) {
    return $Text.Replace("`r`n", "`n").Replace("`r", "`n")
}

function Test-NoBom([string]$Path) {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    return -not ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
}

$migrationText = [System.IO.File]::ReadAllText($migrationPath, [System.Text.UTF8Encoding]::new($false, $true))
$contractorBody = ConvertTo-Lf (Get-FunctionBody $migrationText 'submit_contractor_report_atomic')
$siteVisitBody = ConvertTo-Lf (Get-FunctionBody $migrationText 'submit_site_visit_atomic')
Assert-True 'contractor fixture is the certified production body' ((Get-Md5Utf8 $contractorBody) -eq '94ae61e04f32b5917edd78063bf12f5f')
Assert-True 'site-visit fixture is the certified production body' ((Get-Md5Utf8 $siteVisitBody) -eq 'd2a510a8c1ce8977987cc69dde48fa4e')

$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "restore-function-fidelity-$([guid]::NewGuid().ToString('N').Substring(0, 10))"
$sourcePath = Join-Path $tempDir 'schema.lf.sql'
$filteredPath = Join-Path $tempDir 'schema.filtered.sql'
$rolesSourcePath = Join-Path $tempDir 'roles.lf.sql'
$rolesFilteredPath = Join-Path $tempDir 'roles.filtered.sql'
$container = "restore-function-fidelity-$([guid]::NewGuid().ToString('N').Substring(0, 10))"
$started = $false

try {
    New-Item -ItemType Directory -Path $tempDir | Out-Null
    $fixtureBody = "`nBEGIN`n  RETURN 'ok';`nEND;`n"
    $sql = @(
        'SET check_function_bodies = false;',
        'CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;',
        ('CREATE FUNCTION public.eol_probe() RETURNS text LANGUAGE plpgsql AS $$' + $fixtureBody + '$$;'),
        ('CREATE FUNCTION public.submit_contractor_report_atomic(p_project_id bigint,p_report_date date,p_wp_progress jsonb,p_meta jsonb,p_client_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$' + $contractorBody + '$$;'),
        ('CREATE FUNCTION public.submit_site_visit_atomic(p_project_id bigint,p_contractor_report_id bigint,p_visit_date date,p_observations jsonb,p_meta jsonb,p_client_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$' + $siteVisitBody + '$$;')
    ) -join "`n"
    $sql += "`n"
    [System.IO.File]::WriteAllText($sourcePath, $sql, [System.Text.UTF8Encoding]::new($false))

    $filtered = New-FilteredSchemaFile -SourcePath $sourcePath -DestinationPath $filteredPath -UnavailableExtensionNames @('supabase_vault')
    Assert-True 'required extension transformation still occurs' ($filtered.Count -eq 1)
    Assert-True 'preprocessed schema has no BOM' (Test-NoBom $filteredPath)
    $filteredText = [System.IO.File]::ReadAllText($filteredPath, [System.Text.UTF8Encoding]::new($false, $true))
    Assert-True 'preprocessed schema preserves LF and introduces no CR' (-not $filteredText.Contains("`r"))
    Assert-True 'LF-only probe body survives preprocessing exactly' ((Get-Md5Utf8 (Get-FunctionBody $filteredText 'eol_probe')) -eq (Get-Md5Utf8 $fixtureBody))
    Assert-True 'contractor body survives preprocessing exactly' ((Get-Md5Utf8 (Get-FunctionBody $filteredText 'submit_contractor_report_atomic')) -eq '94ae61e04f32b5917edd78063bf12f5f')
    Assert-True 'site-visit body survives preprocessing exactly' ((Get-Md5Utf8 (Get-FunctionBody $filteredText 'submit_site_visit_atomic')) -eq 'd2a510a8c1ce8977987cc69dde48fa4e')

    $rolesSql = "CREATE ROLE postgres;`nALTER ROLE postgres WITH NOSUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS;`nGRANT anon TO postgres WITH ADMIN OPTION, INHERIT TRUE GRANTED BY supabase_admin;"
    [System.IO.File]::WriteAllText($rolesSourcePath, $rolesSql, [System.Text.UTF8Encoding]::new($false))
    $roleChanges = New-FilteredRolesFile -SourcePath $rolesSourcePath -DestinationPath $rolesFilteredPath -BootstrapRoleNames @('postgres')
    $rolesFiltered = [System.IO.File]::ReadAllText($rolesFilteredPath, [System.Text.UTF8Encoding]::new($false, $true))
    Assert-True 'required role compatibility transformations still occur' ($roleChanges.Count -eq 3 -and $rolesFiltered -match '(?m)^GRANT anon TO postgres WITH ADMIN OPTION, INHERIT TRUE;$')
    Assert-True 'role preprocessing has no BOM and preserves LF' ((Test-NoBom $rolesFilteredPath) -and -not $rolesFiltered.Contains("`r"))

    $mount = "type=bind,source=$tempDir,target=/fixture,readonly"
    $run = Invoke-NativeTool -Command 'docker' -ArgumentList @('run','-d','--name',$container,'--mount',$mount,'-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=postgres','postgres:17')
    if ($run.ExitCode -ne 0) { throw "docker run failed: $($run.Output -join ' | ')" }
    $started = $true
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        $probe = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec',$container,'pg_isready','-U','postgres')
        if ($probe.ExitCode -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    Assert-True 'disposable PostgreSQL 17 became ready' $ready
    $load = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec',$container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','/fixture/schema.filtered.sql')
    if ($load.ExitCode -ne 0) { throw "fixture restore failed: $($load.Output -join ' | ')" }

    $query = "SELECT proname||'|'||md5(prosrc)||'|'||length(prosrc)||'|'||octet_length(prosrc)||'|'||(length(prosrc)-length(replace(prosrc,chr(13),'')))||'|'||(length(prosrc)-length(replace(prosrc,chr(10),''))) FROM pg_proc WHERE proname IN ('eol_probe','submit_contractor_report_atomic','submit_site_visit_atomic') ORDER BY proname;"
    $q = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec',$container,'psql','-X','-U','postgres','-d','postgres','-tA','-v','ON_ERROR_STOP=1','-c',$query)
    if ($q.ExitCode -ne 0) { throw "fixture query failed: $($q.Output -join ' | ')" }
    $rows = @($q.Output | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ })
    $byName = @{}
    foreach ($row in $rows) { $parts = $row -split '\|'; $byName[$parts[0]] = $parts }
    Assert-True 'LF-only function prosrc MD5 survives preprocessing + restore' ($byName['eol_probe'][1] -eq (Get-Md5Utf8 $fixtureBody) -and $byName['eol_probe'][4] -eq '0')
    Assert-True 'contractor prosrc raw MD5 survives preprocessing + restore' ($byName['submit_contractor_report_atomic'][1] -eq '94ae61e04f32b5917edd78063bf12f5f' -and $byName['submit_contractor_report_atomic'][4] -eq '0')
    Assert-True 'site-visit prosrc raw MD5 survives preprocessing + restore' ($byName['submit_site_visit_atomic'][1] -eq 'd2a510a8c1ce8977987cc69dde48fa4e' -and $byName['submit_site_visit_atomic'][4] -eq '0')
} finally {
    if ($started) { Invoke-NativeTool -Command 'docker' -ArgumentList @('rm','-f',$container) | Out-Null }
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "TOTAL: $script:passed passed, 0 failed"
exit 0
