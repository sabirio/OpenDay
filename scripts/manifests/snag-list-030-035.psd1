@{
    # Canonical manifest for the first Snag List production release.
    schemaVersion = 1
    manifestVersion = '1.0.0'
    batchId = 'SNAG-LIST-030-035'
    description = 'Snag List foundation through canonical field capture workflow.'
    approvedProjectRef = 'szgbkeqornkdngoegyso'
    authoritativeCommit = '848659b770b02202c0b5e1a711c3a677aec34ef2'
    requiredDatabaseUser = 'postgres'
    approvalPhrase = 'APPROVE PRODUCTION APPLY SNAG LIST 030-035'
    stopOnFirstFailure = $true
    expectedPredecessorClassification = 'READY_FOR_SNAG-LIST-030-035'
    expectedFinalClassification = 'ALREADY_APPLIED'
    migrationsDirectory = 'weekly-tracker\src\migrations'
    contiguousSequence = $true
    migrations = @(
        @{ number = 30; file = '030_snag_list_foundation.sql'; sha256 = '04843f8589fbaad18c6d47aa6733fc26b6bf52303d0bb8b4846819d725312bf0'; description = 'Snag aggregate, history, evidence metadata and atomic commands.' },
        @{ number = 31; file = '031_snag_reassignment_semantics.sql'; sha256 = '9b5a6f4fea1a4755c41d45066135e763329ddd1933969e04e22dfa932deffe1a'; description = 'Safe reassignment semantics.' },
        @{ number = 32; file = '032_snag_project_contractors_rpc.sql'; sha256 = 'b0495a7a0f1f51a288ba1480a84c468a22f2a2cb51245a537dbd9ea6f4566de3'; description = 'Narrow project contractor lookup.' },
        @{ number = 33; file = '033_snag_private_plan_pinning.sql'; sha256 = '63d809642b79c23553c9fca6e1d3e1fc0e39e99780bde1eeff91c39fad0fb6fb'; description = 'Private immutable plans and normalized pins.' },
        @{ number = 34; file = '034_snag_secure_evidence_lifecycle.sql'; sha256 = '0d71d6185e90bd083816d73cf939798dce276e971127948576f4d7702b55a53d'; description = 'Private idempotent evidence lifecycle.' },
        @{ number = 35; file = '035_snag_canonical_field_capture.sql'; sha256 = '0d02ee77c6001a2369c159b50350e45e23d6f1942ed0a4672b19699fee3bd52a'; description = 'Canonical capture, publication, trades, stakeholders, comments and contractor visibility.' }
    )
}
