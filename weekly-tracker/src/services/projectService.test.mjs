// projectService.test.mjs — P0 template-schema-compatibility regression
// coverage for the proven fatal chain: getAll()/getById()/create() must
// never fail (or silently misroute) solely because of the known
// templates.family/company_id schema-contract mismatch, and must never pick
// an arbitrary active template when routing is genuinely ambiguous.
//
// Same lib/supabase interception technique as
// src/services/scheduleCommitmentBatchService.test.mjs (this repo's
// established pattern for testing a real service file without a live
// Supabase project) - generalized here to intercept every service's
// `../lib/supabase` import with one shared mock, since projectService.js
// dynamically imports templateService.js (which itself imports
// '../lib/supabase') at call time. Critically, the mock module's
// `export const supabase = ...` binding is captured ONCE at first import
// (ES modules are per-specifier singletons) - so every test case below
// MUTATES the one shared `state` object's properties between cases rather
// than replacing `globalThis.__projectServiceTest` itself, exactly like
// scheduleCommitmentBatchService.test.mjs's own header comment documents.
import { register } from 'node:module';

function dataUrl(src) { return `data:application/javascript;base64,${Buffer.from(src).toString('base64')}`; }
const mockUrl = dataUrl('export const supabase = globalThis.__projectServiceTest.supabase;');
const loaderSrc = `export async function resolve(s,c,n){if(s==='../lib/supabase')return{url:'${mockUrl}',shortCircuit:true};if(s.startsWith('.')&&!s.match(/\\.[mc]?jsx?$/))return n(s+'.js',c);return n(s,c)}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
}
async function checkRejects(name, action, predicate) {
  try { await action(); check(name, false); }
  catch (error) { check(name, predicate(error)); }
}

// ── Shared mutable mock state ───────────────────────────────────────────
const state = { resultsByTable: {}, rpcResult: { data: 'company-1', error: null } };
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
    is: (...a) => { calls.push(['is', ...a]); return chain; },
    in: (...a) => { calls.push(['in', ...a]); return chain; },
    order: (...a) => { calls.push(['order', ...a]); return chain; },
    limit: (...a) => { calls.push(['limit', ...a]); return chain; },
    insert: (...a) => { calls.push(['insert', ...a]); return chain; },
    update: (...a) => { calls.push(['update', ...a]); return chain; },
    single: () => Promise.resolve(resultFor(table, calls)),
    maybeSingle: () => Promise.resolve(resultFor(table, calls)),
    then: (resolve, reject) => Promise.resolve(resultFor(table, calls)).then(resolve, reject),
  };
  return chain;
}
globalThis.__projectServiceTest = {
  supabase: {
    from(table) { return makeChain(table); },
    rpc: () => Promise.resolve(state.rpcResult),
  },
};

const { getAll, create } = await import('./projectService.js');

console.log('\nprojectService — template-hydration is never fatal to the projects load; legacy family routing never guesses\n');

const schemaContractError = { code: '42703', message: 'column templates.family does not exist' };
const authError = { status: 401, code: 'PGRST301', message: 'JWT expired' };

// ── 14/15. project with template_id loads using baseline schema; legacy row normalizes ──
{
  const projectRow = {
    id: 1, store_code: 'S1', country: 'US', template_id: 'tpl-1', created_at: '2026-01-01',
    phases: [],
  };
  const baselineTemplateRow = {
    id: 'tpl-1', name: 'Legacy', data: { phases: [] }, is_active: true,
    updated_at: '2026-01-01', family_id: 'f1', version: 1,
    // no `family`, no `company_id` keys at all - exactly a baseline-schema select('*') row
  };
  state.resultsByTable = {
    projects: { data: [projectRow], error: null },
    templates: { data: [baselineTemplateRow], error: null },
    progress_history: { data: [], error: null },
  };
  const result = await getAll();
  check('14. a project with a template_id loads successfully against the baseline (family/company_id-less) schema',
    result.length === 1 && result[0].id === 1);
  check('15. the legacy row (no family/company_id columns at all) normalizes into scopeTemplate with family/companyId as null, not an error',
    result[0].scopeTemplate?.id === 'tpl-1' && result[0].scopeTemplate?.family === null && result[0].scopeTemplate?.companyId === null);
}

// ── 16. multiple active baseline templates do not affect known-ID hydration ──
{
  const projectRow = { id: 2, store_code: 'S2', country: 'US', template_id: 'tpl-known', created_at: '2026-01-01', phases: [] };
  const knownTemplateRow = { id: 'tpl-known', name: 'Known', data: {}, is_active: true, updated_at: '2026-01-01', family_id: 'f-known', version: 1 };
  state.resultsByTable = {
    projects: { data: [projectRow], error: null },
    // fetchTemplateRecordsByIds queries .in('id', [...]) - this mock
    // returns exactly the one row whose id was actually requested, proving
    // id-based hydration is unaffected by however many OTHER active
    // templates (different family_id lineages) might exist - the ambiguity
    // hazard only ever applies to family-ROUTING, never to known-id lookup.
    templates: (calls) => {
      const inCall = calls.find(c => c[0] === 'in');
      const ids = inCall ? inCall[2] : [];
      return { data: ids.includes('tpl-known') ? [knownTemplateRow] : [], error: null };
    },
    progress_history: { data: [], error: null },
  };
  const result = await getAll();
  check('16. known-template_id hydration succeeds via direct id lookup, unaffected by how many OTHER active baseline templates (different family_id lineages) exist',
    result[0]?.scopeTemplate?.id === 'tpl-known');
}

// ── 17. known compatibility error in optional enrichment does not kill the projects list ──
{
  const projectRow = { id: 3, store_code: 'S3', country: 'US', template_id: 'tpl-x', created_at: '2026-01-01', phases: [] };
  state.resultsByTable = {
    projects: { data: [projectRow], error: null },
    templates: { data: null, error: schemaContractError },
    progress_history: { data: [], error: null },
  };
  const result = await getAll();
  check('17. the known templates.family schema-contract error during optional hydration does NOT kill the projects list - the project still loads',
    result.length === 1 && result[0].id === 3 && result[0].scopeTemplate === null);
}

// ── 18. unrelated template DB errors still propagate where required ────────
{
  const projectRow = { id: 4, store_code: 'S4', country: 'US', template_id: 'tpl-y', created_at: '2026-01-01', phases: [] };
  state.resultsByTable = {
    projects: { data: [projectRow], error: null },
    templates: { data: null, error: authError },
    progress_history: { data: [], error: null },
  };
  await checkRejects('18. a genuine (non-schema-contract) template DB error still propagates out of getAll(), it is never masked as "no template"',
    () => getAll(), (e) => e === authError);
}

// ── 21/25/26. V2 family resolution continues to work ────────────────────────
{
  // schemaVersion: 1 (numeric) is deliberate, not a typo - this is the real
  // shape migration 041 seeds (the "V2 family, V1 schema" 91-WP versioned
  // zoned template). selectDefaultScopeTemplate only ever selects
  // schemaVersion-1 data (isVersionedV2TemplateData checks
  // data.schemaVersion === SCOPE_TEMPLATE_SCHEMA_VERSION === 1) - the
  // schemaVersion-2 Master Catalog is never selectable by normal project
  // creation by design (its two documented activation blockers), so a
  // fixture using schemaVersion 2 here would not exercise this code path.
  const v2TemplateRow = {
    id: 'v2-tpl', name: 'V2', data: { schemaVersion: 1, model: 'zoned', templateType: 'retail-fitout-v2', zones: [], dependencies: [] },
    is_active: true, updated_at: '2026-07-28', family_id: 'fam-v2', family: 'retail-fitout-v2', company_id: null, version: 1,
  };
  state.resultsByTable = {
    templates: { data: [v2TemplateRow], error: null },
    projects: (calls) => {
      const insertCall = calls.find(c => c[0] === 'insert');
      const payload = insertCall ? insertCall[1][0] : {};
      return { data: { id: 99, store_code: payload.store_code, country: payload.country, template_id: payload.template_id, created_at: '2026-08-05', phases: [] }, error: null };
    },
  };
  state.rpcResult = { data: 'company-1', error: null };
  const saved = await create({ storeCode: 'V2Store', country: 'US', templateType: 'retail-fitout-v2' });
  check('21/25/26. V2 schema family resolution still resolves a real active V2 template and pins it (company/global precedence delegated unchanged to selectDefaultScopeTemplate)',
    saved.templateId === 'v2-tpl' && saved.scopeTemplate?.family === 'retail-fitout-v2');
}

// ── 22/23/24. baseline schema without family does NOT select an arbitrary active template ──
{
  // Two active "legacy" (family-less) rows with different family_id
  // lineages - exactly the scenario the baseline schema explicitly permits
  // and that must never be resolved by picking one arbitrarily.
  const legacyA = { id: 'legacy-a', name: 'A', data: {}, is_active: true, updated_at: '2026-01-01', family_id: 'fam-a', version: 1 };
  const legacyB = { id: 'legacy-b', name: 'B', data: {}, is_active: true, updated_at: '2026-01-01', family_id: 'fam-b', version: 3 };
  state.resultsByTable = { templates: { data: [legacyA, legacyB], error: null } };
  await checkRejects('22/23. legacy/custom project creation with TWO ambiguous active baseline templates throws TemplateConfigurationUnavailableError instead of picking one',
    () => create({ storeCode: 'CustomStore', country: 'US' }),
    (e) => e?.code === 'TEMPLATE_CONFIGURATION_UNAVAILABLE' && e?.reason === 'AMBIGUOUS_ACTIVE_TEMPLATES');
}
{
  const legacyA = { id: 'legacy-a', name: 'A', data: {}, is_active: true, updated_at: '2026-01-01', family_id: 'fam-a', version: 1 };
  const legacyB = { id: 'legacy-b', name: 'B', data: {}, is_active: true, updated_at: '2026-01-01', family_id: 'fam-b', version: 3 };
  let insertWasCalled = false;
  state.resultsByTable = {
    templates: { data: [legacyA, legacyB], error: null },
    projects: (calls) => {
      if (calls.some(c => c[0] === 'insert')) insertWasCalled = true;
      return { data: null, error: new Error('should never be reached') };
    },
  };
  try { await create({ storeCode: 'CustomStore2', country: 'US' }); } catch { /* expected */ }
  check('24. no project is ever inserted when template routing is ambiguous - the projects.insert() call is never reached',
    insertWasCalled === false);
}
{
  // Zero legacy candidates preserves the pre-existing template_id: null
  // behavior (not an error) - this is NOT the "arbitrary active row"
  // hazard, it is the same safe default main already had.
  state.resultsByTable = {
    templates: { data: [], error: null },
    projects: (calls) => {
      const insertCall = calls.find(c => c[0] === 'insert');
      const payload = insertCall ? insertCall[1][0] : {};
      return { data: { id: 100, store_code: payload.store_code, country: payload.country, template_id: payload.template_id ?? null, created_at: '2026-08-05', phases: [] }, error: null };
    },
  };
  const saved = await create({ storeCode: 'NoTemplateStore', country: 'US' });
  check('zero active legacy candidates preserves template_id: null (pre-existing safe default, not an error)',
    saved.templateId === null || saved.templateId === undefined);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
