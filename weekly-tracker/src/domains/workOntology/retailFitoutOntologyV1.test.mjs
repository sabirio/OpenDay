import { validateWorkOntology } from './workOntologyContract.js';
import {
  RETAIL_FITOUT_DISCIPLINES_V1,
  RETAIL_FITOUT_DISCIPLINE_IDS,
  RETAIL_FITOUT_WORK_ONTOLOGY_V1,
} from './retailFitoutOntologyV1.js';

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

const EXPECTED_CODES = [
  'C100', 'E100', 'H100', 'P100', 'F100', 'V100',
  'S100', 'I100', 'A100', 'J100', 'G100', 'M100',
];

console.log('\nComplete retail fit-out Discipline taxonomy');
check('the complete draft ontology satisfies the canonical contract',
  validateWorkOntology(RETAIL_FITOUT_WORK_ONTOLOGY_V1).length === 0);
check('the taxonomy exposes the twelve approved budget disciplines',
  RETAIL_FITOUT_DISCIPLINES_V1.map(item => item.code).join('|') === EXPECTED_CODES.join('|'));
check('every Discipline has a stable UUID, explicit display order, and PM-scope eligibility',
  RETAIL_FITOUT_DISCIPLINES_V1.every((item, index) =>
    Object.values(RETAIL_FITOUT_DISCIPLINE_IDS).includes(item.id)
    && item.displayOrder === (index + 1) * 10
    && item.budgetSelectable === true
    && item.scopeSelectable === (item.code !== 'M100')));
check('Security and IT / Low Current remain separate PM scope decisions',
  RETAIL_FITOUT_DISCIPLINES_V1.some(item => item.code === 'S100')
  && RETAIL_FITOUT_DISCIPLINES_V1.some(item => item.code === 'I100'));
check('deferred disciplines are not currently PM-selectable',
  ['R100', 'K100', 'X100', 'T100']
    .every(code => RETAIL_FITOUT_DISCIPLINES_V1.every(item => item.code !== code)));
check('zones and lifecycle stages are not misrepresented as disciplines',
  RETAIL_FITOUT_DISCIPLINES_V1.every(item =>
    !['sales', 'boh', 'commissioning', 'handover', 'readiness'].includes(item.code)));
check('all approved Disciplines have at least one canonical Work Group',
  RETAIL_FITOUT_DISCIPLINES_V1.every(discipline =>
    RETAIL_FITOUT_WORK_ONTOLOGY_V1.workGroups.some(group => group.disciplineId === discipline.id)));
check('the approved taxonomy contains 141 unique Work Groups',
  RETAIL_FITOUT_WORK_ONTOLOGY_V1.workGroups.length === 141
  && new Set(RETAIL_FITOUT_WORK_ONTOLOGY_V1.workGroups.map(group => group.id)).size === 141);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
