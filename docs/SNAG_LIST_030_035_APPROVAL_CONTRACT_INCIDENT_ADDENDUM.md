# Snag List 030–035 approval-contract incident addendum

This addendum clarifies the release run that supplied:

`APPROVE PRODUCTION APPLY SNAG LIST 030-035 AT 91CA79B`

Repository validation passed, but the certified executor required the older
unbound phrase `APPROVE PRODUCTION APPLY SNAG LIST 030-035`. Exact comparison
correctly rejected the supplied value. The accurate classification is:

`SNAG LIST 030–035 PRODUCTION RELEASE: BLOCKED BEFORE APPLY — APPROVAL CONTRACT MISMATCH`

The run stopped before credential loading, network access, backup, preflight,
production connection, and migration execution. Migrations 030–035 were all
`NOT_ATTEMPTED`; production remained unchanged. Historical reports and
evidence are not rewritten by this clarification.

Neither failed phrase is reusable. The next authorization must be copied
exactly from `-ShowRequiredApproval` at the final committed release HEAD.
