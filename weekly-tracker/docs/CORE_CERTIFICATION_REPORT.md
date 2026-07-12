# Core Stabilization Certification

Date: 2026-07-12. Scope: application business logic only; production/database security baseline unchanged.

Audited: canonical snapshot/orchestrator, progress, weights, Gantt/dependencies, risk/Monte Carlo, opening readiness, contractor-report and site-visit workflows, atomic persistence adapters, dashboard/report consumers, architecture guards and fixtures.

Verified architecture: canonical orchestration is the application composition boundary; compatibility `evaluateProjectState` has no new production callers; UI and services do not own weighted progress or canonical risk/readiness formulas.

Defect fixed: Monte Carlo forecasting used hidden wall-clock time and global randomness. It now accepts explicit `asOf`, supports injected randomness, and otherwise uses an evidence-derived deterministic seed. Risk rows forward the canonical orchestration timestamp. Regression coverage proves deterministic output, bounded finite results, invalid-time diagnostics, and input non-mutation.

Known compatibility boundaries: legacy report/status adapters remain for persisted historical records; UI workflow timestamps and client-request IDs remain boundary concerns rather than engine calculations. No migration or historical-data reinterpretation was performed.

Certification requires the aggregate tests, architecture guard, lint, typecheck, build and deterministic core scenario to pass with zero failures.
