$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$preflightPath = Join-Path $root 'scripts\production-migration029-preflight-live.ps1'
$applyPath = Join-Path $root 'scripts\production-migration029-apply.ps1'
$preflight = Get-Content -Raw $preflightPath
$apply = Get-Content -Raw $applyPath
$pass=0; $fail=0
function A([string]$n,[bool]$c){if($c){$script:pass++;Write-Host "[PASS] $n"}else{$script:fail++;Write-Host "[FAIL] $n"}}
foreach($p in @($preflightPath,$applyPath)){ $e=$null;[Management.Automation.Language.Parser]::ParseFile($p,[ref]$null,[ref]$e)|Out-Null;A "AST: $p" ($e.Count -eq 0) }
A 'apply requires backup path and manifest checksum' ($apply -match 'Parameter\(Mandatory\).*VerifiedBackupPath' -and $apply -match 'ExpectedBackupManifestSha256')
A 'apply requires approved preflight and checksum' ($apply -match 'ApprovedPreflightPath' -and $apply -match 'ExpectedPreflightSha256')
A 'apply requires repository identity' ($apply -match 'ExpectedRepositoryCommit' -and $apply -match 'rev-parse HEAD')
A 'apply requires exact approval phrase' ($apply -match "ValidateSet\('APPROVE MIGRATION 029'\)")
A 'apply is pinned to migration 029' ($apply -match '029_production_acl_followup\.sql')
A 'apply is pinned to reviewed checksum' ($apply -match 'f6d1a69f7821eb206645fa235c48efc568eeafde8d39b9db92c9cee738553464')
A 'checksum validation precedes production fingerprint' ($apply.IndexOf('actualChecksum') -lt $apply.IndexOf('Get-ProductionConnectionFingerprint'))
A 'backup and preflight validation precede production fingerprint' ($apply.IndexOf('approved preflight checksum mismatch') -lt $apply.IndexOf('Get-ProductionConnectionFingerprint'))
A 'failed or stale preflight is rejected' ($apply -match "status -ne 'READY_FOR_029'" -and $apply -match 'blockingLocks.safe')
A 'apply uses psql -X' ($apply -match "'psql', '-X'")
A 'apply uses ON_ERROR_STOP' ($apply -match "'ON_ERROR_STOP=1'")
A 'apply executes exact file' ($apply.Contains("'--file', `"/apply/`$migrationFile`""))
A 'apply has no retry loop' ($apply -notmatch 'for\s*\(|while\s*\(')
A 'no arbitrary SQL parameter' ($apply -notmatch '\[string\]\$(Sql|Query|Command)\b')
A 'apply no longer prints connection fields' ($apply -notmatch 'Write-Host.*\$\(\$conn\.(Host|Port|Database|User)\)')
A 'apply evidence is atomic' ($apply -match '\.tmp-' -and $apply -match 'Move-Item')
A 'preflight requires verified backup' ($preflight -match 'VerifiedBackupPath' -and $preflight -match 'ExpectedBackupManifestSha256')
A 'preflight catalog wrapper is read only' ($preflight -match 'New-ReadOnlyCatalogScript')
A 'preflight rejects unsafe SQL verbs' ($preflight -match 'INSERT\|UPDATE\|DELETE\|CREATE\|ALTER\|DROP\|GRANT\|REVOKE\|TRUNCATE\|COPY')
A 'preflight checks conflicts' ($preflight -match 'blockingLocks' -and $preflight -match 'conflictingLockCount')
A 'preflight fails non-ready result' ($preflight -match "status -eq 'READY_FOR_029'.*exit 0.*exit 1")
A 'preflight evidence is atomic' ($preflight -match '\.tmp-' -and $preflight -match 'Move-Item')
A 'neither script has inline credential literals' (($preflight+$apply) -notmatch '(?i)(password|token|secret)\s*=\s*["''][^$]')
Write-Host "TOTAL: $pass passed, $fail failed"; if($fail){exit 1}
