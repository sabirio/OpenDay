import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const check = (name, condition) => {
  if (condition) {
    pass += 1;
    console.log(`  OK ${name}`);
  } else {
    fail += 1;
    console.error(`  FAIL ${name}`);
  }
};

const page = read('../pages/RiskDashboard.jsx');
const detail = read('../components/risk/RiskSelectedDetail.jsx');
const master = read('../components/risk/RiskDashboardMasterList.jsx');
const rowModel = read('../core/risk/computeRiskRowsModel.js');
const riskEngine = read('../engines/riskEngine.js');
const stateEngine = read('../core/opendayEngine/evaluateProjectState.js');
const permissions = read('../auth/rolePermissions.js');
const app = read('../App.jsx');
const projectHub = read('../components/dashboard/DashboardProjectOverview.jsx');

console.log('\nG1.11 Risk structural contracts');

check('Risk score and severity remain owned by the canonical engine and state evaluator',
  riskEngine.includes('export function computeProjectRiskScore')
    && stateEngine.includes('computeProjectRiskScore')
    && rowModel.includes('riskScore, contScore, and health are forwarded from base'));
check('Readiness remains a canonical input and is not recalculated by Risk presentation',
  riskEngine.includes("readiness?.verdict === 'NOT_ACHIEVABLE'")
    && !/(computeOpeningReadiness|calculateReadiness|readinessScore)/.test(detail + master + page));
check('Discrepancy signals remain behind the canonical engine inputs',
  riskEngine.includes('computePmAlignmentItems')
    && !/(computePmAlignmentItems|computeWPObservationDiscrepancy)/.test(detail + master + page));
check('Risk presentation does not create a second score, severity, probability, or readiness model',
  !/(getRiskLevel|computeProjectRiskScore|newRiskScore|probabilityModel|Math\.min\(100)/.test(detail + master + page));
check('Project query handoff and mobile detail entry remain preserved',
  page.includes("linkedProjectId = searchParams.get('project')")
    && page.includes("useState(() => (linkedProjectId ? 'detail' : 'master'))")
    && projectHub.includes('`/risk?project=${encodedProjectId}`'));
check('Canonical permission facade still excludes Contractor and Viewer from internal Risk',
  /PM: \[[^\]]*'risk_engine'/.test(permissions)
    && !/Contractor: \[[^\]]*'risk_engine'/.test(permissions)
    && !/Viewer: \[[^\]]*'risk_engine'/.test(permissions)
    && app.includes('resource="risk_engine"'));
check('Canonical MasterDetail and detail-content primitives dominate the Risk composition',
  page.includes('<MasterDetailLayout')
    && ['AttentionSurface', 'AnalyticalSection', 'EvidenceLedger', 'MetadataRows', 'EmptyState'].every(name => detail.includes(name)));
check('Signal, impact, evidence, and response boundary are visibly separated',
  ['Why this state', 'Operational impact', 'Evidence provenance', 'Supporting signals', 'Response boundary'].every(label => detail.includes(label)));
check('Only the canonical high-or-critical predicate controls privileged attention treatment',
  detail.includes('isHighOrCriticalLevel(row.riskScore.level)')
    && detail.includes("tone={privilegedRisk ? 'attention' : 'calm'}"));
check('Presentation exposes engine reasons and source provenance without manufacturing domain state',
  detail.includes('row.riskScore.reasons')
    && detail.includes('reasonForFactor')
    && !/(setRisk|riskScore\s*=|new Action|createAction|createSnag|taskModel)/.test(detail + master));
check('Response language preserves the pre-G1.13 Action and Snag ownership boundary',
  detail.includes('Risk does not create an Action or Snag here.')
    && detail.includes('no Action lifecycle is created here.'));
check('Normal not-assessable work remains a neutral canonical engine output',
  riskEngine.includes('computeNotAssessableRisk')
    && riskEngine.includes('Awaiting schedule commitment'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
