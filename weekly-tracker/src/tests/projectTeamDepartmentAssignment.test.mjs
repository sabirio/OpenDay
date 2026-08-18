import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { assessMembershipDraft, createNewMembershipDraft, getMembershipCommand } from '../engines/commercialFoundationEngine.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../migrations/145_project_team_department_assignment.sql');
const component = read('../components/commercial/CommercialFoundationWorkspace.jsx');
const service = read('../services/commercialFoundationService.js');
let passed = 0;
const check = (name, condition) => { assert.ok(condition, name); passed += 1; console.log(`  PASS ${name}`); };

const view = {
  departments: [{ code: 'CONSTRUCTION', label: 'Construction' }, { code: 'SECURITY', label: 'Security' }],
  availableUsers: [{ userId: 'user-1', name: 'Colleague' }],
  memberships: [{ membershipId: 'member-1', userId: 'user-2', departmentCode: 'CONSTRUCTION', revision: 3 }],
};
const addDraft = { ...createNewMembershipDraft(view), userId: 'user-1', departmentCode: 'SECURITY' };
const editDraft = createNewMembershipDraft(view, 'member-1');

check('department catalog contains Security and all agreed project functions',
  ['PROJECT_MANAGEMENT','CONSTRUCTION','LEASING_LEGAL','SECURITY','IT','HR','STORE_DESIGN','SUPPLY','FACILITY']
    .every(code => migration.includes(`('${code}'`)));
check('department assignment is stored separately from Users authorization role',
  /ADD COLUMN IF NOT EXISTS department_code/.test(migration)
    && /roleSource','USERS','departmentSource','PROJECT_TEAM'/.test(migration));
check('adding a colleague requires a valid project department',
  assessMembershipDraft(view, addDraft).canSave
    && !assessMembershipDraft(view, { ...addDraft, departmentCode: '' }).canSave);
check('an existing colleague can open an edit draft without changing the person',
  editDraft.userId === 'user-2' && editDraft.departmentCode === 'CONSTRUCTION' && editDraft.expectedRevision === 3);
check('membership command carries department and optimistic revision only',
  getMembershipCommand(view, editDraft).departmentCode === 'CONSTRUCTION'
    && getMembershipCommand(view, editDraft).expectedRevision === 3);
check('service exposes add and update RPCs without capability overrides',
  /p_department_code: payload\.departmentCode/.test(service)
    && /update_project_team_member_department/.test(service)
    && !/p_capability_codes/.test(service));
check('Team table and editor expose department while retaining full project access',
  /Project department/.test(component) && /Save department/.test(component)
    && /Full access/.test(component) && /Role in Users/.test(component));
check('database functions remain explicitly permissioned',
  /REVOKE ALL ON FUNCTION public\.add_project_team_member/.test(migration)
    && /GRANT EXECUTE ON FUNCTION public\.add_project_team_member/.test(migration));

console.log(`\nProject Team department assignment: ${passed} passed, 0 failed`);
