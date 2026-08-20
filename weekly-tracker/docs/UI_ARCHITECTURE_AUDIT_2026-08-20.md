# OpenDay UI Architecture Audit — 2026-08-20

## Outcome

OpenDay now has an explicit UI dependency chain:

`Design tokens → Tailwind semantic tokens → Shared UI primitives → Layout/page patterns → Domain components → Pages`

The work intentionally preserves the existing visual language and business behaviour. It centralizes repeated structure instead of introducing a mass redesign.

## Findings

The application already had a broad CSS-variable vocabulary in `design-system.css`, including a separate high-contrast field palette. The main architectural gaps were at the next layers:

- Tailwind utilities did not have semantic aliases for the existing theme variables, so feature code mixed legacy CSS classes, raw CSS variables and page-owned values.
- Page headers, surfaces, section headers, controls, state panels, badges, tables and metric cards were reproduced with slightly different spacing and radii.
- `TemplateEditor`, `PMScheduleReview`, `ContractorSchedule`, `WeightAudit`, `WeeklyReports`, `AdminUsers`, `PlatformAdmin`, and authentication state UI contained static inline layout/style objects.
- Field workspaces implemented their own button, status, page-width, modal-form and sticky-action geometry despite sharing one field palette.
- Business Development pages had a coherent domain shell, but no canonical application-level primitive layer beneath it.

## Centralized architecture

### 1. Design tokens

`src/design-system.css` remains the source of truth for color, typography, spacing, control height, radius, shadow, status and field-workspace variables. No page owns a literal color.

### 2. Tailwind/CSS-variable bridge

`src/index.css` exposes semantic Tailwind v4 tokens such as `ui-page`, `ui-surface`, `ui-primary`, `ui-accent`, `ui-border`, `ui-success`, `rounded-ui` and `shadow-ui`. Theme changes therefore flow from CSS variables through Tailwind utilities without duplicating values.

### 3. Shared foundation

The final certification found that the original centralized file mixed meaningful responsibilities even though it was not large. The foundation is therefore split by architectural boundary:

- `UiPrimitives.jsx` — controls, surfaces, badges, fields, labels and progress presentation;
- `LayoutPrimitives.jsx` — canonical page width, inset, section rhythm and headers;
- `UiPatterns.jsx` — tables, metrics, alerts and loading/error/empty states;
- `FieldPrimitives.jsx` — the distinct shared field-workspace shell and controls.

The files use direct imports rather than a broad barrel. The Business Development shell composes these layers as a domain adapter instead of becoming a second design system.

### 4. Consumers migrated

The central primitives are consumed by the Business Development overview and workspaces, Template Editor, PM Schedule Review, Contractor Schedule, Weight Audit, Admin Users, Platform Admin, Weekly Reports and field-state pages. Changing a shared surface, button, field control, page header or state pattern now propagates to all of these consumers.

## Guardrails

`src/tests/uiArchitectureSystem.test.mjs` now verifies the full dependency principle rather than only representative consumers. It protects responsibility boundaries, canonical shell ownership, semantic tokens, all page files, documented runtime-style exceptions, direct imports and the absence of reconstructed Tailwind surfaces/buttons/state panels.

## Deliberate exceptions

- Plan pins and capture markers retain dynamic `left`/`top` inline values because they are runtime document coordinates, not layout constants.
- The snag trade indicator retains a dynamic CSS custom property because the color is domain data.
- Domain tables and editors retain explicit grid column templates and minimum widths where those values describe the data schema rather than the global page layout.
- The field palette remains distinct for outdoor/contractor usability, but its spacing, controls and layout now come from shared field primitives.
- Legacy selectors in `index.css` remain for untouched consumers. Removing them wholesale would be a redesign/regression risk; the new architecture provides the migration path and the guard prevents new page-level hardcode.

## Behaviour and data boundaries

No workflow, authorization, calculation or persistence behaviour was changed by this UI consolidation. Business Development continues to use orchestration/service boundaries, and field schedule ownership and submission controls remain unchanged.
