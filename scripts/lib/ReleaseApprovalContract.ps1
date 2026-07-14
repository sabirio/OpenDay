Set-StrictMode -Version Latest

$script:ReleaseApprovalSchema = 'snag-list-release-approval/v1'
function Get-ReleaseApprovalSchemaVersion { return $script:ReleaseApprovalSchema }

function New-ReleaseApprovalDescriptor {
    param([Parameter(Mandatory)][string]$ReleaseId,[Parameter(Mandatory)][string]$Branch,[Parameter(Mandatory)][string]$CertifiedHead,[Parameter(Mandatory)][string]$ManifestPath,[Parameter(Mandatory)][string]$ManifestSha256,[Parameter(Mandatory)][string]$MigrationStart,[Parameter(Mandatory)][string]$MigrationEnd,[string]$SchemaVersion=$script:ReleaseApprovalSchema)
    if($SchemaVersion -cne $script:ReleaseApprovalSchema){throw "APPROVAL CONTRACT REJECTED: unsupported schema '$SchemaVersion'; no credential or network access occurred; no migration was attempted"}
    if($ReleaseId -cne 'snag-list-030-035'){throw "APPROVAL CONTRACT REJECTED: invalid releaseId '$ReleaseId'; no migration was attempted"}
    if($CertifiedHead -notmatch '^[0-9a-f]{40}$'){throw 'APPROVAL CONTRACT REJECTED: certifiedHead must be a full lowercase 40-character Git SHA; no migration was attempted'}
    if($ManifestSha256 -notmatch '^[0-9a-f]{64}$'){throw 'APPROVAL CONTRACT REJECTED: manifestSha256 must be a full lowercase SHA-256; no migration was attempted'}
    if($MigrationStart -cne '030' -or $MigrationEnd -cne '035'){throw "APPROVAL CONTRACT REJECTED: invalid migration range '$MigrationStart-$MigrationEnd'; no migration was attempted"}
    if($ManifestPath -cne 'scripts/manifests/snag-list-030-035.psd1'){throw "APPROVAL CONTRACT REJECTED: invalid canonical manifest path '$ManifestPath'; no migration was attempted"}
    if([string]::IsNullOrWhiteSpace($Branch)){throw 'APPROVAL CONTRACT REJECTED: branch is missing; no migration was attempted'}
    $phrase="APPROVE PRODUCTION APPLY SNAG LIST $MigrationStart-$MigrationEnd AT $CertifiedHead MANIFEST $ManifestSha256"
    return [pscustomobject]@{schema=$SchemaVersion;releaseId=$ReleaseId;branch=$Branch;certifiedHead=$CertifiedHead;manifestPath=$ManifestPath;manifestSha256=$ManifestSha256;migrationStart=$MigrationStart;migrationEnd=$MigrationEnd;requiredPhrase=$phrase}
}

function Get-RepositoryReleaseApprovalDescriptor {
    param([Parameter(Mandatory)]$Manifest,[Parameter(Mandatory)][string]$ManifestPath,[Parameter(Mandatory)][string]$RepoRoot)
    if(-not $Manifest.Contains('approvalContract')){throw 'APPROVAL CONTRACT REJECTED: manifest approvalContract is missing; no migration was attempted'}
    $contract=$Manifest.approvalContract
    foreach($key in @('schemaVersion','releaseId','expectedBranch','migrationStart','migrationEnd')){if(-not $contract.Contains($key)-or[string]::IsNullOrWhiteSpace([string]$contract[$key])){throw "APPROVAL CONTRACT REJECTED: manifest approvalContract.$key is missing; no migration was attempted"}}
    $branch=(& git -C $RepoRoot branch --show-current 2>$null).Trim()
    if($LASTEXITCODE-ne 0-or $branch-cne[string]$contract.expectedBranch){throw "APPROVAL CONTRACT REJECTED: branch '$branch' does not match '$($contract.expectedBranch)'; no credential or network access occurred; no migration was attempted"}
    $head=(& git -C $RepoRoot rev-parse HEAD 2>$null).Trim().ToLowerInvariant()
    if($LASTEXITCODE-ne 0-or $head-notmatch'^[0-9a-f]{40}$'){throw 'APPROVAL CONTRACT REJECTED: current full Git HEAD is unavailable; no migration was attempted'}
    & git -C $RepoRoot diff --quiet --no-ext-diff -- 2>$null
    if($LASTEXITCODE-ne 0){throw 'APPROVAL CONTRACT REJECTED: tracked working tree is dirty; no credential or network access occurred; no migration was attempted'}
    & git -C $RepoRoot diff --cached --quiet --no-ext-diff -- 2>$null
    if($LASTEXITCODE-ne 0){throw 'APPROVAL CONTRACT REJECTED: staging area is not empty; no credential or network access occurred; no migration was attempted'}
    $resolved=(Resolve-Path -LiteralPath $ManifestPath).Path;$prefix=(Resolve-Path -LiteralPath $RepoRoot).Path.TrimEnd('\')+'\'
    if(-not $resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'APPROVAL CONTRACT REJECTED: manifest is outside repository root; no migration was attempted'}
    $relative=$resolved.Substring($prefix.Length).Replace('\','/');$hash=(Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash.ToLowerInvariant()
    $start='{0:D3}'-f[int]$Manifest.migrations[0].number;$end='{0:D3}'-f[int]$Manifest.migrations[-1].number
    if($start-cne[string]$contract.migrationStart-or$end-cne[string]$contract.migrationEnd){throw 'APPROVAL CONTRACT REJECTED: manifest migration range contradicts approvalContract; no migration was attempted'}
    return New-ReleaseApprovalDescriptor -ReleaseId $contract.releaseId -Branch $branch -CertifiedHead $head -ManifestPath $relative -ManifestSha256 $hash -MigrationStart $start -MigrationEnd $end -SchemaVersion $contract.schemaVersion
}
function Get-RequiredReleaseApprovalPhrase {
    param([Parameter(Mandatory)]$Descriptor)
    return [string]$Descriptor.requiredPhrase
}
function Test-ReleaseApprovalPhrase {
    param([AllowNull()][AllowEmptyString()][string]$Approval,[Parameter(Mandatory)]$Descriptor)
    if ([string]::IsNullOrWhiteSpace($Approval)) { return $false }
    return [string]::Equals($Approval.Trim(),[string]$Descriptor.requiredPhrase,[StringComparison]::Ordinal)
}
function Assert-ReleaseApproval {
    param([AllowNull()][AllowEmptyString()][string]$Approval,[Parameter(Mandatory)]$Descriptor)
    if (-not (Test-ReleaseApprovalPhrase -Approval $Approval -Descriptor $Descriptor)) { throw "APPROVAL CONTRACT REJECTED: schema='$($Descriptor.schema)' releaseId='$($Descriptor.releaseId)' phrase is missing, malformed, stale, or mismatched; no credential or network access occurred; no migration was attempted" }
    return $true
}
function Get-ReleaseApprovalFailureClassification { return 'BLOCKED BEFORE APPLY - APPROVAL CONTRACT MISMATCH' }
