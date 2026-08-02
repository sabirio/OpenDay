@{
    # Manifest for the Staging Bridge batch (Simplification Phase 3E.2).
    # Live staging is missing migrations 037 and 041, which the
    # contractor-managed-rollout-046-054 batch depends on (052 requires
    # 037's projects.location_type-family columns are NOT actually read by
    # 052/053/054 directly, but 046-054's create/scope-sync RPCs and the
    # zoned-template model assume templates.family/company_id from 041, and
    # the project-profile columns from 037 are expected by the same release
    # narrative and by frontend code paths exercised alongside the rollout).
    # 037 and 041 are mutually independent (037 touches only public.projects;
    # 041 touches only public.templates plus an informational NOT VALID FK
    # back to projects) and are applied in file-number order as a matter of
    # convention, not a hard dependency.
    schemaVersion = 1
    manifestVersion = '1.0.0'
    batchId = 'staging-bridge-037-041'
    description = 'Bridges live staging onto the prerequisite state contractor-managed-rollout-046-054 requires: projects historical-profile columns (037) and versioned/company-scoped templates (041).'
    approvedProjectRef = 'sdndsekarwhumdbcqxni'
    authoritativeCommit = '8d5f5da7f173267cabc28af818e5ea5d80be9206'
    requiredDatabaseUser = 'postgres'
    approvalContract = @{
        schemaVersion = 'staging-bridge-approval/v1'
        releaseId = 'staging-bridge-037-041'
        expectedBranch = 'feature/staging-bridge-037-041-preparation'
        migrationStart = '037'
        migrationEnd = '041'
    }
    stopOnFirstFailure = $true
    expectedPredecessorClassification = 'READY_FOR_STAGING-BRIDGE-037-041'
    expectedFinalClassification = 'ALREADY_APPLIED'
    migrationsDirectory = 'weekly-tracker\src\migrations'
    contiguousSequence = $false
    migrations = @(
        @{ number = 37; file = '037_retail_historical_project_profile.sql'; sha256 = 'b9823300ca093eb929e07b63677363dcc7cad653eae9611570544e49b601defa'; description = 'Adds 10 nullable, no-default, no-constraint historical/profile columns to public.projects. Pure additive DDL, no data mutation.' },
        @{ number = 41; file = '041_versioned_scope_templates.sql'; sha256 = 'f44e816331b07b494def2c1887f867577eae25cfdffc05365a73f872b2c2f7be'; description = 'Adds public.templates.family/company_id, versioning indexes, referenced-template-immutability trigger, narrowed RLS, NOT VALID FK from projects.template_id, and seeds the certified Retail Fit-Out V2 template as global version 1.' }
    )
}
