# Master Catalog Duration Model

## Status

Slice 5F.2B persists the owner-approved schema-v2 duration classifications,
reference areas, bands, and base durations into the existing inactive Master
Catalog candidate. It does not generate the real Master Catalog Gantt or
activate the schema-v2 template.

The frozen Construction Progress Weight model remains a separate capability.
Duration never derives from `baseEffort`, `categoryFactor`,
`constructionProgressEligible`, `catalogClass`, legacy `durationPct`, cost,
contractor count, or Progress Weight.

## Duration semantics

A Work Package duration is elapsed execution time for a reasonably typical,
competent crew under the governed project construction calendar. Execution
starts only after access, required information, predecessor permission, and
required materials/equipment are available.

Duration excludes labor person-days, procurement/manufacturing/shipping,
approval waiting, dependency waiting, float, risk contingency, and progress
weight.

The first calendar contract is:

- unit: `PROJECT_WORKING_DAY`
- calendar profile: `RETAIL_7_DAY`
- every calendar day is initially an available construction working day

No holiday, country, resource, crew, or Monday-Friday calendar is implied.

## Four schema-v2 modes

- `FIXED`: participating execution task with positive integer
  `baseDurationDays`; no area basis.
- `AREA_SCALED`: participating execution task with positive integer
  `baseDurationDays` and `TOTAL_AREA`, `SALES_AREA`, or `BOH_AREA`.
- `MILESTONE`: participating schedule event with resolved duration zero.
- `EXCLUDED`: explicit non-participation in the Construction Baseline
  Schedule. It remains a normal scope/catalog fact for other domains.

Area-scaled resolution uses the existing canonical project-area resolver and
ordered ratio bands from the immutable template version. Missing/invalid
canonical area resolves to the base duration with explicit `AREA_FALLBACK`
provenance. Canonical zero remains a valid area under the existing area
contract and therefore selects a band.

The approved immutable candidate uses reference areas 950/800/150 for
TOTAL/SALES/BOH and five bands with multipliers 0.70/0.85/1.00/1.15/1.30.
Its 221 WPs classify as 131 fixed, 78 area-scaled, 7 milestones, and 5
excluded.

## Canonical schedule routing

`resolveProjectScheduleModel()` is the future single routing boundary:

```text
schemaVersion 1 -> LEGACY_WINDOW_FITTING
schemaVersion 2 -> MASTER_CATALOG_DURATION_V2
```

Slice 5F.2B does not wire it into Gantt generation. Existing schema-v1
generation remains byte-compatible and continues to use the project window,
phase/category allocation, legacy duration percentage, size modifier, and
existing CPM.

The real inactive 221-WP candidate is duration-operational but still lacks
dependencies and schedule integration. It must not reach real Gantt
generation.

## Baseline, model completion, and forecast

- Planned Construction Start and Planned Construction Completion are the
  management baseline/commitment.
- Model Completion is the deterministic result of start, selected scope,
  resolved execution durations, dependencies, and the project calendar.
- Forecast Completion is a later dynamic projection using actual execution
  evidence and performance.

The current `forecast_opening_date` column is populated with the generated
planned Gantt finish even though the more sophisticated
`calculateForecastOpening()` has no live caller. Before schema-v2 integration,
this field needs a semantic adapter or migration so Model Completion is not
misrepresented as Forecast Completion. Slice 5F.1 does not rename or modify
the database.

## Activation and integration requirements

### MASTER CATALOG DEPENDENCY GRAPH REQUIRED

The certified 475-edge dependency graph belongs to the 91-WP schema-v1
template and must not be reused for the 221-WP catalog.

Current scope filtering removes edges touching absent nodes but does not bridge
predecessor to successor. The schema-v2 dependency design must decide how
configurable scope preserves required sequencing without becoming
under-constrained.

### ZERO-DAY GANTT ADAPTER REQUIRED

The schema-v2 duration resolver correctly returns zero for milestones. The
legacy Gantt seeder forces every task to at least one day. Schema-v2 Gantt
integration must preserve zero-day milestone semantics rather than weakening
them.

### MANUAL GANTT OVERRIDE INTEGRITY REQUIREMENT

Current manual resizing can persist task dates/duration without rerunning the
full dependency and CPM graph. Before schema-v2 activation, either:

1. a manual override becomes an explicit Schedule Engine input and triggers
   graph recalculation; or
2. manual resizing is disabled for engine-controlled schema-v2 schedules.

The product/UI choice is intentionally deferred.

### SCHEDULE PROVENANCE REQUIRED

Before activation, a generated schema-v2 baseline must retain
enough provenance to explain why every date was expected:

- template ID and template version;
- schema version;
- duration-model version;
- calendar profile;
- selected WP IDs and scope fingerprint;
- canonical area facts used;
- resolved WP duration results and provenance;
- dependency version/fingerprint;
- generated baseline dates.

Template changes must create a new immutable version rather than rewriting
historical expectations.

## Domain firewalls

Procurement availability is an execution precondition, not execution
duration. Critical Procurement remains a separate future capability.

Duration resolution does not calculate dependencies, CPM, Risk, Opening
Readiness, progress, or forecast. Those capabilities consume or constrain
schedule facts through their own canonical boundaries.

## Retained activation and schedule blockers

- **A — Historical Progress Snapshot Provenance:** historical progress must
  retain template/scope/weight/calculation provenance before activation.
- **B — Default Scope Consistency Review:** installation/commissioning default
  pairs require explicit review.
- **C — Master Catalog Dependency Graph:** the 221-WP graph is not authored.
- **D — Zero-Day Milestone Gantt Integration:** the Gantt adapter must preserve
  true zero-day milestones.
- **E — Manual Gantt Override Integrity:** overrides must become engine inputs
  with recalculation or be disabled for engine-controlled baselines.
- **F — Schedule Provenance / Baseline Reproducibility:** persisted baselines
  must retain immutable template, duration, area, scope, dependency, calendar,
  and generated-date provenance.
