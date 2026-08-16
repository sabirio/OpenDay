import { readFileSync } from 'node:fs';
import {
  materializeRetailFitoutV2TemplateData,
  RETAIL_FITOUT_V2_FAMILY,
  RETAIL_FITOUT_V2_FAMILY_ID,
  RETAIL_FITOUT_V2_TEMPLATE_ID,
} from '../../../domains/construction/templates/versionedScopeTemplate.js';
import {
  buildProjectScopeConfiguratorModel,
  buildProjectScopeEntryModel,
  usesUnifiedProjectScopeEntry,
} from './projectScopeEntryModel.js';
import {
  buildNewProjectDraft,
  initializeNewProjectScope,
  PROJECT_SCOPE_NOT_CONFIGURED,
} from './newProjectScopeOrchestration.js';
import { RETAIL_FITOUT_WORK_ONTOLOGY_V1 } from '../../../domains/workOntology/retailFitoutOntologyV1.js';

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

const data = materializeRetailFitoutV2TemplateData();
const template = {
  id: RETAIL_FITOUT_V2_TEMPLATE_ID,
  name: 'Retail Fit-Out',
  family: RETAIL_FITOUT_V2_FAMILY,
  familyId: RETAIL_FITOUT_V2_FAMILY_ID,
  companyId: null,
  version: 1,
  isActive: true,
  data,
};
const pinnedProject = {
  templateType: RETAIL_FITOUT_V2_FAMILY,
  templateId: template.id,
  scopeTemplate: template,
  scope: null,
  salesAreaSqm: 850,
  backOfHouseAreaSqm: 180,
};

console.log('\nUnified Project Scope entry');
check('new projects always use unified entry',
  usesUnifiedProjectScopeEntry({ templateType: 'standard_with_demo' }, { isEditing: false }));
check('pinned V2 edit uses unified entry',
  usesUnifiedProjectScopeEntry(pinnedProject, { isEditing: true }));
check('legacy unpinned V2 edit uses unified entry',
  usesUnifiedProjectScopeEntry({ templateType: RETAIL_FITOUT_V2_FAMILY }, { isEditing: true }));
check('legacy Standard edit retains compatibility UI',
  !usesUnifiedProjectScopeEntry({ templateType: 'standard_with_demo' }, { isEditing: true }));
check('legacy Custom edit retains compatibility UI',
  !usesUnifiedProjectScopeEntry({ templateType: 'custom' }, { isEditing: true }));

const fullSummary = buildProjectScopeEntryModel(pinnedProject);
check('unconfigured draft means the complete certified 91-WP scope',
  fullSummary.selectedWorkPackageCount === 91 && !fullSummary.explicitSelection);
check('canonical Sales Area is read-only summary context',
  fullSummary.salesArea === 850 && fullSummary.salesAreaLabel.includes('850'));
check('canonical BOH Area is read-only summary context',
  fullSummary.backOfHouseArea === 180 && fullSummary.backOfHouseAreaLabel.includes('180'));

const configuredSummary = buildProjectScopeEntryModel({
  ...pinnedProject,
  scope: { workPackages: data.zones.flatMap(zone =>
    zone.categories.flatMap(category => category.workPackages.map(wp => wp.id))).slice(0, 90) },
});
check('draft summary reflects a deterministic deselection',
  configuredSummary.selectedWorkPackageCount === 90 && configuredSummary.explicitSelection);

console.log('\nCanonical default initialization');
const initialized = buildNewProjectDraft({ storeCode: '' }, template);
check('initialized draft receives compatibility template_type',
  initialized.templateType === RETAIL_FITOUT_V2_FAMILY);
check('initialized draft pins the exact resolved version',
  initialized.templateId === template.id && initialized.scopeTemplate === template);
check('initialized draft does not require opening configurator',
  initialized.scope === null && buildProjectScopeEntryModel(initialized).selectedWorkPackageCount === 91);

const companyTemplate = { ...template, id: 'company-template-v2', companyId: 'company-a', version: 2 };
const companyDraft = await initializeNewProjectScope({}, async family =>
  family === RETAIL_FITOUT_V2_FAMILY ? companyTemplate : null,
  async () => RETAIL_FITOUT_WORK_ONTOLOGY_V1);
check('creation integration uses the injected canonical company default',
  companyDraft.templateId === companyTemplate.id
  && companyDraft.scopeTemplate.version === 2
  && companyDraft.scope.workOntologyVersionId === RETAIL_FITOUT_WORK_ONTOLOGY_V1.id
  && companyDraft.scope.disciplineIds.length === 11);

check('missing default fails closed with safe configuration error', await (async () => {
  try {
    await initializeNewProjectScope({}, async () => null, async () => RETAIL_FITOUT_WORK_ONTOLOGY_V1);
    return false;
  } catch (error) {
    return error.message === PROJECT_SCOPE_NOT_CONFIGURED;
  }
})());

console.log('\nResolved configurator contract');
const before = JSON.stringify(template.data);
const configurator = buildProjectScopeConfiguratorModel(pinnedProject);
check('configurator consumes the pinned template version',
  configurator.templateId === template.id && configurator.source === 'pinned');
check('configurator exposes current certified structure',
  configurator.zones.length === 3
  && configurator.zones.flatMap(zone => zone.categories).length === 23);
check('building configurator model never mutates template definition',
  JSON.stringify(template.data) === before);

const modalSource = readFileSync(
  new URL('../../../components/projects/ProjectEditorModal.jsx', import.meta.url),
  'utf8',
);
const projectsSource = readFileSync(
  new URL('../../../pages/Projects.jsx', import.meta.url),
  'utf8',
);
const configuratorSource = readFileSync(
  new URL('../../../components/projects/ZonedScopeConfigurator.jsx', import.meta.url),
  'utf8',
);
check('new create action initializes scope before opening editor',
  projectsSource.includes('initializeNewProjectScope(emptyProject)'));
check('technical template choices are gated behind legacy edit compatibility',
  modalSource.includes('unifiedScopeEntry ? (')
  && modalSource.includes('title="Construction Template"'));
check('new-project editor exposes UUID-backed Discipline selection',
  modalSource.includes('title="Disciplines"')
  && modalSource.includes('workOntologyVersionId')
  && modalSource.includes('disciplineIds'));
check('PM-facing action is Configure Project Scope',
  modalSource.includes('Configure Project Scope')
  && configuratorSource.includes('Configure Project Scope')
  && !configuratorSource.includes('Configure Zoned Scope'));
check('configurator no longer imports static V2 definition directly',
  !configuratorSource.includes("domains/construction/templates/retailFitoutV2"));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
if (fail > 0) process.exit(1);
