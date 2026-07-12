# Production security inventory — algorithm 1.1.1 — next steps

This document only records what comes **after** the owner runs
`scripts/production-security-inventory.ps1` manually. Nothing in this
document has been executed. No production connection has been made from
this session.

## What was fixed in 1.1.0

- `scripts/lib/SecurityContractInventory.ps1`'s table scope was missing 3 of
  migration 026's 15 actual GRANT targets (`site_visit_wps`,
  `site_visit_discrepancies`, `pending_invites`) — found by parsing the
  migration file directly (`Get-Migration026Targets`), not by trusting the
  1.0.0 summary. Now a regression test (`scripts/tests/security-inventory.tests.ps1`)
  re-parses 026 on every run and fails if the inventory scope ever falls
  behind the migration again.
- `tablePrivileges` / `sequencePrivileges` / `functionPrivileges` / `ownership`
  are ACL/ownership facts that `production-backup.ps1`'s `--no-owner
  --no-privileges` dump flags make structurally untrustworthy when read from
  a restored clone. 1.0.0 queried and compared them anyway, producing
  MATCH/MISMATCH-shaped output that was never actually comparable. 1.1.0
  marks these four categories `SOURCE_NOT_AVAILABLE_FROM_BACKUP` (zero
  elements) whenever the evidence source is `clone` — never MATCH, MISMATCH,
  or an empty-expected-state.
- A real bug in the inherited `Rows` helper (`return ,$p` from inside a
  piped `ForEach-Object` does not survive the pipeline boundary) silently
  flattened every multi-field catalog row into individual characters
  whenever exactly one row matched a category, and mis-shaped multi-row
  results too. This was present in 1.0.0 and likely means some fraction of
  the previously reported "854 vs 840 elements, 171 unexpected differences"
  was a parsing artifact, not necessarily a real security difference. Fixed
  by never crossing a pipeline boundary with a comma-protected value (see
  the code comments in `SecurityContractInventory.ps1` for the exact
  mechanism); regression-tested by 12+ closed-loop mock-query assertions.

## The owner-executed command

```powershell
.\scripts\production-security-inventory.ps1 `
  -BackupPath ".\backups\production\20260711T084934Z"
```

Expected success output:

```
PRODUCTION_SECURITY_INVENTORY: CREATED
Inventory algorithm: 1.1.0
Production fingerprint: PASS
Read-only transaction: PASS
Inventory scope: PASS
Migration 026 scope: PASS
Secrets scan: PASS
Checksum: PASS
Production changed: NO
Output: backups\production\20260711T084934Z\security-inventory-production.json
```

Report back in this shape:

```
Status: SUCCESS|FAIL
Inventory algorithm: 1.1.0
Output: backups/production/20260711T084934Z/security-inventory-production.json
Checksum: PASS|FAIL
Production changed: NO
```

## What happens only after that (not run in this session)

1. Regenerate the production **clone** inventory with algorithm 1.1.0
   (same common helper, `-EvidenceSource clone` — 4 ACL/ownership categories
   will correctly report `SOURCE_NOT_AVAILABLE_FROM_BACKUP`).
2. Regenerate the **local Supabase runtime** inventory with algorithm 1.1.0
   (`-EvidenceSource local` — full ACL/ownership available there).
3. Element-level comparison:
   - actual **production** vs **local runtime**, for ACL, ownership, role
     attributes, and memberships (the categories the clone structurally
     cannot provide).
   - actual **production** vs **clone**, for every clone-verifiable
     category only (RLS, policies, functions, memberships, role attributes).
4. Full migration 026 grant verification against the **real** production
   catalog (the clone could only prove the GRANT statements executed
   without error, never that production's resulting privilege set matches
   what the migration intends).
5. Runtime role-test evidence (`migration-security-closure.json`'s
   anon/authenticated/cross-scope results) may only be treated as
   transferable to production once step 3 shows **zero unexpected**
   application-security differences. Do not extend the allowlist of
   "allowed environment differences" just to force a PASS — an allowlist
   addition needs its own justification, the same way the 4 ACL/ownership
   categories' exclusion was justified here by the `--no-privileges` dump
   flag, not asserted.

Until all of the above happens, `overallStatus` for the full production
security certification must remain `CONDITIONAL`, not `PASS`.
