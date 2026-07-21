# Snag List 030–035 provenance addendum

This addendum records a verification finding from 2026-07-15. It does not
replace or edit the three prior 2026-07-14 incident addenda
(`SNAG_LIST_030_035_RELEASE_INCIDENT_ADDENDUM.md`,
`..._APPROVAL_CONTRACT_INCIDENT_ADDENDUM.md`,
`..._BACKUP_TOOLING_INCIDENT_ADDENDUM.md`).

A fresh production backup was taken and restore-verified
(`backups/production/20260715T183644Z/`, both `BACKUP_DUMP_CREATED` and
`RESTORE_VERIFICATION: PASS`) at commit
`5f80a12c6215dc71aebda7dfc3552fb2b34ca287`. The subsequent live,
read-only preflight against real production returned:

`SNAG LIST 030–035 PREFLIGHT CLASSIFICATION: ALREADY_APPLIED — STATUS: NOT_READY`

Every table, function, and storage bucket the manifest expects already
existed in production before this run. Per the owner runbook,
`ALREADY_APPLIED` is a hard stop — no `psql` invocation against
`030_snag_list_foundation.sql` through `035_snag_canonical_field_capture.sql`
was attempted in this run, and none was made to appear successful.

A live, read-only postflight certification against the same manifest was
then run to check the existing objects for correctness rather than mere
presence. Result:

`MIGRATION_POSTFLIGHT: PASS`

All 11 tables present with RLS enabled on every one; all 15 functions
present with no `anon` EXECUTE grant on any; both buckets (`snag-plans`,
`snag-evidence`) private with the expected file-size limits. Zero reported
failures.

**Provenance is not established.** None of the three 2026-07-14 incident
addenda record a successful apply — each records a distinct tooling defect
that stopped the run before any migration file was executed against
production. No fourth attempt is recorded anywhere in this repository's git
history or documentation. The objects were therefore made present in
production by some means outside this repository's tracked release process;
the operator and timestamp are unknown as of this writing. This should be
investigated via Supabase's own dashboard history/logs before relying on
this repository's release tooling as the sole record of production schema
state for this batch.

Evidence (gitignored, retained locally, not committed):
`work/snag-list-030-035-production-release/20260715T184520Z/`
(`preflight-evidence.json`, `postflight-evidence.json`) and
`backups/production/20260715T183644Z/` (backup + restore-verification).

This finding does not authorize skipping the owner-controlled release
process for any future Snag List migration. It reflects only the verified
state of production as observed on 2026-07-15: schema and security contract
for 030-035 present and correct.
