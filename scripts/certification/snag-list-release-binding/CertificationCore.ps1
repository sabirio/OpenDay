Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:CertificationSchema = 'openday/snag-list-docker-certification/v1'
$script:ReleaseAttestationSchema = 'openday/snag-list-production-gate-attestation/v1'
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

function Get-ArtifactDescriptor([string]$Name, [string]$Path) {
    $item = Get-Item -LiteralPath $Path
    [ordered]@{
        name = $Name
        path = (Resolve-Path -LiteralPath $Path).Path.Replace('\','/')
        bytes = $item.Length
        sha256 = Get-Sha256 $Path
    }
}

function Get-CertificationScriptArtifacts([string]$RepoRoot) {
    $candidates = @(
        [ordered]@{ name = 'certification-core'; path = 'scripts/certification/snag-list-release-binding/CertificationCore.ps1' }
        [ordered]@{ name = 'certification-entrypoint'; path = 'scripts/certification/snag-list-release-binding/Invoke-SnagListReleaseBindingCertification.ps1' }
        [ordered]@{ name = 'final-attestation-generator'; path = 'scripts/certification/snag-list-release-binding/New-SnagListFinalReleaseAttestation.ps1' }
        [ordered]@{ name = 'release-binding-tests'; path = 'scripts/tests/snag-list-release-binding-certification.tests.ps1' }
    )
    @($candidates | ForEach-Object {
        $path = Join-Path $RepoRoot $_.path
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Get-ArtifactDescriptor $_.name $path
        }
    })
}

function Get-DockerImageIdentity([string]$Image) {
    $imageId = Invoke-Docker @('image','inspect','--format','{{.Id}}',$Image) -Capture
    $created = Invoke-Docker @('image','inspect','--format','{{.Created}}',$Image) -Capture
    $repoDigestsRaw = Invoke-Docker @('image','inspect','--format','{{range .RepoDigests}}{{.}}{{"\n"}}{{end}}',$Image) -Capture
    $repoDigests = @($repoDigestsRaw -split "`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    [ordered]@{
        image = $Image
        imageId = $imageId
        created = $created
        repoDigests = $repoDigests
    }
}

function Get-DockerRuntimeIdentity {
    [ordered]@{
        serverVersion = Invoke-Docker @('version','--format','{{.Server.Version}}') -Capture
        clientVersion = Invoke-Docker @('version','--format','{{.Client.Version}}') -Capture
    }
}

function Get-SanitizedDockerRun($Context) {
    [ordered]@{
        kind = $Context.kind
        runId = $Context.runId
        database = $Context.database
        host = $Context.host
        port = $Context.port
        container = $Context.container
        containerId = $Context.containerId
        volume = $Context.volume
        network = $Context.network
        networkId = $Context.networkId
        image = $Context.image
        serverIdentitySha256 = Get-TextSha256 $Context.serverIdentity
        fingerprint = $Context.fingerprint
    }
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

function New-ReleaseAttestation($SourceContext,$RestoreContext,[string]$RepoRoot,$Predecessor,$Backup,$Restore,$Preflight,$Apply,$Postflight,$CertificationReport,$NegativePre,$NegativePost,$Lifecycle,$Cleanup,[string]$WorkDir,[string]$Head,[string]$Branch,[DateTime]$StartedAtUtc,[DateTime]$CompletedAtUtc) {
    $manifestPath = Join-Path $RepoRoot 'scripts/manifests/snag-list-030-035.psd1'
    $manifestHash = Get-Sha256 $manifestPath
    if ($manifestHash -ne $script:ExpectedReleaseManifestSha256) { throw 'Attestation rejected: release manifest hash mismatch' }
    $files = Get-ReleaseFiles $RepoRoot
    foreach ($f in $files) { if ($f.actual -ne $f.expected) { throw "Attestation rejected: migration hash mismatch: $($f.file)" } }

    $certificationScripts = Get-CertificationScriptArtifacts $RepoRoot
    $supportingArtifacts = @(
        Get-ArtifactDescriptor 'dependency-closure' $Predecessor.inventoryPath
        Get-ArtifactDescriptor 'backup-manifest' $Backup.manifestPath
        Get-ArtifactDescriptor 'backup-dump' $Backup.dumpPath
        Get-ArtifactDescriptor 'restore-report' $Restore.path
        Get-ArtifactDescriptor 'preflight-report' $Preflight.path
        Get-ArtifactDescriptor 'apply-report' $Apply.path
        Get-ArtifactDescriptor 'postflight-report' $Postflight.path
        Get-ArtifactDescriptor 'certification-report' $CertificationReport.path
    )
    $negativeScenarios = @($Lifecycle.count + $NegativePre.count + $NegativePost.count)
    if ($negativeScenarios[0] -ne 31) { throw "Attestation rejected: expected 31 negative checks, got $($negativeScenarios[0])" }
    if ($Cleanup.containers -ne 0 -or $Cleanup.volumes -ne 0 -or $Cleanup.networks -ne 0) { throw 'Attestation rejected: cleanup leaks remain' }

    [ordered]@{
        schemaVersion = 1
        schema = $script:ReleaseAttestationSchema
        status = 'PASS'
        releaseId = 'snag-list-030-035'
        generatedAtUtc = $CompletedAtUtc.ToString('o')
        validUntilUtc = $CompletedAtUtc.AddHours(24).ToString('o')
        timestamps = [ordered]@{
            startedAtUtc = $StartedAtUtc.ToString('o')
            completedAtUtc = $CompletedAtUtc.ToString('o')
        }
        repository = [ordered]@{
            exactHead = $Head
            branch = $Branch
            manifestPath = 'scripts/manifests/snag-list-030-035.psd1'
            manifestSha256 = $manifestHash
        }
        releaseManifest = [ordered]@{
            sha256 = $manifestHash
            migrations = @($files | ForEach-Object { [ordered]@{ number = $_.number; file = $_.file; sha256 = $_.actual } })
        }
        certificationScripts = $certificationScripts
        docker = [ordered]@{
            runtime = Get-DockerRuntimeIdentity
            image = Get-DockerImageIdentity $script:AllowedImage
            network = [ordered]@{ name = $SourceContext.network; id = $SourceContext.networkId }
            independentRuns = @(
                Get-SanitizedDockerRun $SourceContext
                Get-SanitizedDockerRun $RestoreContext
            )
        }
        evidence = [ordered]@{
            predecessorSchemaFingerprint = $Predecessor.schemaFingerprint
            sourceFingerprint = $SourceContext.fingerprint
            restoreFingerprint = $RestoreContext.fingerprint
            schemaFingerprint = $Postflight.report.schemaFingerprint
            backupManifestSha256 = $Backup.manifestHash
            restoreReportSha256 = $Restore.hash
            preflightReportSha256 = $Preflight.hash
            applyReportSha256 = $Apply.hash
            postflightReportSha256 = $Postflight.hash
            supportingArtifacts = $supportingArtifacts
        }
        checks = [ordered]@{
            status = 'PASS'
            passed = 31
            total = 31
            lifecycleNegativeChecks = $Lifecycle.count
            preApplyNegativeChecks = $NegativePre.count
            postApplyNegativeChecks = $NegativePost.count
        }
        cleanup = [ordered]@{
            status = 'PASS'
            containers = $Cleanup.containers
            volumes = $Cleanup.volumes
            networks = $Cleanup.networks
        }
        productionGateContract = [ordered]@{
            gateReadsOnlyThisArtifact = $true
            requiredChecks = @('artifactExists','sha256Matches','statusPass','exactHeadMatches','releaseManifestSha256Matches','notExpired','notModified')
            noLogReconstructionRequired = $true
        }
        productionAccessed = $false
        stagingAccessed = $false
    }
}

function Write-ReleaseAttestation($Attestation,[string]$WorkDir) {
    $path = Join-Path $WorkDir 'release-attestation.json'
    $hash = Write-CanonicalJson $Attestation $path
    [ordered]@{ path = $path; sha256 = $hash; report = $Attestation }
}

function Assert-JsonProperty($Object,[string]$Property,[string]$Context) {
    if ($null -eq $Object -or $null -eq $Object.PSObject.Properties[$Property]) {
        throw "ATTESTATION GATE REJECTED: missing $Context.$Property"
    }
    $value = $Object.PSObject.Properties[$Property].Value
    if ($null -eq $value -or ($value -is [string] -and [string]::IsNullOrWhiteSpace($value))) {
        throw "ATTESTATION GATE REJECTED: empty $Context.$Property"
    }
    $value
}

function Assert-ArtifactsMatchDisk($Artifacts,[string]$Context) {
    foreach ($artifact in @($Artifacts)) {
        $path = Assert-JsonProperty $artifact 'path' $Context
        $sha256 = Assert-JsonProperty $artifact 'sha256' $Context
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "ATTESTATION GATE REJECTED: missing bound artifact: $path"
        }
        if ((Get-Sha256 $path) -cne $sha256) {
            throw "ATTESTATION GATE REJECTED: bound artifact SHA mismatch: $path"
        }
    }
}

function Assert-RunAttestationComplete($Run,[string]$ExpectedHead,[string]$ExpectedBranch,[string]$ExpectedManifestSha256,[string]$Label) {
    if ($Run.schema -ne $script:ReleaseAttestationSchema) { throw "ATTESTATION GATE REJECTED: $Label schema mismatch" }
    if ($Run.status -ne 'PASS') { throw "ATTESTATION GATE REJECTED: $Label status is not PASS" }
    if ($Run.repository.exactHead -cne $ExpectedHead) { throw "ATTESTATION GATE REJECTED: $Label HEAD mismatch" }
    if ($Run.repository.branch -cne $ExpectedBranch) { throw "ATTESTATION GATE REJECTED: $Label branch mismatch" }
    if ($Run.repository.manifestSha256 -cne $ExpectedManifestSha256) { throw "ATTESTATION GATE REJECTED: $Label manifest mismatch" }
    if ($Run.checks.passed -ne 31 -or $Run.checks.total -ne 31) { throw "ATTESTATION GATE REJECTED: $Label negative scenarios are not 31/31" }
    if ($Run.cleanup.containers -ne 0 -or $Run.cleanup.volumes -ne 0 -or $Run.cleanup.networks -ne 0) { throw "ATTESTATION GATE REJECTED: $Label cleanup is not 0/0/0" }
    if (@($Run.docker.independentRuns).Count -ne 2) { throw "ATTESTATION GATE REJECTED: $Label does not contain source and restore Docker identities" }
    if ([string]::IsNullOrWhiteSpace($Run.evidence.schemaFingerprint)) { throw "ATTESTATION GATE REJECTED: $Label missing schema fingerprint" }
    if ([string]::IsNullOrWhiteSpace($Run.evidence.backupManifestSha256) -or [string]::IsNullOrWhiteSpace($Run.evidence.restoreReportSha256) -or [string]::IsNullOrWhiteSpace($Run.evidence.preflightReportSha256) -or [string]::IsNullOrWhiteSpace($Run.evidence.applyReportSha256) -or [string]::IsNullOrWhiteSpace($Run.evidence.postflightReportSha256)) {
        throw "ATTESTATION GATE REJECTED: $Label missing required evidence hashes"
    }
}

function Read-ReleaseAttestationArtifact([string]$Path,[string]$ExpectedSha256) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "ATTESTATION GATE REJECTED: run attestation missing: $Path" }
    $actual = Get-Sha256 $Path
    if ($actual -cne $ExpectedSha256) { throw "ATTESTATION GATE REJECTED: run attestation SHA mismatch: $Path" }
    [ordered]@{
        path = (Resolve-Path -LiteralPath $Path).Path.Replace('\','/')
        sha256 = $actual
        report = (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
        descriptor = Get-ArtifactDescriptor 'run-attestation' $Path
    }
}

function Get-RunIdentitySet($Run) {
    $dockerRuns = @($Run.docker.independentRuns)
    [ordered]@{
        containers = @($dockerRuns | ForEach-Object { $_.containerId })
        volumes = @($dockerRuns | ForEach-Object { $_.volume })
        networks = @(@($Run.docker.network.id) + @($dockerRuns | ForEach-Object { $_.networkId }) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
        evidenceHashes = @($Run.evidence.backupManifestSha256,$Run.evidence.restoreReportSha256,$Run.evidence.preflightReportSha256,$Run.evidence.applyReportSha256,$Run.evidence.postflightReportSha256)
    }
}

function Assert-DisjointIdentitySet($A,$B,[string]$Name) {
    $overlap = @($A | Where-Object { $B -contains $_ -and -not [string]::IsNullOrWhiteSpace($_) })
    if ($overlap.Count -gt 0) { throw "ATTESTATION GATE REJECTED: RUN_A and RUN_B reuse $Name identities: $($overlap -join ',')" }
}

function Get-GitCleanProof([string]$RepoRoot,[switch]$SkipGitCleanCheck) {
    if ($SkipGitCleanCheck) {
        return [ordered]@{ status = 'SKIPPED_FOR_UNIT_TEST'; trackedTreeClean = $true; stagingEmpty = $true }
    }
    & git -C $RepoRoot diff --quiet
    if ($LASTEXITCODE -ne 0) { throw 'ATTESTATION GATE REJECTED: tracked working tree is dirty' }
    & git -C $RepoRoot diff --cached --quiet
    if ($LASTEXITCODE -ne 0) { throw 'ATTESTATION GATE REJECTED: staging area is not empty' }
    [ordered]@{ status = 'PASS'; trackedTreeClean = $true; stagingEmpty = $true }
}

function Test-GitAncestor([string]$RepoRoot,[string]$Ancestor,[string]$Descendant) {
    & git -C $RepoRoot merge-base --is-ancestor $Ancestor $Descendant
    $LASTEXITCODE -eq 0
}

function New-FinalReleaseAttestation([string]$RunAAttestationPath,[string]$RunAAttestationSha256,[string]$RunBAttestationPath,[string]$RunBAttestationSha256,[string]$RepoRoot,[string]$Head,[string]$Branch,[DateTime]$StartedAtUtc,[DateTime]$CompletedAtUtc,[switch]$SkipGitCleanCheck) {
    $runA = Read-ReleaseAttestationArtifact $RunAAttestationPath $RunAAttestationSha256
    $runB = Read-ReleaseAttestationArtifact $RunBAttestationPath $RunBAttestationSha256
    if ($runA.path -ceq $runB.path) { throw 'ATTESTATION GATE REJECTED: RUN_A and RUN_B use the same attestation artifact' }
    if ($runA.sha256 -ceq $runB.sha256) { throw 'ATTESTATION GATE REJECTED: RUN_A and RUN_B attestation hashes are identical' }

    $manifestPath = Join-Path $RepoRoot 'scripts/manifests/snag-list-030-035.psd1'
    $manifestHash = Get-Sha256 $manifestPath
    if ($manifestHash -ne $script:ExpectedReleaseManifestSha256) { throw 'Attestation rejected: release manifest hash mismatch' }
    Assert-RunAttestationComplete $runA.report $Head $Branch $manifestHash 'RUN_A'
    Assert-RunAttestationComplete $runB.report $Head $Branch $manifestHash 'RUN_B'

    $identityA = Get-RunIdentitySet $runA.report
    $identityB = Get-RunIdentitySet $runB.report
    Assert-DisjointIdentitySet $identityA.containers $identityB.containers 'container'
    Assert-DisjointIdentitySet $identityA.volumes $identityB.volumes 'volume'
    Assert-DisjointIdentitySet $identityA.networks $identityB.networks 'network'
    Assert-DisjointIdentitySet $identityA.evidenceHashes $identityB.evidenceHashes 'evidence'
    if ($runA.report.evidence.schemaFingerprint -cne $runB.report.evidence.schemaFingerprint) { throw 'ATTESTATION GATE REJECTED: RUN_A and RUN_B schema fingerprints differ' }

    $files = Get-ReleaseFiles $RepoRoot
    foreach ($f in $files) { if ($f.actual -ne $f.expected) { throw "Attestation rejected: migration hash mismatch: $($f.file)" } }
    $gitClean = Get-GitCleanProof $RepoRoot -SkipGitCleanCheck:$SkipGitCleanCheck
    $directParent = (& git -C $RepoRoot rev-parse "$Head^").Trim()
    $commit5963589 = (& git -C $RepoRoot rev-parse '5963589').Trim()
    $ancestry = [ordered]@{
        commit5963589 = (Test-GitAncestor $RepoRoot $commit5963589 $Head)
        commit3fd31aa = (Test-GitAncestor $RepoRoot '3fd31aa' $Head)
        commitFd62e224 = (Test-GitAncestor $RepoRoot 'fd62e2249dcf9460d75bc1d4de65f28157696828' $Head)
    }

    [ordered]@{
        schemaVersion = 2
        schema = $script:ReleaseAttestationSchema
        status = 'PASS'
        releaseId = 'snag-list-030-035'
        generatedAtUtc = $CompletedAtUtc.ToString('o')
        validUntilUtc = $CompletedAtUtc.AddHours(24).ToString('o')
        timestamps = [ordered]@{ startedAtUtc = $StartedAtUtc.ToString('o'); completedAtUtc = $CompletedAtUtc.ToString('o') }
        repository = [ordered]@{
            root = (Resolve-Path -LiteralPath $RepoRoot).Path.Replace('\','/')
            exactHead = $Head
            directParent = $directParent
            branch = $Branch
            manifestPath = 'scripts/manifests/snag-list-030-035.psd1'
            manifestSha256 = $manifestHash
            cleanProof = $gitClean
            ancestry = $ancestry
        }
        releaseManifest = [ordered]@{
            sha256 = $manifestHash
            migrationRange = '030-035'
            migrations = @($files | ForEach-Object { [ordered]@{ number = $_.number; file = $_.file; path = $_.path.Replace('\','/'); bytes = (Get-Item -LiteralPath $_.path).Length; sha256 = $_.actual } })
        }
        certificationScripts = Get-CertificationScriptArtifacts $RepoRoot
        runtime = [ordered]@{
            powershellVersion = $PSVersionTable.PSVersion.ToString()
            docker = $runA.report.docker.runtime
            image = $runA.report.docker.image
        }
        runs = [ordered]@{
            RUN_A = [ordered]@{ attestation = $runA.descriptor; report = $runA.report; identities = $identityA }
            RUN_B = [ordered]@{ attestation = $runB.descriptor; report = $runB.report; identities = $identityB }
        }
        independence = [ordered]@{
            status = 'PASS'
            differentRunArtifacts = $true
            differentContainers = $true
            differentVolumes = $true
            differentNetworks = $true
            sameExactHead = $true
            sameManifest = $true
            sameSchemaFingerprint = $true
        }
        checks = [ordered]@{
            status = 'PASS'
            runs = 2
            passed = 62
            total = 62
            runA = [ordered]@{ passed = 31; total = 31 }
            runB = [ordered]@{ passed = 31; total = 31 }
        }
        cleanup = [ordered]@{
            status = 'PASS'
            RUN_A = $runA.report.cleanup
            RUN_B = $runB.report.cleanup
        }
        productionGateContract = [ordered]@{
            gateReadsOnlyThisArtifact = $true
            requiredChecks = @('artifactExists','sha256Matches','statusPass','exactHeadMatches','branchMatches','releaseManifestSha256Matches','migrationHashesMatch','certificationScriptHashesMatch','twoRunBindingsPresent','runStatusPass','negativeScenarios31Of31','fingerprintsMatch','cleanupZero','notExpired','notModified','trackedTreeClean','stagingEmpty')
            noLogReconstructionRequired = $true
        }
        productionAccessed = $false
        stagingAccessed = $false
    }
}

function Write-FinalReleaseAttestation($Attestation,[string]$WorkDir) {
    $path = Join-Path $WorkDir 'release-attestation.json'
    $hash = Write-CanonicalJson $Attestation $path
    [ordered]@{ path = $path; sha256 = $hash; report = $Attestation }
}

function Assert-FinalReleaseAttestationForProductionGate($Artifact,[string]$ExpectedHead,[string]$ExpectedManifestSha256,[switch]$SkipGitCleanCheck) {
    if ($Artifact.schemaVersion -ne 2) { throw 'ATTESTATION GATE REJECTED: final attestation schemaVersion must be 2' }
    if ($Artifact.repository.exactHead -cne $ExpectedHead) { throw 'ATTESTATION GATE REJECTED: exact HEAD mismatch' }
    if ($Artifact.repository.manifestSha256 -cne $ExpectedManifestSha256) { throw 'ATTESTATION GATE REJECTED: release manifest mismatch' }
    if ($Artifact.releaseManifest.migrationRange -ne '030-035') { throw 'ATTESTATION GATE REJECTED: migration range mismatch' }
    if (@($Artifact.releaseManifest.migrations).Count -ne 6) { throw 'ATTESTATION GATE REJECTED: migration binding incomplete' }
    if ($Artifact.checks.runA.passed -ne 31 -or $Artifact.checks.runA.total -ne 31 -or $Artifact.checks.runB.passed -ne 31 -or $Artifact.checks.runB.total -ne 31) { throw 'ATTESTATION GATE REJECTED: RUN_A/RUN_B negative scenarios are not 31/31' }
    if ($Artifact.cleanup.RUN_A.containers -ne 0 -or $Artifact.cleanup.RUN_A.volumes -ne 0 -or $Artifact.cleanup.RUN_A.networks -ne 0 -or $Artifact.cleanup.RUN_B.containers -ne 0 -or $Artifact.cleanup.RUN_B.volumes -ne 0 -or $Artifact.cleanup.RUN_B.networks -ne 0) { throw 'ATTESTATION GATE REJECTED: cleanup is not 0/0/0 for both runs' }
    if ($Artifact.independence.status -ne 'PASS') { throw 'ATTESTATION GATE REJECTED: independence proof is not PASS' }
    Assert-RunAttestationComplete $Artifact.runs.RUN_A.report $ExpectedHead $Artifact.repository.branch $ExpectedManifestSha256 'RUN_A'
    Assert-RunAttestationComplete $Artifact.runs.RUN_B.report $ExpectedHead $Artifact.repository.branch $ExpectedManifestSha256 'RUN_B'
    $identityA = Get-RunIdentitySet $Artifact.runs.RUN_A.report
    $identityB = Get-RunIdentitySet $Artifact.runs.RUN_B.report
    Assert-DisjointIdentitySet $identityA.containers $identityB.containers 'container'
    Assert-DisjointIdentitySet $identityA.volumes $identityB.volumes 'volume'
    Assert-DisjointIdentitySet $identityA.networks $identityB.networks 'network'
    if ($Artifact.runs.RUN_A.report.evidence.schemaFingerprint -cne $Artifact.runs.RUN_B.report.evidence.schemaFingerprint) { throw 'ATTESTATION GATE REJECTED: schema fingerprints differ' }
    Assert-ArtifactsMatchDisk $Artifact.certificationScripts 'certificationScripts'
    Assert-ArtifactsMatchDisk @($Artifact.runs.RUN_A.attestation,$Artifact.runs.RUN_B.attestation) 'runAttestations'
    Assert-ArtifactsMatchDisk $Artifact.runs.RUN_A.report.evidence.supportingArtifacts 'RUN_A.supportingArtifacts'
    Assert-ArtifactsMatchDisk $Artifact.runs.RUN_B.report.evidence.supportingArtifacts 'RUN_B.supportingArtifacts'
    foreach ($migration in @($Artifact.releaseManifest.migrations)) {
        if ((Get-Sha256 $migration.path) -cne $migration.sha256) { throw "ATTESTATION GATE REJECTED: migration hash mismatch: $($migration.file)" }
    }
    if (-not $SkipGitCleanCheck) { [void](Get-GitCleanProof $Artifact.repository.root) }
}

function Assert-ReleaseAttestationForProductionGate([string]$Path,[string]$ExpectedSha256,[string]$ExpectedHead,[string]$ExpectedManifestSha256,[DateTime]$NowUtc = [DateTime]::UtcNow,[switch]$SkipGitCleanCheck) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'ATTESTATION GATE REJECTED: artifact missing' }
    if ((Get-Sha256 $Path) -cne $ExpectedSha256) { throw 'ATTESTATION GATE REJECTED: artifact SHA-256 mismatch' }
    $artifact = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    if ($artifact.schema -ne $script:ReleaseAttestationSchema) { throw 'ATTESTATION GATE REJECTED: schema mismatch' }
    if ($artifact.status -ne 'PASS') { throw 'ATTESTATION GATE REJECTED: status is not PASS' }
    if ($artifact.repository.exactHead -cne $ExpectedHead) { throw 'ATTESTATION GATE REJECTED: exact HEAD mismatch' }
    if ($artifact.repository.manifestSha256 -cne $ExpectedManifestSha256) { throw 'ATTESTATION GATE REJECTED: release manifest mismatch' }
    if ([DateTime]::Parse($artifact.validUntilUtc).ToUniversalTime() -lt $NowUtc.ToUniversalTime()) { throw 'ATTESTATION GATE REJECTED: artifact expired' }
    if ($artifact.schemaVersion -eq 2) {
        Assert-FinalReleaseAttestationForProductionGate $artifact $ExpectedHead $ExpectedManifestSha256 -SkipGitCleanCheck:$SkipGitCleanCheck
    }
    $artifact
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
    $counts = Get-CertificationLeakCounts $RunId
    if($counts.containers -or $counts.volumes -or $counts.networks){throw 'Cleanup leak detected'}
}

function Get-CertificationLeakCounts([string]$RunId) {
    $containers=@(& docker ps -aq --filter "label=openday.cert.run=$RunId" 2>$null)
    $volumes=@(& docker volume ls -q --filter "label=openday.cert.run=$RunId" 2>$null)
    $networks=@(& docker network ls -q --filter "label=openday.cert.run=$RunId" 2>$null)
    [ordered]@{ containers = @($containers | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count; volumes = @($volumes | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count; networks = @($networks | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count }
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
    Get-CertificationLeakCounts $RunId
}
