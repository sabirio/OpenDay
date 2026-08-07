// contractorReportService.test.mjs — P0 coverage for the same optional
// scope-template hydration fix applied to the report-hydration read paths
// (fetchAllContractorReportsRaw / fetchContractorReportsForProjectRaw).
import { register } from 'node:module';

function dataUrl(src) { return `data:application/javascript;base64,${Buffer.from(src).toString('base64')}`; }
const mockUrl = dataUrl('export const supabase = globalThis.__contractorReportServiceTest.supabase;');
const loaderSrc = `export async function resolve(s,c,n){if(s==='../lib/supabase')return{url:'${mockUrl}',shortCircuit:true};if(s.startsWith('.')&&!s.match(/\\.[mc]?jsx?$/))return n(s+'.js',c);return n(s,c)}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
}

const state = { resultsByTable: {} };
function resultFor(table, calls) {
  const configured = state.resultsByTable[table];
  if (typeof configured === 'function') return configured(calls);
  return configured ?? { data: [], error: null };
}
function makeChain(table) {
  const calls = [];
  const chain = {
    select: (...a) => { calls.push(['select', ...a]); return chain; },
    eq: (...a) => { calls.push(['eq', ...a]); return chain; },
    in: (...a) => { calls.push(['in', ...a]); return chain; },
    order: (...a) => { calls.push(['order', ...a]); return chain; },
    single: () => Promise.resolve(resultFor(table, calls)),
    maybeSingle: () => Promise.resolve(resultFor(table, calls)),
    then: (resolve, reject) => Promise.resolve(resultFor(table, calls)).then(resolve, reject),
  };
  return chain;
}
globalThis.__contractorReportServiceTest = { supabase: { from(table) { return makeChain(table); } } };

const { fetchAllContractorReportsRaw, fetchContractorReportsForProjectRaw } = await import('./contractorReportService.js');

console.log('\ncontractorReportService — report/Portfolio hydration is never fatal to the known templates schema-contract mismatch\n');

const schemaContractError = { code: '42703', message: 'column templates.family does not exist' };

// 19. existing reports/projects still load (Portfolio's underlying raw data
// source) when the optional scope-template hydration hits the known
// compatibility mismatch.
{
  const reportRow = { id: 'r1', project_id: 1, report_date: '2026-08-01' };
  const projectRow = { id: 1, template_type: null, template_id: 'tpl-1' };
  state.resultsByTable = {
    contractor_reports: { data: [reportRow], error: null },
    contractor_report_wps: { data: [], error: null },
    projects: { data: [projectRow], error: null },
    templates: { data: null, error: schemaContractError },
  };
  const result = await fetchAllContractorReportsRaw();
  check('19a. fetchAllContractorReportsRaw still returns real reports/projects when template hydration hits the known compatibility mismatch',
    result.reports.length === 1 && result.projects.length === 1 && result.projects[0].scopeTemplate === null);
}
{
  const reportRow = { id: 'r2', project_id: 5, report_date: '2026-08-02' };
  const projectRow = { template_type: null, template_id: 'tpl-5' };
  state.resultsByTable = {
    contractor_reports: { data: [reportRow], error: null },
    projects: { data: projectRow, error: null },
    templates: { data: null, error: schemaContractError },
  };
  const result = await fetchContractorReportsForProjectRaw(5);
  check('19b. fetchContractorReportsForProjectRaw still returns real reports for the project when template hydration hits the known compatibility mismatch',
    result.reports.length === 1 && result.project.scopeTemplate === null);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
