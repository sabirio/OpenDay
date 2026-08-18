import { MASTER_CATALOG_GROUPS } from '../construction/templates/retailFitoutMasterCatalog.js';
import {
  aggregateExecutionWorksToWorkGroups,
  validateExecutionWorkMappings,
  validateWorkOntology,
} from './workOntologyContract.js';
import {
  ELECTRICAL_WORK_GROUP_IDS,
  RETAIL_FITOUT_ELECTRICAL_EXECUTION_MAPPINGS_V1,
  RETAIL_FITOUT_ELECTRICAL_ONTOLOGY_V1,
} from './retailFitoutElectricalOntologyV1.js';

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
const electricalCategoryWpIds = MASTER_CATALOG_GROUPS.flatMap(group => group.categories)
  .find(category => category.id === 'project_wide.electrical')
  ?.workPackages.map(wp => wp.id) ?? [];

console.log('\nElectrical ontology seed');
check('the Electrical vertical slice satisfies the canonical ontology contract',
  validateWorkOntology(RETAIL_FITOUT_ELECTRICAL_ONTOLOGY_V1).length === 0);
check('the slice has one Discipline and fifteen approved Work Groups',
  RETAIL_FITOUT_ELECTRICAL_ONTOLOGY_V1.disciplines.length === 1
  && RETAIL_FITOUT_ELECTRICAL_ONTOLOGY_V1.workGroups.length === 15);
check('the starter standard BOQ library contains the three roadmap cable examples',
  RETAIL_FITOUT_ELECTRICAL_ONTOLOGY_V1.boqItemDefinitions.map(item => item.label).join('|')
  === 'Cable 3x2.5|Cable 5x6|Cable 5x16');

console.log('\nExplicit Execution Work mapping');
const mappingIssues = validateExecutionWorkMappings(
  RETAIL_FITOUT_ELECTRICAL_EXECUTION_MAPPINGS_V1,
  RETAIL_FITOUT_ELECTRICAL_ONTOLOGY_V1,
  catalogWpIds,
);
check('all mapped execution ids exist in the current 221-item catalog',
  !mappingIssues.some(issue => issue.code === 'UNKNOWN_EXECUTION_WORK_PACKAGE'));
check('all mappings target valid Work Groups and each execution work is mapped once',
  mappingIssues.length === 0);
const mappedExecutionIds = new Set(
  RETAIL_FITOUT_ELECTRICAL_EXECUTION_MAPPINGS_V1.map(mapping => mapping.executionWorkPackageId),
);
check('every execution work in the catalog Electrical category is explicitly mapped',
  electricalCategoryWpIds.length === 16
  && electricalCategoryWpIds.every(id => mappedExecutionIds.has(id)));
check('the mapping also includes the two Electrical commissioning works',
  mappedExecutionIds.has('common.commissioning.electrical_final')
  && mappedExecutionIds.has('project_wide.commissioning.emergency_lighting')
  && mappedExecutionIds.size === 18);

const cableGroups = aggregateExecutionWorksToWorkGroups([
  'project_wide.electrical.power_cabling',
], RETAIL_FITOUT_ELECTRICAL_EXECUTION_MAPPINGS_V1, RETAIL_FITOUT_ELECTRICAL_ONTOLOGY_V1);
check('Power Cabling maps to the canonical Cables Work Group',
  cableGroups.length === 1 && cableGroups[0].id === ELECTRICAL_WORK_GROUP_IDS.cables);

const lightingGroups = aggregateExecutionWorksToWorkGroups([
  'project_wide.electrical.lighting_wiring',
  'project_wide.electrical.general_lighting',
  'project_wide.electrical.feature_lighting',
], RETAIL_FITOUT_ELECTRICAL_EXECUTION_MAPPINGS_V1, RETAIL_FITOUT_ELECTRICAL_ONTOLOGY_V1);
check('lighting wiring, general lighting, and feature lighting follow the approved groups',
  lightingGroups.length === 3
  && lightingGroups.map(item => item.id).join('|') === [
    ELECTRICAL_WORK_GROUP_IDS.lightingDistributionCabling,
    ELECTRICAL_WORK_GROUP_IDS.generalLighting,
    ELECTRICAL_WORK_GROUP_IDS.featureLighting,
  ].join('|'));

let unmapped = null;
try {
  aggregateExecutionWorksToWorkGroups(
    ['project_wide.hvac.ductwork'],
    RETAIL_FITOUT_ELECTRICAL_EXECUTION_MAPPINGS_V1,
    RETAIL_FITOUT_ELECTRICAL_ONTOLOGY_V1,
  );
} catch (error) {
  unmapped = error;
}
check('an unmapped execution work fails closed instead of using name similarity',
  unmapped?.code === 'UNMAPPED_EXECUTION_WORK_PACKAGE');

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
