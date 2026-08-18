import assert from 'node:assert/strict';
import { RETAIL_FITOUT_WORK_ONTOLOGY_V1 } from '../workOntology/retailFitoutOntologyV1.js';
import { PROCUREMENT_ROUTES, assessProcurementStrategyDraft, buildProcurementStrategyCommand, buildProcurementStrategySections, createProcurementStrategyDraft, patchProcurementStrategyDraft } from './procurementStrategyModel.js';

const sections = buildProcurementStrategySections(RETAIL_FITOUT_WORK_ONTOLOGY_V1, []);
assert.deepEqual(sections.map(section => section.label), ['Construction', 'Security', 'IT & Low Current', 'Furniture & Joinery', 'Signage & Graphics', 'Audiovisual']);
assert.deepEqual(sections[0].disciplines.map(item => item.code), ['C100', 'E100', 'H100', 'P100', 'F100', 'V100', 'M100']);
assert.equal(sections.reduce((total, section) => total + section.workGroupCount, 0), RETAIL_FITOUT_WORK_ONTOLOGY_V1.workGroups.length);
assert.equal(new Set(sections.flatMap(section => section.disciplines.flatMap(discipline => discipline.workGroups.map(group => group.id)))).size, RETAIL_FITOUT_WORK_ONTOLOGY_V1.workGroups.length);
assert.deepEqual(PROCUREMENT_ROUTES.map(route => route.value), ['NOT_SELECTED', 'COMPETITIVE_TENDER', 'FRAMEWORK_AGREEMENT', 'REQUEST_FOR_QUOTATION', 'DIRECT_AWARD', 'CLIENT_NOMINATED_CONTRACTOR', 'NOT_APPLICABLE']);

const draft = createProcurementStrategyDraft(sections);
assert.equal(assessProcurementStrategyDraft(draft).canSave, true);
const changed = patchProcurementStrategyDraft(draft, 'SECURITY', 'COMPETITIVE_TENDER');
assert.equal(changed.find(row => row.sectionCode === 'SECURITY').procurementMethod, 'COMPETITIVE_TENDER');
assert.equal(draft.find(row => row.sectionCode === 'SECURITY').procurementMethod, 'NOT_SELECTED');
assert.deepEqual(buildProcurementStrategyCommand(changed), changed);

console.log('procurementStrategyModel: all checks passed');
