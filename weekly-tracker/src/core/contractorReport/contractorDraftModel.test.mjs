import assert from 'node:assert/strict';
import { buildContractorDraftKey, buildContractorDraftEnvelope, inspectContractorDraft, findContractorDraft, saveContractorDraft } from './contractorDraftModel.js';

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`  PASS ${name}`); }
const identity = { userId: 'user/a', projectId: 42 };
const draft = buildContractorDraftEnvelope({ ...identity, reportDate: '2026-07-10', reportPeriod: '2026-W28', clientRequestId: 'request-1', formData: { reportingDate: '2026-07-10' }, workPackageRows: { a: {} }, evidenceItems: ['/private/path.jpg'] }, new Date('2026-07-10T10:00:00Z'));
check('key isolates app/workflow/version/user/project/period', () => assert.equal(buildContractorDraftKey(draft), 'openday:contractor-report:v1:user%2Fa:42:2026-W28'));
check('valid draft is compatible', () => assert.equal(inspectContractorDraft(JSON.stringify(draft), identity, new Date('2026-07-11')).status, 'compatible'));
check('other user is never restored', () => assert.equal(inspectContractorDraft(draft, { ...identity, userId: 'other' }).status, 'foreign'));
check('other project is never restored', () => assert.equal(inspectContractorDraft(draft, { ...identity, projectId: 99 }).status, 'foreign'));
check('invalid JSON is corrupt without throwing', () => assert.equal(inspectContractorDraft('{', identity).status, 'corrupt'));
check('unknown schema is incompatible', () => assert.equal(inspectContractorDraft({ ...draft, schemaVersion: 2 }, identity).status, 'incompatible'));
check('old draft is offered as stale', () => assert.equal(inspectContractorDraft(draft, identity, new Date('2026-08-10')).status, 'stale'));
check('object URLs are not persisted as evidence', () => { const built = buildContractorDraftEnvelope({ ...identity, reportDate: 'x', clientRequestId: 'r', formData: {}, evidenceItems: [{ preview: 'blob:x' }] }); assert.equal(built.evidenceItems.length, 0); });
check('storage discovery returns newest isolated draft', () => { const map = new Map(); const storage = { get length(){ return map.size; }, key(i){ return [...map.keys()][i]; }, getItem(k){ return map.get(k) || null; }, setItem(k,v){ map.set(k,v); } }; saveContractorDraft(storage, draft); const found = findContractorDraft(storage, identity, new Date('2026-07-11')); assert.equal(found.draft.clientRequestId, 'request-1'); });
check('legacy project-only draft is offered for removal, never restored', () => { const map = new Map([['contractor_draft_42', '{}']]); const storage = { get length(){ return map.size; }, key(i){ return [...map.keys()][i]; }, getItem(k){ return map.get(k) || null; } }; assert.equal(findContractorDraft(storage, identity).status, 'incompatible'); });
console.log(`\n-- RESULT: ${passed} passed, 0 failed --`);
