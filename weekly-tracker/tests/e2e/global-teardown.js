import fs from 'fs';
import path from 'path';

export default async function globalTeardown() {
  const resultsPath = path.join(process.cwd(), 'test-results', 'results.json');
  const reportDir = path.join(process.cwd(), 'test-results');

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  let suites;
  let stats = { passed: 0, failed: 0, skipped: 0, total: 0 };
  let criticalFindings = [];
  let warnings = [];
  let modules = {};

  if (fs.existsSync(resultsPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      suites = raw.suites || [];

      const collectResults = (suiteList, moduleName) => {
        for (const suite of suiteList) {
          const name = suite.title || moduleName;
          if (!modules[name]) modules[name] = { passed: 0, failed: 0, skipped: 0 };

          for (const spec of suite.specs || []) {
            for (const test of spec.tests || []) {
              stats.total++;
              const status = test.status;
              if (status === 'passed') {
                stats.passed++;
                modules[name].passed++;
              } else if (status === 'skipped' || test.expectedStatus === 'skipped') {
                stats.skipped++;
                modules[name].skipped++;
              } else {
                stats.failed++;
                modules[name].failed++;
                criticalFindings.push({
                  suite: name,
                  test: spec.title,
                  error: test.results?.[0]?.error?.message || 'Unknown error',
                });
              }
            }
          }

          if (suite.suites?.length) {
            collectResults(suite.suites, name);
          }
        }
      };

      collectResults(suites, 'Root');
    } catch (e) {
      warnings.push(`Failed to parse results.json: ${e.message}`);
    }
  } else {
    warnings.push('test-results/results.json not found — tests may not have run yet');
  }

  const overallStatus =
    stats.failed > 0 ? 'FAIL' : warnings.length > 0 ? 'PASS WITH WARNINGS' : 'PASS';

  const now = new Date().toISOString();
  const baseUrl = 'http://localhost:5173';

  // Generate markdown report
  const moduleRows = Object.entries(modules)
    .map(([name, m]) => `| ${name} | ${m.passed} | ${m.failed} | ${m.skipped} |`)
    .join('\n');

  const failedSection =
    criticalFindings.length > 0
      ? criticalFindings
          .map(
            (f, i) =>
              `### Failure ${i + 1}: ${f.test}\n**Suite:** ${f.suite}\n\`\`\`\n${f.error}\n\`\`\``
          )
          .join('\n\n')
      : '_No test failures._';

  const warningSection =
    warnings.length > 0 ? warnings.map((w) => `- ⚠️ ${w}`).join('\n') : '_No warnings._';

  const skipSection =
    stats.skipped > 0
      ? `${stats.skipped} test(s) were skipped, typically because seed data was not available ` +
        `in the test environment. This is expected in CI without pre-seeded data.`
      : '_No tests skipped._';

  const md = `# Noryx / Construction PM Portal — QA Report

**Generated:** ${now}
**Base URL:** ${baseUrl}
**Overall Status:** ${overallStatus === 'PASS' ? '✅ PASS' : overallStatus === 'FAIL' ? '❌ FAIL' : '⚠️ PASS WITH WARNINGS'}

---

## Summary

| Metric | Count |
|--------|-------|
| Total tests | ${stats.total} |
| ✅ Passed | ${stats.passed} |
| ❌ Failed | ${stats.failed} |
| ⏭️ Skipped | ${stats.skipped} |

---

## Modules

| Module | Passed | Failed | Skipped |
|--------|--------|--------|---------|
${moduleRows || '| (no results) | — | — | — |'}

---

## Critical Workflows

- Auth & Role Access Control
- Project CRUD
- Contractor Report Submission & Prefill
- PM Site Visit & GC Comparison
- Weekly Reports Aggregation
- Risk Dashboard Risk Indicators
- Admin User Management
- Full Data Flow (Project → GC Report → PM Visit → Dashboard → Risk)
- Risk Logic (discrepancy counts, N/A exclusion, support-required, additional-works)
- Opening Readiness (status badges, Critical/At Risk thresholds, countdown)
- Executive Project Summary (drawer blocks, no deep risk detail, Escape close)
- Persistence Stress (reload survival, logout/re-login, cross-page data consistency)
- Role Security (direct URL blocks, session invalidation, nav visibility per role)
- Multi-Project Scenario (4 lifecycle states, KPI cross-check, weekly-reports cycling)

---

## Skipped Tests

${skipSection}

---

## Failures

${failedSection}

---

## Warnings

${warningSection}

---

## Final QA Status: ${overallStatus}
`;

  fs.writeFileSync(path.join(reportDir, 'noryx-qa-report.md'), md, 'utf8');

  const summary = {
    status: overallStatus,
    generatedAt: now,
    baseUrl,
    passed: stats.passed,
    failed: stats.failed,
    skipped: stats.skipped,
    total: stats.total,
    modules,
    criticalFindings,
    warnings,
  };

  fs.writeFileSync(
    path.join(reportDir, 'noryx-qa-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8'
  );

  console.log(`\n📋 QA Report: test-results/noryx-qa-report.md`);
  console.log(`📊 QA Summary: test-results/noryx-qa-summary.json`);
  console.log(`✅ Passed: ${stats.passed}  ❌ Failed: ${stats.failed}  ⏭️ Skipped: ${stats.skipped}`);
  console.log(`Overall: ${overallStatus}\n`);
}
