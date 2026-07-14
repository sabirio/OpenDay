# Snag List 030–035 release incident addendum

This addendum clarifies the production release attempt recorded under
`work/snag-list-030-035-production-release/20260714T122738Z`. It does not
replace or alter that immutable historical evidence.

Canonical classification:

`SNAG LIST 030–035 PRODUCTION RELEASE: BLOCKED BEFORE APPLY — EXECUTOR EVIDENCE CONTRACT DEFECT`

The preflight completed and classified production as READY. The apply command
then failed while validating local preflight evidence because the producer
wrote lock evidence at `assertions.blockingLocks` and the consumer read
`blockingLocks` at the document root. PowerShell strict mode rejected the
missing root property before the apply connection was created.

- Apply connection opened: no.
- Migration 030 attempted: no.
- Migrations 031–035 attempted: no.
- Production schema/data/RLS/Storage changed by apply: no.
- Automatic retry, repair, continuation, or rollback: no.

`FAILED AT MIGRATION XXX` is reserved for a migration whose SQL invocation was
actually attempted and returned failure. A `NOT_ATTEMPTED` step must never be
reported as a failed migration.

A new production release run requires the corrected tooling, a new fresh
verified backup, a new live preflight, and renewed explicit owner approval.
