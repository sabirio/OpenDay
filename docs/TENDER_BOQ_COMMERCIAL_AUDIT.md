# Tender / BOQ / Commercial Foundation Audit

## Scope

This audit reconciles the 2026-08-16 Tender / BOQ / Commercial roadmap with
the current feature branch. It does not introduce a new Project Creation
lifecycle, Payment Engine work, Historical Intelligence UI, or a global UI
redesign.

## Existing canonical capabilities

| Roadmap capability | Current source | Decision |
| --- | --- | --- |
| Work taxonomy | Published Work Ontology: Department -> Discipline -> Work Group -> flexible BOQ line | Keep; Work Group is the canonical commercial comparison category. |
| Template BOQ | Published ontology plus standard BOQ definitions | Audit and freeze as Template v1; do not create a giant item catalog. |
| Project BOQ | `project_boqs`, immutable versions and standard/custom lines | Keep as the single BOQ engine input. |
| Tender setup | `project_tenders` and immutable setup versions | Evolve into Tender Package; do not create a parallel tender engine. |
| Invitations | Tender-scoped bidder access and branded email | Add explicit Accept/Decline lifecycle before package access. |
| Bid rounds | Private drafts and immutable submissions | Keep; extend snapshots for quantity changes and bidder-added lines. |
| Comparison | Total, Discipline, Work Group and line evidence | Keep; Work Group becomes the primary default comparison level. |
| Clarifications | Versioned line clarification register | Keep; extend target scope to Tender and Work Group without a second workflow. |
| Award | Immutable awarded contract and awarded BOQ snapshots | Keep; link to Cost Packages and materialize a Commercial Baseline. |
| Additional Works | `project_variations` with evidence and decisions | Keep as the Additional Work entity; link to Cost Package and canonical category. |
| Forecast | Immutable project forecast versions and movements | Keep calculation engine; add Cost Package attribution and source metadata. |
| Historical evidence | Immutable operational/commercial snapshots already exist | Extend event capture only; do not build Historical Intelligence UI. |

## Material gaps

1. There is no universal Cost Package linking responsibility, budget,
   procurement, tender, commitment, Additional Works and forecast.
2. Procurement Method is not represented; Tender is incorrectly implied as
   the only commercial closure path.
3. Project Team is stored as profile fields/assigned project arrays rather
   than time-bounded memberships with responsibility scope and capabilities.
4. The only application roles are Admin, PM, Contractor and Viewer. The
   roadmap requires Consultant, Approver and Executive, and removal of Viewer.
5. Tender currently has one combined setup screen instead of state-driven
   Overview / Consultant / Participants / BOQ / Bids / Comparison /
   Clarifications / Award sections.
6. Consultant-measured BOQ preparation, PM return/accept and immutable
   Consultant BOQ Snapshot do not exist.
7. Invitation delivery and tender acceptance are conflated. Decline and No
   Response are not first-class states.
8. Tender Bid BOQ cannot yet add contractor-specific lines or preserve
   removed/excluded-line semantics in every round snapshot.
9. Award is tender-specific and is not yet generalized into a universal
   committed value for non-tender procurement methods.
10. Additional Works and Forecast are project/work-group based but not linked
    through Cost Package ownership.

## Source-of-truth decisions

- Cost Package is the commercial spine. Work Group remains the canonical
  category; neither replaces the other.
- Existing `project_tenders` evolves into Tender Package identity.
- Existing Project BOQ remains the only BOQ engine. Template, Consultant,
  Contractor Bid and Award are immutable layers/snapshots over that engine.
- Existing Variations workflow is the Additional Works workflow.
- Existing Forecast engine remains authoritative for deterministic totals.
- UI consumes database/domain projections and does not recalculate commercial
  state independently.

## Implementation order

The implementation follows the roadmap order: Cost Package and procurement
domain, project responsibility/access, Template v1 freeze, BOQ modes,
Consultant workflow, invitation acceptance, bid snapshots, comparison and
clarifications, Award/Commercial Baseline, committed/additional/forecast
aggregation, event capture, and a final security/integrity audit.

## Final implementation reconciliation

| Phase | Implemented result | Evidence |
| --- | --- | --- |
| 1. Domain foundation | Cost Package is the universal commercial spine. Every package has an explicit procurement method, including non-tender methods. Tender Package identity is linked to one or more Cost Packages. | Migrations `118`, `121`; domain engines and projections. |
| 2. Team and access | Time-bounded Project Membership, responsibility scopes and capabilities support Admin, PM, Consultant, Contractor, Approver and Executive. Viewer is removed. Package ownership is capability-scoped. | Migration `119`; capability/RLS tests. |
| 3. BOQ foundation | The published ontology remains the canonical Discipline -> Work Group -> flexible line hierarchy. The audited version is frozen as BOQ Template v1; no giant item catalog was introduced. | Migration `120`; template freeze tests. |
| 4. Single BOQ engine | One BOQ engine serves Contractor Measured and Consultant Measured modes. Contractor mode hides Consultant Qty; consultant mode exposes the accepted quantity read-only while contractor quantity and rates remain bidder-owned. | BOQ domain/facade, bidder presentation model, architecture and browser checks. |
| 5. BOQ layers | Template, Consultant, Contractor Bid and Award are immutable BOQ layers/snapshots rather than one mutable estimate. | Migrations `120`, `122`, `128`, `130`. |
| 6. Tender Package | Multiple Tender Packages per project are supported without department-specific engines. Package owner, procurement, participants, BOQ mode, deadlines, rounds and award are projected through the existing Project Detail shell. | Migration `121`; tender domain/presentation engines. |
| 7. Tender workflow | Direct and consultant workflows converge on the same contractor Bid engine after the BOQ issue point. PM return/accept and consultant freeze are explicit transitions. | Migrations `122`, `126`; workflow guards/tests. |
| 8. Tender UX | State-driven Tender sections provide Overview, conditional Consultant, Participants, BOQ, Bids, Comparison, Clarifications and Award. Business decisions/calculations are supplied by orchestration projections. | Tender components plus `useTenderPresentation`; browser verification. |
| 9. Invitations | Sent/Invited is distinct from Accepted, Declined and No Response. Only accepted contractors receive package/bid access; lifecycle events are retained. | Migrations `125`, `127`, `132`; RLS/transaction tests. |
| 10. Bid rounds | Each submission is immutable and round-scoped. Quantity, rates, totals, custom/removed lines and notes are retained between rounds without rewriting prior submissions. | Migration `128`; bid snapshot tests. |
| 11. Comparison | Work Group is the default canonical comparison level with line drill-down. Evidence includes contractor spread, consultant/contractor quantity variance, missing/excluded and bidder-added lines; the engine does not choose a winner. | Migration `128`; comparison projection/tests. |
| 12. Clarifications | Clarifications are first-class, historical records scoped to tender, Work Group or line, contractor and round, with Open -> Responded -> Revision Required/Accepted -> Closed transitions. | Migration `129`; clarification tests. |
| 13. Award | Selected bid produces immutable Award BOQ and Commercial Baseline snapshots linked to contractor and Cost Packages. Consultant and submitted bid snapshots remain unchanged. | Migration `130`; award tests. |
| 14. Financial overview | Cost Package financial truth is Budget, Committed, Approved Additional Works, Forecast and Variance. Committed supports Tender Award, Framework Call-off, Direct Award, Existing Contract and Nominated Supplier. | Migration `131`; canonical `CostPackageFinancialOverview`. |
| 15. Forecast | Immutable package forecasts retain value, source, owner and update time for every roadmap source, including budget fallback. | Migration `131`; forecast tests. |
| 16. Additional Works | Existing Variations remain the Additional Works engine, now linked to Cost Package, canonical category and contractor. Only approved values enter the financial total; pending exposure remains separate. | Migration `131`; Additional Works projections/tests. |
| 17. Historical foundation | Immutable bid-line facts, category price-spread snapshots and financial events retain the inputs needed by future intelligence. No Historical Intelligence UI was created. | Migration `132`; history and RLS tests. |

## UI business-logic boundary audit

Result: **PASS**.

- Commercial React pages/components import hooks and presentation models only;
  they do not import domain engines, services or Supabase directly.
- Commercial React scopes contain no total/variance calculation, category
  aggregation, workflow decision, authorization decision, role comparison or
  date/number formatting logic.
- Tender presentation, bidder access, variation presentation, form defaults
  and project resolution are computed in domain/orchestration layers.
- `CostPackageFinancialOverview` is the single rendered commercial financial
  truth. Legacy Forecast, Commercial Health and Variation Exposure panels are
  compatibility shells and are not rendered, preventing duplicate totals.
- The repository architecture guard has explicit commercial-spine rules and
  fails when these boundaries are crossed.

## Security and integrity audit

Result: **PASS**.

- Accepted participation, project membership, package scope and capability are
  independently enforced in database policies/functions.
- Contractors cannot access competitors' bids or internal owner financials.
- Consultant access is limited to assigned project/package/tender scope and
  does not imply access to bidder confidential data.
- Tender setup, consultant acceptance, bid submissions, rounds, Award BOQ,
  Commercial Baseline, commitments, forecasts and historical facts use
  immutable/versioned records where required.
- Function and sequence privileges are explicitly revoked from `public` and
  granted only where the application contract requires them.
- The pinned local migration chain covers migrations `117` through `132` and
  validates every file by SHA-256 before application.

## Verification record

- Application tests: 324 suites, 5,957 checks passed.
- Architecture guard: 46 checks passed.
- Lint: passed (four existing non-commercial warnings only).
- Typecheck: passed.
- Production build: passed.
- Transactional database tests: migrations `123`, `125`, `127`, `128`, `129`,
  `130`, `131` and `132` passed and rolled back cleanly.
- Browser verification: accepted contractor can see only their packages; a
  Contractor Measured BOQ hides Consultant Qty, enables Contractor Qty, and
  exposes neither competitor bids nor internal financial data. No fresh
  browser console errors were observed.

## Scope exclusions confirmed

No new Project Creation approval lifecycle, Actuals/ERP integration, Payment
Engine, universal BPM/permission builder, Historical Intelligence UI, AI tender
analysis, giant BOQ catalog or global OpenDay redesign was introduced.
