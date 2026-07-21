# OpenDay — Construction Project Operating System

**OpenDay** is a Construction Project Operating System for managing construction and fit-out projects from execution through operational decision-making.

It combines structured project reporting, schedule and progress control, site inspections, observations, evidence workflows, risk detection, readiness tracking, and decision intelligence in one system.

OpenDay is designed around a core principle:

> **Every operational signal, calculation, status, and management insight must be traceable back to authoritative project data and a defined source of truth.**

The application currently focuses on construction and fit-out operations, with an architecture designed to support multiple companies, project types, and business domains without hard-coding one organization's workflow.

> **Repository layout:** the application lives in the `weekly-tracker/` subfolder. Unless stated otherwise, all `npm` commands below are run from that directory.

---

## Product model

OpenDay is evolving beyond a traditional project tracker.

The system is organized conceptually into three layers:

### 1. Execution Layer

Where project teams perform and record operational work.

Current capabilities include:

* Contractor Weekly Reports
* PM Site Visits
* Gantt / schedule tracking
* Work-package progress tracking
* Project risks
* Opening Readiness
* Observations / Snag List
* PDF plan revisions and plan pinning
* Photo and evidence capture
* Trade and stakeholder responsibility
* Observation publication and contractor visibility
* Activity and workflow history

### 2. Intelligence Layer

Where OpenDay converts project data into structured operational intelligence.

Current engines include:

* Progress Engine
* Risk Engine
* Readiness Engine
* Dependency Engine
* Weighting / scope calculations
* Insight normalization and prioritization

Planned evolution includes:

* Historical Intelligence
* Cross-project benchmarks
* Contractor performance intelligence
* Cost intelligence
* Forecasting
* Predictive project risk models

### 3. Decision Layer

The long-term product direction is not only to show project data, but to help management answer:

* What requires attention now?
* Why does it require attention?
* What changed?
* What is likely to happen next?
* What action should be taken?

This is represented today by the unified Insight system and prioritized management feeds.

---

## Tech stack

| Layer                      | Technology                                           |
| -------------------------- | ---------------------------------------------------- |
| Frontend                   | React + Vite                                         |
| Language                   | JavaScript / ES Modules                              |
| Backend                    | Supabase                                             |
| Database                   | PostgreSQL                                           |
| Authentication             | Supabase Auth                                        |
| Authorization              | PostgreSQL Row-Level Security + server-side commands |
| Storage                    | Supabase Storage                                     |
| Unit / architecture tests  | Node-based automated test suites                     |
| E2E                        | Playwright                                           |
| Local database environment | Local Supabase / Docker                              |
| CI                         | GitHub Actions                                       |
| Hosting                    | Vercel                                               |

---

## Core architecture principles

### Business logic does not belong in UI components

Pages and components are consumers of calculated state.

Business calculations must live in dedicated engines, core domain logic, or authoritative server-side commands.

```text
data
 ↓
services
 ↓
hooks / assembly
 ↓
engines
 ↓
core / insights
 ↓
pages & components
```

The UI should not independently calculate progress, risk, readiness, project health, or other business-critical metrics.

---

### Single source of truth

A metric or operational state should have one authoritative implementation.

Examples include:

* calculated progress;
* work-package weighting;
* schedule state;
* project readiness;
* risk evaluation;
* observation workflow state;
* publication state;
* responsibility mapping.

Duplicating business calculations inside individual screens is intentionally avoided.

---

### Execution state and publication state are separate

Operational workflows are designed so that creating or completing work does not automatically expose it to external stakeholders.

For example, an Observation may exist in a captured internal state before being explicitly published.

This allows OpenDay to maintain clear operational boundaries between:

```text
Captured
    ↓
Reviewed / prepared
    ↓
Published
    ↓
Visible to relevant external stakeholders
```

---

### Configuration over company-specific hard-coding

OpenDay should support different companies and project environments through configurable:

* project types;
* domains;
* trades;
* stakeholders;
* responsibility mappings;
* templates;
* thresholds;
* weighting rules;
* workflow configuration.

Company-specific behavior should not be embedded directly into generic product logic unless it represents a reusable domain rule.

---

## Main application domains

### Project Progress

Tracks project execution against work packages, project scope, schedule, and reported progress.

The Progress Engine is responsible for authoritative progress calculations rather than individual dashboard components.

---

### Contractor Reporting

Contractors submit structured project reports against controlled project scope and work packages.

The system validates submitted information against the project model before it becomes part of authoritative project reporting.

---

### PM Site Visit

Project Managers can perform structured site assessments and compare observed site conditions against reported progress.

The workflow supports partial inspections and discrepancy detection without requiring the entire project to be assessed during every visit.

---

### Risk Management

OpenDay derives project risks from project information and operational signals rather than treating risk only as manually entered text.

Risk logic is isolated from the presentation layer and can be consumed by dashboards, project views, and management insights.

---

### Opening Readiness

Tracks whether a project is operationally ready for opening or handover and identifies unresolved blockers.

Readiness is treated separately from simple construction progress.

A project may therefore have high physical progress while still having significant opening blockers.

---

## Observations / Snag List

The Observation system provides an evidence-based site issue workflow.

Typical PM workflow:

```text
Project
 ↓
PDF plan
 ↓
Active plan revision
 ↓
Place pin
 ↓
Select trade
 ↓
Create Observation
 ↓
Add description / evidence
 ↓
Capture
 ↓
Review
 ↓
Publish
 ↓
Responsible stakeholder visibility
 ↓
Resolution / history
```

### Plan management

Project plans are stored privately.

The system supports:

* PDF plans;
* immutable plan revisions;
* active and historical revisions;
* archive lifecycle;
* normalized pin coordinates;
* page-level pinning;
* project ownership validation.

Permanent public plan URLs are not used.

---

### Observation lifecycle

UI terminology uses **Observation**.

The underlying technical domain may still use `snag` naming in parts of the implementation.

Important workflow rules:

* Observation numbers are project-scoped.
* Numbers are monotonic and are not reused.
* Saving an Observation does not implicitly publish it.
* Captured and Published are separate states.
* Published Observations are archived rather than silently deleted.
* Duplicate workflows preserve traceability.
* Activity and comments form part of the evidence history.

---

### Trades and stakeholders

Trades and responsible stakeholders are configurable.

A stakeholder does not necessarily require an OpenDay login.

Projects can map:

```text
Trade
 ↓
Responsible stakeholder
 ↓
Preferred stakeholder where applicable
```

Example:

```text
Electrical
    → General Contractor

Furniture
    → Furniture Installer

Signage
    → Signage Supplier
```

This allows responsibility logic to work independently from authentication accounts.

---

## Insight architecture

OpenDay engines can produce operational signals that are normalized into a common Insight model.

Conceptually:

```js
{
  id,
  source,
  severity,
  scope,
  projectId,
  title,
  detail,
  recommendedAction,
  priorityScore
}
```

This allows different engines to feed one management decision layer.

Examples:

```text
Progress Engine ───┐
Risk Engine ───────┤
Readiness Engine ──┤
Dependency Engine ─┼──→ Insight Layer ─→ Prioritized management actions
Observations ──────┤
Schedule signals ──┘
```

The objective is to move OpenDay from passive reporting toward active project decision support.

---

## Project structure

```text
weekly-tracker/
├── src/
│   ├── engines/          # Calculation engines and authoritative business logic
│   ├── core/             # Shared project/domain logic and Insight system
│   ├── domains/          # Domain packs, templates and reusable business configuration
│   ├── services/         # Supabase/data-access layer
│   ├── hooks/            # Data assembly and application hooks
│   ├── components/       # Reusable UI and display components
│   ├── pages/            # Routed application screens
│   ├── auth/             # Authentication and UI permission handling
│   ├── config/           # Thresholds, templates and application configuration
│   ├── lib/              # Shared infrastructure clients
│   ├── migrations/       # Versioned PostgreSQL / Supabase migrations
│   └── utils/            # Shared helpers
│
├── tests/
│   └── e2e/              # Playwright end-to-end tests
│
├── scripts/              # Certification, fixture and operational tooling
├── seed.mjs              # Local/demo data utilities where applicable
├── .env.example          # Environment-variable template
└── package.json
```

---

# Environments

OpenDay uses separate environments for different stages of development and release.

Conceptually:

```text
LOCAL
  ↓
STAGING
  ↓
PRODUCTION
```

These environments must not share privileged credentials or databases.

---

## Local

Used for development and automated verification.

The local Supabase stack runs through Docker and provides an isolated local PostgreSQL/Auth/Storage environment.

Typical local workflow:

```text
local application
      +
local Supabase
      +
local fixtures
```

Local-only fixture and test credentials must never be treated as production credentials.

---

## Staging

Staging is used to validate the application against a hosted Supabase environment before production release.

It is intentionally separate from production.

---

## Production

Production changes are gated and must not be treated as normal development operations.

Database changes must follow the project's controlled migration and certification process.

---

# Local setup

## Prerequisites

Install:

* Node.js supported by the current project version;
* npm;
* Docker;
* Supabase CLI where required by the local workflow;
* Git.

Clone the repository:

```bash
git clone https://github.com/sabirio/OpenDay.git
cd OpenDay/weekly-tracker
```

Install locked dependencies:

```bash
npm ci
```

Create the local environment file:

```bash
cp .env.example .env.local
```

On Windows, the file can also be created manually from `.env.example`.

---

## Environment variables

Real secrets must never be committed to Git.

Typical variables include:

| Variable                    | Purpose                                   |
| --------------------------- | ----------------------------------------- |
| `VITE_SUPABASE_URL`         | Supabase URL used by the browser          |
| `VITE_SUPABASE_ANON_KEY`    | Browser-safe publishable / anon key       |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged operational/script access      |
| `E2E_SUPABASE_ANON_KEY`     | Playwright Supabase access where required |
| `E2E_*_EMAIL`               | Test account identity                     |
| `E2E_*_PASSWORD`            | Test account password                     |

### Important

Any variable beginning with:

```text
VITE_
```

can be exposed to browser-side application code.

Therefore privileged credentials such as the Supabase service-role / secret key must **never** use a `VITE_` prefix.

---

# Development

Start the application:

```bash
npm run dev
```

The Vite development server normally runs on:

```text
http://localhost:5173
```

The application then connects to the Supabase environment defined by the active local environment configuration.

---

## Common commands

Run from `weekly-tracker/`.

| Command            | Purpose                             |
| ------------------ | ----------------------------------- |
| `npm run dev`      | Start local Vite development server |
| `npm run build`    | Create production frontend build    |
| `npm run preview`  | Preview production build locally    |
| `npm run lint`     | Run ESLint validation               |
| `npm test`         | Run automated unit/core test suite  |
| `npm run test:e2e` | Run Playwright end-to-end tests     |

Additional certification and operational scripts exist under `scripts/` and should be used according to the relevant release workflow rather than executed blindly.

---

# Database migrations

Database migrations are stored under:

```text
src/migrations/
```

The project has evolved significantly beyond its original schema and now contains multiple generations of schema, security, workflow, storage, and Observation-related migrations.

Migration numbering is authoritative.

Do **not** manually assume that applying only the first migrations is sufficient for a current OpenDay database.

---

## Migration policy

Production database migrations are not treated as ad-hoc SQL changes.

The expected release discipline is conceptually:

```text
migration created
      ↓
local validation
      ↓
automated tests
      ↓
Docker-backed certification
      ↓
staging validation
      ↓
production backup / restore verification
      ↓
preflight
      ↓
release approval
      ↓
production apply
      ↓
post-apply verification
```

Production migrations must use the canonical project tooling and release process applicable to the release being deployed.

Manual production workarounds should not be used to bypass failed safety gates.

---

# Security

Security is enforced primarily at the database and server boundary rather than only through UI controls.

Current security architecture includes:

* Supabase Authentication;
* PostgreSQL Row-Level Security;
* project-level access boundaries;
* role-aware authorization;
* controlled `SECURITY DEFINER` server-side functions where appropriate;
* private Storage buckets;
* project ownership validation;
* contractor visibility boundaries;
* controlled publication workflows;
* restricted privileged credentials;
* production ACL and privilege hardening.

---

## Application roles

The core application currently supports roles including:

* Admin
* Project Manager
* Contractor
* Viewer

UI permissions improve usability, but UI hiding is **not** considered a security boundary.

Authoritative access must be enforced server-side.

---

## Service-role credentials

The Supabase service-role / secret credential bypasses Row-Level Security.

It is therefore restricted to trusted operational scripts and controlled environments.

It must never:

* be exposed in browser code;
* use a `VITE_` environment-variable prefix;
* be committed to Git;
* be included in frontend bundles.

---

## Storage

Sensitive project files such as project plans are stored privately.

Access is controlled through project authorization rather than permanent public URLs.

---

# Testing and certification

OpenDay uses multiple levels of verification.

```text
Unit / pure logic tests
        ↓
Architecture validation
        ↓
Database / RLS tests
        ↓
Storage tests
        ↓
End-to-end tests
        ↓
Docker-backed integration certification
        ↓
Staging verification
```

The certified application baseline contains thousands of automated checks across frontend logic, architecture, security, database behavior, storage boundaries, and critical workflows.

Exact test counts may change as the product evolves; CI and certification outputs are authoritative for the current commit.

---

# CI

GitHub Actions validates changes before integration.

The standard CI pipeline includes checks such as:

```text
npm ci
   ↓
lint
   ↓
build
   ↓
automated tests
```

Additional database, E2E, release, or environment-specific certification may run separately because those checks require controlled infrastructure and credentials.

Passing frontend CI alone does **not** constitute authorization to deploy database changes to production.

---

# Deployment model

The frontend is deployed separately from the Supabase backend.

Conceptually:

```text
GitHub
   ↓
CI
   ↓
Vercel
   ↓
OpenDay frontend

            ↕

Supabase
├── PostgreSQL
├── Auth
├── Storage
└── server-side database logic
```

A frontend deployment does not automatically mean that a database migration has been applied.

Frontend and database release state must therefore remain explicitly coordinated.

---

# Product direction

OpenDay's current focus is establishing a strong project-execution data foundation.

The next major intelligence layer is **Historical Intelligence**.

Its purpose is to use accumulated project history for:

* portfolio benchmarks;
* progress patterns;
* schedule forecasting;
* project risk prediction;
* contractor performance intelligence;
* cost-per-area analysis;
* opening forecasts;
* anomaly detection;
* AI-assisted operational recommendations.

Historical Intelligence should operate as a separate analytical layer over authoritative project and event data rather than as disconnected AI features embedded throughout the UI.

Conceptually:

```text
Operational workflows
        ↓
Authoritative project history
        ↓
Historical Intelligence
        ↓
Benchmarks / models / forecasts
        ↓
Decision support
```

---

# Engineering philosophy

OpenDay prioritizes:

1. **Authoritative business logic over duplicated UI calculations**
2. **Configuration over company-specific hard-coding**
3. **Server-side security over UI-only permissions**
4. **Traceable evidence over unverifiable status reporting**
5. **Explicit workflow state over hidden side effects**
6. **Reusable domain mechanisms over one-off features**
7. **Release safety over manual production shortcuts**
8. **Operational intelligence over passive dashboards**

The objective is not simply to digitize construction reporting.

The objective is to create a system that can progressively understand project execution well enough to help teams identify problems earlier, prioritize intervention, and make better construction-management decisions.

---

## License

**Proprietary software. All rights reserved.**

OpenDay is an independent software project.

Unauthorized copying, distribution, modification, publication, or commercial use is prohibited unless explicitly authorized by the copyright holder.
