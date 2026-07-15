# Snag List local Docker release-binding certification

This subsystem proves the repository migration chain from the canonical pre-030 predecessor state through backup, independent restore, evidence-bound preflight, exact local approval, application of migrations 030–035, and catalog postflight.

It is deliberately separate from production preflight/apply/postflight. It has no local mode for production executors, never loads `.env`, accepts no database URL, and only operates on loopback-published PostgreSQL 17 containers created and labelled by the current run. Container, network, database, port, and PostgreSQL system fingerprints are revalidated before every database operation.

Run:

```powershell
pwsh -NoProfile -File scripts/certification/snag-list-release-binding/Invoke-SnagListReleaseBindingCertification.ps1
```

Runtime artifacts are written below ignored `work/certification/snag-list-release-binding/<run-id>/`. The source and restore containers use distinct databases and volumes. Cleanup is mandatory and leak-checked. Credentials exist only in process memory and are cleared during cleanup.

The authoritative production-gate evidence artifact is:

```text
work/certification/snag-list-release-binding/<run-id>/release-attestation.json
```

Its SHA-256 is printed as `RELEASE_ATTESTATION_SHA256`. This attestation is the only certification artifact production tooling should trust. It binds, in one canonical JSON document:

- exact Git HEAD and branch;
- canonical release manifest path and SHA-256;
- migrations `030` through `035` with expected/actual SHA-256 hashes;
- certification script hashes;
- the two independent Docker database runs (`source` and `restore`) with image identity, container IDs, volume names, network name/id, database names, server fingerprints and timestamps;
- the evidence chain hashes for backup manifest, backup dump, restore report, preflight report, apply report, postflight report and dependency closure;
- `31/31` PASS negative checks;
- final schema fingerprint;
- cleanup result `0/0/0` for containers/volumes/networks;
- `productionAccessed=false` and `stagingAccessed=false`.

The attestation self-declares the production gate contract. Production gate logic should verify only:

1. the attestation artifact exists;
2. its SHA-256 equals the approved `RELEASE_ATTESTATION_SHA256`;
3. `status = PASS`;
4. exact HEAD and release manifest SHA-256 match the intended release;
5. the artifact is not expired and its bytes have not changed.

Production tooling must not reconstruct certification evidence from scattered logs once this artifact has been approved. New checks should be added only for a newly discovered concrete risk or defect.

The predecessor is repository-derived: the canonical fresh-install list from `scripts/contracts/canonical-security-contract.json`, plus the existing Supabase platform role/auth/storage stubs. No production backup or production row data is used.

The evidence chain binds the release manifest, migration hashes, local backup manifest, restore report, preflight report, Git HEAD, run ID, and exact restore target fingerprint. The local approval prefix cannot be accepted by the production executor.

Threats covered include remote/environment target injection, context substitution, stopped/recreated containers, evidence mutation, stale/wrong-run evidence, migration drift, partial/already-applied state, and cleanup leaks.

Docker-backed local release-binding certification passing does not authorize production. Production approval remains a separate gated operation requiring a fresh canonical production backup, live production preflight, and explicit production approval.
