# OpenDay Core Architecture

The Core is the deterministic business layer under `src/core` and `src/engines`. UI pages consume application models/hooks; services persist already-derived meaning and must not recalculate it.

## Canonical flow

`raw project evidence -> buildCanonicalProjectSnapshot -> runOpenDayOrchestrator -> progress/schedule/risk/readiness/diagnostics -> presentation or persistence adapter`

- Progress: `progressEngine` through `computeCanonicalProgress`; percentages are finite `0..100`, missing evidence remains distinct from zero.
- Weights: `core/projects/weights`; active scope is normalized to 100, invalid/negative inputs are clamped with explicit fallback behavior.
- Schedule/dependencies: `ganttEngine` and `scheduleUtils`; callers supply reference dates for time-sensitive decisions.
- Risk: `riskEngine` plus `core/risk`; canonical row risk is forwarded, not recomputed. Monte Carlo uses evidence-seeded randomness and explicit orchestration `asOf`.
- Readiness: `openingReadinessEngine` with project-scope options; presentation adapters do not recalculate blockers.
- Report/site visit: workflow reducers build scoped state; submission models build canonical payloads; atomic services only transport/persist them.

## Contracts

Identifiers are string-compared at boundaries. Percentages use `0..100`; `null` means unavailable and is not zero. Dates are ISO instants for calculation metadata and explicit date-only values for reporting/business dates. Canonical arrays are deterministically ordered. Legacy fields are normalized only through compatibility adapters.

Diagnostics use `{ code, severity, path/entity, originalValue, normalizedValue, details/message }`. Recoverable invalid input produces diagnostics; ambiguous unsafe input fails closed.

Configuration remains in `src/config`, project templates, and scoped weight/readiness builders. Engines receive configuration explicitly. New UI formulas, service-layer recalculation, implicit wall-clock use, global randomness, and imports of compatibility-only `evaluateProjectState` are prohibited by convention and architecture tests.

## Testing

The aggregate suite covers unit, invariant, reducer, adapter, architecture and synthetic integration scenarios. Core changes must additionally pass lint, typecheck, build, deterministic reruns, non-mutation checks, and `git diff --check`.
