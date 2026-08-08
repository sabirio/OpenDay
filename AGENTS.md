# AGENTS.md — Operating Instructions for AI Coding Agents

This file tells an agent **how to work** in the OpenDay repository: how to
start, what to read, how to classify a task, how much context it actually
needs, how to implement and validate safely, and when to stop.

It does not define what OpenDay values — that is
[`agents/OPENDAY_CONSTITUTION.md`](agents/OPENDAY_CONSTITUTION.md) ("the
Constitution"). Do not restate the Constitution's Product Values,
architecture principles, or roadmap-vs-current distinctions here; reference
them by section instead. This file should stay much shorter than the
Constitution and should not need rewriting as OpenDay's codebase evolves.

## 0. Task Depth & Token Efficiency

Use the cheapest safe approach without reducing correctness.

Classify work implicitly by risk:

- MICRO — local UI/small isolated changes: focused inspection, no subagents, targeted tests.
- FEATURE — product/engine changes: focused architectural audit, targeted tests during work, full validation once at the end.
- CRITICAL — DB migrations, RLS, auth, security, production, financial semantics: deep audit, negative cases, full certification.

Rules:
- Do not spawn subagents by default.
- Search before broad reading.
- Do not read SourceOfTruth.md end-to-end unless justified.
- Read only relevant canonical sections and owners.
- Do not re-read unchanged files unnecessarily.
- Escalate task depth immediately if new risk is discovered.
- Never trade correctness or safety for token savings.

## 1. Instruction hierarchy

When sources disagree, resolve in this order — but do not silently pick the
convenient one when they genuinely conflict; surface the conflict instead:

1. The current, explicit instruction from the product owner.
2. `agents/OPENDAY_CONSTITUTION.md`.
3. Relevant domain/architecture documentation (`docs/`, `DESIGN.md`).
4. Tests and executable contracts.
5. Current code.
6. Historical notes, comments, changelogs.

Current code is authoritative for *what the app does today*, not for what
it should do. Tests are evidence of expected behavior, not proof — they can
be stale or incomplete themselves. Never amend the Constitution just to make
a requested implementation appear compliant; a Constitution change requires
an explicit, durable product/architecture decision, not a workaround.

## 2. Start-of-task protocol

Before editing anything, audit proportionately to the task — not maximally:

- confirm repo root, current branch, HEAD, worktree/staging state, and any
  active git operation (merge/rebase/cherry-pick/bisect);
- never assume repository state from a previous session or from memory;
- understand the actual requested scope, then inspect the relevant
  implementation before editing it.

Proportionality: a small UI fix needs the component, its nearby tests, and
the architecture boundary it sits behind — nothing more. A domain/engine
change needs the engine, its callers, its tests, relevant domain docs, and
the Constitution. A database/security change needs schema/migrations/RLS/
RPC and their application callers plus relevant tests/docs. A cross-domain
feature needs a broader architecture pass first.

### Canonical branch start and lifecycle

Before substantial new implementation:

1. fetch origin and resolve the current `origin/main`;
2. verify the repository, worktree, staging, and active-operation state;
3. create a new short-lived, task-specific branch from that exact current
   `origin/main`;
4. audit the affected architecture and existing behavior;
5. plan before implementing.

Never use a `main` SHA remembered from a previous task, chat, report, or
certification as the default base. New product work must not start from an
old feature, fix, hotfix, security, reconciliation, staging, or production
branch. If the available worktree is dirty or historical, preserve it and
create a separate clean worktree from current `origin/main`.

One bounded objective means one branch and one reviewable PR. Examples are
`feature/rfi-workflow`, `feature/procurement`,
`fix/weekly-report-export`, and `docs/canonical-branch-lifecycle`. Keep
unrelated feature work, cleanup, redesign, migration work, security work,
and production tooling out of that branch unless the objective has a proven
dependency on them.

The mandatory lifecycle is:

```
current origin/main → task branch → audit → plan → implementation
→ targeted certification → full required certification → commit → push
→ PR → review → explicit merge approval → merge to main → retire branch
```

A merged branch is retired and must not become the base of subsequent
development. Historical or materially divergent branches are evidence, not
sources of truth. Do not wholesale merge, automatically rebase, or
wholesale cherry-pick a scope-contaminated branch. Create a clean branch
from current `origin/main`, compare candidate changes semantically, and
classify each as `KEEP`, `ALREADY_IN_MAIN`, `REIMPLEMENT`, or `DISCARD`.

## 3. Progressive context loading

Do not read every document for every task. Always know the Constitution
exists; read it in full when the task:

- introduces a new feature, entity, or workflow;
- changes domain/business logic or a major workflow boundary;
- changes architecture or an infrastructure/provider boundary;
- introduces AI into a decision path;
- changes data ownership or a source-of-truth;
- might conflict with a Product Value.

For a task that clearly cannot touch those (a copy fix, a style tweak, a
narrowly-scoped bug fix), inspect the local code and its tests and proceed
without reloading the Constitution or unrelated domain docs. Load domain
documentation only for the domain actually affected, and a specialized role
(§11) only when it materially improves the outcome. Aim for the minimum
context sufficient for a correct decision, not the maximum available.

## 4. Task classification

Classify silently before implementing — this does not need a written report
unless it's genuinely useful to the reader:

- **A. Local** — small, isolated implementation change.
- **B. Domain** — changes business/domain behavior within one domain.
- **C. Cross-domain** — touches multiple modules, canonical state, shared
  engines, or workflows.
- **D. Data/Security** — database, migrations, RLS, auth, storage,
  permissions, RPC.
- **E. Product/Architecture** — new entity, workflow, engine, major
  abstraction, provider boundary, or significant UX model.

The classification sets how much context (§3) and validation (§9) the task
needs.

## 5. Implementation rules

- Inspect before editing; don't guess at existing behavior.
- Preserve One Source of Truth (Constitution §2) — reuse an existing
  calculation/model rather than adding a parallel one.
- Keep business/domain logic out of UI when it belongs in domain/core.
- Avoid speculative abstractions and unrelated refactors.
- Preserve existing behavior outside the requested scope.
- Keep the diff as small as the task reasonably allows.
- Update tests when behavior changes; don't weaken a test to make it pass.
- Preserve security boundaries — never bypass RLS/authorization to make a
  feature "work."
- Don't silently change lifecycle/state-machine semantics of an existing
  workflow.
- Distinguish current implementation from roadmap/future direction, and say
  which one you're describing or building toward.

## 6. Domain engine rule

Before writing a new calculation for progress, risk, readiness, dependency,
benchmarking, forecasting, contractor performance, or other shared
intelligence: check whether a canonical engine/capability already computes
it. Search first.

Never re-implement that logic inside a UI component, a report, an export, a
dashboard, an AI prompt, or mobile-specific code — those are consumers, not
owners. If the existing canonical engine is genuinely insufficient, extend
or deliberately evolve it; don't build a competing calculation without
stating why the existing one doesn't suffice.

## 7. Database / security safety

- Audit existing migrations/schema before writing a new one.
- Understand the RLS and authorization impact of the change.
- Preserve tenant/project boundaries.
- Follow existing migration conventions; don't invent a new pattern.
- Don't edit an already-applied historical migration for convenience unless
  repository policy explicitly allows it — add a new one instead.
- Test negative-authorization cases where relevant (who should be denied).
- Don't access production or staging unless explicitly authorized for this
  task.
- Don't expose secrets, and don't print secret values into logs or reports.
- Don't weaken security to make a test or feature pass.

## 8. Git and environment safety

- Never assume a clean worktree; check first.
- Preserve unrelated user changes — don't discard, reset, stash, or delete
  work that isn't yours without explicit authorization.
- Don't force-push. Don't push unless explicitly requested. Don't deploy
  unless explicitly requested.
- Don't commit unless the task explicitly requests or clearly authorizes it.
- Don't silently switch branches in a way that could affect the user's
  in-progress work.
- Report a blocker instead of taking a destructive shortcut around it.

When the task authorizes them, ordinary local development actions may include
fetching, creating a branch/worktree, implementation, tests, committing,
pushing, and opening a PR. Those permissions are independent gates:

- merging requires explicit owner approval;
- live staging and production database mutations are owner-executed-only;
- permission to branch, commit, push, or open a PR never implies permission
  to merge, deploy, or mutate a live database;
- agents may prepare and audit immutable artifacts and offline commands for a
  live database change, but must not execute the live mutation.

Preserve any stronger release-specific safety boundary.

## 9. Validation strategy

Match validation to the classification (§4); don't run the full
certification suite for a one-line fix, and don't skip validation for a
change that clearly needs it.

- **Local** — targeted tests, plus lint/typecheck where relevant.
- **Domain** — domain tests, affected integration tests, architecture guard
  where relevant.
- **Cross-domain** — broader test run, architecture guard, production
  build.
- **Data/Security** — schema/migration validation, authorization/RLS tests
  including negative cases, relevant application tests.
- **Product/Architecture** — the above plus an explicit re-check against
  the Constitution.

`weekly-tracker/` has `npm run lint`, `typecheck`, `test` (or
`check:architecture`), and `build` as the standing gates; `test:db`,
`test:rls`, `test:storage`, and `test:certification` exist for
database/security work. Before declaring a task done: run the strongest
validation reasonably available, state plainly which checks actually ran
versus which were assumed, and report failures honestly rather than
reframing them.

## 10. Documentation drift

After a meaningful change, ask whether it invalidates the Constitution,
domain/architecture documentation, `docs/SourceOfTruth.md`, or existing
tests/contracts. If not, don't touch documentation just to look thorough.
If it does, update the specific lower-level doc that's now wrong, or report
the drift if updating it is out of scope. The Constitution changes only for
a durable product/architecture principle — never as a side effect of normal
feature work.

## 11. Specialized roles

Role files (not created by this task) may later live under `agents/roles/`
— e.g. `PRODUCT_ARCHITECT.md`, `FIELD_UX.md`, `ENGINEER.md`,
`QA_SECURITY.md`. They are optional context modules an agent applies
sequentially when useful, not separate ceremonial agents and not a mandatory
pipeline. Load only the roles a task actually benefits from; a simple bug
needs only an engineering perspective plus targeted validation, while a
field-workflow redesign may benefit from field-UX, engineering, and QA
perspectives in sequence. No role can override the Constitution.

## 12. Stop conditions

Investigate first; don't stop for every minor uncertainty. Stop and surface
the issue, rather than guessing, when:

- the requested design appears to conflict with the Constitution;
- source-of-truth ownership for the fact in question is ambiguous;
- the task would require an unauthorized destructive data action;
- production/staging access is required but not authorized;
- a security boundary would need to be weakened to proceed;
- the repository is in an unexpected git state that makes the requested
  action unsafe;
- product semantics are genuinely ambiguous and picking one would create
  durable behavior the owner didn't actually decide.

## 13. Final report standard

For a meaningful task, report concisely: what changed and why, which
files/domains were affected, which validation actually ran, known
limitations or drift, the resulting git state, and whether anything was
committed, pushed, or deployed. Don't claim a check passed if it wasn't run,
and don't dump irrelevant command output. A trivial task earns a
correspondingly short report.
