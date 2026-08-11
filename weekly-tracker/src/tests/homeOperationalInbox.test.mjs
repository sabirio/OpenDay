// Structural contracts for the canonical Home operational briefing.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name, value) => value ? (pass++, console.log(`  OK ${name}`)) : (fail++, console.error(`  FAIL ${name}`));
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const home = read('../pages/Home.jsx');
const dashboard = read('../pages/Dashboard.jsx');
const priorities = read('../components/home/PrioritiesToday.jsx');
const morningBrief = read('../components/home/MorningBrief.jsx');
const portfolioHealth = read('../components/home/PortfolioHealth.jsx');
const recentActivity = read('../components/home/RecentActivity.jsx');
const continueWork = read('../components/home/ContinueWork.jsx');

const briefIdx = home.indexOf('<MorningBrief');
const prioritiesIdx = home.indexOf('<PrioritiesToday');
const continueIdx = home.indexOf('<ContinueWork');
const snapshotIdx = home.indexOf('<PortfolioHealth');
const activityIdx = home.indexOf('<RecentActivity');
check('Home DOM keeps the action-first mobile order: attention, continue, snapshot, activity',
  briefIdx !== -1 && prioritiesIdx !== -1 && continueIdx !== -1 && snapshotIdx !== -1 && activityIdx !== -1 &&
  briefIdx < prioritiesIdx && prioritiesIdx < continueIdx && continueIdx < snapshotIdx && snapshotIdx < activityIdx);

check('PriorityRow links to the existing Dashboard route using the real projectId',
  priorities.includes("to={`/?project=${ins.projectId}`}"));
check('the primary attention title preserves the same Dashboard deep link',
  morningBrief.includes("to={`/?project=${primary.projectId}`}"));
check('Dashboard consumes the deep-linked project through its existing search-param selection model',
  dashboard.includes('useSearchParams') && dashboard.includes('searchParams.get("project")') && /useState\(\(\) => linkedProjectId\)/.test(dashboard));

check('blocker expansion remains a semantic keyboard-operable sibling button',
  /hasBlockers && \([\s\S]{0,80}<button[\s\S]{0,240}aria-expanded=\{open\}/.test(priorities));
check('ConfidenceBadge is not nested inside the priority Link',
  priorities.indexOf('<ConfidenceBadge') > priorities.lastIndexOf('</Link>'));

check('Home reads role from canonical useAuth()',
  home.includes("import { useAuth } from '../auth/AuthContext'") && home.includes('useAuth()'));
check('attention action copy remains gated by displayAction',
  priorities.includes('displayAction(role, ins.recommendedAction)'));
check('Continue Work delegates access to the existing permission facade',
  continueWork.includes("from '../../hooks/useDefaultRoute.js'") &&
  continueWork.includes('canAccessResource(role, item.resource)') && !continueWork.includes("role === '"));

check('MorningBrief reuses the canonical AttentionSurface', morningBrief.includes('<AttentionSurface'));
check('Operational snapshot reuses AnalyticalSection and MetadataRows',
  portfolioHealth.includes('<AnalyticalSection') && portfolioHealth.includes('<MetadataRows'));
check('Recent activity reuses AnalyticalSection, EvidenceLedger, and EmptyState',
  recentActivity.includes('<AnalyticalSection') && recentActivity.includes('<EvidenceLedger') && recentActivity.includes('<EmptyState'));

check('empty and healthy portfolio messages remain distinct in the attention surface',
  morningBrief.includes('No projects yet') && morningBrief.includes('All clear — no issues detected across the portfolio.'));
check('PortfolioHealth preserves all existing KPI fields',
  /const\s*\{\s*active, total, atRisk, critical, missing, openingSoon, avgProgress,?\s*\}\s*=\s*kpis;/.test(portfolioHealth));
check('Home no longer renders the six-card KPI grid',
  !portfolioHealth.includes('StatCard') && !portfolioHealth.includes('dashboard-summary-card'));

check('Home activity is built only from already-loaded reports, visits, and projects',
  home.includes('buildRecentActivity({ projects, reports, siteVisits })'));
check('Home-local presentation helpers do not import global engines or services',
  !read('../components/home/homePresentation.js').includes('/engines/') &&
  !read('../components/home/homePresentation.js').includes('/services/'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
