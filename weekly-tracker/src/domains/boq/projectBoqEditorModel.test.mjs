import {
  addCustomBoqDraftItem, addStandardBoqDraftItem, buildNativeProjectBoqRevision,
  createProjectBoqDraft, patchProjectBoqDraftItem, projectBoqDraftIsDirty,
  calculatedLineTotalDisplay, calculatedQuantityVarianceDisplay, removeProjectBoqDraftItem, savedLineTotalDisplay, summarizeProjectBoqDisciplines, summarizeProjectBoqDraft, validateProjectBoqDraft,
  buildProjectBoqHierarchy, groupProjectBoqItems, sortProjectBoqDraftItems,
  syncProjectBoqDraftWithStandardCatalogue,
} from './projectBoqEditorModel.js';

let pass = 0, fail = 0;
const check = (label, condition) => { if (condition) { pass += 1; console.log(`  OK ${label}`); } else { fail += 1; console.error(`  FAIL ${label}`); } };
const ids = ['72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000003'];
let next = 1;
const createId = () => ids[next++];
const context = { boq: { id: ids[0], title: 'BOQ', currencyCode: 'KZT' }, latestVersion: null, items: [] };

console.log('\nprojectBoqEditorModel - Roadmap D.16');
const empty = createProjectBoqDraft(context);
check('new BOQ starts at optimistic revision zero', empty.expectedLatestRevision === 0);
const standard = addStandardBoqDraftItem(empty, { id: ids[2], workGroupId: ids[1], label: 'Cable', defaultUnit: 'm' }, createId);
check('standard catalog row inherits controlled metadata', standard.items[0].itemKind === 'STANDARD' && standard.items[0].description === 'Cable');
check('duplicate standard definition is blocked', (() => { try { addStandardBoqDraftItem(standard, { id: ids[2], workGroupId: ids[1], label: 'Cable', defaultUnit: 'm' }, createId); return false; } catch (error) { return error.code === 'STANDARD_BOQ_ITEM_ALREADY_ADDED'; } })());
const custom = addCustomBoqDraftItem(empty, { workGroupId: ids[1], description: 'Special cable', unit: 'm', quantity: '2', labourRate: '', materialRate: '' }, () => ids[2]);
check('custom row remains unpriced inside one Work Group', custom.items[0].itemKind === 'CUSTOM' && custom.items[0].labourRate === null && custom.items[0].materialRate === null);
const edited = patchProjectBoqDraftItem(custom, ids[2], { quantity: '3', labourRate: '2', materialRate: '3' });
check('commercial patch marks draft dirty', projectBoqDraftIsDirty(edited, custom));
check('valid draft builds canonical persistence payload', buildNativeProjectBoqRevision(edited).items[0].quantity === '3');
check('invalid quantity produces inline domain issue', validateProjectBoqDraft(patchProjectBoqDraftItem(edited, ids[2], { quantity: '0' })).some(issue => issue.code === 'INVALID_QUANTITY'));
check('removal reindexes remaining items', removeProjectBoqDraftItem({ ...edited, items: [...edited.items, { ...edited.items[0], lineId: ids[1], sortOrder: 4 }] }, ids[2]).items[0].sortOrder === 0);
check('saved total is hidden as soon as quantity changes', savedLineTotalDisplay({ quantity: '3', labourRate: '2', materialRate: '3' }, { quantity: '2', labourRate: '2', materialRate: '3', lineTotal: '10.00' }) === null);
check('live total follows Quantity x (Labour + Material)', calculatedLineTotalDisplay(edited.items[0]) === '15.00');
check('quantity variance uses consultant quantity as the baseline', calculatedQuantityVarianceDisplay({ quantity: '12', consultantQuantity: '10' }) === '+20.00%' && calculatedQuantityVarianceDisplay({ quantity: '8', consultantQuantity: '10' }) === '−20.00%');
check('quantity variance is blank without either quantity or a positive consultant baseline', calculatedQuantityVarianceDisplay({ quantity: null, consultantQuantity: '10' }) === null && calculatedQuantityVarianceDisplay({ quantity: '10', consultantQuantity: '0' }) === null);
check('consultant quantity never changes commercial total', calculatedLineTotalDisplay({ ...edited.items[0], consultantQuantity: '999' }) === '15.00');
const draftSummary = summarizeProjectBoqDraft([
  edited.items[0],
  { quantity: '2', labourRate: '2.50', materialRate: '10' },
  { quantity: '1', labourRate: null, materialRate: null },
]);
check('draft total sums priced rows and reports unpriced rows', draftSummary.total === '40.00' && draftSummary.pricedLineCount === 2 && draftSummary.unpricedLineCount === 1);

const catalogueContext = {
  ontology: { boqItemDefinitions: [
    { id: '73000000-0000-4000-8000-000000000001', workGroupId: ids[1], label: 'Included detail', defaultUnit: 'L.S.' },
    { id: '73000000-0000-4000-8000-000000000002', workGroupId: ids[2], label: 'Recovered detail', defaultUnit: 'L.S.' },
  ] },
};
const synced = syncProjectBoqDraftWithStandardCatalogue(custom, catalogueContext, () => crypto.randomUUID());
check('catalogue sync adds all standard detail without budget input', synced.items.length === 3 && synced.items.filter(item => item.itemKind === 'STANDARD').length === 2);
check('repeated catalogue sync does not duplicate standard definitions', syncProjectBoqDraftWithStandardCatalogue(synced, catalogueContext, () => crypto.randomUUID()).items.length === 3);
const grouped = groupProjectBoqItems(synced.items, [{ id: ids[1], code: 'C100.01', label: 'Preparation' }, { id: ids[2], code: 'C100.02', label: 'Other' }]);
check('BOQ rows are grouped by canonical Work Group', grouped.length === 2 && grouped[0].items.length === 2 && grouped[1].items.length === 1);

const orderedOntology = {
  departments: [{ id: 'dep-2', displayOrder: 2 }, { id: 'dep-1', displayOrder: 1 }],
  disciplines: [
    { id: 'disc-2', departmentId: 'dep-2', code: 'S100', label: 'Security', displayOrder: 1 },
    { id: 'disc-1', departmentId: 'dep-1', code: 'C100', label: 'Construction', displayOrder: 1 },
  ],
  workGroups: [
    { id: 'group-2', disciplineId: 'disc-1', code: 'C100.02', label: 'Demolition', displayOrder: 2 },
    { id: 'group-3', disciplineId: 'disc-2', code: 'S100.01', label: 'CCTV', displayOrder: 1 },
    { id: 'group-1', disciplineId: 'disc-1', code: 'C100.01', label: 'Preparation', displayOrder: 1 },
  ],
  boqItemDefinitions: [
    { id: 'def-2', workGroupId: 'group-1', code: 'C100.01.02' },
    { id: 'def-1', workGroupId: 'group-1', code: 'C100.01.01' },
  ],
};
const unorderedDraft = { items: [
  { lineId: 'custom', workGroupId: 'group-1', itemKind: 'CUSTOM', description: 'Custom', sortOrder: 0 },
  { lineId: 'security', workGroupId: 'group-3', itemKind: 'STANDARD', standardDefinitionId: 'def-3', sortOrder: 1 },
  { lineId: 'standard-2', workGroupId: 'group-1', itemKind: 'STANDARD', standardDefinitionId: 'def-2', sortOrder: 2 },
  { lineId: 'demolition', workGroupId: 'group-2', itemKind: 'STANDARD', standardDefinitionId: 'def-4', sortOrder: 3 },
  { lineId: 'standard-1', workGroupId: 'group-1', itemKind: 'STANDARD', standardDefinitionId: 'def-1', sortOrder: 4 },
] };
const orderedDraft = sortProjectBoqDraftItems(unorderedDraft, orderedOntology);
check('BOQ follows Department, Discipline and Work Group order', orderedDraft.items.map(item => item.lineId).join(',') === 'standard-1,standard-2,custom,demolition,security');
check('standard items precede custom items and persisted sort order is reindexed', orderedDraft.items.every((item, index) => item.sortOrder === index));
const hierarchy = buildProjectBoqHierarchy(orderedDraft.items, orderedOntology);
check('editor hierarchy follows Budget-style Discipline and Work Group order', hierarchy.disciplines.map(item => item.code).join(',') === 'C100,S100' && hierarchy.disciplines[0].groups.map(item => item.code).join(',') === 'C100.01,C100.02');
const disciplineTotals = summarizeProjectBoqDisciplines([
  { lineId: 'construction-priced', workGroupId: 'group-1', quantity: '2', labourRate: '3', materialRate: '7', sortOrder: 0 },
  { lineId: 'security-unpriced', workGroupId: 'group-3', quantity: '1', labourRate: null, materialRate: null, sortOrder: 1 },
], orderedOntology);
check('discipline breakdown follows canonical order and exact totals', disciplineTotals.map(item => `${item.code}:${item.total}`).join(',') === 'C100:20.00,S100:0.00');
const sequentialCustoms = sortProjectBoqDraftItems({ items: [
  { lineId: 'custom-first', workGroupId: 'group-1', itemKind: 'CUSTOM', description: 'Z first', sortOrder: 10 },
  { lineId: 'custom-second', workGroupId: 'group-1', itemKind: 'CUSTOM', description: 'A second', sortOrder: 11 },
] }, orderedOntology);
check('new custom rows remain at the bottom in insertion order', sequentialCustoms.items.map(item => item.lineId).join(',') === 'custom-first,custom-second');
const serverOrderedGroups = groupProjectBoqItems([
  { lineId: 's', workGroupId: 'group-3', sortOrder: 0 },
  { lineId: 'c', workGroupId: 'group-1', sortOrder: 1 },
], [orderedOntology.workGroups[1], orderedOntology.workGroups[2]]);
check('contractor Work Groups preserve canonical server order', serverOrderedGroups.map(item => item.code).join(',') === 'S100.01,C100.01');

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
