Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:CertificationSchema = 'openday/snag-list-docker-certification/v1'
$script:AllowedImage = 'postgres:17'
$script:ExpectedReleaseManifestSha256 = '21f4cc08c281c29e64328e68bf72a5aa49594f1dd8243b63c1dbfe3e6ec8bc8a'

function Get-Sha256([string]$Path) {
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-TextSha256([string]$Value) {
    $sha=[Security.Cryptography.SHA256]::Create()
    try { (($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value)) | ForEach-Object {$_.ToString('x2')}) -join '') }
    finally { $sha.Dispose() }
}

function Write-CanonicalJson([object]$Value, [string]$Path) {
    $json = $Value | ConvertTo-Json -Depth 30 -Compress
    [IO.File]::WriteAllText($Path, $json + "`n", [Text.UTF8Encoding]::new($false))
    Get-Sha256 $Path
}

function Invoke-Docker([string[]]$Arguments, [switch]$Capture) {
    $prior=$ErrorActionPreference; $ErrorActionPreference='Continue'
    try {
      if ($Capture) { $out = @(& docker @Arguments 2>&1); $code = $LASTEXITCODE }
      else { & docker @Arguments; $code = $LASTEXITCODE; $out = @() }
    } finally { $ErrorActionPreference=$prior }
    if ($code -ne 0) { throw "Docker command failed ($code): docker $($Arguments -join ' ') :: $($out -join ' | ')" }
    if ($Capture) { return ($out -join "`n").Trim() }
}

function Assert-NoRemoteEnvironment {
    $blocked = @('DATABASE_URL','POSTGRES_URL','SUPABASE_DB_URL','SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','PRODUCTION_DATABASE_URL','STAGING_DATABASE_URL')
    foreach ($name in $blocked) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrWhiteSpace($value)) { throw "Unsafe environment variable is set: $name" }
    }
}

function New-TargetContext([string]$RunId, [string]$Kind, [string]$Network, [string]$NetworkId, [string]$WorkDir) {
    $container = "openday-snag-cert-$Kind-$RunId"
    $volume = "openday-snag-cert-$Kind-vol-$RunId"
    $database = "snag_cert_${Kind}_$($RunId.Replace('-','_'))"
    $password = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    Invoke-Docker @('volume','create','--label',"openday.cert.run=$RunId",$volume) | Out-Null
    Invoke-Docker @('run','-d','--name',$container,'--network',$Network,'--mount',"source=$volume,target=/var/lib/postgresql/data",'--label',"openday.cert.run=$RunId",'-p','127.0.0.1::5432','-e',"POSTGRES_PASSWORD=$password",'-e',"POSTGRES_DB=$database",$script:AllowedImage) | Out-Null
    for ($i=0; $i -lt 60; $i++) {
        $ready = & docker exec $container pg_isready -U postgres -d $database 2>&1
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Milliseconds 500
    }
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL target did not become ready: $container" }
    $roleBootstrap="DO `$`$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF; END `$`$;"
    $roleReady=$false
    for($i=0;$i -lt 60;$i++){
      $prior=$ErrorActionPreference;$ErrorActionPreference='Continue'
      try { & docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $database -c $roleBootstrap *> $null; if($LASTEXITCODE -eq 0){$roleReady=$true;break} } finally {$ErrorActionPreference=$prior}
      Start-Sleep -Milliseconds 500
    }
    if(-not $roleReady){throw "PostgreSQL target did not reach stable post-init state: $container"}
    $containerId = Invoke-Docker @('inspect','--format','{{.Id}}',$container) -Capture
    $published = Invoke-Docker @('port',$container,'5432/tcp') -Capture
    if($published -notmatch '^127\.0\.0\.1:(\d+)$'){throw "Container is not loopback-only: $published"}
    $port = $Matches[1]
    $server = Invoke-Docker @('exec',$container,'psql','-XAt','-U','postgres','-d',$database,'-c',"select current_database()||'|'||coalesce(inet_server_addr()::text,'local')||'|'||inet_server_port()||'|'||current_setting('server_version_num')||'|'||system_identifier from pg_control_system()") -Capture
    $fingerprint = Get-TextSha256 $server
    [ordered]@{ schema=$script:CertificationSchema; runId=$RunId; kind=$Kind; host='127.0.0.1'; port=[int]$port; database=$database; user='postgres'; password=$password; container=$container; containerId=$containerId; network=$Network; networkId=$NetworkId; volume=$volume; image=$script:AllowedImage; serverIdentity=$server; fingerprint=$fingerprint; workDir=$WorkDir }
}

function Assert-TargetContext($Context) {
    if ($Context.schema -ne $script:CertificationSchema) { throw 'Target context schema mismatch' }
    if ($Context.host -notin @('127.0.0.1','localhost')) { throw 'External hostname rejected' }
    if ($Context.database -notlike "snag_cert_$($Context.kind)_$($Context.runId.Replace('-','_'))") { throw 'Database name/run identity mismatch' }
    if ($Context.container -notlike "openday-snag-cert-$($Context.kind)-$($Context.runId)") { throw 'Container/run identity mismatch' }
    $actualContainer = Invoke-Docker @('inspect','--format','{{.Id}}',$Context.container) -Capture
    if ($actualContainer -ne $Context.containerId) { throw 'Container ID mismatch' }
    $actualNetwork = Invoke-Docker @('network','inspect','--format','{{.Id}}',$Context.network) -Capture
    if ($actualNetwork -ne $Context.networkId) { throw 'Network ID mismatch' }
    $binding = Invoke-Docker @('port',$Context.container,'5432/tcp') -Capture
    if ($binding -ne "127.0.0.1:$($Context.port)") { throw 'Loopback port ownership mismatch' }
    $server = Invoke-Docker @('exec',$Context.container,'psql','-XAt','-U',$Context.user,'-d',$Context.database,'-c',"select current_database()||'|'||coalesce(inet_server_addr()::text,'local')||'|'||inet_server_port()||'|'||current_setting('server_version_num')||'|'||system_identifier from pg_control_system()") -Capture
    $fingerprint = Get-TextSha256 $server
    if ($server -ne $Context.serverIdentity -or $fingerprint -ne $Context.fingerprint) { throw 'Server fingerprint mismatch' }
}

function Invoke-PsqlFile($Context, [string]$HostPath) {
    Assert-TargetContext $Context
    $dest = "/tmp/$([IO.Path]::GetFileName($HostPath))"
    Invoke-Docker @('cp',(Resolve-Path -LiteralPath $HostPath).Path,"$($Context.container):$dest") | Out-Null
    Invoke-Docker @('exec',$Context.container,'psql','-X','-v','ON_ERROR_STOP=1','-U',$Context.user,'-d',$Context.database,'-f',$dest) | Out-Null
}

function Invoke-Query($Context, [string]$Sql) {
    Assert-TargetContext $Context
    Invoke-Docker @('exec',$Context.container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U',$Context.user,'-d',$Context.database,'-c',$Sql) -Capture
}

function New-PredecessorSchema($Context, [string]$RepoRoot, [string]$WorkDir) {
    . (Join-Path $RepoRoot 'scripts/lib/MigrationContractExtractor.ps1')
    $contractPath = Join-Path $RepoRoot 'scripts/contracts/canonical-security-contract.json'
    $contract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
    $bootstrap = @(
        Get-SupabasePlatformSchemaStubScript
        Get-SupabaseStorageSchemaStubScript
        'CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(regexp_replace(name, ''^.*\.([^.]+)$'', ''\1'')) $$;'
        'CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY, statements text[]);'
    ) -join "`n"
    $bootstrapPath = Join-Path $WorkDir 'platform-bootstrap.sql'
    [IO.File]::WriteAllText($bootstrapPath,$bootstrap,[Text.UTF8Encoding]::new($false))
    Invoke-PsqlFile $Context $bootstrapPath
    $migrationsRoot = Join-Path $RepoRoot 'weekly-tracker/src/migrations'
    $files = Get-CanonicalMigrationFileList -ContractPath $contractPath -MigrationsRoot $migrationsRoot
    foreach ($migration in $files) {
        Invoke-PsqlFile $Context $migration.FullPath
        [void](Invoke-Query $Context "insert into supabase_migrations.schema_migrations(version,statements) values ('$($migration.FileName.Substring(0,3))',ARRAY['$($migration.FileName)']) on conflict do nothing")
    }
    $releaseAbsent = Invoke-Query $Context "select count(*) from to_regclass('public.snags') where to_regclass('public.snags') is not null"
    if ($releaseAbsent -ne '0') { throw 'Release object public.snags exists before migration 030' }
    $required = Invoke-Query $Context "select (to_regclass('public.projects') is not null and to_regclass('public.profiles') is not null and to_regclass('auth.users') is not null and to_regclass('storage.objects') is not null and to_regprocedure('public.can_access_project(bigint)') is not null and to_regprocedure('public.can_write_project(bigint)') is not null)::text"
    if ($required -ne 'true') { throw 'Predecessor dependency closure is incomplete' }
    $inventory = [ordered]@{ schemaVersion=1; source='repository canonical fresh-install chain'; productionDerived=$false; migrations=@($files.FileName); platformStubs=@('auth.users','auth.uid','auth.role','storage.buckets','storage.objects','storage.foldername','storage.filename','storage.extension','Supabase roles'); requiredByRelease=@('public.projects','public.profiles','public.can_access_project(bigint)','public.can_write_project(bigint)','auth.users','storage.objects','authenticated','anon','service_role'); releaseObjectsAbsent=$true }
    $inventoryPath = Join-Path $WorkDir 'dependency-closure.json'
    $inventoryHash = Write-CanonicalJson $inventory $inventoryPath
    $schemaFingerprint = Invoke-Query $Context "select md5(string_agg(x,E'\n' order by x)) from (select n.nspname||'.'||c.relname||':'||c.relkind::text x from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') union all select n.nspname||'.'||p.proname||':'||pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','storage')) q"
    [ordered]@{ inventoryPath=$inventoryPath; inventoryHash=$inventoryHash; schemaFingerprint=$schemaFingerprint; migrationCount=$files.Count }
}

function New-LocalBackup($Context, [string]$WorkDir) {
    Assert-TargetContext $Context
    $backupDir = Join-Path $WorkDir 'backup'
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    $dumpInContainer='/tmp/predecessor.dump'
    Invoke-Docker @('exec',$Context.container,'pg_dump','-Fc','--no-owner','--no-privileges','-U',$Context.user,'-d',$Context.database,'-f',$dumpInContainer) | Out-Null
    $dumpPath=Join-Path $backupDir 'predecessor.dump'
    Invoke-Docker @('cp',"$($Context.container):$dumpInContainer",$dumpPath) | Out-Null
    $manifest=[ordered]@{ schemaVersion=1; runId=$Context.runId; sourceFingerprint=$Context.fingerprint; sourceContainerId=$Context.containerId; database=$Context.database; productionDerived=$false; artifact=[ordered]@{ file='predecessor.dump'; bytes=(Get-Item $dumpPath).Length; sha256=(Get-Sha256 $dumpPath) } }
    $manifestPath=Join-Path $backupDir 'backup-manifest.json'
    $hash=Write-CanonicalJson $manifest $manifestPath
    [ordered]@{ directory=$backupDir; dumpPath=$dumpPath; manifestPath=$manifestPath; manifestHash=$hash }
}

function Restore-LocalBackup($Context, $Backup, [string]$WorkDir) {
    Assert-TargetContext $Context
    if ((Get-Sha256 $Backup.manifestPath) -ne $Backup.manifestHash) { throw 'Backup manifest hash mismatch' }
    $manifest=Get-Content $Backup.manifestPath -Raw | ConvertFrom-Json
    if ((Get-Sha256 $Backup.dumpPath) -ne $manifest.artifact.sha256) { throw 'Backup artifact hash mismatch' }
    Invoke-Docker @('cp',$Backup.dumpPath,"$($Context.container):/tmp/predecessor.dump") | Out-Null
    Invoke-Docker @('exec',$Context.container,'pg_restore','--exit-on-error','--no-owner','--no-privileges','-U',$Context.user,'-d',$Context.database,'/tmp/predecessor.dump') | Out-Null
    $releaseAbsent=Invoke-Query $Context "select (to_regclass('public.snags') is null)::text"
    if($releaseAbsent -ne 'true'){ throw 'Restored target is not predecessor state' }
    $report=[ordered]@{ schemaVersion=1; status='PASS'; runId=$Context.runId; targetFingerprint=$Context.fingerprint; backupManifestSha256=$Backup.manifestHash; backupArtifactSha256=$manifest.artifact.sha256; releaseObjectsAbsent=$true }
    $path=Join-Path $WorkDir 'restore-report.json'; $hash=Write-CanonicalJson $report $path
    [ordered]@{ path=$path; hash=$hash; report=$report }
}

function Get-ReleaseFiles([string]$RepoRoot) {
    $manifestPath=Join-Path $RepoRoot 'scripts/manifests/snag-list-030-035.psd1'; $manifest=Import-PowerShellDataFile $manifestPath
    $root=Join-Path $RepoRoot $manifest.migrationsDirectory
    @($manifest.migrations | Sort-Object { [int]$_['number'] } | ForEach-Object { $p=Join-Path $root $_['file']; [pscustomobject][ordered]@{ number=[int]$_['number']; file=[string]$_['file']; path=$p; expected=[string]$_['sha256']; actual=Get-Sha256 $p } })
}

function New-LocalPreflight($Context,[string]$RepoRoot,$Backup,$Restore,[string]$WorkDir,[string]$Head,[string]$Branch) {
    Assert-NoRemoteEnvironment; Assert-TargetContext $Context
    $manifestPath=Join-Path $RepoRoot 'scripts/manifests/snag-list-030-035.psd1'; $manifestHash=Get-Sha256 $manifestPath
    if($manifestHash -ne $script:ExpectedReleaseManifestSha256){throw 'Release manifest hash mismatch'}
    $files=Get-ReleaseFiles $RepoRoot
    foreach($f in $files){ if($f.actual -ne $f.expected){ throw "Migration hash mismatch: $($f.file)" } }
    if((Get-Sha256 $Backup.manifestPath) -ne $Backup.manifestHash){throw 'Backup manifest changed'}
    if((Get-Sha256 $Restore.path) -ne $Restore.hash){throw 'Restore report changed'}
    $backupDocument=Get-Content $Backup.manifestPath -Raw|ConvertFrom-Json
    if($backupDocument.runId -ne $Context.runId){throw 'Backup from another run rejected'}
    if($Restore.report.status -ne 'PASS' -or $Restore.report.runId -ne $Context.runId -or $Restore.report.targetFingerprint -ne $Context.fingerprint -or $Restore.report.backupManifestSha256 -ne $Backup.manifestHash){throw 'Restore evidence binding failed'}
    $ledger=Invoke-Query $Context "select count(*) from supabase_migrations.schema_migrations where version between '030' and '035'"
    if($ledger -ne '0'){throw 'Partial or already-applied release state'}
    $required=Invoke-Query $Context "select (to_regclass('public.projects') is not null and to_regclass('public.profiles') is not null and to_regclass('auth.users') is not null and to_regclass('storage.objects') is not null and to_regprocedure('public.can_access_project(bigint)') is not null and to_regprocedure('public.can_write_project(bigint)') is not null and to_regprocedure('storage.extension(text)') is not null)::text"
    if($required -ne 'true'){throw 'Required predecessor object is missing'}
    $checks=@([ordered]@{name='targetIdentity';status='PASS'},[ordered]@{name='predecessorState';status='PASS'},[ordered]@{name='migrationHashes';status='PASS'},[ordered]@{name='backupRestoreBinding';status='PASS'},[ordered]@{name='remoteMarkersAbsent';status='PASS'})
    $report=[ordered]@{ schemaVersion=1; status='PASS'; runId=$Context.runId; gitHead=$Head; branch=$Branch; repositoryRoot=$RepoRoot.Replace('\','/'); manifestSha256=$manifestHash; backupManifestSha256=$Backup.manifestHash; restoreReportSha256=$Restore.hash; targetFingerprint=$Context.fingerprint; migrations=$files; generatedAtUtc=[DateTime]::UtcNow.ToString('o'); checks=$checks }
    $path=Join-Path $WorkDir 'preflight-report.json'; $hash=Write-CanonicalJson $report $path
    $phrase="APPROVE LOCAL DOCKER CERTIFICATION SNAG LIST 030-035 AT $Head MANIFEST $manifestHash BACKUP $($Backup.manifestHash) RESTORE $($Restore.hash) PREFLIGHT $hash TARGET $($Context.fingerprint) RUN $($Context.runId)"
    [ordered]@{path=$path;hash=$hash;report=$report;phrase=$phrase}
}

function Invoke-LocalApply($Context,[string]$RepoRoot,$Backup,$Restore,$Preflight,[string]$Phrase,[string]$WorkDir,[string]$Head) {
    Assert-TargetContext $Context
    if((Get-Sha256 $Preflight.path) -ne $Preflight.hash){throw 'Preflight evidence changed'}
    if((Get-Sha256 $Restore.path) -ne $Restore.hash){throw 'Restore evidence changed'}
    if((Get-Sha256 $Backup.manifestPath) -ne $Backup.manifestHash){throw 'Backup evidence changed'}
    if($Preflight.report.status -ne 'PASS' -or $Preflight.report.gitHead -ne $Head -or $Preflight.report.runId -ne $Context.runId -or $Preflight.report.targetFingerprint -ne $Context.fingerprint){throw 'Preflight status/HEAD/run/target binding failed'}
    if($Phrase -cne $Preflight.phrase){throw 'Exact local approval phrase mismatch'}
    $files=Get-ReleaseFiles $RepoRoot
    foreach($f in $files){ if((Get-Sha256 $f.path) -ne $f.expected){throw "Migration changed after preflight: $($f.file)"} }
    if((Invoke-Query $Context "select count(*) from supabase_migrations.schema_migrations where version between '030' and '035'") -ne '0'){throw 'Partial or already-applied release state'}
    foreach($f in $files){
        Write-Host "APPLYING_MIGRATION=$($f.number):$($f.file)"
        Invoke-PsqlFile $Context $f.path
        [void](Invoke-Query $Context "insert into supabase_migrations.schema_migrations(version,statements) values ('$('{0:d3}' -f $f.number)',ARRAY['$($f.file)'])")
        if($f.number -eq 30 -and (Invoke-Query $Context "select (to_regclass('public.snag_plan_versions') is not null)::text") -ne 'true'){throw 'Migration 030 returned success without creating snag_plan_versions'}
    }
    $report=[ordered]@{schemaVersion=1;status='PASS';runId=$Context.runId;targetFingerprint=$Context.fingerprint;preflightReportSha256=$Preflight.hash;gitHead=$Head;applied=@($files|ForEach-Object{[ordered]@{number=$_.number;file=$_.file;sha256=$_.actual}})}
    $path=Join-Path $WorkDir 'apply-report.json';$hash=Write-CanonicalJson $report $path
    [ordered]@{path=$path;hash=$hash;report=$report}
}

function Invoke-LocalPostflight($Context,$Apply,[string]$WorkDir) {
    Assert-TargetContext $Context
    if((Get-Sha256 $Apply.path) -ne $Apply.hash){throw 'Apply report changed'}
    if($Apply.report.runId -ne $Context.runId -or $Apply.report.targetFingerprint -ne $Context.fingerprint){throw 'Postflight target differs from apply target'}
    $ledger=Invoke-Query $Context "select string_agg(version,',' order by version) from supabase_migrations.schema_migrations where version between '030' and '035'"
    if($ledger -ne '030,031,032,033,034,035'){throw "Release ledger mismatch: $ledger"}
    $sql=@"
select json_build_object(
 'tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('snags','snag_events','snag_evidence','snag_plan_versions','snag_command_requests','snag_evidence_upload_intents','project_snag_sequences','project_snag_trades','project_stakeholders','snag_trade_stakeholders','snag_comments')),
 'rls', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity and c.relname in ('snags','snag_events','snag_evidence','snag_plan_versions','snag_command_requests','snag_evidence_upload_intents','project_snag_sequences','project_snag_trades','project_stakeholders','snag_trade_stakeholders','snag_comments')),
 'policies', (select count(*) from pg_policies where schemaname in ('public','storage') and policyname like 'snag%'),
 'functions', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('execute_snag_command','list_snag_project_contractors','create_snag_plan_upload_intent','authorize_snag_evidence_upload','capture_snag_observation','publish_snag_observations','configure_snag_catalog','add_snag_comment')),
 'unsafeDefiners', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proname like '%snag%' and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) s where replace(s,' ','') in ('search_path=public','search_path=public,pg_temp','search_path=public,storage,pg_temp')))
)::text
"@
    $catalog=Invoke-Query $Context $sql | ConvertFrom-Json
    if($catalog.tables -ne 11 -or $catalog.rls -ne 11 -or $catalog.functions -lt 8 -or $catalog.unsafeDefiners -ne 0){throw "Postflight catalog contract failed: $($catalog|ConvertTo-Json -Compress)"}
    $schemaFingerprint=Invoke-Query $Context "select md5(string_agg(x,E'\n' order by x)) from (select n.nspname||'.'||c.relname||':'||c.relkind::text x from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') union all select n.nspname||'.'||p.proname||':'||pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','storage')) q"
    $report=[ordered]@{schemaVersion=1;status='PASS';runId=$Context.runId;targetFingerprint=$Context.fingerprint;applyReportSha256=$Apply.hash;ledger=$ledger;catalog=$catalog;schemaFingerprint=$schemaFingerprint}
    $path=Join-Path $WorkDir 'postflight-report.json';$hash=Write-CanonicalJson $report $path
    [ordered]@{path=$path;hash=$hash;report=$report}
}

function Assert-Rejected([string]$Name,[scriptblock]$Action,[ref]$Results) {
    $rejected=$false
    try { & $Action } catch { $rejected=$true }
    if(-not $rejected){throw "Negative scenario unexpectedly succeeded: $Name"}
    $Results.Value += [ordered]@{name=$Name;status='PASS';expected='REJECTED'}
}

function Invoke-PreApplyNegativeScenarios($Context,[string]$RepoRoot,$Backup,$Restore,$Preflight,[string]$WorkDir,[string]$Head,[string]$Branch) {
    $results=@()
    function Clone($x){ $x|ConvertTo-Json -Depth 30|ConvertFrom-Json }
    $bad=Clone $Context;$bad.host='db.production.example';Assert-Rejected 'external hostname' {Assert-TargetContext $bad} ([ref]$results)
    $bad=Clone $Context;$bad.host='prod.supabase.co';Assert-Rejected 'production-like URL' {Assert-TargetContext $bad} ([ref]$results)
    $bad=Clone $Context;$bad.host='staging.supabase.co';Assert-Rejected 'staging-like URL' {Assert-TargetContext $bad} ([ref]$results)
    $bad=Clone $Context;$bad.containerId='wrong';Assert-Rejected 'wrong container ID' {Assert-TargetContext $bad} ([ref]$results)
    $bad=Clone $Context;$bad.database='postgres';Assert-Rejected 'wrong database name/arbitrary target' {Assert-TargetContext $bad} ([ref]$results)
    $bad=Clone $Context;$bad.fingerprint='wrong';Assert-Rejected 'wrong target fingerprint' {Assert-TargetContext $bad} ([ref]$results)
    Assert-Rejected 'wrong approval phrase' {Invoke-LocalApply $Context $RepoRoot $Backup $Restore $Preflight ($Preflight.phrase+' X') $WorkDir $Head} ([ref]$results)
    foreach($field in @('AT','MANIFEST','BACKUP','RESTORE','PREFLIGHT','TARGET','RUN')){Assert-Rejected "approval field changed: $field" {Invoke-LocalApply $Context $RepoRoot $Backup $Restore $Preflight ($Preflight.phrase -replace " $field "," ${field}X ") $WorkDir $Head} ([ref]$results)}
    $p=Clone $Preflight;$p.report.gitHead='0000000000000000000000000000000000000000';Assert-Rejected 'wrong Git HEAD binding' {Invoke-LocalApply $Context $RepoRoot $Backup $Restore $p $p.phrase $WorkDir $Head} ([ref]$results)
    $p=Clone $Preflight;$p.report.runId='ffffffffffff';Assert-Rejected 'wrong run ID' {Invoke-LocalApply $Context $RepoRoot $Backup $Restore $p $p.phrase $WorkDir $Head} ([ref]$results)
    $p=Clone $Preflight;$p.report.targetFingerprint='wrong';Assert-Rejected 'wrong preflight target fingerprint' {Invoke-LocalApply $Context $RepoRoot $Backup $Restore $p $p.phrase $WorkDir $Head} ([ref]$results)
    $tampered=Join-Path $WorkDir 'tampered-preflight.json';Copy-Item $Preflight.path $tampered;Add-Content $tampered ' ';$p=Clone $Preflight;$p.path=$tampered;Assert-Rejected 'modified/stale preflight report' {Invoke-LocalApply $Context $RepoRoot $Backup $Restore $p $p.phrase $WorkDir $Head} ([ref]$results)
    $tampered=Join-Path $WorkDir 'tampered-restore.json';Copy-Item $Restore.path $tampered;Add-Content $tampered ' ';$r=Clone $Restore;$r.path=$tampered;Assert-Rejected 'modified restore report' {New-LocalPreflight $Context $RepoRoot $Backup $r $WorkDir $Head $Branch} ([ref]$results)
    $r=Clone $Restore;$r.report.runId='ffffffffffff';Assert-Rejected 'restore report from another run' {New-LocalPreflight $Context $RepoRoot $Backup $r $WorkDir $Head $Branch} ([ref]$results)
    $tampered=Join-Path $WorkDir 'tampered-backup-manifest.json';Copy-Item $Backup.manifestPath $tampered;Add-Content $tampered ' ';$b=Clone $Backup;$b.manifestPath=$tampered;Assert-Rejected 'modified backup manifest' {New-LocalPreflight $Context $RepoRoot $b $Restore $WorkDir $Head $Branch} ([ref]$results)
    $b=Clone $Backup;$doc=Get-Content $Backup.manifestPath -Raw|ConvertFrom-Json;$doc.runId='ffffffffffff';$other=Join-Path $WorkDir 'other-run-backup.json';[void](Write-CanonicalJson $doc $other);$b.manifestPath=$other;$b.manifestHash=Get-Sha256 $other;Assert-Rejected 'backup from another run' {New-LocalPreflight $Context $RepoRoot $b $Restore $WorkDir $Head $Branch} ([ref]$results)
    $tempRepo=Join-Path $WorkDir 'tampered-repo';New-Item -ItemType Directory -Force -Path (Join-Path $tempRepo 'scripts/manifests'),(Join-Path $tempRepo 'weekly-tracker/src/migrations')|Out-Null;Copy-Item (Join-Path $RepoRoot 'scripts/manifests/snag-list-030-035.psd1') (Join-Path $tempRepo 'scripts/manifests/snag-list-030-035.psd1');Get-ReleaseFiles $RepoRoot|ForEach-Object{Copy-Item $_.path (Join-Path (Join-Path $tempRepo 'weekly-tracker/src/migrations') $_.file)};Add-Content (Join-Path $tempRepo 'weekly-tracker/src/migrations/030_snag_list_foundation.sql') ' ';
    Assert-Rejected 'modified migration file' {New-LocalPreflight $Context $tempRepo $Backup $Restore $WorkDir $Head $Branch} ([ref]$results)
    Copy-Item (Join-Path $RepoRoot 'weekly-tracker/src/migrations/030_snag_list_foundation.sql') (Join-Path $tempRepo 'weekly-tracker/src/migrations/030_snag_list_foundation.sql') -Force;Add-Content (Join-Path $tempRepo 'scripts/manifests/snag-list-030-035.psd1') ' ';Assert-Rejected 'modified release manifest' {New-LocalPreflight $Context $tempRepo $Backup $Restore $WorkDir $Head $Branch} ([ref]$results)
    $old=[Environment]::GetEnvironmentVariable('PRODUCTION_DATABASE_URL');try{[Environment]::SetEnvironmentVariable('PRODUCTION_DATABASE_URL','postgres://prod.invalid/db');Assert-Rejected 'production/staging env injection' {New-LocalPreflight $Context $RepoRoot $Backup $Restore $WorkDir $Head $Branch} ([ref]$results)}finally{[Environment]::SetEnvironmentVariable('PRODUCTION_DATABASE_URL',$old)}
    [void](Invoke-Query $Context "insert into supabase_migrations.schema_migrations(version,statements) values ('030',ARRAY['negative partial state'])");Assert-Rejected 'partial migration state' {Invoke-LocalApply $Context $RepoRoot $Backup $Restore $Preflight $Preflight.phrase $WorkDir $Head} ([ref]$results);[void](Invoke-Query $Context "delete from supabase_migrations.schema_migrations where version='030'")
    [void](Invoke-Query $Context 'drop function storage.extension(text)');Assert-Rejected 'missing required predecessor object' {New-LocalPreflight $Context $RepoRoot $Backup $Restore $WorkDir $Head $Branch} ([ref]$results);[void](Invoke-Query $Context "CREATE FUNCTION storage.extension(name text) RETURNS text LANGUAGE sql IMMUTABLE AS `$`$ SELECT lower(regexp_replace(name, '^.*\.([^.]+)$', '\1')) `$`$")
    [ordered]@{status='PASS';count=$results.Count;scenarios=$results}
}

function Invoke-TargetLifecycleNegativeScenarios([string]$RunId,[string]$Network,[string]$NetworkId,[string]$WorkDir) {
    $results=@();$guard=New-TargetContext $RunId 'guard' $Network $NetworkId $WorkDir
    Invoke-Docker @('rm','-f',$guard.container)|Out-Null
    Assert-Rejected 'context reuse after container deletion' {Assert-TargetContext $guard} ([ref]$results)
    Invoke-Docker @('run','-d','--name',$guard.container,'--network',$Network,'--label',"openday.cert.run=$RunId",'-e','POSTGRES_PASSWORD=recreated-only-for-negative-test','-e',"POSTGRES_DB=$($guard.database)",$script:AllowedImage)|Out-Null
    Assert-Rejected 'stopped/recreated Docker container' {Assert-TargetContext $guard} ([ref]$results)
    [ordered]@{context=$guard;status='PASS';count=$results.Count;scenarios=$results}
}

function Test-NoResourceLeaks([string]$RunId) {
    $containers=@(& docker ps -aq --filter "label=openday.cert.run=$RunId" 2>$null)
    $volumes=@(& docker volume ls -q --filter "label=openday.cert.run=$RunId" 2>$null)
    $networks=@(& docker network ls -q --filter "label=openday.cert.run=$RunId" 2>$null)
    if(@($containers).Count -or @($volumes).Count -or @($networks).Count){throw 'Cleanup leak detected'}
}

function Invoke-PostApplyNegativeScenarios($Context,[string]$RepoRoot,$Backup,$Restore,$Preflight,$Apply,[string]$WorkDir,[string]$Head) {
    $results=@()
    Assert-Rejected 'already-applied/partial migration state' {Invoke-LocalApply $Context $RepoRoot $Backup $Restore $Preflight $Preflight.phrase $WorkDir $Head} ([ref]$results)
    $wrong=[pscustomobject]@{path=$Apply.path;hash=$Apply.hash;report=($Apply.report|ConvertTo-Json -Depth 30|ConvertFrom-Json)};$wrong.report.targetFingerprint='wrong';Assert-Rejected 'postflight against different database' {Invoke-LocalPostflight $Context $wrong $WorkDir} ([ref]$results)
    [ordered]@{status='PASS';count=$results.Count;scenarios=$results}
}

function Remove-CertificationResources([string]$RunId,[string[]]$Containers,[string[]]$Volumes,[string]$Network) {
    $labelContainers=@(& docker ps -aq --filter "label=openday.cert.run=$RunId" 2>$null)
    foreach($c in $labelContainers){ if(-not [string]::IsNullOrWhiteSpace($c)){ & docker rm -f $c *> $null } }
    $labelVolumes=@(& docker volume ls -q --filter "label=openday.cert.run=$RunId" 2>$null)
    foreach($v in $labelVolumes){ if(-not [string]::IsNullOrWhiteSpace($v)){ & docker volume rm -f $v *> $null } }
    & docker network rm $Network *> $null 2>&1
    Test-NoResourceLeaks $RunId
}
