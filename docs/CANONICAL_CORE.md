# OpenDay Canonical Core

## Purpose and data flow

Canonical Core gives UI/read models one normalized project snapshot and stable calculated facts without replacing existing business engines.

```text
Raw service-adapted data
→ buildCanonicalProjectSnapshot
→ computeCanonicalProgress
→ computePmContractorDiscrepancy
→ compatibility schedule/readiness/risk adapters
→ runOpenDayOrchestrator result
→ view model / UI
```

Public imports use `src/core/canonical/index.js`.

## Contracts

JSDoc contracts live in `src/core/canonical/types.js`:

- `CanonicalProjectSnapshot`: normalized project, zones/WPs, sorted reports/visits/history, latest records, scope, evidence/risks, metadata and warnings.
- `CanonicalProgressResult`: overall/contractor/PM/planned values, signed variance, confidence, method, breakdown and warnings.
- `CanonicalDiscrepancyResult`: contractor and PM facts, `contractor − PM` signed difference, magnitude, severity, scope and record identity.
- `OpenDayOrchestratorResult`: snapshot, progress, discrepancy, compatibility schedule/readiness/risk, warnings and timestamp.

## Null semantics

- `0`: measured/computed zero or the existing empty-project overall display baseline.
- `null`: source fact is unavailable and must not be interpreted as zero (contractor, PM, planned, variance).
- Missing arrays normalize to empty arrays.
- Out-of-scope work packages have `active:false` and `notApplicable:true`; they are not zero-progress work.
- Invalid/corrected data generates a warning and is never silently discarded.

## Numeric and rounding policy

Progress is clamped to 0–100. Canonical aggregate values retain two decimal places; the inherited progress engine may already round phase/project calculations to whole percentage points. Signed variance is `contractorProgress - verifiedProgress`. Test equivalence tolerance is 0.01 percentage point; tolerance must not be increased to hide a mismatch. UI/PDF retain their existing display formatting until migrated.

## Mutation and side effects

Snapshot, progress and discrepancy functions are pure: no Supabase, React/browser globals, input mutation or writes. Orchestrator compatibility engines are calculation-only but some legacy risk/readiness date calculations still read the wall clock. All Supabase write paths remain outside Canonical Core.

## Consumer rules

Production consumers must import the public canonical index, not internal files. UI must not normalize raw records, select latest reports/visits, recalculate overall progress/weights/discrepancy, or import legacy calculation modules. Flow is UI → hook/view model → canonical orchestrator → engines.

## Compatibility

Sprint 2 retains `evaluateProjectState`, `computeProjectSummary`, risk/readiness/schedule engines, legacy report adapters and submit models. The Project Detail Drawer is the first production consumer: its core model invokes the canonical orchestrator and returns the compatibility summary with unchanged UI shape. Dashboard/Home/Weekly Reports/Risk Dashboard and write flows remain for Sprint 3 migration.

Sprint 3 update: Dashboard/Home base rows and current Weekly Reports facts use the canonical orchestrator. `evaluateProjectState` is no longer a production consumer entry point; it is a guarded internal compatibility implementation. Risk/readiness/schedule rules remain compatibility outputs, with raw risk preparation isolated in `riskCompatibilityEngine`. The print read model is canonical while browser-print export remains unchanged.
