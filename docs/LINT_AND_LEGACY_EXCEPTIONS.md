# Lint and Legacy Exceptions Registry

Audit date: 2026-07-11. ESLint result: **0 errors / 0 warnings**. Typecheck and architecture guard pass.

The source contains exactly 20 reviewed single-line suppressions. `src/tests/finalSafetyGuards.test.mjs` fails if this count grows, if a blanket disable appears, or if an exception stops being line-scoped.

| Category | Files / count | Reason | Removal condition |
| --- | --- | --- | --- |
| Legacy `no-restricted-imports` | 13 files / 16 lines | These imports implement the audited pre-Gantt compatibility branches listed in `ALLOWED_LEGACY_IMPORTERS`. Rewriting them during stabilization risks changing historical-report semantics. | Remove together with the matching architecture allowlist entry after a separately certified legacy-data migration. |
| React effect lifecycle | `App.jsx` / 1 | Session teardown synchronously clears tenant data before another identity can observe it. | Replace only with an equivalent auth-store lifecycle proven not to expose stale tenant data. |
| Gantt recenter effect | `GanttChart.jsx` / 1 | Adding the full layout object would recenter the user's viewport after unrelated task changes. | Remove when recentering is modeled as an explicit zoom/timeline event. |
| Contractor completion callback | `GanttWPSection.jsx` / 1 | The callback intentionally fires on the transition to all-complete, not on callback identity churn. | Remove when the callback is made stable by its owner without changing completion timing. |
| Fast Refresh export boundary | `AuthContext.jsx` / 1 | Context and provider share the established module boundary. | Split during a dedicated Auth module cleanup with HMR regression coverage. |

There are no `@ts-ignore` or `@ts-expect-error` entries. The legacy importer allowlist remains a separate architecture control and must agree with this registry.
