$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backupScript = Join-Path $PSScriptRoot 'production-backup.ps1'
$restoreScript = Join-Path $PSScriptRoot 'restore-verify.ps1'
$id = [guid]::NewGuid().ToString('N').Substring(0,10)
$source = "openday-backup-source-$id"
$certRoot = Join-Path $repoRoot "backups\production\certification-$id"
$fixtureMarker = Join-Path $certRoot 'fixture-path-marker.txt'
$password = 'disposable-only-password'
$backupPath = $null
$sourceCommit = (& git -C $repoRoot rev-parse HEAD).Trim().ToLowerInvariant()
$releaseManifestPath = Join-Path $repoRoot 'scripts\manifests\snag-list-030-035.psd1'
$releaseManifestHash = (Get-FileHash $releaseManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$backupScriptHash = (Get-FileHash $backupScript -Algorithm SHA256).Hash.ToLowerInvariant()

try {
    New-Item -ItemType Directory -Path $certRoot | Out-Null
    [IO.File]::WriteAllText($fixtureMarker, 'path validation fixture only', [Text.UTF8Encoding]::new($false))
    & docker run -d --name $source -e "POSTGRES_USER=fixture_owner" -e "POSTGRES_PASSWORD=$password" -e "POSTGRES_DB=fixture_db" -p '127.0.0.1::5432' postgres:17 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'fixture source container failed to start' }
    $ready=$false
    for($i=0;$i -lt 30;$i++){
        & docker exec $source pg_isready -U fixture_owner -d fixture_db *> $null
        if($LASTEXITCODE -eq 0){$ready=$true;break}
        Start-Sleep -Milliseconds 500
    }
    if(-not $ready){throw 'fixture source database did not become ready'}

    $fixtureSql=@"
CREATE SCHEMA fixture;
CREATE TABLE public.certification_marker(id bigint PRIMARY KEY, label text NOT NULL);
CREATE TABLE public.certification_child(id bigint PRIMARY KEY, marker_id bigint NOT NULL REFERENCES public.certification_marker(id), value integer NOT NULL CHECK(value > 0));
CREATE FUNCTION public.certification_touch() RETURNS trigger LANGUAGE plpgsql AS `$`$ BEGIN NEW.value := NEW.value + 1; RETURN NEW; END `$`$;
CREATE TRIGGER certification_child_touch BEFORE INSERT ON public.certification_child FOR EACH ROW EXECUTE FUNCTION public.certification_touch();
CREATE TABLE fixture.parent(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE TABLE fixture.child(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, parent_id bigint NOT NULL REFERENCES fixture.parent(id), value integer NOT NULL CHECK(value > 0));
CREATE FUNCTION fixture.touch_child() RETURNS trigger LANGUAGE plpgsql AS `$`$ BEGIN NEW.value := NEW.value + 1; RETURN NEW; END `$`$;
CREATE TRIGGER child_touch BEFORE INSERT ON fixture.child FOR EACH ROW EXECUTE FUNCTION fixture.touch_child();
INSERT INTO fixture.parent(name) VALUES ('alpha'),('beta');
INSERT INTO fixture.child(parent_id,value) VALUES (1,4),(2,8);
INSERT INTO public.certification_marker(id,label) VALUES (1,'disposable');
INSERT INTO public.certification_child(id,marker_id,value) VALUES (1,1,4);
"@
    $fixtureCreated=$false
    for($i=0;$i -lt 30;$i++){
        $savedEap=$ErrorActionPreference
        $ErrorActionPreference='Continue'
        & docker exec $source psql -X -v ON_ERROR_STOP=1 -U fixture_owner -d fixture_db -c $fixtureSql *> $null
        $ErrorActionPreference=$savedEap
        if($LASTEXITCODE -eq 0){$fixtureCreated=$true;break}
        Start-Sleep -Milliseconds 500
    }
    if(-not $fixtureCreated){throw 'fixture schema/data creation failed'}
    $portLine=(& docker port $source '5432/tcp' | Select-Object -First 1)
    $port=[int](($portLine -split ':')[-1])
    $provider={ [pscustomobject]@{Host='host.docker.internal';Port=$port;Database='fixture_db';User='fixture_owner';Password=$password;RawUri=$null;EnvironmentText=$null} }.GetNewClosure()
    $env:OPENDAY_DISPOSABLE_BACKUP_CERTIFICATION='I UNDERSTAND THIS MUST BE LOOPBACK ONLY'
    & $backupScript -SourceCommit $sourceCommit -ReleaseManifestPath $releaseManifestPath `
        -ExpectedReleaseManifestSha256 $releaseManifestHash -ExpectedBackupScriptSha256 $backupScriptHash `
        -EnvFile $fixtureMarker -BackupRoot $certRoot -CertificationMode -ConnectionProvider $provider
    if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw "canonical backup script failed: $LASTEXITCODE"}
    $backupPath=(Get-ChildItem $certRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
    if(-not $backupPath){throw 'canonical backup produced no timestamped directory'}
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $restoreScript -BackupPath $backupPath -PostgresImage postgres:17 `
        -ExpectedSourceCommit $sourceCommit -ExpectedReleaseManifestSha256 $releaseManifestHash -ExpectedBackupScriptSha256 $backupScriptHash
    if($LASTEXITCODE -ne 0){throw "restore verification failed: $LASTEXITCODE"}
    $report=Get-Content (Join-Path $backupPath 'restore-verification.json') -Raw | ConvertFrom-Json
    if($report.overallStatus -ne 'PASS'){throw "restore report is not PASS: $($report.overallStatus)"}
    $manifest=Get-Content (Join-Path $backupPath 'backup-manifest.json') -Raw | ConvertFrom-Json
    foreach($f in $manifest.files){if((Get-FileHash (Join-Path $backupPath $f.filename) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $f.sha256){throw "independent checksum mismatch: $($f.filename)"}}
    Write-Host "DISPOSABLE_BACKUP_CERTIFICATION: PASS"
    Write-Host "RESTORE_VERIFICATION: PASS"
    Write-Host "FILES_VERIFIED: $($manifest.files.Count)/$($manifest.files.Count)"
} finally {
    Remove-Item Env:OPENDAY_DISPOSABLE_BACKUP_CERTIFICATION -ErrorAction SilentlyContinue
    & docker rm -f $source *> $null
    if(Test-Path $certRoot){Remove-Item $certRoot -Recurse -Force -ErrorAction SilentlyContinue}
}
