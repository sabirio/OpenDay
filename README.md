OpenDay — C&F Progress Tracker
A multi-business Construction & Fit-out (C&F) progress tracking web app.
Management gets a portfolio dashboard and prioritized "what to do today" commands;
Project Managers submit structured weekly reports. Every number on screen is
traceable back to a single source of truth.
---
✨ Features
Home / Today — portfolio health at a glance, morning brief, and prioritized
action commands (behind schedule, high risk, opening-date at risk, missing reports,
additional works pending).
Portfolio Dashboard — management view: KPIs, risk matrix, SPI/Gantt, reliability
and trend analytics.
Weekly Reports — PM view: structured progress entry, per-week snapshots, and a
"Why this %?" explanation panel that reconstructs how each percentage was derived.
Weight Audit — transparency screen for template vs. project effective weights,
with template version and validation status.
Progress snapshots — every report stores an immutable weight snapshot
(`effective_weights` + `template_id` + `template_version`) for historical accuracy.
Multi-business / multi-template — domain packs and templates drive scope,
phases, and work packages per business line.
---
🏗️ Architecture
> **Core rule: all calculations live in engines. No business logic in components or pages.**
Each engine is a pure, unit-tested single source of truth. Pages and components
are thin consumers that only render pre-computed outputs.
```
src/
├── engines/                # Pure calculation logic (single source of truth)
│   ├── progressEngine.js       # progress %, schedule comparison, WoW delta
│   ├── riskEngine.js           # project risk scoring
│   ├── commandEngine.js        # "what to do" — consumes engine outputs, no recompute
│   ├── portfolioEngine.js      # portfolio KPIs & alerts
│   ├── openingReadinessEngine.js
│   └── progressDeltaEngine.js
├── core/
│   ├── projects/
│   │   ├── weights/            # computeEffectiveWeights (normalization)
│   │   └── explain/            # explainProgress — pure attribution layer
│   └── insights/               # adapters + selectors → unified Insight[] feed
├── domains/                    # domain packs & templates (constructionRetailV1, …)
├── services/                   # Supabase data access (projectService, reportService, …)
├── hooks/                      # useAllRows, useGanttMetrics — assembly layer
├── components/                 # pure display (weekly, dashboard, home, …)
├── pages/                      # thin routes (Home, Dashboard, WeeklyReports, …)
└── config/                     # scheduleConfig, thresholds, constants
```
Data flow: `services` (fetch) → `hooks` (assemble rows) → `engines` (compute) →
`core/insights` (normalize) → `components` (render).
---
🧰 Tech Stack
Frontend: React + Vite
Backend / DB: Supabase (PostgreSQL, Auth)
Language: JavaScript (ES modules)
Testing: unit tests on all engines and pure core functions
---
🚀 Getting Started
Prerequisites
Node.js (LTS)
A Supabase project (URL + anon key)
Installation
```bash
git clone <repo-url>
cd OpenDay
npm install
```
Environment
Create a `.env` file in the project root:
```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```
Run
```bash
npm run dev      # start dev server
npm test         # run unit tests
npm run build    # production build
```
---
🔐 Roles & Permissions
Access is gated per resource via `src/auth/rolePermissions.js`:
Admin — full access, including the template editor and weight audit.
PM — weekly reports for assigned projects, plus read-only audit/transparency views.
---
🧪 Testing Philosophy
Because all logic sits in pure engines, the test suite covers the math directly:
progress attribution, schedule comparison, week-over-week deltas, risk scoring, and
weight normalization. Components are intentionally logic-free and easy to reason about.
---
📄 License
Proprietary — internal project. All rights reserved.
