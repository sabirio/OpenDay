# Snag List local Docker release-binding certification

This subsystem proves the repository migration chain from the canonical pre-030 predecessor state through backup, independent restore, evidence-bound preflight, exact local approval, application of migrations 030–035, and catalog postflight.

It is deliberately separate from production preflight/apply/postflight. It has no local mode for production executors, never loads `.env`, accepts no database URL, and only operates on loopback-published PostgreSQL 17 containers created and labelled by the current run. Container, network, database, port, and PostgreSQL system fingerprints are revalidated before every database operation.

Run:

```powershell
pwsh -NoProfile -File scripts/certification/snag-list-release-binding/Invoke-SnagListReleaseBindingCertification.ps1
```

Runtime artifacts are written below ignored `work/certification/snag-list-release-binding/<run-id>/`. The source and restore containers use distinct databases and volumes. Cleanup is mandatory and leak-checked. Credentials exist only in process memory and are cleared during cleanup.

The predecessor is repository-derived: the canonical fresh-install list from `scripts/contracts/canonical-security-contract.json`, plus the existing Supabase platform role/auth/storage stubs. No production backup or production row data is used.

The evidence chain binds the release manifest, migration hashes, local backup manifest, restore report, preflight report, Git HEAD, run ID, and exact restore target fingerprint. The local approval prefix cannot be accepted by the production executor.

Threats covered include remote/environment target injection, context substitution, stopped/recreated containers, evidence mutation, stale/wrong-run evidence, migration drift, partial/already-applied state, and cleanup leaks.

Docker-backed local release-binding certification passing does not authorize production. Production approval remains a separate gated operation requiring a fresh canonical production backup, live production preflight, and explicit production approval.
