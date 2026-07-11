# RLS Runtime Certification — Sprint 4.5, Stage 8

Runtime evidence only — this document supersedes the read-only claim
implicit in the pre-existing static tests (`rlsCompanyRoles.test.mjs`,
`rlsMultiTenant.test.mjs`, `rlsProjectsSelfReferenceFix.test.mjs`, which
regex-match migration SQL text and prove nothing about actual database
behavior — see `docs/CERTIFICATION_ENVIRONMENT.md` for that caveat).
Every row below is a real HTTP call through PostgREST from a real
`signInWithPassword` session (or the anon client with no session), not a
service-role bypass and not a static read.

Script: `weekly-tracker/scripts/certification/certifyRls.mjs`. Run via
`npm run test:rls`. **28/28 checks passed.**

## DEFECT-03 — found and fixed during this stage

The first run of this stage failed 5 SELECT checks outright with
`42501: permission denied for table projects`. Root cause: the fresh-path
migration chain (000-025) defines RLS *policies* on every table but never
`GRANT`s the underlying `SELECT/INSERT/UPDATE/DELETE` table privileges to
the `authenticated` role — Postgres checks base grants before RLS is even
evaluated, so every direct query failed regardless of policy correctness.
Production has never shown this because the real Supabase project already
has these grants from its own creation-time defaults, never captured as a
migration in this repo. Fixed via a new append-only migration:
`src/migrations/026_grant_authenticated_table_privileges.sql` — see that
file's header and `docs/DATABASE_CERTIFICATION_REPORT.md` for full detail.
All results below are from the re-run **after** this fix.

## Role/resource matrix (own-company, Project A)

| Role/context | Resource | Action | Expected | Actual | Status |
|---|---|---|---|---|---|
| Admin A | projects (own company) | SELECT | visible | visible | PASS |
| PM A (assigned) | projects | SELECT | visible | visible | PASS |
| Contractor A (assigned) | projects | SELECT | visible | visible | PASS |
| Contractor A (unassigned) | projects | SELECT | not visible | not visible | PASS |
| Viewer A | projects | SELECT | visible | visible | PASS |
| Admin A | contractor_reports | direct INSERT | allowed (`can_write_project` — README documents only contractor direct-writes are blocked) | allowed | PASS |
| PM A | contractor_reports | direct INSERT | allowed | allowed | PASS |
| Contractor A (assigned) | contractor_reports | direct INSERT | denied (RPC is the approved path for contractors) | denied | PASS |
| Viewer A | contractor_reports | direct INSERT | denied | denied | PASS |
| Admin A | projects | UPDATE | allowed | allowed | PASS |
| Viewer A | projects | UPDATE | denied (RLS silently filters the row; no effect) | no effect, value unchanged | PASS |

## Direct API — other tenant (Company B Admin against Project A / Company A)

| Resource | Action | Expected | Actual | Status |
|---|---|---|---|---|
| projects (Project A) | SELECT | Deny (no row) | 0 rows | PASS |
| contractor_reports (Project A) | SELECT | Deny | 0 rows | PASS |
| site_visits (Project A) | SELECT | Deny | 0 rows | PASS |
| progress_history (Project A) | SELECT | Deny | 0 rows | PASS |
| contractor_reports (Project A) | INSERT | Deny | denied, 0 rows created (ground truth) | PASS |
| projects (Project A) | UPDATE | Deny | no effect, value unchanged | PASS |
| projects (Project A) | DELETE | Deny | 0 rows affected, row still exists | PASS |
| `submit_site_visit_atomic` (Project A) | RPC | Deny | denied, 0 rows created | PASS |

## Unauthenticated (anon key, no session)

| Resource | Action | Expected | Actual | Status |
|---|---|---|---|---|
| projects | SELECT | Deny | 0 rows | PASS |
| contractor_reports | INSERT | Deny | denied | PASS |
| `submit_contractor_report_atomic` | RPC | Deny | denied at the grant layer (`permission denied for function`) — `authenticated`-only EXECUTE grant from 025 confirmed working; anon never reaches the function's own `auth.uid()` check | PASS |
| write_command_requests | SELECT | Deny | 0 rows / denied (RLS + explicit `REVOKE ALL` from 025) | PASS |

## Service-role secret scan

**Windows defect (found and fixed during a Sprint 4.5 continuation pass):**
the original implementation shelled out to
`grep -rl "service_role" src/ --include=*.js --include=*.jsx || true`.
`grep` and the `|| true` shell fallback are Unix-only — `execSync`'s
default shell on Windows (`cmd.exe`) has neither, so this check failed
with a shell/command error on every Windows run of `npm run test:rls`,
independent of whether the codebase actually had an offending file. This
is a harness/tooling defect, not a security-policy defect: it never
produced a false PASS, only a hard failure that blocked the rest of the
suite from reporting.

**Fix:** replaced the shell-out with a pure Node.js recursive scanner,
`scripts/certification/scanSource.mjs` (`findFilesContaining(rootDir,
pattern, options)`), which walks `src/` using `node:fs`/`node:path` only —
no shell, no platform-specific command. It preserves the original security
intent exactly: scans `.js`/`.jsx`/`.ts`/`.tsx` files, excludes
`node_modules`, `.git`, `dist`, `build`, `dist-ssr`, `migrations/` (SQL
comments legitimately discuss `service_role`), `tests/`/`__tests__/` (test
fixtures legitimately reference the string), and `certification/` (this
harness's own comments/docs reference it). Covered by 16 targeted unit
tests in `scripts/certification/scanSource.test.mjs` (real offenders
found per extension, each excluded directory verified absent, custom
`extensions`/`excludeDirs` overrides honored, no crash on a nonexistent
directory) — run via `node scripts/certification/scanSource.test.mjs`,
16/16 passing.

`certifyRls.mjs` now calls `findFilesContaining(srcRoot, /service_role/)`
directly. Result: **0 files** — no service-role key or reference reaches
application source that ships to the browser, confirmed identically on
Windows and cross-platform. (`npm run check:architecture` also
independently asserts this via its own static check — both agree.)

## Verdict

**PASS**, after fixing DEFECT-03. Role matrix, cross-tenant isolation, RPC
authorization, and unauthenticated denial are all confirmed by real
authenticated HTTP calls against a live database — not inferred from
reading policy SQL.
