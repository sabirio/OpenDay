[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ApiSessionPath,
  [string]$LifecycleStoreCode='P1-RECON-LIFECYCLE'
)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
$session=Get-Content -Raw -LiteralPath $ApiSessionPath|ConvertFrom-Json
if($session.databaseContainer -notmatch '^p1-equivalence-[0-9a-f]{10}$'){throw 'Refusing non-disposable database container.'}
$base="http://127.0.0.1:$($session.proxyPort)"
function A([bool]$ok,[string]$name,[string]$detail=''){if(-not $ok){throw "FAIL $name $detail"};Write-Host "[PASS] $name$(if($detail){" - $detail"})"}
function Sql([string]$q){$o=& docker exec $session.databaseContainer psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -tA -c $q 2>&1;if($LASTEXITCODE -ne 0){throw "SQL failed: $($o -join ' | ')"};return (($o|ForEach-Object{"$_"}) -join "`n").Trim()}
function Http([string]$method,[string]$path,[object]$body=$null,[string]$token=$null,[hashtable]$extra=@{}){
  $headers=@{apikey=$session.anonKey};if($token){$headers.Authorization="Bearer $token"};foreach($k in $extra.Keys){$headers[$k]=$extra[$k]}
  try{$args=@{Uri="$base$path";Method=$method;Headers=$headers;UseBasicParsing=$true};if($null-ne$body){$args.ContentType='application/json';$args.Body=($body|ConvertTo-Json -Depth 30 -Compress)};$r=Invoke-WebRequest @args;return [pscustomobject]@{Status=[int]$r.StatusCode;Body=$r.Content}}
  catch{$resp=$_.Exception.Response;if(-not$resp){throw};$text=$_.ErrorDetails.Message;if(-not$text){$reader=[IO.StreamReader]::new($resp.GetResponseStream());$text=$reader.ReadToEnd();$reader.Dispose()};return [pscustomobject]@{Status=[int]$resp.StatusCode;Body=$text}}
}
function Login([string]$email,[string]$password){$r=Http POST '/auth/v1/token?grant_type=password' @{email=$email;password=$password};A ($r.Status-eq200) "login_$email";return ($r.Body|ConvertFrom-Json).access_token}

$admin=Login 'admin@openday.fit' 'Admin123!';$pm=Login 'pm@openday.fit' 'Pm123!';$contractor=Login 'gc@openday.fit' 'Gc123!';$wrong=Login 'p1-wrong-company@example.test' 'P1-Wrong-Company-2026!'
$escapedLifecycleStoreCode=$LifecycleStoreCode.Replace("'", "''")
$projectId=[int](Sql "SELECT id FROM public.projects WHERE store_code='$escapedLifecycleStoreCode';")
$otherId=[int](Sql "SELECT id FROM public.projects WHERE store_code='P1-OTHER-TENANT-FIXTURE';")
A ((Sql "SELECT count(*)||'|'||min(company_id)||'|'||min(template_id::text)||'|'||min(schedule_ownership_mode) FROM public.projects WHERE store_code='$escapedLifecycleStoreCode';") -eq '1|p1-company|dc92175a-251c-45ab-a4fd-c83c1c668ef4|CONTRACTOR_MANAGED') 'lifecycle_project_exactly_once_and_canonical_v1'
A ((Sql "SELECT count(*) FROM public.project_gantt_tasks WHERE project_id=$projectId AND NOT is_archived;") -eq '3') 'expected_gantt_tasks_materialized'

$project=(Http GET "/rest/v1/projects?select=scope&id=eq.$projectId" $null $admin).Body|ConvertFrom-Json
$scope=$project[0].scope;$wpIds=@(Sql "SELECT wp_id FROM public.project_gantt_tasks WHERE project_id=$projectId AND NOT is_archived ORDER BY wp_id;" -split "`n")
$submission2=[int](Sql "SELECT id FROM public.project_schedule_versions WHERE project_id=$projectId AND submission_number=2;")
$rpcBodies=@{
  can_access_schedule_submissions=@{p_project_id=$projectId};contractor_schedule_lifecycle_status=@{p_project_id=$projectId};
  create_contractor_managed_project=@{p_project=@{};p_scope_wp_ids=@('x');p_client_request_id=[guid]::NewGuid()};
  update_contractor_managed_project_scope=@{p_project_id=$projectId;p_scope=$scope;p_scope_wp_ids=$wpIds;p_client_request_id=[guid]::NewGuid()};
  save_contractor_schedule_draft=@{p_project_id=$projectId;p_changes=@();p_client_request_id=[guid]::NewGuid()};
  submit_contractor_schedule=@{p_project_id=$projectId;p_client_request_id=[guid]::NewGuid();p_contractor_comment='denied'};
  request_schedule_changes=@{p_submission_id=$submission2;p_comment='denied';p_client_request_id=[guid]::NewGuid()};
  approve_schedule_submission=@{p_submission_id=$submission2;p_comment='denied';p_client_request_id=[guid]::NewGuid()}
}
foreach($name in $rpcBodies.Keys){$r=Http POST "/rest/v1/rpc/$name" $rpcBodies[$name] $session.anonKey;A ($r.Status-in@(401,403)) "anon_rpc_denied_$name" "status=$($r.Status)"}
$anonRead=Http GET "/rest/v1/project_schedule_versions?select=id&project_id=eq.$projectId" $null $session.anonKey
A ($anonRead.Status-in@(401,403) -or ($anonRead.Status-eq200 -and @($anonRead.Body|ConvertFrom-Json).Count-eq0)) 'anon_schedule_read_denied'
$anonCreate=Http POST '/rest/v1/rpc/create_contractor_managed_project' $rpcBodies.create_contractor_managed_project $session.anonKey;A ($anonCreate.Status-in@(401,403)) 'anon_project_create_denied'

A (@(((Http GET "/rest/v1/projects?select=id&id=eq.$projectId" $null $wrong).Body|ConvertFrom-Json)).Count-eq0) 'wrong_company_project_read_empty'
A (@(((Http GET "/rest/v1/project_schedule_versions?select=id&project_id=eq.$projectId" $null $wrong).Body|ConvertFrom-Json)).Count-eq0) 'wrong_company_schedule_read_empty'
$wrongMut=Http POST '/rest/v1/rpc/update_contractor_managed_project_scope' $rpcBodies.update_contractor_managed_project_scope $wrong;A ($wrongMut.Status-eq403 -and $wrongMut.Body-match 'NOT_AUTHORIZED|42501') 'wrong_company_scope_mutation_denied'
A (@(((Http GET "/rest/v1/projects?select=id&id=eq.$otherId" $null $pm).Body|ConvertFrom-Json)).Count-eq0) 'pm_cross_tenant_read_empty'
A (@(((Http GET "/rest/v1/projects?select=id&id=eq.$projectId" $null $pm).Body|ConvertFrom-Json)).Count-eq1) 'pm_own_tenant_read_allowed'
A (@(((Http GET "/rest/v1/projects?select=id&id=eq.$otherId" $null $wrong).Body|ConvertFrom-Json)).Count-eq1) 'wrong_company_own_fixture_read_allowed'

$contractorApprove=Http POST '/rest/v1/rpc/approve_schedule_submission' $rpcBodies.approve_schedule_submission $contractor;A ($contractorApprove.Status-eq403 -and $contractorApprove.Body-match '42501|Not authorized') 'contractor_pm_approve_denied'
$beforeLock=Sql "SELECT md5(scope::text)||'|'||(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text) FROM public.project_gantt_tasks t WHERE t.project_id=p.id)||'|'||(SELECT md5(jsonb_agg(to_jsonb(v) ORDER BY v.id)::text) FROM public.project_schedule_versions v WHERE v.project_id=p.id)||'|'||(SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY s.id)::text) FROM public.project_schedule_version_tasks s JOIN public.project_schedule_versions v ON v.id=s.version_id WHERE v.project_id=p.id) FROM public.projects p WHERE p.id=$projectId;"
$locked=Http POST '/rest/v1/rpc/update_contractor_managed_project_scope' $rpcBodies.update_contractor_managed_project_scope $contractor;A ($locked.Status-eq403 -or ($locked.Status-eq400 -and $locked.Body-match 'BASELINE_ALREADY_APPROVED')) 'contractor_scope_change_denied'
$adminLockBody=@{p_project_id=$projectId;p_scope=$scope;p_scope_wp_ids=$wpIds;p_client_request_id=[guid]::NewGuid()}
$adminLocked=Http POST '/rest/v1/rpc/update_contractor_managed_project_scope' $adminLockBody $admin;A ($adminLocked.Status-in@(400,500) -and $adminLocked.Body-match 'BASELINE_ALREADY_APPROVED') 'authorized_scope_lock_canonical_error' "status=$($adminLocked.Status) code=55000"
$afterLock=Sql "SELECT md5(scope::text)||'|'||(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text) FROM public.project_gantt_tasks t WHERE t.project_id=p.id)||'|'||(SELECT md5(jsonb_agg(to_jsonb(v) ORDER BY v.id)::text) FROM public.project_schedule_versions v WHERE v.project_id=p.id)||'|'||(SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY s.id)::text) FROM public.project_schedule_version_tasks s JOIN public.project_schedule_versions v ON v.id=s.version_id WHERE v.project_id=p.id) FROM public.projects p WHERE p.id=$projectId;"
A ($beforeLock-eq$afterLock) 'scope_lock_before_after_fingerprint_equal' $beforeLock

$templateBefore=Sql "SELECT md5(to_jsonb(t)::text) FROM public.templates t WHERE id='dc92175a-251c-45ab-a4fd-c83c1c668ef4';"
$globalRead=(Http GET '/rest/v1/templates?select=id,family,is_active&id=eq.dc92175a-251c-45ab-a4fd-c83c1c668ef4' $null $admin).Body|ConvertFrom-Json;A (@($globalRead).Count-eq1) 'canonical_global_template_readable'
$globalPatch=Http PATCH '/rest/v1/templates?id=eq.dc92175a-251c-45ab-a4fd-c83c1c668ef4' @{name='P1 unauthorized mutation'} $admin @{'Prefer'='return=representation'};$patchBody=$globalPatch.Body.Trim();A (($globalPatch.Status-eq200 -and $patchBody-eq'[]') -or ($globalPatch.Status-eq204 -and -not$patchBody)) 'company_admin_global_template_mutation_denied' "status=$($globalPatch.Status) body=$patchBody"
A ((Sql "SELECT md5(to_jsonb(t)::text) FROM public.templates t WHERE id='dc92175a-251c-45ab-a4fd-c83c1c668ef4';") -eq $templateBefore) 'global_template_fingerprint_unchanged'

$history=Sql "SELECT string_agg(v.id||':'||v.submission_number||':'||v.status||':'||COALESCE(v.baseline_revision_number::text,'')||':'||v.created_at::text||':'||(SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY s.wp_id)::text) FROM public.project_schedule_version_tasks s WHERE s.version_id=v.id),E'\n' ORDER BY v.submission_number) FROM public.project_schedule_versions v WHERE v.project_id=$projectId;"
A (($history-split"`n").Count-eq2 -and $history-match 'CHANGES_REQUESTED' -and $history-match 'APPROVED') 'two_ordered_immutable_submissions' $history
A ((Sql "SELECT string_agg(submission_number||':'||planned_end::text,',' ORDER BY submission_number) FROM public.project_schedule_versions v JOIN public.project_schedule_version_tasks s ON s.version_id=v.id WHERE v.project_id=$projectId AND s.wp_id='common.demolition.mep_disconnect';") -eq '1:2027-08-16,2:2027-08-21') 'submission_revision_is_real_and_distinct' 'exclusive planned_end moved by five days'
$priorPreference=$ErrorActionPreference;$ErrorActionPreference='Continue'
$immut=& docker exec $session.databaseContainer psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c "UPDATE public.project_schedule_version_tasks SET planned_end=planned_end+1 WHERE id=(SELECT min(id) FROM public.project_schedule_version_tasks);" 2>&1;$immutExit=$LASTEXITCODE
$ErrorActionPreference=$priorPreference
A ($immutExit-ne0 -and ($immut-join' ') -match 'immutable') 'snapshot_trigger_blocks_direct_mutation'

$ledgerBefore=[int](Sql "SELECT count(*) FROM public.write_command_requests;")
$approveKey=Sql "SELECT client_request_id::text FROM public.write_command_requests WHERE operation='schedule.approve' AND source_record_id=$submission2;"
$replay=Http POST '/rest/v1/rpc/approve_schedule_submission' @{p_submission_id=$submission2;p_comment='Approved after requested revision.';p_client_request_id=$approveKey} $pm
$replayBody=$replay.Body|ConvertFrom-Json;A ($replay.Status-eq200 -and $replayBody.idempotentReplay-eq$true) 'command_ledger_idempotent_replay'
A ([int](Sql "SELECT count(*) FROM public.write_command_requests;")-eq$ledgerBefore) 'idempotent_replay_adds_no_ledger_row'
$directLedger=Http POST '/rest/v1/write_command_requests' @{operation='unauthorized';client_request_id=[guid]::NewGuid()} $contractor;A ($directLedger.Status-in@(401,403)) 'write_command_requests_direct_mutation_denied'

$dbGate=Sql @"
DO `$gate`$
DECLARE n int;
BEGIN
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relname IN ('project_schedule_versions','project_schedule_version_tasks') AND c.relkind='r')<>2 THEN RAISE EXCEPTION 'new tables'; END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relname IN ('project_schedule_versions_id_seq','project_schedule_version_tasks_id_seq') AND c.relkind='S')<>2 THEN RAISE EXCEPTION 'new sequences'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname IN ('prevent_referenced_template_semantic_change','save_contractor_schedule_draft','prevent_schedule_version_task_mutation','can_access_schedule_submissions','contractor_schedule_lifecycle_status','submit_contractor_schedule','request_schedule_changes','approve_schedule_submission','prevent_scope_mutation_during_review','update_contractor_managed_project_scope','create_contractor_managed_project'))<>11 THEN RAISE EXCEPTION 'new functions'; END IF;
  SELECT count(*) INTO n FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('project_schedule_versions','project_schedule_version_tasks') AND ((grantee='authenticated' AND privilege_type<>'SELECT') OR grantee IN ('anon','service_role','PUBLIC'));
  IF n<>0 THEN RAISE EXCEPTION 'table ACL leak %',n; END IF;
  SELECT count(*) INTO n FROM information_schema.role_usage_grants WHERE object_schema='public' AND object_name IN ('project_schedule_versions_id_seq','project_schedule_version_tasks_id_seq') AND grantee IN ('anon','authenticated','service_role','PUBLIC');
  IF n<>0 THEN RAISE EXCEPTION 'sequence ACL leak %',n; END IF;
  IF has_table_privilege('anon','public.write_command_requests','INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','public.write_command_requests','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'ledger direct write ACL'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['can_access_schedule_submissions(bigint)','contractor_schedule_lifecycle_status(bigint)','create_contractor_managed_project(jsonb,text[],uuid)','update_contractor_managed_project_scope(bigint,jsonb,text[],uuid)','save_contractor_schedule_draft(bigint,jsonb,uuid)','submit_contractor_schedule(bigint,uuid,text)','request_schedule_changes(bigint,text,uuid)','approve_schedule_submission(bigint,text,uuid)']) f(sig) WHERE has_function_privilege('anon','public.'||sig,'EXECUTE') OR NOT has_function_privilege('authenticated','public.'||sig,'EXECUTE')) THEN RAISE EXCEPTION 'RPC ACL'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['prevent_referenced_template_semantic_change()','prevent_schedule_version_task_mutation()','prevent_scope_mutation_during_review()']) f(sig),unnest(ARRAY['anon','authenticated','service_role']) r(role) WHERE has_function_privilege(role,'public.'||sig,'EXECUTE')) THEN RAISE EXCEPTION 'trigger helper ACL'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE ns.nspname='public' AND p.proname IN ('prevent_referenced_template_semantic_change','prevent_schedule_version_task_mutation','prevent_scope_mutation_during_review') AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'trigger helper PUBLIC ACL'; END IF;
END `$gate`$;
SELECT 'unintended_acl_leak_count=0';
"@
A ($dbGate-match'unintended_acl_leak_count=0') 'all_created_object_acl_targets' $dbGate
Write-Host 'RECONCILIATION_SECURITY_PASS'
