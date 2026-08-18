# Project BOQ Core (Roadmap C.11-C.15)

## Outcome

OpenDay now has a native, versioned BOQ core. A project BOQ is pinned to the project's active Work Ontology version and stores immutable numbered revisions. BOQ lines belong to a valid Work Group and may reference either a standard ontology BOQ definition or a project-specific custom item. Work Group aggregation, deterministic Execution Scope mapping, and a controlled Excel compatibility layer all consume this same native contract.

The native BOQ editor and tender workflows remain Phase D concerns.

## Data model

- `project_boqs` is the stable project BOQ identity and records project, ontology version, title, and currency.
- `project_boq_versions` stores immutable numbered revisions and their source (`NATIVE`, `IMPORT`, or `SYSTEM`).
- `project_boq_items` stores immutable revision lines with stable line identity, Work Group, standard/custom kind, description, unit, quantity, optional unit rate, generated line total, notes, and optional reference/specification.
- Composite foreign keys prevent cross-project, cross-version, cross-ontology, and cross-Work-Group references.
- Standard items must reference a standard definition from the same ontology version and Work Group; custom items cannot impersonate a standard definition.

## Write and read boundary

- The only authenticated write path is `save_project_boq_revision(...)`.
- The command is PM/Admin-only, project-authorized, idempotent, project-locked, and uses optimistic latest-revision checks.
- Direct table mutation and sequence use are not granted to API roles.
- Read policies use project access and return only authorized project BOQs.
- The client model validates and normalizes exact decimal strings; PostgreSQL remains the source of truth for monetary line-total calculation.

## Discipline scope

The BOQ model uses only the active project Work Ontology. The currently excluded disciplines remain excluded:

- Refrigeration
- Food-Service Equipment
- External & Civil Works
- Retail Technology

## Migration and verification

- Migration: `weekly-tracker/src/migrations/067_project_boq_foundation.sql`
- Local reset chain: `npm run cert:reset:project-boq-foundation`
- Domain, service, migration-contract, security, idempotency, stale-write, and snapshot-immutability tests cover the foundation.

## Work Group aggregation (Roadmap C.12)

Migration `068_project_boq_work_group_aggregation.sql` adds the read-only `project_boq_work_group_totals` projection. For every populated Work Group in one immutable BOQ revision it returns:

- canonical Discipline and Work Group identity and display order;
- total, standard, and custom line counts;
- priced and unpriced line counts;
- the sum of database-generated line totals;
- an explicit fully-priced flag.

The view uses caller permissions (`security_invoker`) so the underlying project RLS remains effective. API roles receive read-only access. The application also has an exact-decimal aggregation model for deterministic local projections, but it sums database-generated line totals and never independently recalculates Quantity × Unit Rate.

## Standard and custom item lifecycle (Roadmap C.13)

Migration `069_project_boq_standard_custom_items.sql` adds a stable identity registry for every BOQ line:

- a `STANDARD` line permanently references one ontology definition and inherits its Work Group, description, and default unit;
- a `CUSTOM` line has no standard definition, retains its own description and unit, and must remain inside one canonical Work Group;
- the same line UUID may continue across revisions for commercial edits, but can never switch kind, Work Group, or standard definition;
- existing BOQ history is backfilled and the migration refuses to continue if it detects earlier identity drift;
- identities and revision snapshots are immutable and use project-scoped RLS.

The application provides separate standard/custom item factories and validates identity transitions before persistence. Contractor/bidder write access is intentionally not granted yet; that belongs to the native Tender Workspace and bidder-access phases.

## BOQ to Execution Scope mapping (Roadmap C.14)

Migration `070_project_boq_execution_scope_mapping.sql` adds an atomic PM/Admin command that maps one immutable BOQ revision to a new immutable Execution Scope revision:

- every detailed STANDARD and CUSTOM line follows its canonical Work Group;
- repeated Work Groups collapse to one Execution Scope item;
- the result records the exact source BOQ version and a deterministic fingerprint;
- the same BOQ version cannot be materialized twice for one project;
- optimistic revision checks prevent stale concurrent Scope writes;
- BOQ project, ontology and PM-selected Discipline scope must match;
- the response reports BOQ line count, Work Group count and how many detailed lines were collapsed.

No Gantt activity is created. Contractor Schedule Setup continues to decide how Work Groups become activities, so the system never assumes one BOQ line equals one task.

## Excel compatibility (Roadmap C.15)

The `.xlsx` exchange contract is a compatibility layer over one immutable BOQ revision:

- the workbook carries BOQ, revision and ontology metadata in a very-hidden technical sheet;
- stable line, Work Group, kind and standard-definition identities travel in hidden columns;
- unchanged numeric cells preserve the exact database decimal strings even when Excel displays IEEE-754 numbers;
- existing lines cannot disappear, change kind, move Work Group, or lose their technical identity during import;
- new lines are accepted only as `CUSTOM` items with an exact canonical Work Group code;
- completely empty new rows are ignored, while a blank Unit Rate remains an explicit unpriced line;
- the visible `Total` formula is informational and is never imported; PostgreSQL recalculates every line total;
- the imported workbook must match the exact source BOQ revision, preventing stale or cross-project uploads;
- a successful import uses the same authorization, validation, locking and idempotency contract as a native save, but the immutable revision records `source_kind = 'IMPORT'`.

Migration `071_project_boq_excel_compatibility.sql` adds only the explicit import provenance path. It grants no direct table mutation and does not expose the trigger helper through the Data API.

## Next roadmap step

Phase C is complete.

## Native BOQ editor (Roadmap D.16)

The PM/Admin office workspace is available at `/projects/:projectId/boq` and from the project's Commercial tab. It provides:

- creation of the first native BOQ and subsequent immutable revisions;
- standard item selection from the pinned Work Ontology catalog;
- project-specific custom rows constrained to a canonical Work Group;
- editable quantity, optional Unit Rate, notes, reference and specification;
- controlled standard description/unit and immutable line classification;
- domain validation before save, explicit unpriced-row handling and revision notes;
- revision history with read-only historical snapshots;
- unsaved-change protection;
- export of the latest clean revision and import preview before an Excel revision is committed.

The editor deliberately does not grant contractor access. The existing server command remains PM/Admin-only; bidder access belongs to D.18 and must be introduced together with its own tender authorization context rather than by weakening the project BOQ boundary.

## Tender Setup (Roadmap D.17)

The PM/Admin office workspace at `/projects/:projectId/tender` creates a versioned tender setup from a saved native BOQ revision. Each setup revision pins the project Work Ontology, issued BOQ revision, canonical Work Groups, tender identity, deadline, currency, rules and participating-contractor contacts. Previous setup revisions are immutable and saves use optimistic revision checks plus idempotent request IDs.

## Bidder Access (Roadmap D.18)

Saved tender participants can be invited through the existing Supabase Auth identity flow. Access is pinned to `Tender + Setup Revision + Participant`; it never adds the bidder to `profiles.assigned_projects`. A bidder activates matching invitations after authentication and receives a dedicated `/tenders` inbox plus a read-only server projection of only their issued tender. The projection excludes competitors, PM/internal rates and all unrelated project data.

## Bid Rounds / Versioning (Roadmap D.19)

PM/Admin can open sequential bid rounds pinned to a Tender Setup revision. Each invited bidder receives a private revision-guarded draft with quantity, Unit Rate and bidder note inputs. Draft data is not directly readable by PM. Submission copies the draft to immutable submission/header and line snapshots, preserving unpriced lines explicitly. A later round can open after every active participant has submitted; its initial read model inherits that bidder's previous rates and exposes deterministic changed-line indicators.

PM Review, clarification decisions and comparison remain deliberately outside this layer and begin at D.20.

## PM Bid Review (Roadmap D.20)

The PM/Admin tender workspace now provides a protected review register for every bid round. It shows invited participants, submission state, immutable totals, priced and missing line counts, canonical Work Group detail, bidder notes and exact rate changes from the participant's prior round. Each submitted bid moves through `NOT_STARTED -> IN_REVIEW -> REVIEWED` with optimistic revision checks and idempotent commands.

A bid round cannot close into the next round until every non-revoked participant has submitted and every submission is marked `REVIEWED`. This stage does not add line comments, contractor responses, cross-bidder ranking or award decisions; those remain D.21-D.23.

## Clarification Register (Roadmap D.21)

PM/Admin can create typed clarification drafts against an exact immutable bid-submission line and issue all drafts for one contractor as a numbered Clarification Set. Only after issue does the contractor see the questions in `/tenders`. Contractor responses and PM decisions use revision guards and idempotent commands; immutable event rows retain Created, Issued, Responded, Revision Required, Resolved and Closed history.

The next bid round remains blocked while any clarification from the current round is Draft, Open, Responded or Revision Required. Cross-bidder commercial comparison and award decisions remain D.22 and D.23.

## Tender Comparison Engine (Roadmap D.22)

The PM/Admin tender workspace compares any bid round at Total, Discipline, Work Group and BOQ Item levels. A PM-only read model exposes immutable submission totals and exact decimal strings; the deterministic domain engine calculates rank, lowest/highest, median, deviation from median, missing submissions/prices, zero rates, previous-round changes, quantity mismatches and unit-rate anomalies without floating-point money arithmetic.

Unpriced is never treated as zero. A unit-rate anomaly requires at least three priced bids and an absolute deviation of 20% or more from the median. Budget variance remains explicitly unavailable until the Phase E Budget Tool exists. The engine provides evidence, not a recommendation, winner selection or award mutation.

## Award (Roadmap D.23)

PM/Admin explicitly selects one eligible submission from the latest open round and records the decision note. The atomic award command requires a fully priced bid, completed PM review, closed clarifications and active bidder access; closing the final round also enforces that every active participant has submitted and been reviewed and that all round clarifications are terminal.

One successful command creates immutable Awarded Contract, Awarded BOQ Item and Awarded Work Group snapshots, reconciles copied line count and total to the source submission, closes the final round and changes the tender to `AWARDED`. Replays are idempotent, a second award is rejected, and new tender setup revisions or bid rounds are blocked. The separate D.24 command described below consumes this snapshot without weakening its immutability.
Migration 079 completes roadmap D.24. A PM/Admin may materialize the immutable
Awarded BOQ exactly once into an `AWARDED_BOQ` Execution Scope revision. The
command reconciles awarded line totals and Work Group totals to the contract
value, verifies ontology and PM Discipline boundaries, and collapses detailed
commercial lines to the distinct canonical Work Groups. It creates no Gantt
activities, dates, durations, dependencies, sequencing, or progress; those
remain owned by the Contractor Schedule Setup workflow.
