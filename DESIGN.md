# Design

## Source

This file captures the current OpenDay visual system from the existing React/Vite codebase. It is descriptive, not a redesign.

Primary files:

- `weekly-tracker/src/design-system.css`
- `weekly-tracker/src/index.css`
- `weekly-tracker/src/components/Layout.jsx`
- `weekly-tracker/src/components/Sidebar.jsx`
- `weekly-tracker/src/App.jsx`

## Register

product

Design serves authenticated operational workflows: dashboards, tables, project drawers, contractor forms, PM site visits, risk review, and portfolio management.

## Color

OpenDay uses a restrained product UI palette with OKLCH design tokens for the app shell and a separate fixed light field-mode palette for contractor and site-visit workflows.

### App Shell

Default theme is dark.

- Base background: `--bg-base`
- Surface: `--bg-surface`
- Elevated surface: `--bg-elevated`
- Border: `--border`
- Strong border: `--border-strong`
- Primary text: `--text-primary`
- Secondary text: `--text-secondary`
- Muted text: `--text-muted`
- Accent: `--accent`

Light theme is provided through `[data-theme="light"]` overrides. The same semantic token names must be used across both themes.

### Semantic Status

Status colors are functional, not decorative:

- Done/success: `--status-done`
- Active: `--status-active`
- Warning: `--status-warn`
- Alert/danger: `--status-alert`
- Todo/inactive: `--status-todo`

Risk and status UI must pair color with labels, badges, text, icons, or hierarchy. Never rely on color alone.

### Field Mode

Contractor report and PM site-visit screens use fixed light palettes for outdoor and job-site readability:

- Contractor field background: `--field-bg-contractor`
- Site visit field background: `--field-bg-sitevisit`
- Contractor accent: `--field-accent-contractor`
- Site visit accent: `--field-accent-sitevisit`
- Field text, border, success, warning, danger, info, delayed, and neutral states are defined under `--field-*`.

Do not make these screens follow the global dark/light toggle unless the field workflow is explicitly redesigned.

## Typography

Use one product UI family:

```css
--font-sans: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
--font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
```

Guidelines:

- Product UI should use fixed rem scales, not fluid display typography.
- Labels are compact and often uppercase for table headers, dashboard labels, and form labels.
- Body and table text should remain readable at dense operational sizes.
- Avoid decorative display fonts in labels, buttons, tables, and data-heavy surfaces.

## Layout

The main app uses a left sidebar plus scrollable content shell:

- `.app-shell`: flex row, full viewport height.
- `.sidebar`: 240px sticky vertical navigation.
- `.main-content`: flexible content pane with generous desktop padding and horizontal overflow protection.

Primary surfaces:

- dashboard grids;
- data tables;
- project detail drawers/modals;
- KPI cards;
- risk rows;
- field-report forms;
- site-visit comparison summaries.

Operational density is allowed. Preserve scanability with consistent spacing, table alignment, clear labels, and predictable controls.

## Components

Existing component vocabulary:

- `.card`, `.dashboard-card`, `.dashboard-summary-card`
- `.ds-table`, `.dashboard-table`, `.data-table`
- `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-ghost-sm`, `.btn-danger`
- `.ds-input`, `.ds-select`, `.ds-textarea`
- `.chip`, `.dot`, `.status-badge`, `.status-pill`
- `.ds-overlay`, `.ds-modal`, `.modal`
- `.empty-state`
- `.theme-toggle`

Component principles:

- Keep the button vocabulary consistent screen to screen.
- Use native form controls unless a domain-specific control is clearly better.
- Use badges and chips for status, but always include readable labels.
- Avoid nested cards and decorative card grids.
- Prefer skeletons and useful empty states over indefinite spinners where the user needs context.

## Motion

Current motion is minimal and state-driven:

- hover/focus transitions around 120-300ms;
- progress bar width transitions;
- loading spinner for global loading states.

Future motion should communicate state, feedback, loading, or reveal. Avoid decorative page-load choreography.

## Accessibility

Target: WCAG AA.

Design requirements:

- keyboard-accessible workflows;
- visible focus states via `--focus-ring`;
- reduced-motion alternatives for any future animation;
- strong dark/light contrast;
- color-blind-safe status communication;
- no status or risk meaning conveyed by color alone.

## Anti-patterns To Avoid

- generic SaaS decoration;
- colorful startup template aesthetics;
- spreadsheet-clone density without hierarchy;
- task-tracker metaphors that weaken progress verification;
- gamified project management;
- ornamental gradients, glass, or decorative motion;
- hero metrics and marketing-style dashboard panels inside the app.

## Product-Specific Design Bar

OpenDay should feel like an operational control center for construction fit-out projects. Design choices should strengthen progress truth verification, contractor vs PM comparison, schedule drift detection, opening readiness, construction risk intelligence, and portfolio visibility.
