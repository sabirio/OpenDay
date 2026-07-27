// homeOperationalInbox.test.mjs — structural checks for Home P0
// (UI HOME P0 — OPERATIONAL INBOX REFINEMENT).
//
// These assert wiring facts (render order, navigation target, route
// support) that a plain-Node source read can verify without a DOM/RTL
// harness (none is set up in this repo — see src/tests/runAll.mjs).
// Pure-function behavior (role-aware text, empty-state classification) is
// covered separately in components/home/__tests__/homePresentation.test.mjs.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name, value) => value ? (pass++, console.log(`  OK ${name}`)) : (fail++, console.error(`  FAIL ${name}`));
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const home            = read('../pages/Home.jsx');
const dashboard       = read('../pages/Dashboard.jsx');
const prioritiesToday = read('../components/home/PrioritiesToday.jsx');
const morningBrief    = read('../components/home/MorningBrief.jsx');
const portfolioHealth = read('../components/home/PortfolioHealth.jsx');

// ── P0-1: hierarchy order — Priorities before Portfolio Health ──────────
const briefIdx      = home.indexOf('<MorningBrief');
const prioritiesIdx = home.indexOf('<PrioritiesToday');
const healthIdx     = home.indexOf('<PortfolioHealth');
check('Home renders Morning Brief, then Priorities, then Portfolio Health, in that order',
  briefIdx !== -1 && prioritiesIdx !== -1 && healthIdx !== -1 &&
  briefIdx < prioritiesIdx && prioritiesIdx < healthIdx);

// ── P0-2: priority click-through targets the real project on the existing route ──
check('PriorityRow links to the Dashboard route using the insight\'s real projectId',
  prioritiesToday.includes("to={`/?project=${ins.projectId}`}"));
check('no second project-detail route was introduced for this', !prioritiesToday.includes('projectDetailRoute') && !home.includes('Route'));
check('Dashboard reads the linked project id via useSearchParams (no new route registered)',
  dashboard.includes('useSearchParams') && dashboard.includes('searchParams.get("project")'));
check('Dashboard seeds selectedProjectId from the linked id, not a separate selection model',
  /useState\(\(\) => linkedProjectId\)/.test(dashboard));

// ── P0-2 accessibility: blocker toggle is a semantic sibling button, not nested in the Link ──
check('blocker-expand control is a real <button> with aria-expanded (keyboard operable)',
  /hasBlockers && \([\s\S]{0,40}<button[\s\S]{0,200}aria-expanded=\{open\}/.test(prioritiesToday));
check('ConfidenceBadge usage is not nested inside the project Link (avoids nested interactive controls)',
  prioritiesToday.indexOf('<ConfidenceBadge') > prioritiesToday.lastIndexOf('</Link>'));

// ── P0-3: role-aware action text sourced from the canonical auth role ───
check('Home reads role from the canonical useAuth() context, not a re-derived field',
  home.includes("import { useAuth } from '../auth/AuthContext'") && home.includes('useAuth()'));
check('PrioritiesToday renders the role-gated action via the shared displayAction helper (no inline PM-string duplication)',
  prioritiesToday.includes('displayAction(role, ins.recommendedAction)'));
check('commandEngine itself was not modified for role text (grep for role in the engine finds nothing)',
  !read('../engines/commandEngine.js').includes('role'));

// ── P0-4: empty vs healthy portfolio copy are distinct strings ──────────
check('empty-tenant copy differs from the healthy-portfolio copy in MorningBrief',
  morningBrief.includes('No projects yet') && morningBrief.includes('All clear — no issues detected across the portfolio.'));
check('empty-tenant copy differs from the healthy-portfolio copy in PrioritiesToday',
  prioritiesToday.includes('No projects yet') && prioritiesToday.includes('No critical or warning issues — well done.'));

// ── P0-5: Portfolio Health demoted, same six KPI fields still destructured ──
check('PortfolioHealth still surfaces exactly the six original KPI fields (no new/removed metrics)',
  /const\s*\{\s*active, total, atRisk, critical, missing, openingSoon, avgProgress,?\s*\}\s*=\s*kpis;/.test(portfolioHealth));
check('Portfolio Health value type scale was reduced from the previous 26px anchor size',
  !portfolioHealth.includes('fontSize: 26') && portfolioHealth.includes('fontSize: 19'));

// ── P0-6: Home-local tone duplication consolidated, not globalized ──────
check('MorningBrief and PortfolioHealth both consume the shared Home-local homePresentation helper',
  morningBrief.includes("from './homePresentation.js'") && portfolioHealth.includes("from './homePresentation.js'"));
check('the Home-local helper does not import global statusColors/riskConfig (kept local-only per scope)',
  !read('../components/home/homePresentation.js').includes('statusColors') &&
  !read('../components/home/homePresentation.js').includes('riskConfig'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
