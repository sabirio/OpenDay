export function createQaSummary({ baseUrl }) {
  return {
    status: 'PASS',
    generatedAt: null,
    baseUrl,
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    modules: {},
    criticalFindings: [],
    warnings: [],
  };
}

export function recordQaTest(summary, { moduleName, title, status, error }) {
  const module = summary.modules[moduleName] || { passed: 0, failed: 0, skipped: 0 };
  summary.modules[moduleName] = module;
  summary.total += 1;

  if (status === 'passed') {
    summary.passed += 1;
    module.passed += 1;
    return;
  }

  if (status === 'skipped') {
    summary.skipped += 1;
    module.skipped += 1;
    return;
  }

  summary.failed += 1;
  module.failed += 1;
  summary.criticalFindings.push({
    suite: moduleName,
    test: title,
    error: error || 'Unknown error',
  });
}

export function finalizeQaSummary(summary, generatedAt = new Date().toISOString()) {
  summary.generatedAt = generatedAt;
  summary.status = summary.failed > 0
    ? 'FAIL'
    : summary.warnings.length > 0
      ? 'PASS WITH WARNINGS'
      : 'PASS';
  return summary;
}

export function renderQaReport(summary) {
  const moduleRows = Object.entries(summary.modules)
    .map(([name, module]) => `| ${name} | ${module.passed} | ${module.failed} | ${module.skipped} |`)
    .join('\n');
  const failures = summary.criticalFindings.length > 0
    ? summary.criticalFindings.map((finding, index) =>
      `### Failure ${index + 1}: ${finding.test}\n**Suite:** ${finding.suite}\n\`\`\`\n${finding.error}\n\`\`\``).join('\n\n')
    : '_No test failures._';
  const warnings = summary.warnings.length > 0
    ? summary.warnings.map((warning) => `- ⚠️ ${warning}`).join('\n')
    : '_No warnings._';

  return `# OpenDay — E2E QA Report

**Generated:** ${summary.generatedAt}
**Base URL:** ${summary.baseUrl}
**Overall Status:** ${summary.status}

## Summary

| Metric | Count |
|---|---:|
| Total tests | ${summary.total} |
| Passed | ${summary.passed} |
| Failed | ${summary.failed} |
| Skipped | ${summary.skipped} |

## Modules

| Module | Passed | Failed | Skipped |
|---|---:|---:|---:|
${moduleRows || '| (no results) | 0 | 0 | 0 |'}

## Failures

${failures}

## Warnings

${warnings}
`;
}
