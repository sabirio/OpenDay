@{
    schemaVersion = 'openday-p1-certified-reconciliation/v1'
    reconciliationId = 'p1-templates-mixed-state-production-20260807-r2'
    applicationMainSha = 'df27d16395a724b356b88afec22f37497b0e6ae7'
    backupGateSha = '79d655142584da34e6c43b4c0a2b9af0d802703e'
    restoreToolSha = '1646cdf9eb06ec58bf5b66b5f7ebce66e823ec85'
    historicalCertification = @{
        applicationMainSha = 'ecfa6771136b47a0372caf18fc52136997784069'
        reconciliationGateSha = '5f1ec7cc813dd9c5fe976e7c9d009d993df71325'
    }
    approvedProjectRef = 'szgbkeqornkdngoegyso'

    backup = @{
        relativePath = 'backups/production/20260807T120651Z'
        manifestSha256 = 'e330066b56b24173e2998fe208e95c5ae72b13557ec48b45902ce70b844aa363'
    }
    securityEvidence = @{
        path = 'scripts/evidence/p1-production-security-baseline.json'
        sha256 = '4a3471004f9d36a3407e473f06458a144301db3ba1d1631e5c366a5421bc3f0d'
        restoredEquivalenceEvidenceSha256 = '5e61f06b9a4370c9b3d97744dd9b07930ad0f651486fee795c612ebf06e5c8a5'
    }
    artifact = @{
        reconciliationSqlSha256 = 'dbebe29b9edec1aaa7f619d887d520445700eb48b4ffad48029935515ab23c7e'
        builderLibrarySha256 = 'fb6120041819f63b679f0bb42270eaadf044e810efbb778e59a63f9da9d0b97e'
        builderEntryPointSha256 = '397bd5c4d42b427fbef2646e7f74f8bcfa7ff52c8069d3aae9727227f9847f49'
        sourceContractSha256 = 'fbb9b0484fa6433a3dbd4b27f00c55f3db8351ea94dfaf342f4015198017b816'
        transactionPolicy = 'single-outer-transaction-ON_ERROR_STOP'
    }

    sourceMigrations = @(
        @{ number=37; file='037_retail_historical_project_profile.sql'; sha256='e0627888ea4b57b108ba8bf28e6e09bb4f2c06f218646022ce959e663d7cc091'; execution='explicit-forward-repair-without-ledger-insertion' }
        @{ number=41; file='041_versioned_scope_templates.sql'; sha256='ac7e7956d71d4fc3e4c7e23f9a44acf150db3d2fbe5514278e33ade79783d383' }
        @{ number=42; file='042_master_catalog_schema_v2.sql'; sha256='f217fc9536ecd3f374f2f33f048eb7927fb98b28b4093bbf1588bd088796b8d9' }
        @{ number=43; file='043_retail_fitout_master_catalog.sql'; sha256='c7d8c556a9d1f7ec3b442257e1342361a0ea2d5932899b4457898de1dfde7239' }
        @{ number=44; file='044_master_catalog_weight_calibration.sql'; sha256='9052420c24800f582122ef69cd98786a521de56e49e7c296fd411f6254729998' }
        @{ number=45; file='045_master_catalog_duration_calibration.sql'; sha256='9d939824e8dd3bdec955bb2ce61068da246e0edc9fdd7be35e841613badc3dda' }
        @{ number=46; file='046_contractor_schedule_draft_foundation.sql'; sha256='9f0b0190a2c98cee08e2bd71f5461790113ae302e21b3f9bc58828776c3a4645' }
        @{ number=49; file='049_contractor_schedule_submission_lifecycle.sql'; sha256='49348f1bae01dc3c4736c5cea181c2bd058b63e7370c4918a3560df74b444108' }
        @{ number=51; file='051_contractor_schedule_lifecycle_lock_integrity.sql'; sha256='59484af8fbe9a808f5c2c02c36b98459165768150347a6817d4e2945bfaec507' }
        @{ number=53; file='053_contractor_managed_project_scope_sync.sql'; sha256='7e4be8a0599cbe05060dcd66bff3ab833bd2088624e1580180c2e2e636b3e506' }
        @{ number=54; file='054_fix_contractor_managed_scope_null_artifact.sql'; sha256='53cd09c694a8308853f79179dc72a968549a95c47d205a40f70d2021f43ecf1f' }
        @{ number=55; file='055_restrict_contractor_schedule_function_acl.sql'; sha256='ff7ba569576c0439d7cff045473321e086a25528e8d39b6cba10f8bd8b11a02b' }
        @{ number=56; file='056_restrict_rls_helper_function_acl.sql'; sha256='c70c8c17aeabc36b248695796823ae81ed07b40c3d2f8e76696a9b9c9cb956d6' }
        @{ number=57; file='057_part5_table_sequence_acl_bridge.sql'; sha256='e50cb44435cc80c68ecd67265bf03c518a007270a94d546db29fb108c1ec0286' }
        @{ number=58; file='058_reconcile_atomic_write_security_and_contractor_rpc.sql'; sha256='5f7d47139622cfb582105e138715b4e7c22d58d8508ad55fe497335c5f16f4a0' }
    )
    migrationExecutionOrder = @(41,42,43,44,45,46,49,51,53,54,55,56,57,58)
    skippedMigrations = @(47,48,50,52)
    noLedgerFabrication = $true

    productionPre = @{
        legacyTemplate = 'e330a625-d0fd-48ef-ba5f-e96a75e67e6b|cf63f05ba67c26e027c01c242dcb36f5|32|11|true'
        project127 = 'e330a625-d0fd-48ef-ba5f-e96a75e67e6b|aa9facc31307489b1ede47085d2adff9'
        project143 = 'e330a625-d0fd-48ef-ba5f-e96a75e67e6b|b63330187ce763bf90cf8573a83b28f2'
        projectProfile037Columns = 'all-ten-absent'
        contractorFunctionBodyMd5 = '94ae61e04f32b5917edd78063bf12f5f'
        siteVisitFunctionBodyMd5 = 'd2a510a8c1ce8977987cc69dde48fa4e'
        projectsTemplateFk = 'validated|SIMPLE|NO ACTION|NO ACTION|not-deferrable'
    }
    expectedPost = @{
        projectProfile037Columns = 'all-ten-present-nullable'
        fkRepair = 'validated|ON UPDATE NO ACTION|ON DELETE RESTRICT'
        contractorFunctionBodyMd5 = '53ddc257aaa05053822b30e8c7e8d72f'
        siteVisitFunctionBodyMd5 = 'd2a510a8c1ce8977987cc69dde48fa4e'
        canonicalV1 = 'dc92175a-251c-45ab-a4fd-c83c1c668ef4|retail-fitout-v2|1|91|active'
        masterCatalogV2 = 'e4ef4d98-5688-4d12-9fca-2d7cded88d29|2|221|78|inactive'
        aclTargetSha256 = '67773fd9b6d5f9ef6b6c3fe20bdda438ec9ddaa05ddec530d730600faccb83d8'
        unintendedAclLeakCount = 0
    }

    certification = @{
        packageTests = '15/15 PASS'
        browserLifecycle = '11/11 PASS'
        browserLifecycleSpecSha256 = '137065965e3965b24c8b7b79d381e7debba74d726313ad33b98bba06ac796862'
        postLifecycleBrowserRegression = '1/1 PASS; zero unexpected console/network errors'
        postLifecycleBrowserSpecSha256 = '0dcfe1742e2255c773fa81f59235114fdc0ec3795c3daf4420dff1c77c7b2c08'
        securityResult = 'RECONCILIATION_SECURITY_PASS'
        securityTestSha256 = 'd511d61cbaf44637c95673fc81a5b682e19148861eee0b565dd449e3043932fb'
        scopeLockFingerprint = 'ace256fdf7941dcf5e337d0e99461264|bd9bbfc4056d1ed2e8fe36773214a1a8|9214d850e3eb86dec66eb18dc1901e91|598e6a46d54e238bc5d7041637bef83e'
        exactlyOnceClassifier = 'ALREADY_RECONCILED'
        classifierBeforeAfterFingerprint = '4ed8d8ccd7bffda9a08483e0d65d64f7'
    }

    stopConditions = @(
        'Production or staging identity differs from the approved project ref.'
        'Deployed application main differs from applicationMainSha.'
        'Backup, security evidence, builder, source contract, source migration, or reconciliation artifact hash differs.'
        'Any production PRE preservation fingerprint or exact mixed-state precondition differs.'
        'Backup restore or security hydration/equivalence is not PASS.'
        'The classifier is not READY before execution or ALREADY_RECONCILED after execution.'
        'The transaction, database postflight, ACL/security postflight, or browser smoke reports any failure.'
        'The legacy template or Projects 127/143 pin/Scope fingerprints change.'
        'The 91-WP canonical V1 template is not active or the 221-WP Master Catalog V2 becomes active.'
    )
}
