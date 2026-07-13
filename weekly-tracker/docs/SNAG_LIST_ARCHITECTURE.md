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

Note evidence is supported through the existing atomic command and metadata contract. File/image upload is deferred: the current private storage policies do not provide a snag-scoped upload/download boundary, so Phase 2 does not weaken the shared bucket or create public URLs. PDF upload/rendering, plan pins, annotations, advanced gallery, notifications, export, analytics, AI and configurable workflows remain deferred.
