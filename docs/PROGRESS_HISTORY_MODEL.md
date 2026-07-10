# Progress history integrity model

New Tier-1 snapshots use `snapshot_schema_version:1` and include source type/record ID, client request ID, actor, calculation version and calculated time.

- Contractor source: canonical cumulative progress remains in `overall_progress`; snapshot links the committed contractor report.
- Site-visit source: `overall_progress` is null because a PM partial visit is not official project progress; observations and discrepancy metadata are stored in the versioned snapshot.
- Idempotent replay cannot create another source event/snapshot.
- Historical rows remain readable and are not rewritten.
- Historical replay without frozen template/scope weights must emit the existing compatibility caveat; mutable current weights must not silently replace stored evidence.

