import { MASTER_CATALOG_GROUPS } from '../construction/templates/retailFitoutMasterCatalog.js';
import {
  resolveExecutionWorkClassification,
  validateExecutionWorkClassifications,
} from './workOntologyContract.js';
import {
  EXECUTION_CLASSIFICATION_REASON_CODES,
  RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1,
} from './retailFitoutExecutionClassificationV1.js';
import {
  RETAIL_FITOUT_WORK_GROUP_IDS,
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

const catalogWpIds = MASTER_CATALOG_GROUPS.flatMap(group =>
  group.categories.flatMap(category => category.workPackages.map(wp => wp.id)));
const counts = RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1.reduce((result, item) => {
  result[item.kind] = (result[item.kind] ?? 0) + 1;
  return result;
}, {});

console.log('\nComplete 221-item execution classification');
const issues = validateExecutionWorkClassifications(
  RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1,
  RETAIL_FITOUT_WORK_ONTOLOGY_V1,
  catalogWpIds,
);
check('the current Master Catalog contains the expected 221 unique execution ids',
  catalogWpIds.length === 221 && new Set(catalogWpIds).size === 221);
check('every catalog item is classified exactly once with no invalid references', issues.length === 0);
check('classification totals are explicit and stable',
  counts.mapped === 185 && counts.deferred === 22 && counts.lifecycle === 14);

console.log('\nSemantic boundary examples');
check('an included HVAC work maps to a canonical HVAC Work Group',
  resolveExecutionWorkClassification(
    'project_wide.hvac.ductwork',
    RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1,
  ).workGroupId === RETAIL_FITOUT_WORK_GROUP_IDS.hvac.ductwork);
check('Sales and BOH flooring aggregate to the same canonical Construction Work Group',
  resolveExecutionWorkClassification(
    'sales.flooring.tile',
    RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1,
  ).workGroupId === RETAIL_FITOUT_WORK_GROUP_IDS.construction.flooring
  && resolveExecutionWorkClassification(
    'boh.flooring.tile',
    RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1,
  ).workGroupId === RETAIL_FITOUT_WORK_GROUP_IDS.construction.flooring);
check('a Retail Technology work is explicitly deferred, not silently mapped to IT',
  resolveExecutionWorkClassification(
    'sales.retail_technology.pos',
    RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1,
  ).reasonCode === EXECUTION_CLASSIFICATION_REASON_CODES.deferredDiscipline);
check('an approval remains a lifecycle fact rather than a commercial Work Group',
  resolveExecutionWorkClassification(
    'project_wide.pre_handover.authority_approvals',
    RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1,
  ).reasonCode === EXECUTION_CLASSIFICATION_REASON_CODES.lifecycleApproval);

let missing = null;
try {
  resolveExecutionWorkClassification('future.unclassified.work', RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1);
} catch (error) {
  missing = error;
}
check('unknown future catalog work fails closed until explicitly classified',
  missing?.code === 'UNCLASSIFIED_EXECUTION_WORK_PACKAGE');

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
