# Data integrity architecture

```text
UI form/draft
→ boundary validator + stable request UUID
→ application command model
→ authenticated atomic RPC
→ SQL transaction + header audit trigger + versioned snapshot
→ canonical persisted response
→ read-side refresh
```

Tier 1 is Contractor Report and PM Site Visit. Tier 2 is project/template/assignment mutation. Tier 3 is file operations with compensation.

Transaction invariant: every Tier-1 SQL record and cache update commits together or all roll back. Authorization is enforced inside RPC using `auth.uid`, profile role/company/project access; client organization IDs are not trusted. Request replay is database-idempotent.

Versioning: request UUID, source type/record ID, snapshot schema 1, Canonical Core calculation version, and discrepancy convention/version 1. Historical records are not rewritten.

Files cannot join the SQL transaction. Upload paths are retained in drafts; SQL finalize is retryable; orphan cleanup remains controlled/manual. Write errors normalize to validation/authentication/authorization/conflict/network/database categories with request ID and retryability.

Remaining risks: runtime RLS/RPC/Storage scenarios and clean DB deployment are unverified without an isolated Supabase environment; legacy no-Gantt site visits remain single-row compatibility writes; project Gantt generation remains a multi-call derived-cache operation.

