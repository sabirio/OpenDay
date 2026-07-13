@{
    # Machine-readable, reviewed manifest for one production migration batch.
    # Consumed by scripts/production-migration-apply.ps1 and the matching
    # preflight/postflight scripts - never edited by those scripts, only read.
    schemaVersion = 1
    batchId = 'SNAG-LIST-030-034'
    description = 'Snag List: foundation, reassignment semantics, contractor RPC, private plan pinning, secure evidence lifecycle.'
    approvedProjectRef = 'szgbkeqornkdngoegyso'
    authoritativeCommit = '7234b6413e46d76b82794dcedbe66fa2600f4e46'
    migrationsDirectory = 'weekly-tracker\src\migrations'
    contiguousSequence = $true
    migrations = @(
        @{
            number = 30
            file = '030_snag_list_foundation.sql'
            sha256 = '04843f8589fbaad18c6d47aa6733fc26b6bf52303d0bb8b4846819d725312bf0'
            description = 'Headless Snag List aggregate, append-only history, evidence metadata (v1), atomic commands.'
        },
        @{
            number = 31
            file = '031_snag_reassignment_semantics.sql'
            sha256 = '9b5a6f4fea1a4755c41d45066135e763329ddd1933969e04e22dfa932deffe1a'
            description = 'Preserve active work state during reassignment; forbid silent review invalidation.'
        },
        @{
            number = 32
            file = '032_snag_project_contractors_rpc.sql'
            sha256 = 'b0495a7a0f1f51a288ba1480a84c468a22f2a2cb51245a537dbd9ea6f4566de3'
            description = 'Narrow contractor lookup RPC for the Snag assignment UI.'
        },
        @{
            number = 33
            file = '033_snag_private_plan_pinning.sql'
            sha256 = '63d809642b79c23553c9fca6e1d3e1fc0e39e99780bde1eeff91c39fad0fb6fb'
            description = 'Private immutable PDF plans and page-bound normalized Snag pins.'
        },
        @{
            number = 34
            file = '034_snag_secure_evidence_lifecycle.sql'
            sha256 = '0d71d6185e90bd083816d73cf939798dce276e971127948576f4d7702b55a53d'
            description = 'Private, idempotent Snag evidence lifecycle and closeout read model.'
        }
    )
}
