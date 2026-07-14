# Snag List 030-035 backup-tooling incident addendum

This immutable clarification supplements, and does not replace or edit, the
historical release evidence for the production attempt at commit
`c596fbeddb02cc5a6885b62556d1cdb4d27a5c5c`.

Repository, manifest, migration-checksum and exact owner-approval validation
passed. The canonical backup entry point then failed during PowerShell
parameter binding because its default `EnvFile` expression evaluated
`Join-Path $PSScriptRoot` before a usable script root existed. The correct
classification is:

`SNAG LIST 030-035 PRODUCTION RELEASE: BLOCKED BEFORE APPLY - BACKUP TOOLING DEFECT`

Production credentials were not loaded; Docker, network and production were
not accessed; no backup directory or backup was created; preflight and apply
were not run; migrations 030-035 were all `NOT_ATTEMPTED`; production remained
unchanged. The failed run must not be made to appear successful and its
approval cannot be reused after the repair commit changes HEAD. The next run
requires a newly generated exact approval and a new fresh production backup.
