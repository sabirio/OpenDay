# Accessibility Audit

| Issue | Screen/component | Severity | Fix | Verification |
| --- | --- | --- | --- | --- |
| validation not announced/focused | PM form | P1 | assertive focusable summary | source/typecheck |
| duplicate submit/status | PM submit | P1 | disabled/aria-busy reducer state | reducer tests |
| status controls too small | Gantt/legacy rows | P1 | 44 px, aria-pressed and item labels | static audit |
| declaration div keyboard gap | PM declaration | P1 | checkbox role, checked/required, Space/Enter | static audit |
| upload errors not live | PM photos | P1 | role alert and shared accessible controls | static audit |
| recovery ambiguity | PM draft | P1 | labelled recovery section and explicit actions | draft tests |
| success focus/replay copy | PM success | P2 | autofocus heading and replay explanation | source/typecheck |

The line above was written when the in-app browser surface was unavailable.
It no longer applies — see the update below, where live browser
verification became possible and was actually run.

## Update — 2026-07-10/11: Phase 2, shared dialog/drawer accessibility (live-verified)

### Inventory (from `docs/SPRINT_5_FRONTEND_FINALIZATION_AUDIT.md`'s audit)

| Component | Consumers | Before | After |
|---|---|---|---|
| `components/weekly/MissingReportsModal.jsx` | Weekly Reports | Already had `role="dialog"`/`aria-modal`/`aria-labelledby`, but no focus trap, no initial focus, no scroll lock, no focus return | Migrated onto the shared `Modal` primitive — gains all of the above for free, visual styling (`weekly-missing-modal` class) unchanged |
| `components/projects/GcInvitationModal.jsx` | Project Editor (contractor invite) | `autoFocus` on the email input only — no `role`, no `aria-modal`, no Escape handling, no focus trap/return | Shared `Modal` primitive + dirty-state protection (email changed from its original value blocks a silent Escape/backdrop close) |
| `components/projects/ProjectDetailModal.jsx` | Projects list | No `role`/`aria-modal`/Escape/focus management at all | Shared `Modal` primitive (read-only content, no dirty state needed) |
| `components/projects/ProjectEditorModal.jsx` | Projects list, project creation | Same gaps as above, **and** this is the one component with real unsaved-data risk (multi-field form) — backdrop click or a stray Escape previously discarded an in-progress edit with zero warning | Shared `Modal` primitive + real dirty-state tracking (`Projects.jsx` snapshots the project at open time, diffs against the live edit) — Escape, backdrop click, and the Cancel/× buttons all now route through the same `window.confirm`-gated close path |
| `components/dashboard/ProjectDetailDrawer.jsx` | Dashboard, Portfolio | Had its own bespoke Escape handler; no `role`/`aria-modal`, no focus trap/return, no scroll lock | Shared `Modal` primitive (its own visual styling preserved via `className=""` + explicit `style`) — this "drawer" genuinely blocks the background screen, so it gets full modal semantics, not a non-modal drawer treatment (task's own §2.3 rule: don't mix modal/non-modal semantics — this one is unambiguously modal) |

### The shared primitive: `components/shared/Modal.jsx`

One new file, behavior-only (callers keep 100% of their existing visual
styling/className/content):
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` (caller passes a
  `titleId` and puts that `id` on its own heading element).
- Initial focus on mount → first focusable descendant (falls back to the
  panel itself).
- Tab/Shift+Tab containment (wraps at the first/last focusable element —
  never lets focus escape onto the page behind the dialog).
- Escape and backdrop click both close — gated behind `window.confirm` when
  the caller passes `isDirty` (native browser confirm, deliberately not a
  second custom dialog, to avoid a recursive accessibility problem and
  keep this a targeted fix rather than a new design surface).
- Background scroll lock while open (`document.body.style.overflow`).
- Focus returns to whatever element had focus before the dialog opened
  (the trigger button, in every real usage here) once it closes.

### Live verification — `tests/e2e/dialog-accessibility.spec.js` (3/3 PASS)

Real authenticated Playwright runs against local Supabase only (same
local-only discipline as the mobile spec — no direct Supabase client in
the test file):

| Check | Result |
|---|---|
| `ProjectDetailModal` has `role="dialog"` + `aria-modal="true"` + non-empty `aria-labelledby` | PASS |
| Initial focus lands inside the dialog on open (not left on `<body>`) | PASS |
| Escape closes the dialog | PASS |
| Focus returns to the trigger element after close | PASS |
| `ProjectEditorModal`: typing into a field then pressing Escape triggers a real `confirm()` prompt (not a silent close) | PASS |
| Dismissing that prompt keeps the dialog open with the typed value intact | PASS |
| Accepting that prompt actually closes the dialog | PASS |
| `ProjectEditorModal`: Tab from the last focusable control wraps to the first (focus never escapes the dialog) | PASS |

Full regression re-confirmed clean after this change: `npm test` 76/76
(1822/1822), lint 0 errors/26 warnings (unchanged), typecheck, `check:
architecture` 25/25, build.

### Scope notes

- Visual design of every dialog is unchanged — this was a behavioral/
  semantic fix only, per the task's "not a redesign" constraint.
- Nested-overlay stacking was not exercised — this app does not currently
  open one of these dialogs from within another, so per the task's own
  instruction ("не добавлять поддержку nested dialogs, если они
  отсутствуют") that was not built or tested.
- `GcInvitationModal`'s dirty-state check is intentionally lighter
  (compares the single email field to its opening value) than
  `ProjectEditorModal`'s (deep-compares the whole edited project object) —
  proportional to what's actually at stake in each form.
- The Contractor Report / PM Site Visit workflows' own draft-recovery UI
  (`DraftRecoveryBanner.jsx`, `SiteVisitDraftRecovery.jsx`) is a different,
  already-existing mechanism (page-level, not a dialog) and was out of
  scope for this pass — it's covered by Phase 1's mobile verification
  instead.

## Update — Phase 3: loading/error state accessibility + raw-error leaks (live-verified)

Full 9-screen loading/empty/error/stale matrix was not built as a
standalone artifact (no dedicated doc for it in this task's required list)
— instead, the two real, cross-cutting defects found while surveying
`App.jsx`'s top-level data-load gate (which every authenticated screen
routes through) were fixed directly:

1. **`GlobalLoadingScreen`/`RouteLoadingScreen`/`GlobalErrorScreen`
   (`App.jsx`) had no `role`/`aria-live` at all.** Fixed:
   `role="status" aria-live="polite"` on both loading screens,
   `role="alert"` on the error screen.
2. **`GlobalErrorScreen` displayed the raw Supabase/Postgres error message
   directly to the user** (`err?.message`, e.g. `"relation
   \"public.projects\" does not exist"`) — a direct violation of the
   task's explicit rule. Fixed: the screen now shows a single fixed,
   friendly message ("Could not connect to the database…") in every case;
   the raw error remains available to developers via the existing
   `console.error()` calls at the two fetch call sites (`loadProjects()`,
   `loadPortfolioData()`). The now-unread `projectsError`/`portfolioError`
   state values were removed from destructuring (`const [, setX] =
   useState(...)`) rather than left as dead reads.
3. Same category of leak found and fixed in `components/shared/PhotoUpload.jsx`
   (upload-retry failure text and the "still in storage" removal warning
   both interpolated a raw Storage SDK `error.message` into user-facing
   text) — both now show a fixed friendly message with `console.error()`
   for the raw detail.

The `GlobalErrorScreen`'s Retry button was already correct per the task's
"read retry" rule (`loadProjects`/`loadPortfolioData` are read-only
re-fetches, no write side effect).

**Live verification** — `tests/e2e/error-state-sanitization.spec.js`
(1/1 PASS): forces the `projects` REST call to fail with a realistic
Postgres error body (`42P01`, `relation "public.projects" does not
exist`) via Playwright request interception, logs in, and asserts the
rendered `role="alert"` screen's text contains neither the error code nor
the raw message — only the friendly copy — with the Retry button present.

**Not done in this pass** (real remaining gap, not claimed complete): the
full 9-screen (Home/Dashboard/Portfolio/Projects/Project
Detail/Weekly Reports/Risk Dashboard/Contractor Report/PM Site Visit)
loading/empty/error/stale matrix from the task's own Phase 3 spec —
individual per-screen empty-state copy, stale-data-with-timestamp
indicators, and the loading/background-refresh/route-transition
distinction were not separately audited screen-by-screen. What is
confirmed: the app has no live "background refresh" code path today
(`loadPortfolioData()`/`loadProjects()` each run once per session, gated
by `idle`/`loading`/`ready`/`error` state — there is no repeated
silent refetch that could blank out last-good data), so the specific
"background refresh must preserve last success" failure mode does not
currently have a code path to trigger it.

## Update — Phase 7: final accessibility verification (live, dedicated pass)

### Keyboard/focus smoke — `tests/e2e/keyboard-smoke.spec.js` (3/3 PASS, re-run 3× to confirm reliability)

Real authenticated Playwright runs, 390×844:

- **Contractor Report**: Tab reaches the (Phase 2-fixed) collapsible phase
  header; Enter expands it (`aria-expanded` flips); Space collapses it back
  (both activation keys checked, not just one); Tab after expanding lands
  on the next real focusable control in DOM order (the progress range
  input — confirmed this is correct layout order by reading the component,
  not asserted as a defect). An empty-form submit correctly produces a
  `role="alert"` validation summary.
- **PM Site Visit**: filter buttons and PM status buttons are real
  `<button>`s — Tab/focus + Enter toggle `aria-pressed` exactly like a
  click. The custom `role="checkbox"` declaration control responds to
  Space and toggles `aria-checked`.
- **Real (non-)finding surfaced while writing this test**: marking a WP
  "Completed" while filtered to "incomplete" correctly auto-advances the
  single-item view to the next incomplete WP, since the just-resolved one
  no longer matches the active filter. This looked like a keyboard-Enter
  bug at first (a stale button reference after the view moved on) — traced
  down via direct DOM inspection before concluding it was actually correct
  app behavior, not a defect, and not silently assumed either way.

### Landmarks / heading structure (checked, not assumed)

`components/Layout.jsx`/`Sidebar.jsx` already use real landmarks:
`<aside>` for the sidebar, `<nav>` for its links, `<main>` for page
content. Every one of the 5 primary authenticated pages checked (Home,
Dashboard, Weekly Reports, Risk Dashboard, Projects) has exactly one
`<h1>` (grepped directly, not sampled).

### Color-only indicators

Not a fresh finding — confirmed already-correct by re-reading the
components this pass touched: discrepancy badges pair an icon (⚠) with
text ("GC claimed X% — Ngap pp"), not color alone;
PM/status buttons carry their state in visible text labels
("Completed"/"In Progress"/etc.) and `aria-pressed`, not color alone; the
GC-vs-PM distinction on a status button uses an explicit "GC" text badge,
not color alone.

### Touch targets

`min-height: 44` (or the CSS equivalent) is already present and was
directly observed in: PM status buttons (`GanttPMTaskRow.jsx`), Gantt WP
status buttons (`GanttWPSection.jsx`), the mobile off-canvas nav toggle
(Phase 1's fix, `index.css`), and the `SiteVisitSelect` CTA at the
mobile breakpoint (Phase 1's fix). Not exhaustively re-measured
pixel-by-pixel across every control in the app.

### Overall accessibility status

Per the task's own required phrasing — **not** claiming full compliance:

> Critical accessibility gaps resolved: shared dialog/drawer semantics
> (Phase 2), loading/error screen `aria-live`/`role` (Phase 3), the
> previously keyboard-unreachable Contractor Report phase header (Phase 2,
> live-verified in Phase 7), and a dedicated live keyboard/focus smoke
> pass across both field workflows (Phase 7) — not a full WCAG audit, and
> not claimed as one. The 9-screen loading/empty/error matrix and a
> pixel-exact touch-target sweep remain open, named explicitly above, not
> silently skipped.
