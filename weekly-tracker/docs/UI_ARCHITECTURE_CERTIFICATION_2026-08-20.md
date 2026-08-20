# OpenDay UI Architecture Certification — 2026-08-20

## Certification result

**PASS**

The shared UI foundation has a stable inward dependency direction and no longer concentrates unrelated responsibilities in one shared file. Canonical application geometry has one owner, field workspaces have an explicit shared exception, and page-level escape hatches are covered by executable guardrails.

## Certified dependency chain

Consumer direction:

`Pages → Domain Components / Shared Patterns → Layout Primitives → UI Primitives → Semantic Tailwind/CSS Tokens → Design Tokens`

Source-of-truth direction:

`Design Tokens → Semantic Tailwind/CSS Tokens → UI Primitives → Layout Primitives / Shared Patterns / Field Primitives → Domain Components → Pages`

Field workspaces use `FieldPrimitives` as a deliberate shared branch over the same semantic/design-token foundation. They do not define field geometry on individual pages.

## Findings and corrections

### UiPrimitives risk

The pre-certification `UiPrimitives.jsx` was only 114 lines, so size alone did not make it a god-file. It did, however, own five distinct responsibilities: low-level controls, application layout, reusable state/table patterns, field-workspace components and progress presentation. That coupling meant a page-shell change and a field-control change shared the same module boundary.

It was split on meaningful responsibility boundaries, not mechanically:

- `UiPrimitives.jsx`: 44 lines, 8 exports;
- `LayoutPrimitives.jsx`: 35 lines, 3 exports;
- `UiPatterns.jsx`: 37 lines, 7 exports;
- `FieldPrimitives.jsx`: 62 lines, 12 exports.

No barrel re-export was added. Consumers import their actual layer, which keeps dependency ownership visible.

### Canonical shell and semantic tokens

- `PageShell` exclusively owns canonical application max widths, horizontal inset, page gap and bottom rhythm.
- `PageHeader` and `SectionHeader` own standard header/section spacing.
- shared `Surface`, `Button`, `InlineAlert`, table, metric and state patterns own standard radius, border, shadow and control geometry.
- field page width, page inset, field panel, field button, sticky actions, modal content and state presentation now come from `FieldPrimitives`.
- raw theme-variable use in page JSX was replaced with semantic `ui-*` / `field-*` utilities, including SVG fills and strokes.
- the project GC invitation stopped receiving a page-owned inline input style and now composes shared controls, surfaces, buttons and alerts.

### Second-design-system checks

Business Development remains a domain adapter: it imports the layout, pattern and UI layers directly and contains no raw theme variables or color literals. Opportunity and estimate registers use the shared `Surface`; validation and information states use `InlineAlert`.

## Guardrails

`uiArchitectureSystem.test.mjs` now scans every page and asserts:

- no hex/RGB page colors or direct theme CSS variables;
- no unapproved inline-style escape hatch;
- no removed `PageContainer` or `PageShell className` geometry override;
- no page-owned centered max-width shell or canonical width value;
- no reconstructed Tailwind `Surface`, `Button` or alert/state panel;
- no arbitrary Tailwind values except data-driven grid columns and table minimum widths;
- exact documented exceptions for runtime plan coordinates and domain trade color;
- exact exports and non-overlapping responsibilities across foundation layers;
- no outward page/domain dependency from the shared foundation;
- representative consumers keep the intended direct dependency chain;
- the Business Development shell does not become a second design system.

Any change to the foundation export boundaries or any new page-level alternative shell now fails the standard test suite.

## Deliberate exceptions

- data-driven grid-column definitions;
- table minimum widths tied to the represented data structure;
- runtime plan marker/capture coordinates;
- the domain-driven snag trade color;
- fullscreen estimate/pricing editor geometry inside domain components;
- shared field-workspace visual characteristics implemented through `FieldPrimitives`;
- existing legacy CSS selectors for untouched screens. They remain to avoid an unrelated mass redesign, but new page-level raw theme values and alternative Tailwind shells are blocked.

## Verification

- lint: **0 errors**, 4 pre-existing React effect warnings outside this UI refactor;
- typecheck: **PASS**;
- UI architecture guard: **PASS**;
- architecture guard: **47/47 PASS**;
- full tests: **373/373 suites, 6211/6211 checks PASS**;
- production build: **PASS** (existing chunk-size/dynamic-import advisory warnings only);
- `git diff --check`: **PASS** (line-ending notices only).

No business logic, calculations, authorization, persistence or workflow behavior was changed by the certification refactor.
