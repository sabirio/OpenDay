import { register } from 'node:module';
import { RETAIL_FITOUT_WORK_ONTOLOGY_V1 } from '../domains/workOntology/retailFitoutOntologyV1.js';
import { RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1 } from '../domains/workOntology/retailFitoutExecutionClassificationV1.js';

function dataUrl(source) {
  return `data:application/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const mockUrl = dataUrl('export const supabase = globalThis.__workOntologyServiceTest.supabase;');
const loaderSource = `export async function resolve(s,c,n){if(s==='../lib/supabase')return{url:'${mockUrl}',shortCircuit:true};if(s.startsWith('.')&&!s.match(/\\.[mc]?jsx?$/))return n(s+'.js',c);return n(s,c)}`;
register('data:application/javascript,' + encodeURIComponent(loaderSource), { parentURL: import.meta.url });

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

const ontology = RETAIL_FITOUT_WORK_ONTOLOGY_V1;
const rows = {
  work_ontology_versions: [{
    id: ontology.id, company_id: null, schema_version: ontology.schemaVersion,
    version: ontology.version, label: ontology.label, status: 'PUBLISHED', is_active: true,
  }],
  work_ontology_departments: ontology.departments.map(item => ({
    ontology_version_id: ontology.id, id: item.id, code: item.code, label: item.label,
    display_order: item.displayOrder,
  })),
  work_ontology_disciplines: ontology.disciplines.map(item => ({
    ontology_version_id: ontology.id, id: item.id, department_id: item.departmentId, code: item.code, label: item.label,
    display_order: item.displayOrder, scope_selectable: item.scopeSelectable, budget_selectable: item.budgetSelectable,
  })),
  work_ontology_work_groups: ontology.workGroups.map((item, index) => ({
    ontology_version_id: ontology.id, id: item.id, discipline_id: item.disciplineId,
    code: item.code, label: item.label, display_order: index * 10,
  })),
  work_ontology_boq_item_definitions: ontology.boqItemDefinitions.map(item => ({
    ontology_version_id: ontology.id, id: item.id, work_group_id: item.workGroupId,
    code: item.code, label: item.label, default_unit: item.defaultUnit,
  })),
  work_ontology_execution_classifications: RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1.map(item => ({
    ontology_version_id: ontology.id,
    execution_work_package_id: item.executionWorkPackageId,
    kind: item.kind.toUpperCase(),
    work_group_id: item.workGroupId ?? null,
    reason_code: item.reasonCode ?? null,
  })),
};

const calls = [];
function makeChain(table) {
  const filters = [];
  const chain = {
    select: () => chain,
    eq: (column, value) => { filters.push([column, value]); return chain; },
    order: () => chain,
    then: (resolve, reject) => {
      calls.push({ table, filters: [...filters] });
      const data = (rows[table] || []).filter(row => filters.every(([key, value]) => row[key] === value));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return chain;
}
globalThis.__workOntologyServiceTest = { supabase: { from: table => makeChain(table) } };

const { resolveActiveWorkOntologyForCurrentCompany } = await import('./workOntologyService.js');

console.log('\nworkOntologyService - active published ontology read model');
const loaded = await resolveActiveWorkOntologyForCurrentCompany('company-1');
check('resolves the global active fallback for a company', loaded.id === ontology.id && loaded.companyId === null);
check('loads the complete normalized graph',
  loaded.departments.length === 6 && loaded.disciplines.length === 12 && loaded.workGroups.length === 141 && loaded.boqItemDefinitions.length === 3);
check('loads all explicit execution classifications', loaded.executionClassifications.length === 221);
check('queries only published active versions',
  calls.find(call => call.table === 'work_ontology_versions')?.filters.some(([key, value]) => key === 'status' && value === 'PUBLISHED')
  && calls.find(call => call.table === 'work_ontology_versions')?.filters.some(([key, value]) => key === 'is_active' && value === true));
check('reads every child table through the pinned version id',
  calls.filter(call => call.table !== 'work_ontology_versions')
    .every(call => call.filters.some(([key, value]) => key === 'ontology_version_id' && value === ontology.id)));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
