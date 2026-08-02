@{
    # Canonical manifest for the Contractor-Managed Schedule rollout batch
    # (Simplification Phase 3D.2/3D.2.1/3D.3, staged for Phase 3E.1 staging
    # rehearsal). Dependency-complete: 052-054 alone are not independently
    # promotable - 052 requires 046's schedule_ownership_mode column, and
    # 053 requires 049's contractor_schedule_lifecycle_status() and 051's
    # projects_scope_lifecycle_lock trigger. All nine migrations must be
    # applied together, in this exact order.
    schemaVersion = 1
    manifestVersion = '1.0.1'
    batchId = 'contractor-managed-rollout-046-054'
    description = 'Contractor-Managed Schedule foundation through atomic Create/Scope-sync and the JSONB-null-scope data correction.'
    approvedProjectRef = 'sdndsekarwhumdbcqxni'
    authoritativeCommit = 'cf5fc00d4028bbb255e4d100a537a6d1575bd81e'
    requiredDatabaseUser = 'postgres'
    approvalContract = @{
        schemaVersion = 'contractor-managed-rollout-approval/v1'
        releaseId = 'contractor-managed-rollout-046-054'
        expectedBranch = 'fix/contractor-schedule-function-acl'
        migrationStart = '046'
        migrationEnd = '054'
    }
    stopOnFirstFailure = $true
    expectedPredecessorClassification = 'READY_FOR_CONTRACTOR-MANAGED-ROLLOUT-046-054'
    expectedFinalClassification = 'ALREADY_APPLIED'
    migrationsDirectory = 'weekly-tracker\src\migrations'
    contiguousSequence = $true
    migrations = @(
        @{ number = 46; file = '046_contractor_schedule_draft_foundation.sql'; sha256 = '989d09af15d4ed2d216cd0d0f51805ea8a080dc789cb3f1149289e0e738b2fa8'; description = 'Adds projects.schedule_ownership_mode (default AUTO_GENERATED) and save_contractor_schedule_draft() RPC.' },
        @{ number = 47; file = '047_contractor_schedule_human_date_semantics.sql'; sha256 = '7e3fea282eac83a588b20b76440572402218f7c99f0c001afab43ec9f9213b68'; description = 'save_contractor_schedule_draft(): human-facing inclusive Finish date input contract.' },
        @{ number = 48; file = '048_contractor_schedule_ownership_enforcement.sql'; sha256 = '339862f93bba8d4839b8e4aececb99ed9f0cf95151b6c6a900d3e8b973efc7f0'; description = 'save_contractor_schedule_draft(): Contractor-only authorization (removes PM/Admin inherited access).' },
        @{ number = 49; file = '049_contractor_schedule_submission_lifecycle.sql'; sha256 = 'a963cf161009a0ac648ccac93333ec765b729de2cff7232e3b2a64e75010e20e'; description = 'Adds project_schedule_versions / project_schedule_version_tasks tables; submit/request-changes/approve RPCs; contractor_schedule_lifecycle_status().' },
        @{ number = 50; file = '050_contractor_schedule_draft_lifecycle_lock.sql'; sha256 = '1cc114d59219cc1e31f5e4102a46f0446c95196297bc18cd694b4bda60627bb4'; description = 'save_contractor_schedule_draft(): rejects Save Draft while PENDING_REVIEW/APPROVED.' },
        @{ number = 51; file = '051_contractor_schedule_lifecycle_lock_integrity.sql'; sha256 = '7e6d186b44ca67548b2fdf8e4cb72b7a7303d269b3e13a0b3800f61d75d382c5'; description = 'Adds projects_scope_lifecycle_lock trigger (prevent_scope_mutation_during_review); hardens save_contractor_schedule_draft()/submit_contractor_schedule().' },
        @{ number = 52; file = '052_create_contractor_managed_project.sql'; sha256 = '2ccd788db3103e4513a1bd8611687137661e442aab7d8ca444b2899d53522a1b'; description = 'Atomic create_contractor_managed_project() RPC: project + Scope + unscheduled schedule rows in one transaction.' },
        @{ number = 53; file = '053_contractor_managed_project_scope_sync.sql'; sha256 = 'a0b1ea7910d35c18709f40b3535c1303501f5539b824574dd0b73aa577a6d64f'; description = 'Atomic update_contractor_managed_project_scope() RPC: Scope + schedule-row delta in one transaction.' },
        @{ number = 54; file = '054_fix_contractor_managed_scope_null_artifact.sql'; sha256 = 'a84040891bb20262f40a31c94c455465534bf2be4e963ec78558a92b1565d158'; description = 'One-time JSONB-null-scope data correction; CREATE OR REPLACE of create_contractor_managed_project() to prevent recurrence.' }
    )
}
