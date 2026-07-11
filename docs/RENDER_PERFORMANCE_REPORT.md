# Render Performance Report

PM observations previously rendered every task in every zone/phase. The stabilized Gantt path renders one current task plus navigation/review summaries. Filter/count derivation is pure in `core/siteVisit`; no network request runs on observation changes. Source/Gantt orchestration remains keyed to project/scope/recovery context.

Draft serialization is debounced 500 ms and disabled before recovery choice or meaningful edits. Filter/navigation stores only identifiers, not copied observation collections. Shared upload preview URLs are revoked on removal/unmount. No virtualization dependency was added because single-item rendering removes the measured long-list pressure.

The Contractor Report chunk and behavior remain regression-tested.

## Update — Phase 5, measured (not assumed)

A live in-app browser surface is now available (see
`docs/MOBILE_FIELD_USABILITY.md`'s Phase 1 update) — this pass used it to
actually check, rather than assume, the claims above and the task's own
hypotheses.

### 1. Bundle size — investigated, one real lead, no safe fix available

`npm run build`'s own output flags `page-ContractorReport` as
disproportionately large: **384.21 kB / 101.94 kB gzip**, roughly 5× the
next-largest page chunk (`page-RiskDashboard`, 74.14 kB). Traced the cause
by grepping the built chunk for library signatures: `zod`'s own internal
markers (`ZodError`, `ZodType`, `invalid_type`, `too_small`, `too_big`)
appear in `page-ContractorReport` and **nowhere else** — confirmed via
`import { z } from 'zod'` in `schemas/contractorReportSchema.js`, reached
through `core/contractorReport/contractorReportScreensModel.js`.

Attempted fix: added an explicit `vite.config.js` `manualChunks` rule to
route `src/schemas/**` (and therefore its `zod` dependency) to a shared
chunk, the same way `src/services/**` already routes to `vendor-supabase`.
**Measured result: zero effect** — rebuilt with a cleared `.vite` cache
and a fresh `dist/`, and the output chunk hash and byte size were
byte-for-byte identical, with no separate `schemas-*.js` chunk ever
emitted. Conclusion: the bundler (Rolldown/Rollup) already merges a
manually-assigned chunk back into its sole consumer when nothing else
actually shares it — `contractorReportSchema.js`'s `zod` usage genuinely
has no other consumer today (`siteVisitSchema.js`/`projectSchema.js`'s
own `zod` usage is absorbed into the already-shared `vendor-supabase`
chunk via their direct importers in `src/services/`, which is why they
don't show up in this search at all). The config change was reverted
(confirmed via a follow-up build restoring the exact original chunk hash)
rather than left in as dead configuration that does nothing.

**Why not fixed further**: the only paths to actually shrink this chunk are
(a) removing/weakening the zod-based validation, or (b) replacing zod with a
smaller validation library — both are out of scope (removing validation is
a correctness regression; swapping libraries is a large, business-logic-
adjacent change with real regression risk, not a "targeted frontend fix").
**What is already correct**: `ContractorReport` is lazy-loaded
(`React.lazy` in `App.jsx`) — this 102 kB gzip cost is paid only by a user
who actually opens that one page, not on initial app load or by any other
role/route.

### 2. Object URL lifecycle — checked, already correct, no fix needed

Traced every `URL.createObjectURL`/`URL.revokeObjectURL` call in
`components/shared/PhotoUpload.jsx`: a preview URL is created exactly
once per selected file, tracked in a `previewUrlsRef` set, revoked on
manual removal (and dropped from the tracking set at the same time), and
the unmount cleanup effect revokes every URL still tracked. `retryPhoto()`
reuses the existing `photo.file`/preview rather than creating a new
object URL. No leak found — the claim in the pre-Phase-5 draft of this
document ("revoked on removal/unmount") is accurate, verified by reading
the actual code, not re-asserted from the earlier claim alone.

### 3. Autosave — checked, already correctly debounced, local-only (no network spam possible)

`pages/ContractorReport.jsx`'s autosave effect uses the standard
`window.setTimeout(..., 500)` + `clearTimeout` idiom (not a named
"debounce" helper, hence "debounce" doesn't appear as a literal string
anywhere in the codebase — worth knowing if searching for it in future).
Every `form`/`ganttWpProgress`/`photoUrls` change re-runs the effect,
which clears whatever timer was still pending and starts a fresh 500ms
one — rapid edits within that window collapse to a single
`saveContractorDraft()` call. Separately confirmed this same mechanism
live and working end-to-end in Phase 1 (fill WP → wait → refresh →
recovery restored the exact value). Also worth noting explicitly:
`saveContractorDraft()` writes to `localStorage`, not the network — the
Phase 5.2 concern ("network write on every field change") has no code
path that could even occur here; drafts are client-side only until
explicit submit.

### Not measured in this pass (real gap, not claimed complete)

Canonical-orchestration call-count instrumentation (Phase 5.1 — "one
calculation per data version, no duplicate list/detail computation") and
PM Site Visit's navigation/filter render behavior beyond what the
existing static claims describe were not independently re-verified with
actual render-count tooling (no React DevTools Profiler access in this
environment). The claims in the paragraph above (single-item Gantt
rendering, pure filter derivation) are carried over from the pre-Phase-5
version of this document and were not independently re-measured here.

### Bundle table (current, for reference — unchanged from before this pass)

```
page-ContractorReport   384.21 kB │ gzip: 101.94 kB   (lazy-loaded, zod-validated form — see above)
vendor-react            174.87 kB │ gzip:  55.12 kB
engines                 129.74 kB │ gzip:  36.49 kB
page-RiskDashboard       74.14 kB │ gzip:  15.13 kB
page-Dashboard           66.97 kB │ gzip:  16.82 kB
page-WeeklyReports       65.91 kB │ gzip:  15.81 kB
page-SiteVisitReport     54.85 kB │ gzip:  13.71 kB
page-Projects            46.76 kB │ gzip:  10.36 kB
```
