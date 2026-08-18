import { strict as assert } from 'node:assert';
import { buildClarificationSubjectOptions, summarizeClarifications, validateClarificationDraft } from './clarificationModel.js';

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`  PASS ${name}`); };

test('summary separates active accepted and closed items', () => {
  assert.deepEqual(summarizeClarifications([{ status: 'DRAFT' }, { status: 'OPEN' }, { status: 'RESPONDED' }, { status: 'REVISION_REQUIRED' }, { status: 'ACCEPTED' }, { status: 'CLOSED' }]), { draft: 1, open: 3, responded: 1, accepted: 1, complete: 1, allComplete: false });
});
test('all complete requires closed or legacy resolved clarifications', () => { assert.equal(summarizeClarifications([{ status: 'RESOLVED' }, { status: 'CLOSED' }]).allComplete, true); assert.equal(summarizeClarifications([{ status: 'ACCEPTED' }]).allComplete, false); });
test('line and category subjects require their identity', () => { assert.deepEqual(validateClarificationDraft({ subjectType: 'LINE', lineId: '', type: 'BAD', comment: ' ' }), ['LINE_REQUIRED', 'TYPE_REQUIRED', 'COMMENT_REQUIRED']); assert.deepEqual(validateClarificationDraft({ subjectType: 'CATEGORY', workGroupId: '', type: 'SCOPE', comment: 'Explain' }), ['CATEGORY_REQUIRED']); });
test('whole tender subject needs no line identity', () => { assert.deepEqual(validateClarificationDraft({ subjectType: 'TENDER', type: 'COMMERCIAL', comment: 'Confirm exclusions' }), []); });
test('subject options deduplicate canonical categories', () => { const options = buildClarificationSubjectOptions({ items: [{ lineId: '1', workGroupId: 'w', workGroupCode: 'C100.01', workGroupLabel: 'Setup', description: 'A' }, { lineId: '2', workGroupId: 'w', workGroupCode: 'C100.01', workGroupLabel: 'Setup', description: 'B' }] }); assert.equal(options.categories.length, 1); assert.equal(options.lines.length, 2); });

console.log(`\nTender clarification model: ${passed} passed, 0 failed`);
