# P1 production reconciliation closeout

## Final status

P1 production reconciliation is complete. The owner-reported production gates
were:

- `PRODUCTION_RECONCILIATION_TRANSACTION=PASS`
- `CORRECTED_DATABASE_POSTFLIGHT=PASS`
- `POST_WRITE_CLASSIFIER_UNIQUE_STATE=ALREADY_RECONCILED`
- `POST_WRITE_CLASSIFIER=PASS`
- `SECURITY_POSTFLIGHT=PASS`
- authenticated production browser smoke: PASS

The resulting catalog state is the canonical 91-work-package V1 template
active and the 221-work-package Master Catalog V2 inactive. The reconciliation
must not be executed again.

## Incident and recovery record

The incident originated in production template-schema lag combined with a
mixed migration state. The browser-visible failure path reached application
bootstrap and template hydration. P0 shipped a frontend compatibility repair
so existing production projects could load safely across the legacy schema.

P1 then certified and executed a forward-only reconciliation package. The
package preserved the legacy template, Projects 127 and 143, and their Scope
fingerprints; reconciled the template schema and project-template foreign key;
applied the canonical migration-037 forward repair; upgraded the contractor
report function; and normalized the certified ACL/RLS target.

## Immutable identities

- Deployed application main: `df27d16395a724b356b88afec22f37497b0e6ae7`
- Final certification gate: `123b2bc946f897fe90d90005d555642c1bed5f24`
- Certified reconciliation SQL SHA-256:
  `dbebe29b9edec1aaa7f619d887d520445700eb48b4ffad48029935515ab23c7e`
- Accepted fresh backup: `backups/production/20260807T173832Z`
- Accepted backup-manifest SHA-256:
  `9975f27225ce6e9969cceb67b592a8f5c6ac86a3477de4666721f497c32f1b04`
- Restore verification: PASS
- Structural equivalence: PASS
- Security equivalence: PASS

The incomplete `backups/production/20260807T171319Z` capture is invalid
evidence. It remains untouched and must never be reused.

## Owner-tooling defects found during execution

1. A Git guard used `core.excludesFile=NUL`, which fails on Windows in this
   invocation. Canonical tooling now uses a securely created real empty
   temporary file and guaranteed cleanup.
2. `Get-ProductionConnectionFingerprint` validated the username/project ref
   but did not return `ProjectRef`, while an owner guard expected that property.
   The validated ref is now part of the returned contract; the username check
   remains unchanged.
3. An ad-hoc postflight checked ten unrelated conceptual project fields instead
   of migration 037's real columns. The canonical contract is now derived from
   `037_retail_historical_project_profile.sql` and verifies ten columns,
   nullability, and absence of defaults.
4. An ad-hoc classifier parser concatenated duplicate identical states. The
   canonical parser now accepts duplicate identical output informationally and
   rejects missing or conflicting states.

These defects affected owner tooling and postflight classification. They did
not invalidate the certified single transaction and did not require repeating
the committed production reconciliation.

## Reusable-tooling disposition

The ignored P1 wrappers were not promoted wholesale because they bind local
paths, timestamps, and P1 identities:

- reusable PRE behavior is represented by
  `scripts/production/Invoke-OwnerProductionReadOnlyGate.ps1`;
- backup capture remains owned by canonical `scripts/production-backup.ps1`;
- reusable post-COMMIT behavior is represented by
  `scripts/production/Invoke-OwnerProductionPostflight.ps1`;
- marker and classifier semantics live in tracked libraries under
  `scripts/lib/`;
- P1 manifests and security evidence remain immutable release-specific files;
- timestamped wrappers, logs, dumps, and diagnostics remain ignored artifacts.

`RawUri` and `EnvironmentText` currently have no tracked consumer. They contain
sensitive material and are a valid future hardening target, but they were
retained in this focused change so their removal can receive a separate
compatibility and security review.

No credentials or secret connection details are recorded in this closeout.
