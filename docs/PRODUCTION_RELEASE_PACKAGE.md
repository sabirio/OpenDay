# Production Release Package

Prepared, not executed. Production remains untouched.

- Certified source: local-certified commit/tag recorded after the final gate.
- Expected migration path: `000`, `010`, `012–027`; never run legacy-only 011 on a fresh target.
- Preflight: verified backup/restore owner, read-only migration history, provider-supported dry-run, environment fingerprint and production change approval.
- Order: database migrations → DB/RLS/RPC smoke checks → Auth redirects/bucket policies → frontend build/deploy → end-to-end smoke tests.
- Reference data: no local/staging fixtures or users may enter production.
- Edge Functions: none added or required by this release.
- Integrity checks: project/company ownership, unique report period, request ledger/source links, progress history, tenant isolation and evidence paths.
- Forward-fix boundary: prefer append-only repair for deployed schema; restore migration 025 function only if 027 rollback is explicitly approved and its validation loss is accepted.
- Stop criteria: unexpected migration/schema drift, missing backup, Auth failure, cross-tenant visibility, duplicate write, broken canonical read, invalid Storage reference or production/staging fingerprint ambiguity.

Incident template: timestamp, release/tag, target fingerprint, failing gate, observed scope, writes already executed, stop action, owner and forward-fix/rollback decision.
