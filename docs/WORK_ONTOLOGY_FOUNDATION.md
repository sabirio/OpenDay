# Work Ontology Foundation

## Status

Phase A is complete and the first Phase B capability is in place. The work
remains local to the feature branch and does not migrate a live database.

## Audit result

OpenDay currently has three different concepts that must not be renamed into
one another:

1. The active schema-v1 project template contains 91 schedule/reporting Work
   Packages.
2. The inactive schema-v2 Master Catalog candidate contains 221 execution and
   readiness Work Packages, grouped into 26 categories and three physical
   zones (`project_wide`, `sales`, and `boh`).
3. The lifecycle roadmap introduces a commercial semantic backbone:
   Department -> Discipline -> Work Group -> BOQ Item.

The 221-item catalog is not that backbone. Its categories mix several axes:

- true disciplines (`Electrical`, `HVAC`);
- construction groupings (`Flooring`, `Partitions & Doors`);
- physical zones (`Sales Area`, `Back of House`);
- lifecycle/verification work (`Commissioning`, `Pre-Handover`,
  `Handover & Documentation`).

Four category labels are also repeated across Sales and Back of House. Treating
all 26 category IDs as disciplines would therefore make PM scope, Budget, BOQ,
and historical comparison depend on physical execution zoning and would not
produce stable commercial Work Groups.

## Decision

The commercial ontology is a new canonical domain capability. The existing
221 Work Packages remain an Execution Work Library until each relevant work is
explicitly mapped to a Work Group. No name-based or AI-generated mapping is
allowed in the source-of-truth path.

The first contract is flat and relational so that it can later map cleanly to
Postgres without coupling domain logic to Supabase:

```text
Ontology Version
  -> Discipline (stable UUID + readable code)
      -> Work Group (stable UUID + readable code)
          -> standard BOQ Item Definition (stable UUID + readable code)

Project BOQ Item (standard or custom)
  -> exactly one valid Work Group

One or many Project BOQ Items
  -> deterministic set of Work Groups
  -> input to a later Execution Scope workflow
```

BOQ detail is not schedule detail. A Work Group may lead to zero, one, or many
project-specific schedule activities, and schedule activities remain owned by
the Contractor. This slice intentionally adds no Gantt generation.

## Implemented in this slice

`domains/workOntology/workOntologyContract.js` owns:

- schema-version validation;
- stable UUID identity plus separate readable codes;
- uniqueness and parent-reference validation;
- deterministic BOQ Item -> Work Group aggregation;
- mandatory Work Group mapping for custom BOQ rows;
- rejection of silent remapping for standard BOQ definitions.

The first draft vertical slice now covers Electrical:

- one canonical Discipline;
- fourteen management/commercial Work Groups;
- the three roadmap cable examples as standard BOQ definitions;
- eighteen explicit mappings from existing execution Work Packages;
- deterministic many-to-one aggregation such as three detailed lighting
  execution works -> one Lighting Work Group.

The same model is now materialized as one global, published database seed in
migration `060_work_ontology_foundation.sql`. It is not deployed to production.
Detailed BOQ definitions beyond the Electrical examples will be added only as
real tender and budgeting requirements are confirmed; they will not be
manufactured from the execution catalog.

The approved three-level taxonomy contains six Departments, twelve budget
Disciplines, and 141 Work Groups. The readable code levels are `X100` for a
Discipline and `X100.01` for its Work Groups. The Disciplines are:

1. C100 — General Construction
2. E100 — Electrical
3. H100 — HVAC
4. P100 — Plumbing & Drainage
5. F100 — Fire & Life Safety
6. V100 — Vertical Transportation
7. S100 — Security
8. I100 — IT, Voice & Data
9. A100 — Audiovisual
10. J100 — Furniture & Joinery
11. G100 — Signage & Graphics
12. M100 — Project Administration & Control

Deferred from the current version by product-owner decision:

- Refrigeration
- Food-Service Equipment
- External & Civil Works
- Retail Technology

Sales Area and Back of House remain location/zone dimensions. Commissioning,
Readiness, Handover, approvals, and documentation remain lifecycle facts. None
of them is presented to the PM as a fake technical Discipline.

## Complete Work Group and execution classification status

All twelve budget Disciplines now have canonical Work Groups. The approved
taxonomy contains 141 unique Work Groups. Electrical remains the first detailed
BOQ-definition slice; other Work Groups do not yet carry speculative BOQ rows.

Every one of the current 221 Master Catalog Work Packages is classified exactly
once:

- 185 map to an included canonical Work Group;
- 22 are `deferred` because their Discipline is intentionally excluded from
  the current product version;
- 14 are `lifecycle` facts such as approvals, documentation, inspections,
  training, or cross-discipline commissioning.

The classification is fail-closed. A future catalog item causes validation to
fail until it receives an explicit mapping or exclusion reason. There is no
label-based inference and no automatic fallback to a nearby Discipline.

## Persistence and security status

Migration 060 adds normalized, version-aware tables for ontology versions,
Departments, Disciplines, Work Groups, standard BOQ definitions, and execution
classifications. Projects receive a nullable version reference with a
restrictive foreign key; existing projects are not backfilled.

Published or project-referenced versions are immutable at the database
boundary. All ontology tables use RLS, anonymous access is revoked, and
authenticated users may read only global data, their own company's data, or
data visible to a global administrator. The migration has a hash-pinned local
deployment step and was executed successfully against local PostgreSQL inside
a transaction that was then rolled back.

Migration 061 connects new projects to this contract. The PM selects the eleven
execution-scope Disciplines by stable UUID; M100 remains budget-selectable but
is not forced into the Contractor's execution schedule. The project is pinned to the
corresponding ontology version. Existing projects remain unpinned and are not
rewritten.

Migration 062 provides the compatibility boundary required by Phase A item 5:

- Contractor Reports and Progress History inherit the project's ontology
  version;
- Contractor Report and PM Site Visit progress lines can carry a canonical
  Work Group UUID;
- known execution Work Package IDs are mapped only through the explicit
  classification table;
- deferred/lifecycle work cannot silently claim a Work Group;
- report risks have a normalized report-to-Work-Group relation for later UI
  use;
- historical projects and facts remain valid without backfill.

The new risk relation is authenticated read-only through the current Data API
surface and uses project-access RLS. Product write flows will be added only
when the risk workflow is implemented atomically.

Migration 063 implements the Phase B item 7 Execution Scope foundation. For a
new ontology-pinned project, the selected PM Disciplines are resolved to the
complete deterministic set of their canonical Work Groups and stored as an
immutable, numbered project snapshot. Repeating the same Discipline set does
not create a duplicate revision; changing it does. Existing projects are not
backfilled.

Execution Scope is deliberately separate from `project_gantt_tasks`. It stores
no activities, dates, durations, dependencies, zones, or progress and performs
no Gantt materialization. This preserves the roadmap rule that the Contractor
owns execution planning. An authenticated read model loads the latest snapshot
against its pinned ontology version, while table writes remain internal and
project-authorized RLS protects reads.

Migration 064 implements Phase B item 8, Contractor Schedule Setup. It adds
stable Contractor-owned Schedule Activities and a normalized many-to-many
Activity-to-Work-Group relation. One Work Group may be split across several
activities and one activity may combine several Work Groups, but every current
Execution Scope Work Group must be covered before Setup can be saved.

The Setup save is one Contractor-only, Draft-only, idempotent database command.
It rejects stale Execution Scope revisions, preserves dates for unchanged
Activity UUIDs, starts new activities without invented dates, and archives
removed activities instead of deleting history. Legacy projects without a
canonical Execution Scope continue through their existing schedule path.

Migration 065 implements Phase B item 9, the canonical Gantt baseline
snapshot. Every new ontology-backed submission pins its exact Execution Scope
revision and freezes the stable Schedule Activity UUID, submitted Activity
title, Gantt phase, dates, duration, and Activity-to-Work-Group membership. The review UI
therefore reads canonical identity and labels from the immutable submission,
not from a later moving Draft.

Submission is rejected if the Gantt contains an unlinked or stale Activity,
if an active Setup Activity has no Gantt row, or if the Activity mappings no
longer cover the current Execution Scope. The write remains one Contractor-
only idempotent transaction. Legacy projects without an Execution Scope retain
their existing immutable `wp_id` snapshot format and are not backfilled.

Migration 066 implements Phase B item 10, PM Baseline Approval. Approval now
validates the immutable submitted Schedule Activity rows and their complete
Work Group coverage against the pinned Execution Scope before creating an
explicit append-only `project_schedule_baselines` reference. Existing approved
legacy versions are registered without changing their historical state.

The PM confirmation shows the pinned Scope, Activity count, and distinct Work
Group count. Construction/reporting commitment projections require the
official baseline reference and fail closed if an APPROVED status exists
without a matching baseline record or immutable task rows.

## Next bounded slice

Phase B is complete. The next roadmap step is Phase C item 11: establish the
native BOQ domain and versioned data model. That slice must remain separate
from deterministic BOQ-to-Execution-Scope mapping (Phase C item 14) and must
not disturb the now-stable Scope-to-Schedule baseline chain.

Any unfinished branch that currently treats every zone category as a
Discipline must be reconciled semantically before reuse; it must not be merged
wholesale into this model.
