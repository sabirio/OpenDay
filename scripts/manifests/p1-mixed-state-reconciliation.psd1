@{
    schemaVersion = 1
    manifestVersion = '1.0.0'
    batchId = 'P1-TEMPLATES-MIXED-STATE-RECONCILIATION'
    description = 'Immutable backup/security gate for forward-only reconciliation of the production mixed templates and schedule state.'
    approvedProjectRef = 'szgbkeqornkdngoegyso'
    applicationMainCommit = 'ecfa6771136b47a0372caf18fc52136997784069'

    reconciliationIdentity = @{
        schemaVersion = 'openday-p1-reconciliation-gate/v1'
        reconciliationId = 'p1-templates-mixed-state-production-20260807'
        sourceState = 'production-mixed-pre-041-templates-with-later-atomic-write-state'
        executionPolicy = 'forward-only-fail-closed'
        gateCommitPolicy = 'The containing Git commit is bound externally by production-backup.ps1 SourceCommit and is intentionally not embedded here.'
    }

    preflightEvidence = @{
        production = @{
            sqlName = 'p1-production-template-preflight.sql'
            sqlSha256 = 'c9e61e6a7f621e71b7f3cb71de98de5cc429062c849e368fbc752f3219428fba'
            outputName = 'p1-production-preflight-20260807-144536.txt'
            outputSha256 = '13f842c74390f66a2d6581e9a18889b9d2e19ac177d068b0a202bb6d661383e1'
        }
        minimalDelta = @{
            sqlName = 'p1-production-minimal-delta-preflight.sql'
            sqlSha256 = '06095198f66b714f285c850b0e6c1e8d9e968bc5add5147457da446fd3044daf'
            outputName = 'p1-production-minimal-delta-preflight-20260807-163409.txt'
            outputSha256 = 'b698264295bd4a4a51cbe9f36436f75abde6ff45e29adab9d5abfe17f82aa16a'
        }
    }

    securityEvidence = @{
        path = 'scripts/evidence/p1-production-security-baseline.json'
        sha256 = '4a3471004f9d36a3407e473f06458a144301db3ba1d1631e5c366a5421bc3f0d'
        schemaVersion = 'openday-production-security-baseline/v1'
        hydrationPolicy = 'restore-then-hydrate-and-prove-exact-before-reconciliation'
    }

    productionPre = @{
        legacyTemplate = @{
            id = 'e330a625-d0fd-48ef-ba5f-e96a75e67e6b'
            dataMd5 = 'cf63f05ba67c26e027c01c242dcb36f5'
            workPackageCount = 32
            phaseCount = 11
            active = $true
        }
        pinnedProjects = @(
            @{ id = 127; templateId = 'e330a625-d0fd-48ef-ba5f-e96a75e67e6b'; scopeMd5 = 'aa9facc31307489b1ede47085d2adff9' }
            @{ id = 143; templateId = 'e330a625-d0fd-48ef-ba5f-e96a75e67e6b'; scopeMd5 = 'b63330187ce763bf90cf8573a83b28f2' }
        )
        orphanNonNullTemplateReferences = 0
        canonical041Seed = @{ id = 'dc92175a-251c-45ab-a4fd-c83c1c668ef4'; state = 'absent' }
        masterCatalog043Seed = @{ id = 'e4ef4d98-5688-4d12-9fca-2d7cded88d29'; state = 'absent' }
        contractorReportFunction = @{
            bodyMd5 = '94ae61e04f32b5917edd78063bf12f5f'
            definitionMd5 = 'be01ed978a1c2fd30dd803510eafd360'
            provenance = 'migration-027/028'
            securityMode = 'DEFINER'
            owner = 'postgres'
            executePrincipals = @('authenticated','postgres','service_role')
        }
        siteVisitFunction = @{
            bodyMd5 = 'd2a510a8c1ce8977987cc69dde48fa4e'
            definitionMd5 = '0fff2d4052e4cc024513b8975149447c'
            securityMode = 'DEFINER'
            owner = 'postgres'
            executePrincipals = @('authenticated','postgres','service_role')
        }
        projectsTemplateForeignKey = @{
            name = 'projects_template_id_fkey'
            columns = @('template_id')
            referencedTable = 'public.templates'
            referencedColumns = @('id')
            validated = $true
            matchType = 'SIMPLE'
            onUpdate = 'NO ACTION'
            onDelete = 'NO ACTION'
            deferrable = $false
            initiallyDeferred = $false
        }
        writeCommandRequests = @{
            columnCount = 9
            constraintCount = 4
            indexCount = 2
            idSequence = 'public.write_command_requests_id_seq'
            rlsEnabled = $true
            policyCount = 0
            state = 'canonical-production-pre-state'
        }
    }

    migrationsDirectory = 'weekly-tracker/src/migrations'
    includedMigrations = @(
        @{ number = 41; file = '041_versioned_scope_templates.sql'; sha256 = 'ac7e7956d71d4fc3e4c7e23f9a44acf150db3d2fbe5514278e33ade79783d383' }
        @{ number = 42; file = '042_master_catalog_schema_v2.sql'; sha256 = 'f217fc9536ecd3f374f2f33f048eb7927fb98b28b4093bbf1588bd088796b8d9' }
        @{ number = 43; file = '043_retail_fitout_master_catalog.sql'; sha256 = 'c7d8c556a9d1f7ec3b442257e1342361a0ea2d5932899b4457898de1dfde7239' }
        @{ number = 44; file = '044_master_catalog_weight_calibration.sql'; sha256 = '9052420c24800f582122ef69cd98786a521de56e49e7c296fd411f6254729998' }
        @{ number = 45; file = '045_master_catalog_duration_calibration.sql'; sha256 = '9d939824e8dd3bdec955bb2ce61068da246e0edc9fdd7be35e841613badc3dda' }
        @{ number = 46; file = '046_contractor_schedule_draft_foundation.sql'; sha256 = '9f0b0190a2c98cee08e2bd71f5461790113ae302e21b3f9bc58828776c3a4645' }
        @{ number = 49; file = '049_contractor_schedule_submission_lifecycle.sql'; sha256 = '49348f1bae01dc3c4736c5cea181c2bd058b63e7370c4918a3560df74b444108' }
        @{ number = 51; file = '051_contractor_schedule_lifecycle_lock_integrity.sql'; sha256 = '59484af8fbe9a808f5c2c02c36b98459165768150347a6817d4e2945bfaec507' }
        @{ number = 53; file = '053_contractor_managed_project_scope_sync.sql'; sha256 = '7e4be8a0599cbe05060dcd66bff3ab833bd2088624e1580180c2e2e636b3e506' }
        @{ number = 54; file = '054_fix_contractor_managed_scope_null_artifact.sql'; sha256 = '53cd09c694a8308853f79179dc72a968549a95c47d205a40f70d2021f43ecf1f' }
        @{ number = 55; file = '055_restrict_contractor_schedule_function_acl.sql'; sha256 = 'ff7ba569576c0439d7cff045473321e086a25528e8d39b6cba10f8bd8b11a02b' }
        @{ number = 56; file = '056_restrict_rls_helper_function_acl.sql'; sha256 = 'c70c8c17aeabc36b248695796823ae81ed07b40c3d2f8e76696a9b9c9cb956d6' }
        @{ number = 57; file = '057_part5_table_sequence_acl_bridge.sql'; sha256 = 'e50cb44435cc80c68ecd67265bf03c518a007270a94d546db29fb108c1ec0286' }
        @{ number = 58; file = '058_reconcile_atomic_write_security_and_contractor_rpc.sql'; sha256 = '5f7d47139622cfb582105e138715b4e7c22d58d8508ad55fe497335c5f16f4a0' }
    )
    skippedSupersededMigrations = @(
        @{ number = 47; reason = 'superseded' }
        @{ number = 48; reason = 'superseded' }
        @{ number = 50; reason = 'superseded' }
        @{ number = 52; reason = 'superseded' }
    )

    explicitForwardReconciliation = @{
        projectProfileSchemaRepair = @{
            sourceMigration = '037_retail_historical_project_profile.sql'
            sourceSha256 = 'e0627888ea4b57b108ba8bf28e6e09bb4f2c06f218646022ce959e663d7cc091'
            execution = 'forward-repair-without-ledger-insertion'
            reason = 'Production mixed state lacks all ten nullable project-profile columns required by current-main project creation RPCs.'
            requiredPreExistingColumnCount = 0
            requiredPostColumnCount = 10
        }
        projectsTemplateForeignKey = @{
            name = 'projects_template_id_fkey'
            fromOnDelete = 'NO ACTION'
            toOnDelete = 'RESTRICT'
            preserveOnUpdate = 'NO ACTION'
            preserveMatchType = 'SIMPLE'
            validated = $true
        }
        contractorReportUpgrade = @{
            fromProvenance = 'migration-027/028'
            fromBodyMd5 = '94ae61e04f32b5917edd78063bf12f5f'
            toProvenance = 'canonical-036/058'
            toBodyMd5 = '53ddc257aaa05053822b30e8c7e8d72f'
            intentional = $true
        }
    }

    expectedPost = @{
        canonicalV1 = @{
            id = 'dc92175a-251c-45ab-a4fd-c83c1c668ef4'
            family = 'retail-fitout-v2'
            schemaVersion = 1
            workPackageCount = 91
            active = $true
        }
        masterCatalogV2 = @{
            id = 'e4ef4d98-5688-4d12-9fca-2d7cded88d29'
            schemaVersion = 2
            workPackageCount = 221
            defaultScopeCount = 78
            active = $false
        }
    }

    stopConditions = @(
        'Backup SourceCommit is not the clean dedicated gate commit.'
        'Production project ref differs from approvedProjectRef.'
        'Any manifest, security artifact, preflight, or migration SHA-256 differs.'
        'Any production/restored PRE fingerprint differs from productionPre.'
        'Security hydration does not reproduce exact direct and default ACL evidence.'
        'Any included migration is missing, reordered, duplicated, or replaced.'
        'Any skipped superseded migration is included.'
        'Legacy template data, existing template pins, or existing Scope JSON changes.'
        'The projects table is not in the exact certified pre-state with all ten 037 profile columns absent.'
        'The forward project-profile repair does not produce the exact ten nullable columns required by current main.'
        'The 91-WP v1 template is not active after reconciliation.'
        'The 221-WP v2 Master Catalog becomes active.'
        'projects_template_id_fkey is not validated ON DELETE RESTRICT after reconciliation.'
        'Any postflight table, sequence, or function privilege exceeds the canonical target.'
        'Any backup, restore, reconciliation, security, API, or browser gate fails.'
    )
}
