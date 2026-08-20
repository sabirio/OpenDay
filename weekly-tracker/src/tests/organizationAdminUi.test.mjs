import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('../pages/AdminUsers.jsx');
const service = read('../services/adminUserService.js');
const auth = read('../auth/authService.js');
const route = read('../auth/ProtectedRoute.jsx');
const navigation = read('../engines/permissionEngine.js');
const email = read('../../supabase/functions/send-organization-invitation/index.ts');

assert.match(page, /organizationRole/);
assert.match(page, /Organization Admin can manage colleagues and project teams/);
assert.match(page, /Pending invitations/);
assert.match(page, /Invite colleague/);
assert.doesNotMatch(page, /Contractor project access|assignedProjects/);
assert.match(service, /functions\.invoke\('send-organization-invitation'/);
assert.match(service, /update_organization_user/);
assert.match(service, /deactivate_organization_user/);
assert.match(auth, /activate_my_organization_invitations/);
assert.match(auth, /organizationRole === 'ORG_ADMIN'/);
assert.match(route, /canAccessUser\(scopedUser \?\? user, resource\)/);
assert.match(navigation, /getAllowedNavItemsForUser/);
assert.match(email, /prepare_organization_user_invitation/);
assert.match(email, /generateLink/);
assert.match(email, /mark_organization_user_invitation_sent/);
assert.match(email, /Join OpenDay/);
console.log('organizationAdminUi: all checks passed');
