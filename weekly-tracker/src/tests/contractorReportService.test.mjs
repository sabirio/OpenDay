// contractorReportService.test.mjs - submitReport ownership + single-write contract.
// Run: node src/tests/contractorReportService.test.mjs

import { register } from 'node:module';

function moduleDataUrl(src) {
  return `data:application/javascript;base64,${Buffer.from(src).toString('base64')}`;
}

const supabaseMockUrl = moduleDataUrl(`
export const supabase = globalThis.__contractorReportServiceTest.supabase;
`);

const ganttServiceMockUrl = moduleDataUrl(`
export async function batchUpdateWPProgress(projectId, wpProgressArray) {
  globalThis.__contractorReportServiceTest.ganttCalls.push({
    type: 'batchUpdateWPProgress',
    projectId,
    wpProgressArray,
  });
}
export async function updateForecast(projectId) {
  globalThis.__contractorReportServiceTest.ganttCalls.push({
    type: 'updateForecast',
    projectId,
  });
}
`);

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (
    specifier === '../lib/supabase' &&
    context.parentURL?.endsWith('/services/contractorReportService.js')
  ) {
    return { url: '${supabaseMockUrl}', shortCircuit: true };
  }
  if (
    specifier === './ganttService' &&
    context.parentURL?.endsWith('/services/contractorReportService.js')
  ) {
    return { url: '${ganttServiceMockUrl}', shortCircuit: true };
  }
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;

register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const calls = [];

function makeResultFor(table, operation, payload) {
  if (operation === 'insert' && table === 'contractor_reports') {
    return {
      data: { id: 501, ...(Array.isArray(payload) ? payload[0] : payload) },
      error: null,
    };
  }
  if (operation === 'insert' && table === 'contractor_report_wps') {
    return { data: payload, error: null };
  }
  return { data: null, error: null };
}

function createBuilder(table) {
  let operation = null;
  let payload = null;
  const builder = {
    insert(value) {
      operation = 'insert';
      payload = value;
      calls.push({ table, operation, payload });
      return builder;
    },
    select() { return builder; },
    single() { return Promise.resolve(makeResultFor(table, operation, payload)); },
    then(resolve, reject) {
      return Promise.resolve(makeResultFor(table, operation, payload)).then(resolve, reject);
    },
  };
  return builder;
}

globalThis.__contractorReportServiceTest = {
  ganttCalls: [],
  supabase: {
    auth: {
      async getUser() {
        calls.push({ table: 'auth', operation: 'getUser' });
        return { data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null };
      },
    },
    from(table) {
      calls.push({ table, operation: 'from' });
      return createBuilder(table);
    },
  },
};

const { submitReport } = await import('../services/contractorReportService.js');

console.log('\ncontractorReportService.submitReport - single-write + ownership');

const wpProgressArray = [
  { wpId: 'demo.1', progress_pct: 100, status: 'completed', comment: 'done' },
  { wpId: 'mep.1', progress_pct: 40, status: 'in_progress', comment: '' },
];

const result = await submitReport('project-71', wpProgressArray, {
  reportDate: '2026-07-05',
  cumulativeProgress: 63,
});

const insertedTables = calls
  .filter(call => call.operation === 'insert')
  .map(call => call.table);
const reportInsert = calls.find(call => call.table === 'contractor_reports' && call.operation === 'insert');
const wpInsert = calls.find(call => call.table === 'contractor_report_wps' && call.operation === 'insert');
const historyInsert = calls.find(call => call.table === 'progress_history' && call.operation === 'insert');

check('returns saved contractor report id', result.report.id === 501);
check('auth.getUser called for submitted_by fallback', calls.some(call => call.table === 'auth' && call.operation === 'getUser'));
check('submitted_by is authenticated user id', reportInsert?.payload?.[0]?.submitted_by === '11111111-1111-4111-8111-111111111111');
check('writes contractor_reports header', insertedTables.includes('contractor_reports'));
check('writes contractor_report_wps line items', insertedTables.includes('contractor_report_wps'));
check('does not insert into legacy reports', !insertedTables.includes('reports'));
check('line items are tied to saved contractor report id', wpInsert?.payload?.every(row => row.report_id === 501));
check('progress_history uses cumulative progress', historyInsert?.payload?.overall_progress === 63);
check('gantt sync called after canonical write', globalThis.__contractorReportServiceTest.ganttCalls.some(call => call.type === 'batchUpdateWPProgress'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
