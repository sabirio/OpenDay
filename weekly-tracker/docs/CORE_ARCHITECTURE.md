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

## Stabilization boundary and dependency map

```text
React pages/components
  -> hooks and application view/submission models
  -> runOpenDayOrchestrator / workflow reducers
  -> progress, weights, dependency, risk and readiness engines
  -> service adapters / atomic write RPCs
  -> PostgreSQL and Storage
```

The orchestrator calculates current derived state. It is not an event store and does not write snapshots. Services and atomic commands persist facts and versioned snapshots; read-side adapters select and present those results without owning formulas. Contractor facts and PM observations remain separate inputs. Compatibility engines may adapt historical shapes, but new consumers must enter through `src/core/canonical/index.js`.

Business rules found in pages are limited to presentation and interaction state. Weighted project progress, scope weights, discrepancy, risk and opening readiness remain engine-owned. Legacy report averaging and compatibility schedule paths are retained only for historical formats and are not approved as new consumer entry points.

## Authoritative invariants

- Progress and readiness percentages are finite and bounded to `0..100`; unavailable evidence remains `null` rather than an implicit pass.
- Active weights normalize to 100 within engine tolerance. Negative, non-numeric and non-finite areas cannot create negative or non-finite weights. Fallback weights apply only when no usable positive area exists.
- Canonical IDs are string-normalized. Duplicate report, visit, history and work-package IDs are represented once and emit diagnostics; first input occurrence wins deterministically.
- Identical normalized inputs, configuration and `calculatedAt` produce identical orchestration output. Engines do not mutate source data.
- Dependency templates are configuration inputs. Cycle and missing-input handling fail closed; runtime code does not mutate normative templates.
- Contractor and PM write flows preserve stable `client_request_id` values across retry and use atomic server commands to prevent duplicate domain effects. Drafts are scoped by workflow, user, project and period.
- PM observations never overwrite contractor facts. Persisted discrepancy rows record source IDs, sign convention and version.
- Risk consumes canonical current facts and explicit time. Paused Gantt mismatch logic is not an active risk source. Opening blockers come from scoped template configuration, not UI labels.
- Production guards fail closed. Local/staging fixture tooling requires explicit target identity. Privileged credentials are forbidden from browser/Vite configuration.

## Configuration decisions

| Concern | Decision |
| --- | --- |
| Numeric bounds, finite-number rules, deterministic ordering, idempotency semantics | `KEEP_IN_CORE` |
| Project templates, dependency graphs, status mappings, risk/readiness thresholds | `MOVE_TO_VERSIONED_CONFIG_NOW` where already represented by `src/config` or template modules |
| Company-specific policy editing and runtime threshold administration | `DEFER_CONFIGURATION` until ownership and versioning requirements exist |
| Historical report/status adapters | Keep as compatibility boundaries; `REMOVE_AS_LEGACY` only after stored data and consumers are migrated |

Stable mathematics and security rules stay in code; project/company variability belongs in versioned configuration; visual choices stay in the UI layer.

## History and reproducibility

Current progress-history snapshots persist source record IDs, `client_request_id`, actor, calculation timestamp, snapshot schema version, calculation version and discrepancy convention/version where applicable. Canonical orchestration also returns normalized inputs, warnings, source version and `calculatedAt`.

For MVP, deterministic snapshots plus source linkage are sufficient. New snapshot writers should additionally preserve configuration/template version and a reason for recalculation. A general event store, retroactive reinterpretation of historical records and a full History Graph are deferred post-MVP. Preserving input/source IDs, schema version, engine/configuration version, output, warnings and recalculation reason now prevents a future migration crisis.

## Coverage matrix

| Component | Unit | Contract | Integration | Edge/adversarial | Determinism |
| --- | --- | --- | --- | --- | --- |
| Progress Engine | Yes | Yes | Canonical orchestration | Empty/N/A/range/corrupt input | Yes |
| Weights Engine | Yes | Yes | V2 template/progress | Zero, negative, mixed and non-finite area; drift | Yes |
| Dependency/Gantt | Yes | Yes | V1/V2 orchestration | Cycles, delays and scoped graphs | Yes |
| Risk Engine | Yes | Yes | Dashboard rows | Missing/stale evidence and thresholds | Yes |
| Opening Readiness | Yes | Yes | V1/V2 project state | Missing evidence, scope and critical chain | Yes |
| Orchestrator | Yes | Stable result shape | Dashboard/print/summary | Empty, corrupt and duplicate inputs | Yes with explicit time |
| Contractor/site-visit workflows | Reducer/model | Payload | Atomic service | Retry, draft corruption, duplicate WP and ranges | Stable request identity |
| Production guards | Yes | Target identity | Certification scripts | Remote-target rejection | Yes |

## Stabilization changes and deferred items

Core stabilization added explicit duplicate-work-package normalization and non-finite zone-area handling at canonical boundaries. Both corrections are diagnostic and pure, and preserve valid-input behavior and public output contracts.

Deferred non-critical work: richer snapshot configuration-version metadata, removal of historical adapters after consumer/data migration, and a future History Graph. Production database schema, production configuration and historical facts are unchanged.

The Supabase Secret-Key Migration is **`DEFERRED — SAFE BLOCKED STATE`**. It does not block repository Core Stabilization. Resume it before disabling legacy service-role, adding production external automation or privileged API consumers, or transferring production operations. The authoritative security controls and resumption gates are in [`../../docs/PRODUCTION_SECURITY_REMEDIATION_RUNBOOK.md`](../../docs/PRODUCTION_SECURITY_REMEDIATION_RUNBOOK.md).
