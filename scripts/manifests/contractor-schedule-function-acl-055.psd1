@{
    # Forward-only security hotfix for the Contractor-Managed Schedule RPCs.
    #
    # Supabase default privileges in schema public grant EXECUTE directly to
    # anon whenever a PostgreSQL function is created. REVOKE FROM PUBLIC alone
    # therefore does not remove anonymous execution rights.
    #
    # Migration 055 removes direct anon EXECUTE from all Contractor-Managed
    # Schedule RPCs and removes direct anon/authenticated execution from the
    # two trigger-only integrity functions.

    schemaVersion = 1
    manifestVersion = '1.0.0'
    batchId = 'contractor-schedule-function-acl-055'
    description = 'Forward-only ACL hardening for Contractor-Managed Schedule RPCs and trigger-only functions.'
    approvedProjectRef = 'sdndsekarwhumdbcqxni'
    authoritativeCommit = 'cf5fc00d4028bbb255e4d100a537a6d1575bd81e'
    requiredDatabaseUser = 'postgres'

    approvalContract = @{
        schemaVersion = 'contractor-schedule-function-acl-approval/v1'
        releaseId = 'contractor-schedule-function-acl-055'
        expectedBranch = 'fix/contractor-schedule-function-acl'
        migrationStart = '055'
        migrationEnd = '055'
    }

    stopOnFirstFailure = $true
    expectedPredecessorClassification = 'READY_FOR_CONTRACTOR-SCHEDULE-FUNCTION-ACL-055'
    expectedFinalClassification = 'ALREADY_APPLIED'
    migrationsDirectory = 'weekly-tracker\src\migrations'
    contiguousSequence = $true

    migrations = @(
        @{
            number = 55
            file = '055_restrict_contractor_schedule_function_acl.sql'
            sha256 = '8db03764d989e20ee7f47aa9f7e05da8eca32488ae10f1948bef80643618c59c'
            description = 'Revokes Supabase default anon EXECUTE from Contractor-Managed Schedule RPCs and blocks direct anon/authenticated execution of trigger-only integrity functions.'
        }
    )
}