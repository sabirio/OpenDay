import { strict as assert } from 'node:assert';
import { addConsultantCustomItem, assessConsultantBoq, buildConsultantBoqPresentation, createConsultantBoqDraft, getConsultantBoqSaveCommand, patchConsultantQuantity } from './consultantBoqEngine.js';

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`  PASS ${name}`); }
const standard = { lineId: 'line-1', workGroupId: 'wg-1', itemKind: 'STANDARD', standardDefinitionId: 'def-1', description: 'Cable', specification: null, unit: 'm', consultantQuantity: null, reference: 'E100.01.01', sortOrder: 0, workGroupCode: 'E100.01', workGroupLabel: 'Incoming Supply', disciplineCode: 'E100', disciplineLabel: 'Electrical' };
const workspace = { tenderId: 'tender-1', consultantBoqId: 'boq-1', projectBoqId: 'project-boq-1', tenderNumber: 'T01', status: 'NOT_STARTED', revisionNumber: 0, canPrepare: true, canReview: false, items: [standard], events: [] };

test('draft keeps empty consultant quantity editable', () => {
  const draft = createConsultantBoqDraft(workspace);
  assert.equal(draft.items[0].consultantQuantity, '');
  assert.equal(assessConsultantBoq(draft).canSave, true);
  assert.equal(assessConsultantBoq(draft).canSubmit, false);
});

test('decimal patch rejects negative and malformed quantities', () => {
  const draft = createConsultantBoqDraft(workspace);
  assert.equal(patchConsultantQuantity(draft, 'line-1', '-1'), draft);
  assert.equal(patchConsultantQuantity(draft, 'line-1', '12.25').items[0].consultantQuantity, '12.25');
});

test('custom item remains inside its canonical work group', () => {
  const draft = addConsultantCustomItem(createConsultantBoqDraft(workspace), 'wg-1', 'custom-1');
  assert.equal(draft.items[1].workGroupId, 'wg-1');
  assert.equal(draft.items[1].itemKind, 'CUSTOM');
  assert.equal(assessConsultantBoq(draft).invalidCustom, 1);
});

test('presentation groups by discipline and work group', () => {
  const view = buildConsultantBoqPresentation(createConsultantBoqDraft(workspace));
  assert.equal(view.disciplines[0].code, 'E100');
  assert.equal(view.disciplines[0].workGroups[0].code, 'E100.01');
});

test('save command carries no commercial rates', () => {
  const command = getConsultantBoqSaveCommand(createConsultantBoqDraft(workspace));
  assert.equal(Object.hasOwn(command.items[0], 'labourRate'), false);
  assert.equal(command.items[0].consultantQuantity, null);
});

console.log(`\nConsultant BOQ engine: ${passed} passed, 0 failed`);
