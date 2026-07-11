# Sprint 5 Completion Report — Database and Security Certification Gate

Date: 2026-07-10. Environment: local Supabase CLI stack (Docker), never
production — see `docs/CERTIFICATION_ENVIRONMENT.md`.

**Scope of this report:** this document covers only the DB/security
certification gate that `docs/SPRINT_5_FINALIZATION_AUDIT.md` identifies
as the required precondition before any UI/mobile/accessibility/lint
finalization work proceeds ("Proceed in required order: isolated
clean-install certification → append-only migration 027 → DB
recertification. Do not begin global UI cleanup until the DB gate has a
factual result."). It is **not** a report on Sprint 5's broader
UI/workflow/accessibility deliverables (draft recovery, mobile navigation,
shared modal unification, etc.) — those are tracked separately in
`docs/SPRINT_5_FINALIZATION_AUDIT.md` and were not touched, re-verified,
or claimed complete by this pass. Per explicit instruction, mobile/
accessibility/lint phases were not started in this pass.

## What this pass did

Starting point: a parallel/earlier continuation of Sprint 4.5 had already
added migration `027_contractor_report_wp_validation.sql` (closing
CR-07/CR-08) and updated `certifyContractorReport.mjs` and
`resetAndDeploy.mjs`'s fresh-path list accordingly, but reported that
`npm run test:rls` failed on Windows and that `npm run test:certification`
did not visibly continue past `cert:reset`. This pass:

1. Audited `certifyRls.mjs`'s service-role secret scan and confirmed the
   Windows failure cause: it shelled out to `grep -rl "service_role" src/
   --include=*.js --include=*.jsx || true`, a Unix-only construct (`grep`
   and the `|| true` shell fallback do not exist under `cmd.exe`, which is
   what Node's `execSync` uses by default on Windows).
2. Replaced it with a pure Node.js recursive scanner,
   `scripts/certification/scanSource.mjs`, preserving the original
   security intent exactly (same extensions scanned, same directories
   excluded) with no shell dependency.
3. Added 16 targeted unit tests for the scanner
   (`scripts/certification/scanSource.test.mjs`), all passing.
4. Re-ran `npm run test:rls`: **28/28 passed, exit code 0.**
5. Investigated the `test:certification` orchestration. Could not
   reproduce the exact reported symptom on a fresh run (the full pipeline
   completed end-to-end on the first attempt), but found a genuine,
   confirmable inconsistency: `resetAndDeploy.mjs` was the only script in
   the harness with no `try`/`catch` around its `main()`, so an uncaught
   exception (Docker not running, a real SQL error in a migration file)
   would print a raw Node stack trace with no indication of which of its
   two steps failed — easy to misread as "the script did nothing" in a
   long terminal scroll. Fixed with the same clear-failure-messaging
   pattern already used by every other harness script; happy path
   unaffected (verified), failure path verified via a deliberate,
   safely-reversed simulation (temporarily renamed migration 027, restored
   afterward with a byte-identical diff check).
6. Added the missing positive own-tenant Storage delete scenario (ST-04b)
   to `certifyStorage.mjs`: authorized own-tenant upload → confirmed
   present → cross-tenant delete attempt has no effect → anonymous delete
   attempt has no effect → own-tenant delete succeeds → authorized lookup
   confirms absence → direct download of the deleted object fails.
7. Re-ran the full aggregate gate.

No migration file (000-027), RPC, RLS policy, or Storage policy was
modified in this pass — every fix was confined to the certification test
harness itself, per the explicit constraint that only a separately
reproduced runtime defect would justify touching product SQL, and none
was found.

## Results

| Stage | Result |
|---|---|
| `cert:reset` (18 fresh-path migrations: `000, 010, 012-027`) | PASS |
| `test:db` — Contractor Report RPC (CR-01..CR-10) | 50/50 PASS |
| `test:db` — PM Site Visit RPC (SV-01..SV-12) | 50/50 PASS |
| `test:db` — Progress history (Stage 7) | 20/20 PASS |
| `test:rls` (Stage 8, incl. fixed service-role scan) | 28/28 PASS |
| `test:storage` (Stage 9, ST-01..ST-10 incl. new ST-04b) | 22/22 PASS |
| `npm run test:certification` (full aggregate: `cert:reset` → `test:db` → `test:rls` → `test:storage`, sequential) | **exit code 0** |

Main project suite, re-confirmed unaffected by this pass's changes:
`npm test` 76 suites / 1822 checks passing, `npm run lint` 0 errors / 26
warnings, `npm run typecheck` clean, `npm run check:architecture` 25/25,
`npm run build` succeeds.

## Gate status

**DATABASE AND SECURITY CERTIFICATION: PASS.** The aggregate gate
(`npm run test:certification`) runs `cert:reset → test:db → test:rls →
test:storage` sequentially and exits 0, on Windows, without any
shell-specific dependency remaining in the harness. This satisfies the
precondition `docs/SPRINT_5_FINALIZATION_AUDIT.md` set for proceeding to
UI finalization work.

Two items remain explicitly out of scope for this label (unchanged from
`docs/DEPLOYMENT_READINESS_GATE.md`, not security gaps):
- Automated Storage orphan reconciliation (capability confirmed via ST-10;
  no automated job exists or was built).
- Audit-trigger firing confirmed present via `pg_trigger`, not
  independently re-fired and row-by-row inspected in this pass.

## Explicitly not covered by this report

Per the user's constraint ("не переходи к mobile/accessibility/lint
phases, пока aggregate DB/security certification не завершится PASS"),
this pass did not start, re-verify, or claim completion of: mobile
navigation/field-workflow UI, accessibility remediation, shared modal
focus-lifecycle unification, or ESLint rule cleanup. Those remain tracked
in `docs/SPRINT_5_FINALIZATION_AUDIT.md`'s own inventory and are unblocked
to proceed now that the DB/security gate above is PASS — but proceeding
on them is a separate, subsequent task.
