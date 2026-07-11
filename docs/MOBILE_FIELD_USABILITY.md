# Mobile Field Usability

Contractor Report preserves the existing field-mode design and sticky submit action. Recovery and retry actions stack to full-width 44 px targets below 560 px; declaration and photo-removal targets are keyboard/touch accessible; long labels wrap rather than forcing page overflow.

| Viewport | Static overflow audit | Actions | WP usability | Live verification |
| ---: | --- | --- | --- | --- |
| 320×568 | no expected page-level overflow; inner data wrappers scroll | sticky, recovery stacked | full list remains long | unavailable |
| 360×800 | no expected page-level overflow | accessible | usable | unavailable |
| 390×844 | target CSS/layout present | accessible | usable | unavailable |
| 412×915 | no expected page-level overflow | accessible | usable | unavailable |
| 768×1024 | two-column helpers active | accessible | usable | unavailable |

The in-app browser surface was unavailable during that pass, so authenticated screenshot/keyboard viewport certification was not claimed at the time.

## Update — 2026-07-10: live authenticated verification, primary viewport (390×844)

A later Sprint 5 pass confirmed Docker/local Supabase and the frontend
dev server were both actually reachable, and ran real Playwright specs
(`tests/e2e/mobile-field-workflows.spec.js`) through real
`signInWithPassword` sessions against **local Supabase only** — see
`docs/INCIDENT_2026-07-10_PRODUCTION_SIDE_EFFECT.md` for the safety
process this followed after an initial setup mistake pointed a seed
script at production (no test traffic reached production; only
`*.cert.local` fixture accounts were used for the tests below).

| Workflow | Viewport | Scenario | Result | Evidence |
|---|---:|---|---|---|
| Contractor Report | 390×844 | login (contractor-a-assigned) → open assigned project → form renders, no horizontal overflow | **PASS** | `test-results/mobile-390x844-contractor-report.png` |
| Contractor Report | 390×844 | expand a scoped WP phase → set status "In Progress" (40% carried from prior demo data) → autosave (500ms) → refresh → recovery restores reporting date, expanded phase, and WP status | **PASS** | `test-results/mobile-390x844-contractor-recovery.png` |
| PM Site Visit | 390×844 | login (pm-a-assigned) → open project from `/site-visit-select` → visit form renders, no horizontal overflow | **PASS** (after a fix — see below) | `test-results/mobile-390x844-site-visit.png` |

### Defect found and fixed during this pass

**Finding**: at 390×844, the desktop sidebar (`components/Sidebar.jsx`,
fixed 240px/200px column, no breakpoint below 900px) consumed roughly
half the viewport width, and `pages/SiteVisitSelect.jsx`'s fixed
4-column inline-styled grid (`2fr 1.5fr 1fr auto`) did not collapse in
the remaining ~200px — text overlapped illegibly (store code overlapping
the opening countdown, status badge overlapping the project name) and
the "Start Visit" action was clipped off-screen. Confirmed live via
screenshot, not inferred from source reading alone.

**Fix**: `components/Layout.jsx` and `components/Sidebar.jsx` now support
an off-canvas drawer mode below 640px (hamburger toggle, Escape-to-close,
backdrop, closes on nav-link click) — the sidebar stops permanently
occupying viewport width on mobile. `pages/SiteVisitSelect.jsx`'s row/
header grid moved from inline styles to CSS classes
(`.site-visit-select-row`/`-header`/`-cta`) specifically so a `@media
(max-width: 480px)` rule could actually override it (inline styles
cannot be overridden by a stylesheet media query) — rows now stack as
single-column cards with a full-width, ≥44px "Start Visit" action below
480px. Also corrected a nested-interactive-control issue in the same
component (a real `<button>` was nested inside a `role="button"` row;
the row itself is now the sole interactive element).

Re-verified live after the fix: all PASS rows above are from the
**post-fix** run. `npm test` (76/76, 1822/1822), lint (0 errors/26
warnings, unchanged), typecheck, `check:architecture` (25/25), and build
all re-confirmed clean after this change.

### Second defect found and fixed: phase-header toggle had no keyboard support

While wiring up the autosave/recovery scenario, found that
`components/contractor/GanttWPSection.jsx`'s `PhaseSection` header (the
collapsible "DEMOLITION / MEP / FINISHES" row) was a bare `<div
onClick=...>` — no `role`, no `tabIndex`, no `onKeyDown`, meaning it was
completely unreachable and inoperable via keyboard, a real accessibility
gap on the Contractor Report's primary interaction surface. Fixed:
`role="button"`, `tabIndex={0}`, `aria-expanded`, and `onKeyDown` for
Enter/Space, plus a `data-testid` for stable test targeting. This overlaps
with Phase 2/7's mandate but was fixed here since it was found blocking
this exact scripted scenario, not deferred to "later."

### Secondary viewports — open/no-overflow, all PASS

| Viewport | Contractor Report | PM Site Visit |
|---|---|---|
| 320×568 | PASS | PASS |
| 360×800 | PASS | PASS |
| 412×915 | PASS | PASS |

Lighter-weight than the 390×844 release gate (open + no-overflow only, not
the full autosave/recovery script) — the task's own instructions scope the
full release-gate requirement to 390×844 specifically. Screenshots:
`test-results/mobile-{width}x{height}-{contractor-report,site-visit}.png`.

### Update — Phase 7: deeper PM scenario + Contractor submit, both live and PASS

`tests/e2e/sitevisit-deep-scenario.spec.js` (PM Site Visit, 390×844):
navigation (Previous/Next), all 4 filters (`all`/`incomplete`/`completed`/
`discrepant`, each verified via real `aria-pressed` state changes), a
**real discrepancy created live** (clicking the "Completed" status button
on a WP diverging from the GC's own claimed status/progress correctly
surfaced the `pm-task-discrepancy` badge), autosave → refresh → recovery
correctly restored the active filter (`discrepant`, confirmed via
`aria-pressed="true"` after reload), review summary section visible,
submit button reached an enabled state. **PASS.**

`tests/e2e/contractor-report-submit.spec.js` (Contractor Report, 390×844):
filled reporting date, expanded a WP phase, set status, set schedule
status, **uploaded a real photo** (`setInputFiles` against the hidden
file input, waited for the async compress+upload to actually finish),
checked the declaration control (a custom `role="checkbox"`, not a real
`<input>` — found and corrected mid-pass, see below), submitted, and
confirmed a genuine "Report submitted" success screen (screenshot:
`test-results/contractor-submit-outcome.png`) with the local draft key
removed from `localStorage` afterward. **PASS.**

**Two real mistakes caught and fixed while writing these specs, not
shipped:** (1) an initial success-detection check matched the string
"submitted" against pre-existing page text ("Last submitted report: 02
Feb 2099") that was present *before* the real submit even happened — the
actual first run's screenshot showed a validation-error banner
("At least one photo is required," "Declaration confirmation is
required"), which the loose regex masked as a false "success." Fixed by
asserting the specific validation-error banner is gone, not that some
success-shaped text merely exists somewhere on the page. (2) a
`pm-task-row` visibility check raced the async Gantt-tasks fetch (same
class of race already fixed in `mobile-field-workflows.spec.js`) — an
immediate `.count()` intermittently returned 0 before the fetch resolved,
causing a false skip; fixed with a proper `waitFor`, then re-run 3× to
confirm the fix, not just once.

### Still open for a follow-up pass

- The keyboard/accessibility smoke pass (Tab/Shift+Tab/Enter/Space/Escape,
  focus visibility, validation-error focus, success announcement) called
  for in the task's §1.3 is covered separately in
  `docs/ACCESSIBILITY_AUDIT.md`'s final-pass update, not duplicated here.
- Idempotent retry/replay specifically triggered via a simulated network
  failure mid-submit (as opposed to the happy-path submit verified above)
  was not exercised live in the browser — the underlying RPC-level
  idempotency guarantee is already certified at the database layer
  (`docs/RPC_CERTIFICATION_REPORT.md`, CR-02/CR-10, SV-02), so this is a
  frontend-retry-UX gap specifically, not an unverified correctness claim.

This document's status: **390×844 release gate PASS for both workflows**
across open, autosave/recovery, deeper interaction (filters/navigation/
discrepancy for PM; photo+declaration+submit for Contractor), all 4
viewports PASS for open/no-overflow, two real UI defects and two real
test-script defects found and fixed along the way. The one remaining gap
(simulated-failure retry UX) is narrow and explicitly named above, not
silently left out.

## PM Site Visit — prior static findings (unchanged, not yet re-verified beyond the above)

The Gantt path now renders one item at a time with Previous/Next, progress text, filters, review counts, wrapped group/task labels, 44 px status/navigation controls, safe-area sticky padding, and full-width review actions on narrow screens. Static checks cover 320, 360, 390, and 412 px CSS behavior. Live scripted verification of these specific interactions (Previous/Next, filters, discrepancy creation) remains UNVERIFIED beyond the open/render check above.
