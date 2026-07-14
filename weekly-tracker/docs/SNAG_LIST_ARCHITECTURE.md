# Snag List Architecture

## Product boundary

Snag List is a standalone bounded context that can run as an OpenDay module without depending on React, Progress, Risk, Opening Readiness, contractor-report reducers, site-visit reducers or customer-specific terminology.

```text
React route/page
  -> controller hook and presentation model
  -> Snag application adapter/service
  -> Snag application commands and selectors
  -> canonical Snag workflow/domain engine
  -> repository/RPC adapter
  -> PostgreSQL/Supabase
```

The `snags` row is authoritative current state. `snag_events` is append-only audit history, not a global event store. `snag_evidence` stores private object metadata only. `snag_plan_versions` is deliberately minimal metadata for future PDF plan pinning; Phase 1 implements no renderer, upload or annotation UI.

## Domain and workflow

Statuses are `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `READY_FOR_REVIEW`, `CLOSED`, and `CANCELLED`. Reopen and reject are events that return the aggregate to `IN_PROGRESS`; there is no `REOPENED` status.

PM/Admin create, assign, edit, review, close, reopen and cancel. Contractors may start, add evidence and submit only their assigned snag for review. Viewers are read-only. Project identity is immutable. Terminal rows cannot be silently edited. Reject, reopen and cancel require reasons.

Every command carries actor, project, aggregate identity where applicable, `client_request_id`, expected version and validated payload. Identical replay returns the stored result; a conflicting payload under the same request ID fails. Optimistic version checks reject concurrent transitions. Current state, evidence and event history are written atomically by `execute_snag_command`.

## Data model and location contract

- `snags`: project-scoped number, description/classification, assignment, due date, status, location, timestamps and optimistic/schema/workflow versions.
- `snag_events`: actor, event type, before/after subsets, reason, source command and timestamp. Update/delete is trigger-blocked.
- `snag_evidence`: storage path, type, note, creator and optional transition link.
- `snag_plan_versions`: project, name/version, private storage path, MIME/page metadata and active flag.

A location requires text or structured zone/level/room data. Normalized coordinates are finite `0..1` pairs and require a plan-version reference. A plan is not required to create a snag.

## Authorization and persistence

RLS reads delegate to the canonical `can_access_project` function. Browser roles are never trusted by the RPC; role and project authorization come from `auth.uid()`, `profiles` and canonical project access functions. Direct table writes are revoked from `authenticated`; the security-definer command RPC is the only write boundary. New sequence/function/table grants are explicit because production default ACL behavior is known to be broad.

Contractor visibility follows existing project access. Write commands additionally require `assignee_id = auth.uid()` for contractor operations. This avoids a parallel membership system.

## Read models

Headless selectors support project, status, assignee, category, priority, creator, location zone and deterministic due-state filtering. Due states are `NO_DUE_DATE`, `ON_TRACK`, `DUE_SOON`, `OVERDUE`, and `COMPLETED`; they are derived at an explicit UTC reference time and not persisted.

## Configuration

Core invariants: transitions, permissions, coordinate range, project identity, idempotency, immutable history and terminal semantics. Versioned configuration: categories, disciplines, priority presentation, due-date policy, evidence/acknowledgement rules, SLA and notifications. The default fixture contains only neutral `GENERAL` classifications.

Deferred: arbitrary workflow designer, custom statuses, permission editor, no-code rules, company-admin configuration UI, AI classification and automated scoring.

## Future integration contracts

Future adapters may publish read-only signals for overdue critical snags, reopen/rejection rates, unresolved opening blockers, contractor correction cycle time, lifecycle history and post-opening FM conversion. Phase 1 does not call Risk, Opening Readiness, Contractor Performance, History Graph or OpenDay FM.

## Test matrix and scope

Domain tests cover valid/invalid transitions, role boundaries, reasons, terminal protection, project/version conflicts, input validation, idempotent replay, conflicting replay, evidence duplication prevention, deterministic history, coordinates and due-state selectors. Migration contract tests cover schema, constraints, indexes, RLS, grants, immutable events, authenticated project access, payload conflict checks and atomic state/history writes. Local database certification must prove actual application, rollback behavior and access isolation before Phase 1 can be declared complete.

## Phase 2 mobile application

The routes `/snags`, `/projects/:projectId/snags`, `/projects/:projectId/snags/new` and `/projects/:projectId/snags/:snagId` expose project selection, bounded list, create and detail workflows. Pages consume controller hooks and the presentation model; only the service adapter performs reads and calls `execute_snag_command`. Snag routes skip unrelated portfolio loading.

List reads are project-scoped, ordered by update time and capped at 200 rows. Detail performs three parallel bounded reads for aggregate, evidence metadata and append-only history. Contractor assignment choices use the narrow `list_snag_project_contractors` security-definer RPC because profiles RLS intentionally does not expose peer profiles to PM users. The RPC verifies authentication, PM/Admin role, company and canonical project access.

PM/Admin can create, assign/reassign, unassign, update details/location, reject, close, reopen and cancel when the canonical workflow exposes those actions. An assigned contractor can start, record a correction note and submit for review. Viewer is read-only. React does not contain a transition table; action availability comes from the public workflow API and every mutation remains server-authorized.

Create drafts use versioned `sessionStorage` keys scoped by user, project and form type. Writes retain a stable client request ID while pending/retrying, prevent double taps, refresh authoritative state after success and preserve unsent reason/note text on version conflict. Stable database errors are reduced to safe user-facing categories without SQL internals.

The UI is card-first below 760px, uses labelled native controls, visible status text, focus-visible styles, approximately 44px actions and a sticky create action area. Tested field widths are 320, 375 and 412px; desktop uses the same presentation model and denser layout. History uses one event presentation adapter and unknown future events remain visible.

Note evidence is supported through the existing atomic command and metadata contract. Snag evidence file/image upload remains deferred because its storage boundary is distinct from private project plans. Plan annotations, advanced gallery, notifications, export, analytics, AI and configurable workflows remain deferred.

## Phase 3 private plans and normalized pinning

Plan integration follows `plan route → controller hook → application adapter → authorized RPC/private Storage`. Mozilla PDF.js (`pdfjs-dist`) is dynamically loaded only for PDF validation or viewing; it consumes private Blob data and never sends documents to an external service. The viewer renders one page at a time, ignores stale render completion, releases its loading task, and exposes a semantic pin list alongside the visual surface.

Migration 033 adds `plan_page_number`, immutable file metadata, archival metadata, a partial unique index enforcing at most one active plan per project, page-pin lookup index, and a project/page validation trigger. A canonical pin is the exact tuple `(plan_version_id, plan_page_number, normalized x, normalized y)`. Coordinates are finite `0..1` values independent of viewport, zoom, DPR and canvas pixels. The referenced plan must belong to the same project and the page must be within its registered positive page count.

The dedicated `snag-plans` bucket is private, PDF-only and limited to 20 MB. Upload intent RPCs authorize PM/Admin through canonical project write access and issue the constrained path `{project}/{actor}/{request}.pdf`; browser uploads use `upsert:false`. Registration verifies that exact stored object, MIME and size before creating an immutable version row. Unregistered actor-owned paths may be removed as compensation; registered objects cannot be deleted through that policy. Client-side extension/MIME/size and PDF.js parsing are advisory defense-in-depth. Server-side antivirus and deep content inspection are not present.

Plan rows are readable through existing project access. Storage read policy independently enforces the project encoded in the object path. Plan management, lifecycle and plan-location commands are security-definer RPCs with fixed search paths, explicit role/project checks and least-privilege grants. Direct authenticated table writes remain revoked. Viewer and Contractor can read accessible plans and pins but cannot upload, activate, archive, place or relocate pins.

Activation is explicit and changes only lifecycle metadata: activating a revision deactivates the previous revision without touching any Snag. Historical pins continue to resolve their stored plan version/page. Relocation is an explicit PM/Admin command against the current Snag version and creates `SNAG_LOCATION_CHANGED`; terminal Snags remain immutable. Automatic revision alignment or pin transfer is deliberately absent.

Plan list queries are project-scoped and capped at 100. Page pin queries are scoped to one project, plan and page and capped at 500, returning only card-level Snag fields. The viewer never loads evidence or history for pins and never renders all PDF pages. Supported placement widths are 320, 375 and 412 px, with internally scrollable/pannable plan surface and 44 px mobile pin targets. Keyboard users can place at the page center and use the synchronized link list.

Production use of migration 033 requires separate database and Storage-policy review and approval. No Phase 3 migration or bucket change has been applied outside the guarded local environment.

## Phase 4 secure evidence lifecycle and closeout foundation

Evidence follows `Snag detail -> evidence controller -> evidence application adapter -> authorized RPC/private Storage`. The infrastructure layer owns selection, advisory validation, stable upload identity, progress, retry, private Blob retrieval and object-URL release. React never writes `snag_evidence` or `snags`, constructs a storage path, creates history, or receives a service-role credential. The canonical Snag aggregate remains authoritative for project access, assignment, optimistic version, terminal-state protection and append-only history.

Migration 034 extends existing evidence rows compatibly and introduces neutral `CONDITION`, `CORRECTION`, `VERIFICATION` and `GENERAL` file evidence. Registered file identity, storage path, original safe filename, MIME, size, actor, request identity, optional capture timestamp/checksum, sequence, schema version and transition event are retained. Legacy note-only rows remain readable. Registered rows and their history cannot be updated or deleted; an incorrect photograph is superseded by a new evidence item.

The `snag-evidence` bucket is private, limited to 8 MB and restricted to JPEG, PNG and WebP. HEIC/HEIF, SVG, HTML, executables, archives and unknown binary types are rejected. Camera capture uses the native `capture="environment"` hint with ordinary file selection as fallback. Browser MIME and extension checks are advisory; bucket constraints and registration-time comparison with actual Storage metadata are authoritative. Malware scanning, antivirus and deep binary signature inspection are not present.

The server derives paths as `projects/{project}/snags/{snag}/evidence/{evidence}/{safe filename}` from a stable evidence UUID. An upload-intent RPC verifies the authenticated actor, canonical project access, current assignment/state, role/type policy, aggregate version, size/type/count limits and request fingerprint. Storage accepts only the exact unexpired actor-owned intent. Registration re-locks the Snag, rechecks version, assignment and terminal state, verifies the stored object, then writes metadata, one `SNAG_EVIDENCE_ADDED` event and the aggregate version atomically. Identical retries return the original intent/result before mutable-state checks; conflicting retries fail explicitly. Upload uses `upsert:false`, so identity cannot be silently replaced.

An unregistered intent may delete only its exact actor-owned object. Registered objects cannot be removed through the orphan policy. Cleanup certification is local-only and proves unrelated objects are preserved; no broad filename- or timestamp-based deletion exists. Expired intent cleanup automation is deferred until an operational scheduler is separately approved.

The versioned default policy is permissive: evidence is recommended but neither correction evidence before review nor verification evidence before closure is required. The shared policy contract contains allowed types/MIME, maximum size/count, required counts, note satisfaction and role/type rules. Server RPCs remain authoritative. Reject and reopen preserve all prior evidence and events while allowing a new correction cycle when the Snag returns to `IN_PROGRESS`.

The mobile evidence section lazily downloads a selected private Blob only after an explicit “Open image” action. It never preloads full images or stores permanent/public/signed URLs. Preview URLs are scoped to the mounted UI and revoked on close, replacement or teardown. The gallery exposes type, filename, uploader metadata where available, timestamp, note, MIME/size, loading/error/retry states and semantic empty state. Capture, cancel and retry controls use native labels, live progress/error announcements, visible non-color states and approximately 44 px touch targets at 320, 375 and 412 px.

`get_snag_closeout` returns a deterministic project-scoped JSON contract containing schema version, project summary, Snag aggregate, plan revision/page/normalized pin, ordered timeline and evidence metadata ordered by type/time/identity. Storage paths, access tokens, signed URLs and image bytes are excluded. Missing optional plan data is explicit `null`; the `missing` array is reserved for future export diagnostics. Future authorized PDF/ZIP infrastructure may resolve private file bytes from evidence identities, but PDF generation and bulk export are not part of Phase 4.

Evidence metadata reads remain scoped to one Snag through the existing bounded detail query. Private images are loaded one at a time on demand; retries reuse one identity and do not retain duplicate object URLs. The maximum is 20 registered file evidence items per Snag. No Risk, Opening Readiness, Contractor Performance, analytics, notifications, OCR/AI, markup, image conversion or OpenDay FM dependency is introduced.

Production use of migration 034 requires separate approval for the table extension, intent table, bucket, Storage/RLS policies, immutable trigger and four security-definer RPCs. It also requires review of operational expired-intent cleanup and a decision on malware/deep-file inspection. Phase 4 applies these objects only to the guarded local environment.

## Phase 5 CPOS context map and module contract

OpenDay is a CPOS composed of Shared Platform Core, independent business modules, domain engines and application orchestration. Shared Core owns Company/Tenant, User, Role, Project, membership/access, audit actor and canonical site references. Snag List consumes those identities; it does not define competing Company, User, Role, Project or tenant-isolation models.

```text
React UI -> controller hooks -> application adapters -> Snag commands/use cases
                                                   -> ports -> Supabase/RPC/Storage
Snag append-only events -> OpenDay orchestrator -> read models/future engines
```

Snag List owns the Snag aggregate, lifecycle, assignment, due date, location, plan revision/page/pin linkage, evidence metadata and append-only history. Supabase, PostgreSQL RPC, RLS and private Storage are infrastructure adapters. React gathers input and renders state; it does not authorize, implement transitions or write Snag tables directly.

Allowed domain dependencies are deterministic domain policies, contracts and Shared Core identity passed through application context. Prohibited domain dependencies are React/Router, browser APIs, Supabase/Storage, UI/PDF code and Weekly Report, Site Visit, Progress, Risk or Readiness modules. Adjacent modules consume a safe integration contract through an OpenDay orchestrator; they do not import the Snag database or call the Snag engine directly.

The public module contract declares only Shared Core capabilities (`identity`, `tenancy`, `projects`, `audit`) and explicitly excludes adjacent business modules. Its entitlement seam answers whether `openday.snags` is enabled; pricing, billing and subscription administration remain platform responsibilities. Standalone and integrated modes therefore use the same domain and persistence contract. A separately packaged standalone application shell is not yet produced.

## Commands, ports and integration events

The browser application calls narrow application adapters. Critical writes terminate at security-definer RPCs that authorize against canonical project access and atomically update current state, command request, evidence where applicable, and append-only history. `client_request_id` plus fingerprint provides idempotent replay; expected aggregate version provides optimistic concurrency. Reads remain project-scoped and bounded.

`toSnagIntegrationEvent` is the pure adapter from an existing `snag_events` record to schema version 1. The envelope contains event type/id/time, actor, company, project, aggregate type/id, correlation ID and safe payload. Company identity must be supplied by Shared Core/orchestration and project mismatch fails closed. URL, token, secret and storage-path fields are recursively removed. Only event types emitted by migrations 030, 033 and 034 are accepted; no speculative plan, analytics or scoring events are declared.

The append-only `snag_events` table is forensic history and the transactional event record for current commands, not a general event platform or durable external outbox. No network publication guarantee exists. A future publisher must add delivery state/outbox semantics in a separately reviewed migration before claiming at-least-once external delivery. Future Benchmark, Contractor Performance, Risk or Readiness engines may consume versioned envelopes/read models through orchestration, but none is implemented here.

## Architecture certification decisions

| Rule | Result | Evidence / limitation |
| --- | --- | --- |
| Bounded context; no React/Supabase/other engines in domain | PASS | Recursive architecture guard over `core/snags`; isolated domain tests |
| No duplicate Project/User/Company/access core | PASS | Shared identities enter as context; canonical RLS access functions remain authoritative |
| Thin UI and centralized lifecycle | PASS | UI delegates through hooks/adapters; single `SNAG_STATUSES` definition and workflow API |
| Stable commands, atomicity, idempotency | PASS | Command RPC plus request fingerprint/version contracts and local certification |
| RLS, tenant/project isolation and private Storage | PASS | Migrations 030-034 contract tests and disposable local RLS/Storage certification |
| Immutable plans/history and historical linkage | PASS | Immutable metadata/triggers; activation never rewrites Snag plan references |
| Versioned integration events | PASS | Safe schema-v1 envelope, correlation and tenant/project validation |
| Forensic audit foundation | PARTIAL | Actor/time/before-after/reason/correlation retained; no durable external outbox or explicit user-vs-system discriminator |
| Standalone possible | PARTIAL | Runtime domain boundary is independent; standalone packaging/configuration shell is deferred |
| Integrated mode without fork | PASS | Same module contract consumes Shared Core and exposes orchestration envelope |
| Future analytics readiness | PASS | Immutable event/evidence/revision identities retained without implementing analytics engines |

### Architecture decisions and deferred scope

- ADR-5.1: retain the proven RPC transaction boundary; do not introduce repository abstractions that merely wrap one current adapter.
- ADR-5.2: adapt append-only events into a safe integration envelope; do not turn audit history into an unproven global event bus.
- ADR-5.3: obtain Company scope from Shared Core/orchestration rather than duplicating tenant ownership inside the Snag domain.
- ADR-5.4: expose a minimal entitlement capability seam; defer billing, marketplace and company configuration UI.
- ADR-5.5: preserve migrations 030-034 byte-for-byte; Phase 5 requires no schema change.

Next MVP work may add a standalone application shell and explicit system-action audit identity. Later platform work may add a transactional outbox, analytics projections and module commerce. A general event platform, speculative engine APIs, marketplace implementation, configurable workflow designer and large UI redesign are explicitly rejected from Phase 5 scope.

## Phase 5 canonical field capture workflow

The user-facing entity is **Observation**; `snag` remains the stable technical aggregate/table/RPC name. Field capture starts from an immutable private drawing revision. PM/Admin enables capture, presses and holds for 450 ms, confirms a normalized crosshair, and the server immediately persists a numbered `CAPTURED` Observation. Keyboard users may place at the drawing center with Enter. Drawing revision, page and normalized coordinates are stored on the aggregate and never migrate implicitly when another revision becomes active.

Publication and contractor workflow are independent axes:

- `publication_state`: `CAPTURED`, `PUBLISHED`, `ARCHIVED`;
- `status`: `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `READY_FOR_REVIEW`, `CLOSED`, `CANCELLED`.

`Done — keep Captured` saves the card but never publishes. Publication requires a configured trade, responsible stakeholder and either description or evidence. Individual and batch publication are explicit and idempotent. Batch publication publishes valid selections and returns incomplete selections as `needsDetails`. Contractors can read only `PUBLISHED` Observations assigned to their own account; captured and unrelated project/company data remain hidden by RLS.

### Project preparation and responsibility

`project_snag_trades` is a project-scoped configurable catalog with stable code, display name, accessible pin color and active state. `project_stakeholders` represents a responsible company/contact independently of `auth.users`; `user_id` is optional. A many-to-many `snag_trade_stakeholders` matrix supports multiple suggestions and one preferred stakeholder. Selection remains explicit in the Observation card; the matrix never silently assigns responsibility. The current preparation surface supports trade creation, stakeholder creation and preferred mapping. Search, recent/repeat shortcuts and inactive-item administration are deferred UX optimizations.

### Numbering, Activity and lifecycle safety

`project_snag_sequences` reserves monotonically increasing project-local numbers under one atomic upsert. Numbers are not derived from current rows and are never reused after archive or interruption. Capture, card completion, publication, comments, workflow transitions, evidence, duplicate and archive append immutable Activity events. Comments have their own immutable command identity and chronological timestamp.

Duplicate creates a new `CAPTURED` aggregate and number, copies descriptive/responsibility/location fields, and copies neither evidence, prior history, publication nor workflow state. The user then explicitly relocates its pin. Archive requires a reason and preserves the row/history. Published Observations are never hard-deleted by this workflow.

### Mobile and operational states

The capture surface uses existing OpenDay operational controls, private PDF rendering and explicit Saving/error states. Crosshair confirmation, card completion and batch selection are keyboard accessible and tested without horizontal overflow at 320, 360, 375, 390 and 412 px. Color reinforces trade/publication identity but text labels remain authoritative. The complete automated PM capture-to-publish scenario ran in 7.2 seconds in the local test environment; this is an end-to-end test duration, not a guaranteed network SLA or a separate photo-return latency measurement.

### Implemented versus deferred

Implemented: drawing capture, precise confirmation, immediate persistence, non-reusable numbering, trade/stakeholder configuration and suggestion, account-independent stakeholder, captured card, explicit individual/batch publication, contractor visibility boundary, comments/Activity, duplicate, show on drawing, archive, immutable revision linkage and local security certification.

Deferred: recent/repeat trade shortcuts, inline creation inside the capture card, automatic camera launch, notification delivery, offline synchronization, BIM/OCR/AI, automated pin transfer, advanced analytics and PDF export redesign. Existing private evidence capture remains available from the Observation detail after immediate persistence.
