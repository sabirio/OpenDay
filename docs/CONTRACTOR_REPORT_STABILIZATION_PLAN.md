# Contractor Report Stabilization Plan

Scope is intentionally limited to Contractor Report. Canonical calculations, PM Site Visit semantics, schema/RLS, dashboard/read-side behavior, and migrations 000–026 remain untouched.

1. Add a pure, lightweight workflow reducer and transition tests.
2. Add a versioned draft envelope/key model with user, project, period, and schema isolation; cover corruption and staleness.
3. Add a Contractor workflow hook that owns submit status and debounced persistence.
4. Present compatible/stale/corrupt draft recovery explicitly; restore only recoverable data and the same request ID.
5. Normalize validation, retryable/fatal errors, replay success, and confirmed persisted result.
6. Represent upload items explicitly enough to block submit and explain refresh limitations; retain uploaded storage paths.
7. Add mobile review/status affordances and unsaved-change protection without redesigning the form.
8. Fix Contractor-related lint warnings introduced or exposed by the changed workflow.
9. Add unit/component-style source contracts and a 390×844 Playwright scenario where the existing environment supports it.
10. Run lint, typecheck, full tests, architecture guard, and build. Run DB certification only if an append-only migration 027 is proven necessary.

Data-quality decision: UI/application validation will reject duplicate and out-of-scope rows. Migration 027 will not be created unless targeted tests demonstrate the certified RPC must enforce CR-07/CR-08 for this isolated delivery; without it, server-side protection remains an explicit limitation.
