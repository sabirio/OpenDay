import { register } from 'node:module';
import { RETAIL_FITOUT_WORK_ONTOLOGY_V1 } from '../domains/workOntology/retailFitoutOntologyV1.js';
import { RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1 } from '../domains/workOntology/retailFitoutExecutionClassificationV1.js';

function dataUrl(source) {
  return `data:application/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const mockUrl = dataUrl('export const supabase = globalThis.__executionScopeServiceTest.supabase;');
const loaderSource = `export async function resolve(s,c,n){if(s==='../lib/supabase')return{url:'${mockUrl}',shortCircuit:true};if(s.startsWith('.')&&!s.match(/\\.[mc]?jsx?$/))return n(s+'.js',c);return n(s,c)}`;
register('data:application/javascript,' + encodeURIComponent(loaderSource), { parentURL: import.meta.url });

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

const ontology = RETAIL_FITOUT_WORK_ONTOLOGY_V1;
const electrical = ontology.disciplines.find(item => item.code === 'E100');
const electricalGroups = ontology.workGroups.filter(item => item.disciplineId === electrical.id);
const rows = {
  project_execution_scope_versions: [
    { id: 70, project_id: 501, schema_version: 1, revision_number: 1, source_kind: 'PM_DISCIPLINE_SCOPE', ontology_version_id: ontology.id, selected_discipline_ids: [ontology.disciplines[0].id], created_at: '2026-08-01T00:00:00Z' },
    { id: 71, project_id: 501, schema_version: 1, revision_number: 2, source_kind: 'PM_DISCIPLINE_SCOPE', ontology_version_id: ontology.id, selected_discipline_ids: [electrical.id], created_at: '2026-08-02T00:00:00Z' },
  ],
  project_execution_scope_items: electricalGroups.map(item => ({
    execution_scope_version_id: 71,
    ontology_version_id: ontology.id,
    discipline_id: electrical.id,
    work_group_id: item.id,
  })),
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
  work_ontology_work_groups: ontology.workGroups.map(item => ({
    ontology_version_id: ontology.id, id: item.id, discipline_id: item.disciplineId,
    code: item.code, label: item.label, display_order: item.displayOrder,
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

function makeChain(table) {
  const filters = [];
  let ordering = null;
  let rowLimit = null;
  const chain = {
    select: () => chain,
    eq: (column, value) => { filters.push([column, value]); return chain; },
    order: (column, options) => { ordering = [column, options]; return chain; },
    limit: value => { rowLimit = value; return chain; },
    then: (resolve, reject) => {
      let data = (rows[table] || []).filter(row => filters.every(([key, value]) => row[key] === value));
      if (ordering) {
        const [column, options] = ordering;
        data = [...data].sort((a, b) => options?.ascending === false ? b[column] - a[column] : a[column] - b[column]);
      }
      if (rowLimit != null) data = data.slice(0, rowLimit);
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return chain;
}
globalThis.__executionScopeServiceTest = { supabase: { from: table => makeChain(table) } };

const { fetchCurrentProjectExecutionScope } = await import('./executionScopeService.js');

console.log('\nexecutionScopeService - current immutable Work Group snapshot');
const scope = await fetchCurrentProjectExecutionScope(501);
check('reads the highest project revision', scope.id === 71 && scope.revisionNumber === 2);
check('hydrates the pinned ontology version rather than a label-derived model', scope.ontologyVersionId === ontology.id);
check('returns all fifteen Electrical Work Groups in canonical order',
  scope.workGroupIds.length === 15 && scope.workGroupIds.join(',') === electricalGroups.map(item => item.id).join(','));
check('retains the PM Discipline source without creating schedule activities',
  scope.sourceKind === 'PM_DISCIPLINE_SCOPE' && !('activities' in scope));
check('legacy project without a snapshot remains compatible',
  await fetchCurrentProjectExecutionScope(999) === null);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
