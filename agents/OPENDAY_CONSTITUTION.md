# The OpenDay Constitution

This document is the durable product and architecture reference for anyone —
human or AI agent — making product or engineering decisions in OpenDay. It
governs *how decisions get made*, not what the current codebase looks like.

It is not a README, an architecture reference, a schema description, a
migration log, a route/component list, a sprint plan, a backlog, an API
reference, or a style guide. Those live in `docs/`, `README.md`, and the
codebase itself, and change far more often than this document should.

Most of this document should still be true if OpenDay changes frontend
framework, hosting provider, or database vendor.

---

## 1. What is OpenDay

OpenDay is a **Construction Project Operating System (CPOS)**: a system that
turns real construction and fit-out fieldwork — contractor reports, PM site
visits, schedules, photos, observations — into verified operational
decisions, not just a record of activity.

OpenDay is not a generic task tracker, a decorative dashboard product, or a
collection of unrelated construction tools bolted together. Every module
should contribute to one shared operational model of a project, not a
private dataset of its own.

## 2. Product Values

These five values are owner-approved. They govern trade-offs when a request
doesn't have an obvious answer. Preserve their meaning; do not water them
down when applying them to a specific decision.

### One Source of Truth

Every significant fact, state, and business calculation has one
authoritative canonical source. Derived representations may exist, but they
must remain subordinate to and traceable to that source. Do not duplicate
business logic across screens, components, reports, or clients. UI surfaces
consume canonical domain results; they do not independently reinterpret the
same rule. When two representations of the same fact could disagree, that
is a defect to close, not a pattern to extend.

### Keep It Simple

Do not create a new entity, workflow, screen, state, or feature when an
existing mechanism already solves the real user problem adequately. Minimize
user actions and conceptual surface area. Complexity *inside* an engine or
core module is acceptable when it materially simplifies the user's workflow
or improves correctness — the cost is paid once, by the system, not
repeatedly by the user. Avoid feature proliferation.

### Capture Once, Use Everywhere

Operational data is captured once, as close as practical to the real work
that produced it, and then reused throughout OpenDay — by progress
calculation, risk detection, readiness tracking, benchmarking, historical
intelligence, reporting, and future AI. Never ask a user to re-enter
information OpenDay already has.

### Work First, Software Second

OpenDay adapts to real construction and project workflows; it does not force
users to perform administrative work merely to satisfy the software. Field
workflows optimize for speed, low interaction count, mobile usability,
contextual evidence capture, and continuation of the real-world task. A
workflow that is technically correct but operationally burdensome is not a
successful workflow.

### Evidence Over Opinion

Where practical, decisions and analytics rely on observable operational
evidence — verified progress, site visit data, photos, comments, timestamps,
contractor reports, discrepancies, actual costs, drawing revisions,
historical outcomes — rather than unsupported assumption. **A missing or
incomplete activity is not, by itself, proof of schedule risk.** Absence of
data is a data-confidence problem to surface honestly, not a fact to
silently treat as zero or as danger.

## 3. Domain and Core vs. UI

Business and domain rules do not live primarily in UI components. Pages and
components are consumers of already-calculated state, not calculators.
Deterministic calculations — progress, risk, readiness, benchmarking, and
future forecasting — are domain/intelligence capabilities with one canonical
implementation each, not page-specific logic re-derived per screen.

Different UI surfaces (desktop, mobile, a future contractor app) consume the
same underlying domain rules rather than re-implementing them. This applies
equally to any future native or mobile client: it is a new presentation
layer over the existing domain, not a second business-logic implementation.

The exact layering mechanism (which folders, which facade pattern) is
implementation detail owned by the codebase and its own architecture
documentation — this Constitution only requires that the *boundary* exist
and that agents respect its direction rather than reach around it for
convenience.

## 4. Operational Data and the Product Loop

Normal project work should create structured, reusable data as a
by-product whenever practical — not as a separate data-entry chore.

The long-term product loop is, conceptually:

```
Capture → Structure → Compare → Predict → Explain
```

This is product direction, not a rigid pipeline every feature must
literally implement. It is a lens for asking, of any new capability: what
does this capture, does it reuse structure that already exists, what does
it compare against, and can OpenDay eventually explain the result rather
than merely display it?

## 5. Readiness vs. Risk

These are different questions and must stay different concepts:

- **Opening Readiness** answers *"what still needs to happen before
  opening, and can the project realistically get there?"* It may legitimately
  list many incomplete mandatory items — that is its job, an inventory of
  remaining work, not an alarm.
- **Risk** answers *"what is currently deviating from plan, or evidenced as
  a threat to the outcome?"*

Incomplete or not-started mandatory work is not, by itself, sufficient
evidence of schedule risk. A future task that hasn't started yet is normal,
not dangerous, until there is an actual signal — a missed planned date, a
material progress deviation, shrinking schedule slack, a threatened
dependency, or an explicit reported risk — that it has become one. Do not
let a large "remaining work" count leak into risk-flavored language
("critical", "at risk") without that evidence.

## 6. Workflow Boundaries

### Site Visit

Site Visit is the construction-phase field verification workflow. It
already supports photo evidence and observation notes as part of the
existing PM verification flow. Do not introduce a separate "Site Visit
Observation" entity or workflow to duplicate capability Site Visit already
has — that would violate Keep It Simple. This is an explicit product
decision, not an oversight.

### Snag List

Snag List (the Observation system) is for the end-of-construction,
pre-handover, and handover close-out stage — not the default mechanism for
ordinary construction-phase Site Visit remarks. Where the codebase has
verified lifecycle semantics for this domain (such as a separation between
a captured observation and a published one), preserve that separation as an
existing invariant rather than re-deriving it. This Constitution is not a
Snag List specification; consult the domain's own documentation for that.

### PM vs. Contractor Experience

PM experience is primarily **project-state oriented**: what is the state of
my portfolio and projects. Contractor experience is primarily **action
oriented**: what requires my attention right now. Do not blur these — a
contractor-facing surface that mimics a PM dashboard has usually drifted
from its intended user.

This principle may evolve into a dedicated contractor workspace ("My Work").
Treat that, and the idea of a contractor workspace surfacing the current
approved drawing revision so contractors reliably know what to build from,
as future product direction — do not describe either as already implemented
unless the codebase demonstrates it.

## 7. Historical Data and Intelligence

Historical operational data is a strategic product asset, not a disposable
byproduct. Future historical-intelligence capabilities — benchmarking, cost
and schedule comparisons, contractor performance profiles, forecasting,
anomaly detection, AI explanation — are roadmap direction, not current
implementation, unless the codebase proves otherwise.

When they arrive, they should be designed as reusable intelligence/domain
capabilities, not calculations owned by a single dashboard. Historical
comparisons should use relevant comparable cohorts rather than naive global
averages once sufficient data exists. Imported historical data must preserve
its own uncertainty and gaps rather than being smoothed into false
precision — and OpenDay must never fabricate site visits, reports, snags, or
other operational evidence for a historical project that didn't actually
produce them.

## 8. Data Import and Export

The durable direction for bringing external structured data (historical
projects, budgets/BOQs, and similar) into OpenDay is conceptually:

```
Source → Parse → Map → Normalize → Validate → Preview → Commit
```

This should exist as one reusable capability, not a separate bespoke upload
implementation per module. Spreadsheet formats (Excel/CSV) are an initial
transport, not the domain architecture — the domain model behind imported
data should not assume one company's exact column layout. Data portability
(export, not just import) should remain possible. This capability is
roadmap direction; do not treat it as already built.

## 9. Configurability

Prefer configurable domain behavior where companies legitimately differ —
terminology, project structure, contractor model, cost structure,
operational conventions — rather than hard-coding one organization's
convention into the core. But do not build speculative generic frameworks
for hypothetical future customers. Configuration solves demonstrated
variability; it does not anticipate imagined variability. Apply Keep It
Simple here as everywhere else.

## 10. Infrastructure Portability

OpenDay currently runs on Supabase (Postgres, Auth, Storage) and is hosted
on Vercel. That is a legitimate, fully-usable choice today — this
Constitution is not a call to migrate or to abstract prematurely.

The durable principle: domain/business logic should not unnecessarily
depend on a specific infrastructure provider. Provider-specific abstraction
is worth introducing only at natural seams — persistence/data access,
object/file storage, identity, external AI providers — and only when it
provides *present* architectural value, not speculative optionality.
OpenDay should be prepared to migrate infrastructure if one day justified;
it should not carry the cost of supporting multiple clouds today.

## 11. Deterministic Engines and AI

Future AI must not become the canonical source for a fact OpenDay can
calculate deterministically and reliably. The preferred shape is:

```
Domain / Intelligence Engines → structured context → AI layer → explanation / assistance
```

Good: the Risk Engine determines evidenced risk and AI explains it in plain
language; the future Benchmark Engine computes cohort statistics and AI
narrates the comparison; Site Visit evidence exists and AI drafts a summary
of it.

Not acceptable: an LLM inventing a progress percentage, independently
deciding canonical opening readiness, or fabricating missing historical
evidence to fill a gap.

When AI providers are introduced, they should eventually sit behind a
provider boundary so OpenDay is not unnecessarily coupled to one vendor —
following the same natural-seam logic as Section 10, not a separate rule.
No AI capability is implied to exist today merely by being described here.

## 12. The Change Decision Test

Before introducing a meaningful new feature, entity, or workflow, an agent
should be able to answer these honestly:

1. Does this create another source of truth for a fact that already has one?
2. Can an existing model or workflow already solve the real problem?
3. Are we asking the user to (re-)enter data OpenDay already possesses?
4. Does this simplify the real work, or does it make the user serve the software?
5. Is the decision backed by evidence, or by assumption?
6. Does this business logic belong in reusable domain/core rather than this one screen?
7. Are we adding infrastructure coupling without a present reason?
8. Is this solving a demonstrated problem, or speculative complexity?

If the honest answer to any of these is uncomfortable, that discomfort is
the signal — resolve it before writing the implementation, not after.

## 13. Conflict and Governance

An agent must not silently violate a constitutional principle to satisfy a
request. If a requested implementation appears to conflict with this
Constitution, say so — identify the specific conflict — before implementing
the conflicting design. Implement the requested direction only once that
conflict has been surfaced.

The product owner's explicit, current decision outranks both this document
and existing code: an owner may amend the Constitution deliberately, and an
explicit current product decision is not overridden by legacy implementation
just because the legacy implementation is older. Existing code describes
what was built, not what must remain true.

The Constitution itself is not immutable, but it changes deliberately and
rarely. A minor implementation change does not require updating it. Update
it only when a durable product or architecture principle actually changes —
not to record a sprint outcome, a bug fix, or a one-off decision.

Agents must not amend the Constitution merely to make an implementation
request appear compliant. Constitutional changes require an explicit
durable product or architecture decision.

### Document taxonomy

- **Constitution** (this document) — durable principles and invariants.
- **Domain documentation** (`docs/`, module-level notes) — how a domain or
  workflow currently works, and why, in more implementation-specific detail.
- **Code** — the current implementation. Authoritative for "what happens
  today," not for "what should be true."
- **Tests** — executable evidence of expected behavior; the most reliable
  signal that a documented behavior is actually true right now.

When these disagree, that disagreement is itself worth surfacing rather
than silently picking one.
