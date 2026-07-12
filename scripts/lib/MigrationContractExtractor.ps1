# Migration Contract Extractor
#
# Section 10 of the composite-certification spec asks for a migration
# parser that extracts GRANT/REVOKE/RLS/policy/function/ownership/
# membership statements. A hand-written regex parser is fragile here
# specifically because this repository's RLS/policy state is NOT the union
# of every CREATE POLICY statement across every migration file - it is the
# *final* state after 010's policies are partly superseded by
# 020_rls_company_role_hardening.sql, then again by
# 021_multi_tenant_hardening.sql and 022_fix_projects_select_self_reference.sql
# (DROP+CREATE / CREATE-OR-REPLACE chains). Statically diffing that
# supersession chain via regex is exactly the kind of "silently drop a
# security-relevant statement" failure mode section 10 warns against.
#
# Instead, this module resolves the canonical migration file list (a pure,
# testable, no-I/O function) and executes those files, in order, for real,
# against a disposable PostgreSQL 17 container - Postgres itself is the
# parser, and the resulting catalog IS the correctly-resolved final state.
# The only category genuinely extracted by *text* here is migration 026's
# GRANT scope (Get-Migration026Targets, in SecurityContractInventory.ps1),
# reused as-is because it is a narrow, single-statement, already-tested
# regex with no supersession chain to resolve.
#
# Explicit canonical contract (scripts/contracts/canonical-security-contract.json)
# supplies the categories no migration creates at all: roleAttributes,
# memberships, ownership (see that file's "rationale" fields - each is
# backed by a verified `git grep` showing zero CREATE ROLE / ALTER ROLE /
# OWNER TO statements in this repository's migrations).

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-CanonicalMigrationFileList {
    param(
        [Parameter(Mandatory)][string]$ContractPath,
        [Parameter(Mandatory)][string]$MigrationsRoot
    )

    if (-not (Test-Path -LiteralPath $ContractPath -PathType Leaf)) {
        throw "canonical security contract not found: $ContractPath"
    }
    $contract = Get-Content -LiteralPath $ContractPath -Raw | ConvertFrom-Json

    if ($contract.contractSchemaVersion -ne '1.0.0') {
        throw "unknown canonical security contract schema version: $($contract.contractSchemaVersion) (expected 1.0.0) - fail closed rather than apply an unrecognized contract"
    }

    $included = @($contract.canonicalMigrationPath.included)
    if ($included.Count -eq 0) {
        throw 'canonical security contract lists zero included migration files'
    }

    $result = New-Object System.Collections.Generic.List[object]
    foreach ($fileName in $included) {
        $fullPath = Join-Path $MigrationsRoot $fileName
        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
            throw "canonical migration file listed in contract does not exist on disk: $fullPath"
        }
        $result.Add([pscustomobject]@{ FileName = $fileName; FullPath = (Resolve-Path -LiteralPath $fullPath).Path })
    }
    return ,$result
}

function Invoke-CanonicalMigrationChain {
    param(
        [Parameter(Mandatory)][string]$Container,
        [Parameter(Mandatory)][string]$ContainerMigrationsMountPath,
        [Parameter(Mandatory)][object[]]$MigrationFiles,
        [Parameter(Mandatory)][scriptblock]$InvokeNativeTool
    )

    foreach ($migration in $MigrationFiles) {
        $containerPath = "$ContainerMigrationsMountPath/$($migration.FileName)"
        $r = & $InvokeNativeTool -Command 'docker' -ArgumentList @(
            'exec', $Container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
            '-v', 'ON_ERROR_STOP=1', '--quiet', '--file', $containerPath
        )
        if ($r.ExitCode -ne 0) {
            throw "canonical migration chain failed applying $($migration.FileName): $($r.Output -join ' | ')"
        }
    }
}

function Get-StructuralSchemaEvidence {
    # MVP-scoped structural schema evidence (spec section 8.1 / section 7's
    # MVP boundaries: no full DDL/constraint/index/trigger differ here -
    # that catalog-level integrity is already independently verified by
    # restore-verify.ps1's own constraints/triggers/tableCount checks
    # against the restored clone. This comparator adds the one thing
    # restore-verify.ps1 does not check: whether the restored clone's
    # in-scope table set matches what the canonical migration chain
    # produces. Deliberately table-existence granularity, not full
    # column/type/constraint diffing - see docs/COMPOSITE_CERTIFICATION.md
    # "MVP scope" for why, and restore-verify.ps1's own tableCount/
    # constraints/triggers checks for the deeper catalog verification this
    # intentionally does not duplicate.
    param(
        [Parameter(Mandatory)][scriptblock]$Query,
        [Parameter(Mandatory)][string[]]$Tables
    )

    $tableSql = ($Tables | ForEach-Object { "'$_'" }) -join ','
    $sql = "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ($tableSql) ORDER BY table_name"
    # $Query is the same callback convention Get-SecurityContractInventory
    # uses: it receives RAW SQL and wraps it itself (New-ReadOnlyCatalogScript
    # inside the caller's queryFn) - wrapping here too would double-wrap,
    # producing literal \set/\pset lines that trip New-ReadOnlyCatalogScript's
    # own meta-command guard on the second pass.
    $raw = & $Query $sql
    $result = New-Object System.Collections.Generic.List[object]
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
        foreach ($line in ($raw -split "`n")) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            $result.Add([ordered]@{ table = $line.Trim(); exists = $true })
        }
    }
    return ,$result
}

function Get-SupabasePlatformSchemaStubScript {
    # This repository's own migrations never create the `auth` schema -
    # on a real Supabase project it already exists, provisioned by
    # Supabase's own Auth (GoTrue) service outside this repo entirely.
    # A vanilla postgres:17 disposable container has no such thing, but
    # 000_baseline.sql and 10 of the 18 canonical migrations reference
    # auth.uid()/auth.users(id) (verified: `grep -o 'auth\.[a-zA-Z_]*'`
    # across every canonicalMigrationPath.included file). Without a stub,
    # 000_baseline.sql fails outright with "schema auth does not exist"
    # before a single RLS/policy/privilege catalog row can be captured.
    #
    # This stub exists ONLY so the DDL applies and the resulting catalog
    # (pg_policies, pg_proc, has_table_privilege, etc.) can be read back -
    # auth.uid()/auth.role() are never actually invoked for a real
    # authorization decision anywhere in this certification engine, since
    # every comparator reads catalog *definitions*, not query results.
    #
    # auth.role() is included alongside auth.uid() because a real
    # composite run found it in production's functions category (Supabase
    # installs it as a standard platform helper on every project, matching
    # Get-SecurityContractInventory's functions query, which explicitly
    # matches WHERE ... p.proname IN ('uid','role',...)) - without a stub
    # here it produced spurious "unexpected function" noise, not a real
    # production defect.
    return @'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;
'@
}

function Get-SupabaseStorageSchemaStubScript {
    # Same platform-provisioning gap as auth, one service over: 014 and 017
    # (both explicitly headed "NOT applied automatically - review and run
    # this yourself via the Supabase dashboard SQL editor or CLI ... a live
    # change to shared infrastructure") issue INSERT INTO storage.buckets
    # and CREATE POLICY ... ON storage.objects using storage.foldername()/
    # storage.filename(). "Not applied automatically" describes *when* a
    # human runs this against real infrastructure (a bucket-creation side
    # effect, not just DDL) - it does not mean the migration is outside the
    # canonical security contract; README's fresh-install table still lists
    # both as canonical steps 6 and 9, and production's real inventory
    # includes storage.objects policies. Like auth.*, the storage schema
    # itself is Supabase Storage-service-provisioned, never created by this
    # repository's own migrations, so a vanilla postgres:17 container needs
    # a minimal stub before 014/017 can apply. Only signatures matter here
    # (no policy is ever evaluated against real rows in this offline
    # catalog capture), so storage.foldername()/storage.filename() below
    # are structurally-typed stand-ins, not Supabase's real implementations.
    return @'
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid
);
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;
CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT name $$;
'@
}

function Set-ServiceRolePlatformPrivilegeDefaults {
    # service_role's ACL is platform-managed, not migration-derived - same
    # reasoning already applied to roleAttributes/memberships/ownership
    # (no migration in this repository GRANTs anything to service_role; it
    # is Supabase's always-bypasses-everything service credential). A real
    # composite run initially modeled service_role's table/sequence/
    # function privileges the same way as authenticated's (expected
    # allowed=false unless migration 026 says otherwise), which produced
    # ~150 false-positive DEFECT differences - service_role legitimately
    # has full ACL on every in-scope object by Supabase platform design,
    # exactly as documented for its bypassRls=true roleAttributes rule.
    # This function fixes that architectural gap by re-deriving
    # service_role rows from the *set of objects already computed* by
    # migration-derived-execution (never fabricating new object identities)
    # and forcing their expected allowed/execute value to true - it does
    # not consult or copy production's actual evidence.
    param([Parameter(Mandatory)][object[]]$Rows, [Parameter(Mandatory)][string]$ValueField)

    $out = New-Object System.Collections.Generic.List[object]
    foreach ($row in $Rows) {
        if ($row.role -eq 'service_role') {
            $copy = [ordered]@{}
            foreach ($key in $row.Keys) { $copy[$key] = $row[$key] }
            $copy[$ValueField] = $true
            $out.Add($copy)
        } else {
            $out.Add($row)
        }
    }
    [object[]]$outArray = $out
    return ,$outArray
}

function Get-SupabasePlatformRoleStubScript {
    # Same gap as the auth schema stub, one layer down: 010_rls_by_roles.sql
    # (and every migration after it) issues `CREATE POLICY ... TO
    # authenticated`, but this repository's migrations never CREATE ROLE
    # anon/authenticated/authenticator/service_role - verified by
    # Test-NoOwnershipOrRoleStatementsInMigrations - because on a real
    # Supabase project those 4 roles already exist as platform
    # provisioning. `postgres` already exists via postgres:17's own
    # initdb bootstrap (same convention restore-verify.ps1 uses for its
    # $BootstrapRoles), so it is skipped here.
    #
    # Generated directly from canonical-security-contract.json's
    # roleAttributes/memberships rules rather than hand-duplicated, so the
    # bootstrap can never silently drift from the contract those same
    # rules are compared against later.
    param([Parameter(Mandatory)]$Contract)

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($rule in $Contract.roleAttributes.rules) {
        if ($rule.role -eq 'postgres') { continue }
        $attrs = New-Object System.Collections.Generic.List[string]
        $attrs.Add($(if ($rule.canLogin) { 'LOGIN' } else { 'NOLOGIN' }))
        $attrs.Add($(if ($rule.inherit) { 'INHERIT' } else { 'NOINHERIT' }))
        if ($rule.bypassRls) { $attrs.Add('BYPASSRLS') }
        $lines.Add("CREATE ROLE $($rule.role) $($attrs -join ' ');")
    }
    foreach ($m in $Contract.memberships.rules) {
        $lines.Add("GRANT $($m.grantedRole) TO $($m.memberRole)$(if ($m.adminOption) { ' WITH ADMIN OPTION' });")
    }
    return ($lines -join [Environment]::NewLine) + [Environment]::NewLine
}

function Test-NoOwnershipOrRoleStatementsInMigrations {
    # Regression guard backing canonical-security-contract.json's roleAttributes/
    # memberships/ownershipRules "zero CREATE ROLE / ALTER ROLE / OWNER TO"
    # claim. Fails closed (returns $false) if a migration is later added that
    # would invalidate that claim, so the explicit contract does not silently
    # go stale.
    param([Parameter(Mandatory)][string]$MigrationsRoot)

    $files = Get-ChildItem -LiteralPath $MigrationsRoot -Filter '*.sql' -File
    foreach ($file in $files) {
        $text = Get-Content -LiteralPath $file.FullName -Raw
        $stripped = $text -replace '(?m)--[^\r\n]*', ''
        if ($stripped -match '(?i)\b(CREATE|ALTER|DROP)\s+ROLE\b' -or $stripped -match '(?i)\bOWNER\s+TO\b') {
            return $false
        }
    }
    return $true
}
