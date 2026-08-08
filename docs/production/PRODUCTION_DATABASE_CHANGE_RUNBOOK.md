# Production database change runbook

This is the canonical owner-executed workflow for production database changes.
Release-specific identifiers, row fingerprints, SQL, and expected states belong
in an immutable release manifest or evidence package, not in this generic
runbook or its reusable scripts.

## Owner boundary

The agent prepares and verifies immutable artifacts and offline commands. The
owner explicitly authorizes and executes every live production command. A
successful rehearsal, backup, PRE check, or postflight is not production-write
authorization.

## Required sequence

1. Freeze a clean audit commit and record its parent, branch, and application
   deployment identity. Retain any historical certification branch unchanged.
2. Bind every executable SQL/tool/manifest to an immutable SHA-256. Never edit
   or rebuild a certified artifact inside the production window.
3. Run the release-specific PRE drift check as an explicit read-only
   transaction. Use `scripts/production/Invoke-OwnerProductionReadOnlyGate.ps1`
   for hash and transcript-marker enforcement. SQL using audited `DO` assertion
   blocks must opt in with `-AllowProceduralAssertions`; the explicit read-only
   transaction remains mandatory.
4. Take a fresh, release-bound backup with `scripts/production-backup.ps1`.
   Verify all checksums and rehearse restoration in an isolated stack before
   considering a write.
5. Reconfirm deployment identity and obtain explicit owner production-write
   approval after the PRE and backup/restore gates pass.
6. Execute exactly one certified SQL artifact with `psql -X -v
   ON_ERROR_STOP=1`. Multi-migration reconciliation packages must retain one
   outer PostgreSQL transaction.
7. Treat transaction result separately from every post-COMMIT gate. Run
   database assertions, the post-write classifier, and ACL/RLS/security checks
   as explicit read-only transactions. The reusable entry point is
   `scripts/production/Invoke-OwnerProductionPostflight.ps1`.
8. Run authenticated browser smoke last. It is a distinct product gate and
   must not be inferred from database success.

## Cross-platform Git safety

Never configure `core.excludesFile=NUL` or `/dev/null`. Code that must suppress
the user's global Git excludes uses `scripts/lib/GitIsolation.ps1`, which
creates an empty random temporary file with `CreateNew`, passes its real path
to Git, and removes it in `finally` on success or failure.

## Classifier semantics

Use `ConvertFrom-ProductionClassifierOutput` from
`scripts/lib/ProductionClassifier.ps1`. Duplicate identical markers are one
semantic state and their duplicate count is informational. Zero recognized
states or conflicting recognized states fail closed.

## Post-COMMIT failure semantics

A failed postflight does not undo a successful COMMIT. It must print `DO NOT
RERUN RECONCILIATION`, preserve sanitized evidence, and stop. Never
automatically retry the transaction, restore production, execute DOWN
migrations, or improvise corrective SQL. Any correction requires a separately
reviewed forward-only change and new owner authorization.

## Generic tooling vs. release evidence

- Generic: Git isolation, connection fingerprinting, read-only SQL validation,
  classifier parsing, backup capture, restore verification, and separated
  postflight orchestration.
- Release-specific: project ref, migration set, SQL hashes, row fingerprints,
  classifier state expectations, pass markers, and browser-smoke assertions.
- Temporary: timestamped logs, raw diagnostics, local command wrappers, dump
  files, and disposable-stack state. These remain ignored and are never used
  as reusable source code.
