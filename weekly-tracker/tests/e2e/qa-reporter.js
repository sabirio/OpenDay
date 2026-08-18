import fs from 'node:fs';
import path from 'node:path';
import {
  createQaSummary,
  finalizeQaSummary,
  recordQaTest,
  renderQaReport,
} from './qaReportModel.mjs';

export default class QaReporter {
  onBegin(config) {
    const baseUrl = config.projects[0]?.use?.baseURL || process.env.PLAYWRIGHT_BASE_URL || 'unknown';
    this.summary = createQaSummary({ baseUrl });
  }

  onTestEnd(test, result) {
    const titlePath = test.titlePath();
    recordQaTest(this.summary, {
      moduleName: titlePath.at(-2) || 'Root',
      title: test.title,
      status: result.status,
      error: result.error?.message || result.error?.value || result.errors?.[0]?.message,
    });
  }

  onEnd() {
    const reportDir = path.join(process.cwd(), 'test-results');
    fs.mkdirSync(reportDir, { recursive: true });
    finalizeQaSummary(this.summary);
    fs.writeFileSync(
      path.join(reportDir, 'openday-qa-summary.json'),
      JSON.stringify(this.summary, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(reportDir, 'openday-qa-report.md'),
      renderQaReport(this.summary),
      'utf8',
    );
  }
}
