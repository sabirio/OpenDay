# Snag List Architecture

## Product boundary

Snag List is a standalone bounded context that can run as an OpenDay module without depending on React, Progress, Risk, Opening Readiness, contractor-report reducers, site-visit reducers or customer-specific terminology.

```text
UI (future)
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

Phase 2/3 remains responsible for PDF upload/viewer/pins, mobile field UI, photo capture UX, notifications, PDF export, analytics, AI and configurable workflows.
