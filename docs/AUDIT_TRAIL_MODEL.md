# Audit trail model

`fn_audit_log` triggers audit project, contractor-report and site-visit headers. Because triggers execute in the caller transaction, Tier-1 header success audit rows commit or roll back with the command.

Child WP rows and Gantt caches are represented through the source header, versioned snapshot and request ledger; they do not currently have row-level audit triggers. `changed_by` comes from `auth.uid()`, never a trusted payload. Audit reads are project/company-scoped by migration 020.

Limitations: Storage object lifecycle is not in the SQL audit log, and automated Gantt-only project changes are intentionally excluded.

