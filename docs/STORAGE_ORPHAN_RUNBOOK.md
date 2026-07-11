# Storage Orphan Operational Runbook

Storage runtime security is already certified (own-tenant delete, cross-
tenant/anon delete denial — see `docs/STORAGE_RUNTIME_CERTIFICATION.md`).
This document covers a separate, operational concern: objects that exist
in the private `site-photos` bucket but are no longer referenced by any
database row — e.g. a user photographed evidence, the upload succeeded,
and then the browser closed/crashed/lost connection before the report was
ever submitted. Object storage and Postgres are two independent systems
with no cross-system transaction, so this class of orphan is inherent to
the architecture (documented in Storage certification's ST-08/09 finding)
— it is not a bug this Sprint introduced or is expected to eliminate.

No automated reconciliation job exists, and this task does not build one
— per the task's own scope, this is a **read-only identification tool +
a heavily-guarded manual cleanup command**, not an automatic sweep.

## 1. What counts as an orphan candidate

An object is a candidate if **all** of the following hold:

1. It exists in the `site-photos` bucket.
2. Its path is **not** present in any of:
   `contractor_reports.photo_urls`, `site_visits.photos`,
   `site_visits.photo_urls` (all three checked — the live schema was read
   directly, not assumed; `site_visit_discrepancies` has no photo/evidence
   column at all, confirmed the same way).
3. It is older than the age threshold (default 7 days — see §2).
4. Its path parses under the `{project_id}/{yyyy-mm}/{uuid}_{timestamp}.ext`
   convention (017's header) — anything that *doesn't* parse is flagged
   separately for manual review rather than silently treated as a normal
   orphan, since an unexpected path shape deserves a human look before
   any judgment about it.

A **fresh** upload (younger than the threshold) is never a candidate,
even if currently unreferenced — that's just the normal window between
"upload finished" and "report submitted," not an orphan.

## 2. Retention policy and why local defaults to 7 days

Environment policy:

- local certification default: 7 days;
- staging default: 14 days (pass `--min-age-days=14` explicitly);
- production recommended default: 30 days and a separate manual approval outside this task.

The scripts intentionally do not infer an environment or silently select a
different threshold. Operators must pass the staging/production value
explicitly; production cleanup was not performed in this work.

Not arbitrary — matches this app's own existing staleness convention:
`components/weekly/MissingReportsModal.jsx` already treats "no report in
7 days" as the missing/overdue threshold elsewhere in the product.
Reasoning for reuse here: autosave/draft-recovery
(`docs/MOBILE_FIELD_USABILITY.md`) is a 500ms local-storage debounce —
irrelevant to this threshold, since it's not what determines how long an
uploaded-but-unsubmitted photo might legitimately sit around. What
matters is how long a real field user might leave an in-progress report
before returning to finish it — a multi-day interruption (sick day, site
access issue, waiting on other stakeholders) is plausible for a
real-world construction workflow; an object still unreferenced after a
full week is not a plausible "still in progress" case. Override with
`--min-age-days=N` if a specific investigation needs a different window
— the default is a safety floor, not a hard rule.

## 3. Identifying candidates (read-only)

`scripts/storage/findOrphanCandidates.mjs` — **never deletes anything**,
regardless of flags.

### Required environment (no defaults, no fallback file)

```
ORPHAN_SUPABASE_URL=<url>
ORPHAN_SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
ORPHAN_DB_URL=<postgres-connection-string>
```

This is deliberate, not an oversight: `weekly-tracker/.env.local` points
at the live `openday.fit` production project (see
`docs/CERTIFICATION_ENVIRONMENT.md`) — a script in this same Sprint 5
session accidentally wrote to production because an earlier, unrelated
script silently read that file (see
`docs/INCIDENT_2026-07-10_PRODUCTION_SIDE_EFFECT.md`). Neither script in
this runbook reads `.env.local` or any `VITE_` variable, ever. You must
supply the target explicitly, every run — there is no "it defaults to
local" convenience here, on purpose.

`ORPHAN_DB_URL` is required in addition to the Storage URL/key because
`service_role` has `BYPASSRLS` in this schema but was never granted base
`SELECT` on `contractor_reports`/`site_visits` (only `authenticated` was,
in migration 026) — confirmed live while building this tool, not assumed.
PostgREST (what the Storage/DB REST client uses) enforces the grant
regardless of `BYPASSRLS`, so the reference-check half of this tool talks
to Postgres directly via `psql`, the same pattern
`scripts/certification/lib.mjs`'s `psql()` helper already uses for
ground-truth verification.

### Usage

```bash
# All projects, default 7-day threshold, human-readable table
ORPHAN_SUPABASE_URL=... ORPHAN_SUPABASE_SERVICE_ROLE_KEY=... ORPHAN_DB_URL=... \
  node scripts/storage/findOrphanCandidates.mjs

# Scope to one project, custom threshold
... node scripts/storage/findOrphanCandidates.mjs --project=900001 --min-age-days=3

# Machine-readable, for piping into the review file used by deleteOrphans.mjs
... node scripts/storage/findOrphanCandidates.mjs --json
```

Verified live against the local stack (2026-07-10/11): correctly
identified 3 real leftover objects from earlier Sprint 4.5 certification
runs at `--min-age-days=0`; correctly returned zero candidates at the
default 7-day threshold (all 3 were only hours old); correctly flagged
one non-conforming filename (`...-dup.png`, from a certification
duplicate-upload test) for manual review instead of silently treating it
as a normal orphan; `--project=` filtering and `--json` output both
verified.

## 4. Cleanup (guarded, human-in-the-loop, never automatic)

`scripts/storage/deleteOrphans.mjs` — dry-run by default; requires
`--execute` to actually delete anything.

**Deliberately does not** re-run the detection logic and delete whatever
it finds — that would remove the human review step. Instead:

1. Run `findOrphanCandidates.mjs`, review the output yourself.
2. Write the exact paths you've decided are safe to delete into a plain
   text file, one per line (`#`-prefixed lines and blank lines are
   ignored — copy/paste/edit the tool's own output directly).
3. Run `deleteOrphans.mjs` pointing at that file. It **re-validates every
   path immediately before deleting** — re-checks it's still
   unreferenced, still exists, still older than the threshold — in case
   anything changed between step 1 and now (e.g. the user came back and
   submitted the report in the meantime). Anything that no longer
   qualifies is skipped, not deleted, with the reason recorded.

### Required flags (every run — no wildcard-root deletion is possible)

```
--project=<id>       every path in --paths-file must start with "<id>/" —
                      a path that doesn't is a hard refusal, not a skip
--paths-file=<path>  the reviewed list from step 2
--reason="<text>"    free-text note, written into the audit record
```

### Usage

```bash
# Dry-run — always safe, shows exactly what would happen, writes an audit record either way
ORPHAN_SUPABASE_URL=... ORPHAN_SUPABASE_SERVICE_ROLE_KEY=... ORPHAN_DB_URL=... \
  node scripts/storage/deleteOrphans.mjs --project=900001 \
    --paths-file=./orphans-to-delete.txt --reason="reviewed 2026-07-11, confirmed abandoned drafts"

# Actually delete, after reviewing the dry-run output
... node scripts/storage/deleteOrphans.mjs --project=900001 \
    --paths-file=./orphans-to-delete.txt --reason="..." --execute
```

Every run — dry-run or `--execute` — writes a timestamped JSON audit
record to `scripts/storage/audit-log/` (gitignored — operational output,
not source) containing: timestamp, project, reason, mode, threshold used,
the full candidate list, what was actually deleted, and what was skipped
and why.

Verified live end-to-end against the local stack: dry-run correctly
listed 2 real objects without deleting them; `--execute` correctly
deleted exactly those 2 (confirmed via a follow-up `findOrphanCandidates`
scan showing the bucket count drop from 3 to 1); the audit record for
both runs was written and is well-formed.

## 5. What this deliberately does NOT do

- **No automated schedule/cron job.** Every run is a deliberate, manual,
  human-initiated action. Building an automated sweep was explicitly out
  of scope for this task.
- **No production credentials anywhere in this repo.** Both scripts
  refuse to run without the 3 `ORPHAN_*` env vars supplied fresh on the
  command line; nothing is cached or defaulted.
- **No bulk/wildcard delete.** `--project` is mandatory on the cleanup
  script; there is no "delete all orphans across all projects" mode.
- **No trusting a stale list.** `deleteOrphans.mjs` re-checks every path
  against current DB/Storage state immediately before deleting, not just
  at whatever moment `findOrphanCandidates.mjs` was originally run.

## 6. Known limitation

The re-check in `deleteOrphans.mjs` closes the most obvious race (report
submitted between detection and cleanup) but is not a database-level
lock — a submission landing in the few hundred milliseconds between the
re-check read and the actual `remove()` call is a theoretical residual
race, not eliminated. Given this tool is meant for periodic, deliberate,
human-reviewed cleanup (not a hot path), this residual window was judged
an acceptable trade-off rather than adding real distributed-locking
complexity for a manual, infrequent operation.
