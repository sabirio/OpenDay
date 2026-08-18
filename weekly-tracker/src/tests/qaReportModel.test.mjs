import {
  createQaSummary,
  finalizeQaSummary,
  recordQaTest,
  renderQaReport,
} from '../../tests/e2e/qaReportModel.mjs';

let passed = 0;
function check(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('\nqaReportModel');

const summary = createQaSummary({ baseUrl: 'http://127.0.0.1:5179' });
recordQaTest(summary, { moduleName: 'project flow', title: 'creates a project', status: 'passed' });
recordQaTest(summary, { moduleName: 'project flow', title: 'blocks outsider', status: 'failed', error: 'access denied' });
recordQaTest(summary, { moduleName: 'secondary', title: 'optional path', status: 'skipped' });
finalizeQaSummary(summary, '2026-08-18T00:00:00.000Z');

check('counts every reported test', summary.total === 3);
check('counts passed tests', summary.passed === 1);
check('counts failed tests', summary.failed === 1);
check('counts skipped tests', summary.skipped === 1);
check('a failed test makes the report fail', summary.status === 'FAIL');
check('retains the actual base URL', summary.baseUrl === 'http://127.0.0.1:5179');
check('records the failure message', summary.criticalFindings[0]?.error === 'access denied');

const markdown = renderQaReport(summary);
check('renders the real total', markdown.includes('| Total tests | 3 |'));
check('renders the failure', markdown.includes('access denied'));

console.log(`qaReportModel: ${passed}/9 checks passed`);
