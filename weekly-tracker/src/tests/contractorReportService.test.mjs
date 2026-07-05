// contractorReportService.test.mjs - atomic RPC submit contract.
// Run: node src/tests/contractorReportService.test.mjs

import { readFileSync } from 'node:fs';
import { register } from 'node:module';

function moduleDataUrl(src) {
  return `data:application/javascript;base64,${Buffer.from(src).toString('base64')}`;
}

const supabaseMockUrl = moduleDataUrl(`
export const supabase = globalThis.__contractorReportServiceTest.supabase;
`);

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (
    specifier === '../lib/supabase' &&
    context.parentURL?.endsWith('/services/contractorReportService.js')
  ) {
    return { url: '${supabaseMockUrl}', shortCircuit: true };
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

globalThis.__contractorReportServiceTest = {
  rpcError: null,
  supabase: {
    async rpc(fnName, params) {
      calls.push({ operation: 'rpc', fnName, params });
      if (globalThis.__contractorReportServiceTest.rpcError) {
        return { data: null, error: globalThis.__contractorReportServiceTest.rpcError };
      }
      return {
        data: {
          report: { id: 501, project_id: params.p_project_id, report_date: params.p_report_date },
          wpLineItems: params.p_wp_progress.map((wp, index) => ({ id: index + 1, ...wp })),
          lineItemCount: params.p_wp_progress.length,
        },
        error: null,
      };
    },
    from(table) {
      calls.push({ operation: 'from', table });
      throw new Error(`Unexpected direct table access during submit test: ${table}`);
    },
  },
};

const { submitReport } = await import('../services/contractorReportService.js');

console.log('\ncontractorReportService.submitReport - atomic RPC contract');

const wpProgressArray = [
  { wpId: 'demo.1', progress_pct: 100, status: 'completed', comment: 'done' },
  { wpId: 'mep.1', progress_pct: 40, status: 'in_progress', comment: '' },
];

const reportSnapshot = { id: 777, projectId: 71, photos: ['u/71/a.jpg'] };
const result = await submitReport(71, wpProgressArray, {
  reportDate: '2026-07-05',
  overallProgress: 70,
  cumulativeProgress: 63,
  masterReportId: 777,
  reportSnapshot,
  photoUrls: ['u/71/a.jpg'],
});

const rpcCall = calls.find(call => call.operation === 'rpc');
const serviceSource = readFileSync(new URL('../services/contractorReportService.js', import.meta.url), 'utf8');

check('calls submit_contractor_report RPC once', calls.filter(call => call.operation === 'rpc').length === 1);
check('does not touch tables directly during submit', !calls.some(call => call.operation === 'from'));
check('returns saved contractor report id', result.report.id === 501);
check('returns line item summary from RPC', result.lineItemCount === 2 && result.wpLineItems.length === 2);
check('maps project id', rpcCall?.params?.p_project_id === 71);
check('maps report date', rpcCall?.params?.p_report_date === '2026-07-05');
check('maps wp progress array', rpcCall?.params?.p_wp_progress === wpProgressArray);
check('maps canonical cumulative progress', rpcCall?.params?.p_meta?.cumulativeProgress === 63);
check('maps report snapshot', rpcCall?.params?.p_meta?.reportSnapshot === reportSnapshot);
check('maps photo urls', rpcCall?.params?.p_meta?.photoUrls?.[0] === 'u/71/a.jpg');
check('service submit path has no direct inserts', !serviceSource.includes('.insert('));

globalThis.__contractorReportServiceTest.rpcError = { message: 'Not authorized to submit for this project' };
let threw = false;
try {
  await submitReport(72, [], { reportDate: '2026-07-05' });
} catch (error) {
  threw = error.message === 'Not authorized to submit for this project';
}
check('propagates RPC errors', threw);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
