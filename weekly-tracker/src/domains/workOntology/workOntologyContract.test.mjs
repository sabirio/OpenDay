import {
  WORK_ONTOLOGY_SCHEMA_VERSION,
  aggregateBoqItemsToWorkGroups,
  buildWorkOntologyIndex,
  validateWorkOntology,
} from './workOntologyContract.js';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) {
    pass++;
    console.log(`  OK ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}`);
  }
}

const ELECTRICAL_ID = '10000000-0000-4000-8000-000000000001';
const CONSTRUCTION_DEPARTMENT_ID = '10000000-0000-4000-8000-000000000010';
const CABLES_ID = '20000000-0000-4000-8000-000000000001';
const BOARDS_ID = '20000000-0000-4000-8000-000000000002';
const CABLE_3X25_ID = '30000000-0000-4000-8000-000000000001';
const CABLE_5X6_ID = '30000000-0000-4000-8000-000000000002';

function buildOntology(overrides = {}) {
  return {
    schemaVersion: WORK_ONTOLOGY_SCHEMA_VERSION,
    id: '00000000-0000-4000-8000-000000000001',
    version: 1,
    departments: [
      { id: CONSTRUCTION_DEPARTMENT_ID, code: 'D100', label: 'Construction' },
    ],
    disciplines: [
      { id: ELECTRICAL_ID, departmentId: CONSTRUCTION_DEPARTMENT_ID, code: 'E100', label: 'Electrical', scopeSelectable: true, budgetSelectable: true },
    ],
    workGroups: [
      { id: CABLES_ID, disciplineId: ELECTRICAL_ID, code: 'E100.01', label: 'Cables' },
      { id: BOARDS_ID, disciplineId: ELECTRICAL_ID, code: 'E100.02', label: 'Distribution Boards' },
    ],
    boqItemDefinitions: [
      { id: CABLE_3X25_ID, workGroupId: CABLES_ID, code: 'E100.01.001', label: 'Cable 3x2.5' },
      { id: CABLE_5X6_ID, workGroupId: CABLES_ID, code: 'E100.01.002', label: 'Cable 5x6' },
    ],
    ...overrides,
  };
}

console.log('\nWork ontology structural contract');
{
  const ontology = buildOntology();
  check('valid ontology has no issues', validateWorkOntology(ontology).length === 0);
  const index = buildWorkOntologyIndex(ontology);
  check('technical UUID identity and readable code are separate lookup facts',
    index.workGroupsById.get(CABLES_ID)?.code === 'E100.01');
}

console.log('\nReferential integrity and uniqueness');
{
  const duplicateCode = buildOntology({
    workGroups: [
      { id: CABLES_ID, disciplineId: ELECTRICAL_ID, code: 'E100.01', label: 'Cables' },
      { id: BOARDS_ID, disciplineId: ELECTRICAL_ID, code: 'E100.01', label: 'Boards' },
    ],
  });
  check('duplicate readable codes are rejected',
    validateWorkOntology(duplicateCode).some(issue => issue.code === 'DUPLICATE_READABLE_CODE'));

  const orphan = buildOntology({
    workGroups: [{ id: CABLES_ID, disciplineId: BOARDS_ID, code: 'E100.01', label: 'Cables' }],
  });
  check('a Work Group cannot reference an unknown Discipline',
    validateWorkOntology(orphan).some(issue => issue.code === 'UNKNOWN_DISCIPLINE'));
}

console.log('\nBOQ -> Work Group aggregation');
{
  const ontology = buildOntology();
  const groups = aggregateBoqItemsToWorkGroups([
    { id: 'project-row-1', definitionId: CABLE_3X25_ID },
    { id: 'project-row-2', definitionId: CABLE_5X6_ID },
    { id: 'project-row-3', workGroupId: CABLES_ID, description: 'Custom fire-rated cable' },
  ], ontology);
  check('many standard and custom BOQ rows aggregate to one canonical Work Group',
    groups.length === 1 && groups[0].id === CABLES_ID);

  const ordered = aggregateBoqItemsToWorkGroups([
    { workGroupId: BOARDS_ID },
    { workGroupId: CABLES_ID },
  ], ontology);
  check('aggregation output uses canonical ontology order',
    ordered.map(item => item.id).join(',') === `${CABLES_ID},${BOARDS_ID}`);

  let mismatch = null;
  try {
    aggregateBoqItemsToWorkGroups([{ definitionId: CABLE_3X25_ID, workGroupId: BOARDS_ID }], ontology);
  } catch (error) {
    mismatch = error;
  }
  check('a standard BOQ definition cannot be remapped silently', mismatch?.code === 'BOQ_WORK_GROUP_MISMATCH');

  let unknownCustomGroup = null;
  try {
    aggregateBoqItemsToWorkGroups([{ workGroupId: '90000000-0000-4000-8000-000000000001' }], ontology);
  } catch (error) {
    unknownCustomGroup = error;
  }
  check('a custom BOQ row must still map to a valid Work Group', unknownCustomGroup?.code === 'UNKNOWN_WORK_GROUP');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
