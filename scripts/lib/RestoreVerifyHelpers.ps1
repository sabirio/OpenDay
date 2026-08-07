# Pure, side-effect-free helper functions shared between scripts/restore-verify.ps1
# and its offline tests (scripts/tests/restore-verify.tests.ps1). This file only
# defines functions - dot-sourcing it never touches Docker, the filesystem beyond
# what a caller explicitly passes in, or any network/production resource.

# 'utf8NoBOM' is a PowerShell 7+/Core-only -Encoding value; Windows PowerShell
# 5.1's Set-Content/Out-File reject it, and its 'UTF8' value writes a BOM.
# This helper writes UTF-8 without a BOM identically on 5.1 and 7+ via .NET.
function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][AllowEmptyString()][string]$Value
    )
    $resolvedPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
    $utf8NoBomEncoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($resolvedPath, $Value, $utf8NoBomEncoding)
}

# Reads a UTF-8 text file without allowing a BOM or invalid byte sequences,
# applies a caller-supplied transformation one physical line at a time, and
# preserves every original line terminator byte-for-byte. Returning $null
# from the transform drops that line together with its terminator. This is
# deliberately not implemented with ReadAllLines()/Environment.NewLine:
# doing so rewrites LF-only pg_dump function bodies to CRLF on Windows and
# changes pg_proc.prosrc.
function Convert-Utf8FileLinesPreservingEndings {
    param(
        [Parameter(Mandatory)][string]$SourcePath,
        [Parameter(Mandatory)][string]$DestinationPath,
        [Parameter(Mandatory)][scriptblock]$Transform
    )

    $bytes = [System.IO.File]::ReadAllBytes($SourcePath)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        throw "UTF-8 BOM is not permitted in restore input: $SourcePath"
    }
    $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
    $text = $strictUtf8.GetString($bytes)
    $out = [System.Text.StringBuilder]::new($text.Length)
    $position = 0

    while ($position -lt $text.Length) {
        $lineStart = $position
        while ($position -lt $text.Length -and $text[$position] -ne "`r" -and $text[$position] -ne "`n") {
            $position++
        }
        $line = $text.Substring($lineStart, $position - $lineStart)
        $ending = ''
        if ($position -lt $text.Length) {
            if ($text[$position] -eq "`r" -and ($position + 1) -lt $text.Length -and $text[$position + 1] -eq "`n") {
                $ending = "`r`n"
                $position += 2
            } else {
                $ending = [string]$text[$position]
                $position++
            }
        }

        $replacement = & $Transform $line $ending
        if ($null -ne $replacement) {
            [void]$out.Append([string]$replacement)
            [void]$out.Append($ending)
        }
    }

    Write-Utf8NoBom -Path $DestinationPath -Value $out.ToString()
}

# Windows PowerShell 5.1 wraps every stderr line from a native command into a
# terminating NativeCommandError when $ErrorActionPreference = 'Stop' and that
# stderr is captured via redirection. Docker/psql legitimately write to
# stderr for conditions that are not fatal - the exit code is the only
# trustworthy signal, so every native call should go through here, and
# stderr is only ever collected, never allowed to auto-promote into an
# exception.
function Invoke-NativeTool {
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string[]]$ArgumentList
    )
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $Command @ArgumentList 2>&1
        return [pscustomobject]@{ Output = $output; ExitCode = $LASTEXITCODE }
    } finally {
        $ErrorActionPreference = $prevEAP
    }
}

function Get-ErrorLineCount($outputLines) {
    ($outputLines | Where-Object { $_ -match 'ERROR:' } | Measure-Object).Count
}

function Get-FileChecksum([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

# ---------------------------------------------------------------------------
# COPY block parser - counts rows in each `COPY ... FROM stdin; ... \.` block
# of a pg_dump text-format data file, without interpreting row content.
# ---------------------------------------------------------------------------
function Get-CopyBlockInventory {
    param([Parameter(Mandatory)][string]$Path)

    # One identifier part: a bare name, or a double-quoted name (with "" as
    # an escaped literal quote inside), schema-qualified or not.
    $ident = '(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)'
    $headerPattern = "^COPY\s+($ident(?:\.$ident)?)\s*\(.*\)\s+FROM\s+stdin;\s*$"
    $looksLikeCopyPattern = '^COPY\s'

    $lines = [System.IO.File]::ReadAllLines($Path)
    $blocks = New-Object System.Collections.Generic.List[object]
    $inBlock = $false
    $currentRef = $null
    $currentRows = 0
    $currentHeaderLine = 0

    for ($i = 0; $i -lt $lines.Length; $i++) {
        $line = $lines[$i]
        if (-not $inBlock) {
            if ($line -match $headerPattern) {
                $inBlock = $true
                $currentRef = $Matches[1]
                $currentRows = 0
                $currentHeaderLine = $i + 1
            } elseif ($line -match $looksLikeCopyPattern) {
                throw "COPY parser: unrecognized COPY statement format at $Path`:$($i + 1): $line"
            }
        } else {
            if ($line -eq '\.') {
                $blocks.Add([pscustomobject]@{
                    Ref = $currentRef
                    HeaderLine = $currentHeaderLine
                    Rows = $currentRows
                })
                $inBlock = $false
                $currentRef = $null
            } else {
                $currentRows++
            }
        }
    }

    if ($inBlock) {
        throw "COPY parser: unterminated COPY block starting at $Path`:$currentHeaderLine (ref: $currentRef) - no closing '\.' line found before end of file."
    }

    # Unary comma: emit $blocks as a single pipeline item (the List itself),
    # not enumerated element-by-element - otherwise a 1-element result would
    # silently unwrap to a scalar and break every $result.Count caller.
    return ,$blocks
}

function ConvertTo-NormalizedIdentifierPart([string]$Part) {
    if ($Part.StartsWith('"') -and $Part.EndsWith('"')) {
        return $Part.Substring(1, $Part.Length - 2).Replace('""', '"')
    }
    return $Part.ToLowerInvariant()
}

function ConvertTo-NormalizedTableRef([string]$Ref) {
    # Splits on the FIRST unquoted '.' - identifiers here never contain a
    # literal unescaped '.' outside quotes, so a simple quote-aware scan is
    # sufficient (no need for a full SQL tokenizer).
    $inQuotes = $false
    $splitAt = -1
    for ($i = 0; $i -lt $Ref.Length; $i++) {
        if ($Ref[$i] -eq '"') { $inQuotes = -not $inQuotes }
        elseif ($Ref[$i] -eq '.' -and -not $inQuotes) { $splitAt = $i; break }
    }
    if ($splitAt -lt 0) {
        return [pscustomobject]@{ Schema = 'public'; Table = (ConvertTo-NormalizedIdentifierPart $Ref) }
    }
    $schemaPart = $Ref.Substring(0, $splitAt)
    $tablePart = $Ref.Substring($splitAt + 1)
    return [pscustomobject]@{ Schema = (ConvertTo-NormalizedIdentifierPart $schemaPart); Table = (ConvertTo-NormalizedIdentifierPart $tablePart) }
}

# ---------------------------------------------------------------------------
# schema.sql extension filter - writes a TEMP copy with CREATE EXTENSION /
# COMMENT ON EXTENSION lines removed for the explicit unavailable-extension
# allow-list only. The real schema.sql is never modified.
# ---------------------------------------------------------------------------
function New-FilteredSchemaFile {
    param(
        [Parameter(Mandatory)][string]$SourcePath,
        [Parameter(Mandatory)][string]$DestinationPath,
        [Parameter(Mandatory)][string[]]$UnavailableExtensionNames
    )
    $filtered = New-Object System.Collections.Generic.List[string]
    $extNamePattern = ($UnavailableExtensionNames | ForEach-Object { [regex]::Escape($_) }) -join '|'
    $createPattern = "^CREATE EXTENSION IF NOT EXISTS `"?($extNamePattern)`"? "
    $commentPattern = "^COMMENT ON EXTENSION `"?($extNamePattern)`"? "

    Convert-Utf8FileLinesPreservingEndings -SourcePath $SourcePath -DestinationPath $DestinationPath -Transform {
        param($line, $ending)
        if ($line -match $createPattern -or $line -match $commentPattern) {
            $filtered.Add($line.Trim())
            return "-- filtered by restore-verify.ps1: unavailable on vanilla postgres:17 -- $line"
        } else {
            return $line
        }
    }
    # Unary comma: see the matching note in Get-CopyBlockInventory - without
    # it, a single-element result silently unwraps to a scalar and every
    # $result.Count caller breaks.
    return ,$filtered
}

# ---------------------------------------------------------------------------
# roles.sql filter - writes a TEMP copy with `CREATE ROLE <name>;` lines
# removed for an explicit allow-list of roles that postgres:17's own
# entrypoint/initdb already creates before roles.sql ever runs (currently
# just `postgres`). The paired `ALTER ROLE <name> WITH ...` / `SET ...` /
# `GRANT ... TO <name> ...` statements are always kept - the role already
# exists (from initdb), so applying the dumped attributes/grants onto it is
# correct and desired; only the redundant, conflicting CREATE is dropped.
# The real roles.sql on disk is never modified.
#
# A second, distinct bootstrap conflict applies only to the `postgres` role:
# Postgres hard-refuses to strip SUPERUSER from the actual bootstrap
# superuser ("ERROR: permission denied to alter role / DETAIL: The bootstrap
# superuser must have the SUPERUSER attribute") - a fixed server rule, not a
# postgres:17-specific quirk. Supabase's dump always declares `postgres` as
# NOSUPERUSER (Supabase's own admin power lives in `supabase_admin`
# instead), so the `ALTER ROLE postgres WITH NOSUPERUSER ...` line always
# hits this. Fix: strip only the `NOSUPERUSER` token from that one
# statement, keep every other listed attribute (INHERIT/CREATEROLE/
# CREATEDB/LOGIN/REPLICATION/BYPASSRLS etc.) verbatim.
#
# A third bootstrap conflict applies to the "Role memberships" section:
# `GRANT <role> TO <member> ... GRANTED BY supabase_admin;` fails because
# `supabase_admin` never has ADMIN OPTION on the granted role on a fresh
# container - Supabase's real infrastructure sets that up out-of-band,
# outside anything `pg_dumpall --roles-only` captures. Fix: strip only the
# `GRANTED BY <grantor>` clause (the grantor becomes the connecting
# superuser implicitly), preserving the granted role, member role, and any
# WITH ADMIN OPTION / INHERIT {TRUE|FALSE} / SET OPTION {TRUE|FALSE}
# clauses verbatim. The membership edge itself (role/member/options) is
# restored with full fidelity; only the grantor attribution changes -
# see Get-RoleMembershipEdges for the corresponding post-restore check.
# ---------------------------------------------------------------------------
function New-FilteredRolesFile {
    param(
        [Parameter(Mandatory)][string]$SourcePath,
        [Parameter(Mandatory)][string]$DestinationPath,
        [Parameter(Mandatory)][string[]]$BootstrapRoleNames
    )
    $ident = '(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)'
    $filtered = New-Object System.Collections.Generic.List[string]
    $rolePattern = ($BootstrapRoleNames | ForEach-Object { [regex]::Escape($_) }) -join '|'
    $createPattern = "^CREATE ROLE ($rolePattern);\s*$"
    $alterNosuperuserPattern = "^(ALTER ROLE (?:$rolePattern) WITH )NOSUPERUSER (.*;)\s*$"
    $grantedByPattern = "^(GRANT $ident TO $ident(?: WITH .+?)?) GRANTED BY $ident;\s*$"

    Convert-Utf8FileLinesPreservingEndings -SourcePath $SourcePath -DestinationPath $DestinationPath -Transform {
        param($line, $ending)
        if ($line -match $createPattern) {
            $filtered.Add($line.Trim())
            return "-- filtered by restore-verify.ps1: postgres:17 already creates this role via initdb -- $line"
        } elseif ($line -match $alterNosuperuserPattern) {
            $rewritten = "$($Matches[1])$($Matches[2])"
            $filtered.Add($line.Trim())
            $insertedEnding = if ($ending) { $ending } else { "`n" }
            return "-- filtered by restore-verify.ps1: bootstrap superuser cannot have SUPERUSER stripped -- $line$insertedEnding$rewritten"
        } elseif ($line -match $grantedByPattern) {
            $rewritten = "$($Matches[1]);"
            $filtered.Add($line.Trim())
            $insertedEnding = if ($ending) { $ending } else { "`n" }
            return "-- filtered by restore-verify.ps1: GRANTED BY grantor lacks ADMIN OPTION on a fresh container (grantor normalized, edge preserved) -- $line$insertedEnding$rewritten"
        } else {
            return $line
        }
    }
    return ,$filtered
}

# ---------------------------------------------------------------------------
# Parses the SOURCE (unfiltered) roles.sql for expected role-membership
# edges: `GRANT <role> TO <member> [WITH ...] GRANTED BY <grantor>;`. Used
# to verify, after restore, that every membership edge the backup declared
# actually exists in pg_auth_members - independent of whether the grantor
# attribution matches (it deliberately won't; see New-FilteredRolesFile).
# ---------------------------------------------------------------------------
function Get-RoleMembershipEdges {
    param([Parameter(Mandatory)][string]$Path)
    $ident = '(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)'
    $pattern = "^GRANT ($ident) TO ($ident)(?: WITH (.+?))? GRANTED BY $ident;\s*$"
    $lines = [System.IO.File]::ReadAllLines($Path)
    $edges = New-Object System.Collections.Generic.List[object]

    foreach ($line in $lines) {
        if ($line -match $pattern) {
            $role = ConvertTo-NormalizedIdentifierPart $Matches[1]
            $member = ConvertTo-NormalizedIdentifierPart $Matches[2]
            $withText = $Matches[3]
            $adminOption = $false
            $inheritOption = $null
            $setOption = $null
            if ($withText) {
                foreach ($tok in ($withText -split ',')) {
                    $t = $tok.Trim()
                    if ($t -eq 'ADMIN OPTION') { $adminOption = $true }
                    elseif ($t -match '^INHERIT (TRUE|FALSE)$') { $inheritOption = ($Matches[1] -eq 'TRUE') }
                    elseif ($t -match '^SET OPTION (TRUE|FALSE)$') { $setOption = ($Matches[1] -eq 'TRUE') }
                }
            }
            $edges.Add([pscustomobject]@{
                Role = $role
                Member = $member
                AdminOption = $adminOption
                InheritOption = $inheritOption
                SetOption = $setOption
            })
        }
    }
    return ,$edges
}

# ---------------------------------------------------------------------------
# data.sql filter - drops whole COPY blocks (header + data + terminator) for
# tables that do not exist after the (filtered) schema restore, replacing
# each with a comment. Every other byte is copied verbatim.
# ---------------------------------------------------------------------------
function New-FilteredDataFile {
    param(
        [Parameter(Mandatory)][string]$SourcePath,
        [Parameter(Mandatory)][string]$DestinationPath,
        [Parameter(Mandatory)][hashtable]$TableExists  # key: "schema.table" normalized -> $true/$false
    )
    $ident = '(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)'
    $headerPattern = "^COPY\s+($ident(?:\.$ident)?)\s*\(.*\)\s+FROM\s+stdin;\s*$"
    $skipped = New-Object System.Collections.Generic.List[string]
    # The transform callback executes in a child PowerShell scope. Keep the
    # cross-line parser state in one mutable object so assignments persist
    # between callback invocations (plain scalar assignments would not).
    $state = [pscustomobject]@{ InBlock = $false; SkippingBlock = $false }

    Convert-Utf8FileLinesPreservingEndings -SourcePath $SourcePath -DestinationPath $DestinationPath -Transform {
        param($line, $ending)
        if (-not $state.InBlock) {
            if ($line -match $headerPattern) {
                $ref = ConvertTo-NormalizedTableRef $Matches[1]
                $key = "$($ref.Schema).$($ref.Table)"
                $state.InBlock = $true
                if ($TableExists.ContainsKey($key) -and -not $TableExists[$key]) {
                    $state.SkippingBlock = $true
                    $skipped.Add($key)
                    return "-- restore-verify.ps1: skipped COPY for $key - relation does not exist after schema restore (extension-dependent)"
                } else {
                    $state.SkippingBlock = $false
                    return $line
                }
            } else {
                return $line
            }
        } else {
            if ($line -eq '\.') {
                $state.InBlock = $false
                if (-not $state.SkippingBlock) { return $line }
                $state.SkippingBlock = $false
                return $null
            } elseif (-not $state.SkippingBlock) {
                return $line
            }
            return $null
        }
    }
    return ,$skipped
}
