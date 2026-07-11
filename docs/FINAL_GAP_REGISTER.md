# OpenDay Final Gap Register

Audit date: 2026-07-11. Branch: `main`. The working tree contains the accumulated Sprint 5 implementation and is intentionally not treated as a clean-checkout proof.

## Evidence classification

| Claim | Current evidence | Status | Required closure |
| --- | --- | --- | --- |
| Canonical Core and architecture boundary | 25/25 architecture checks in the preceding run; source guard inspected | TEST VERIFIED | Repeat from final clean environment |
| Contractor/PM reducer, draft and retry behavior | 76 suites / 1822 checks in preceding run | TEST VERIFIED | Live production-build E2E |
| Migration 027 duplicate/out-of-scope rejection | Migration and required assertions inspected; unit migration contract passes | TEST VERIFIED, runtime pending | Fresh local DB certification |
| CR/RLS/Storage runtime certification | Historical reports exist, but not reproduced after the current final diff | PARTIAL | Fresh reset and full certification |
| Shared Modal semantics | Source has dialog role, focus containment/return, Escape and scroll lock | CODE-READING ONLY | Automated edge matrix and production-preview run |
| Project editor dirty normalization | Implementation exists; complete value matrix not yet evidenced | PARTIAL | Targeted automated tests |
| Repository-wide user error sanitization | Several surfaces fixed, but raw messages remain in AdminUsers/Auth paths | PARTIAL | Sweep, shared sanitization and tests |
| Loading/empty/error/stale matrix | Field screens and some read screens have states; full nine-screen matrix absent | PARTIAL | Matrix, fixes and automated scenarios |
| ESLint 0/0 | Previous report claims 0/0; 20 inline suppressions currently exist | TEST VERIFIED for output, governance incomplete | Registry plus ratchet guard |
| Runtime performance | Bundle measured; runtime request/render evidence incomplete | PARTIAL | Production-preview measurement |
| Storage orphan safety | Guarded scripts and historical local evidence exist | TEST VERIFIED, policy update needed | Explicit 7/14/30-day policy and scenario tests |
| Mobile/accessibility | Existing E2E specs and historical report; final viewport/landscape matrix not reproduced | PARTIAL | Production-preview Playwright matrix |
| Local Auth reproducibility | Certification fixtures create roles; fresh-reset login not reproduced in this audit | PARTIAL | Fresh reset and live login by role |
| Clean install | Two isolated `npm ci` runs previously passed | TEST VERIFIED | Final clean checkout/worktree gate after all changes |
| Staging | No explicit staging project, credentials, linked ref, or deployment config discovered | NOT VERIFIED | External staging access; Phase 9 must remain blocked |
| Production | Explicitly out of scope and untouched by this task | NOT APPLICABLE | Never connect or deploy |

## Phase 2–7 gaps

- Modal nested/dirty edge cases and ProjectEditor normalized diff tests.
- Repository-wide sanitization of user-visible backend/Auth/Storage errors.
- Complete loading, empty, error and stale-state matrix.
- A suppression registry that is mechanically checked against source.
- Runtime request/render measurements on a production preview.
- Storage retention policy defaults differentiated for local, staging and production.
- Final mobile viewport, landscape, focus and overflow evidence.
- Fresh-reset Auth users and role logins without Studio intervention.

## Phase 8 inputs

Phase 8 requires a clean reproducible copy, unchanged lockfile, `npm ci`, fresh local Supabase, all static/DB gates, production preview, full live E2E, false-pass protections and repeatability evidence. Historical reports are supporting context, not substitutes.

## Phase 9 inputs

No clearly scoped staging environment is present. No cloud discovery or deployment may use `.env.local`, production references, guessed project refs, or credentials. Unless explicit staging access is independently available, Phase 9 status is `BLOCKED_BY_EXTERNAL_STAGING_ACCESS` while runbooks and deployment package may still be prepared.

## Claims prohibited by current evidence

- Production certification or production readiness.
- Full WCAG compliance.
- Complete runtime performance certification before measurements run.
- Staging certification without an explicit staging environment and live results.
- Database/RLS/Storage PASS based solely on old reports after migration 027.
