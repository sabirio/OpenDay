import { strict as assert } from 'node:assert';
import { buildCommercialFoundationView, createNewMembershipDraft, filterAvailableProjectUsers, getMembershipCommand, getMembershipIssues, patchMembershipDraft, toggleCostPackageWorkGroup } from './commercialFoundationEngine.js';

let passed = 0;
const test = (name, check) => { check(); passed += 1; console.log(`  PASS ${name}`); };
const id = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const view = buildCommercialFoundationView({
  project: { id: 1, storeCode: 'A', currencyCode: 'EUR' },
  commercial: { costPackages: [{ costPackageId: id }], currencyCode: 'EUR' },
  team: { departments: [{ code: 'SECURITY', label: 'Security' }], availableUsers: [{ userId, name: 'PM User', role: 'PM' }], memberships: [] },
  ontology: { disciplines: [], workGroups: [] },
});

test('view preserves project currency and package identities', () => {
  assert.equal(view.project.currencyCode, 'EUR');
  assert.equal(view.costPackages[0].costPackageId, id);
});
test('scope toggle is canonical and reversible', () => {
  const first = toggleCostPackageWorkGroup({ workGroupIds: [] }, id);
  assert.deepEqual(first.workGroupIds, [id]);
  assert.deepEqual(toggleCostPackageWorkGroup(first, id).workGroupIds, []);
});
test('membership draft contains project assignment fields only', () => {
  assert.deepEqual(createNewMembershipDraft(view), { membershipId: null, userId: '', departmentCode: 'SECURITY', expectedRevision: 0 });
});
test('membership validation rejects missing or unavailable users', () => {
  assert(getMembershipIssues(view, createNewMembershipDraft(view)).some(issue => issue.code === 'TEAM_USER_REQUIRED'));
  assert(getMembershipIssues(view, { membershipId: null, userId: id, departmentCode: 'SECURITY', expectedRevision: 0 }).some(issue => issue.code === 'TEAM_USER_NOT_AVAILABLE'));
});
test('membership command cannot redefine role or capabilities', () => {
  const draft = patchMembershipDraft(createNewMembershipDraft(view), { userId, projectRole: 'EXECUTIVE', capabilityCodes: ['EXECUTIVE_SUMMARY'] });
  assert.deepEqual(getMembershipCommand(view, draft), { membershipId: null, userId, departmentCode: 'SECURITY', expectedRevision: 0 });
});
test('available colleagues can be searched without deriving the list in React', () => {
  assert.deepEqual(filterAvailableProjectUsers(view, 'pm user').map(user => user.userId), [userId]);
  assert.deepEqual(filterAvailableProjectUsers(view, 'contractor'), []);
});
console.log(`\nCommercial foundation engine: ${passed} passed, 0 failed`);
