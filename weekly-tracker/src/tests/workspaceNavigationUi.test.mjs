import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const auth = read('../auth/authService.js');
const context = read('../auth/WorkspaceContext.jsx');
const selection = read('../auth/workspaceSelection.js');
const route = read('../auth/ProtectedRoute.jsx');
const sidebar = read('../components/Sidebar.jsx');
const permissions = read('../engines/permissionEngine.js');
const navigation = read('../auth/rolePermissions.js');
const app = read('../App.jsx');
const projectService = read('../services/projectService.js');

assert.match(auth, /get_effective_organization_entitlements/);
assert.match(auth, /effectiveCapabilities:[\s\S]*filter\(capability => capability\.enabled === true\)/);
assert.match(selection, /openday\.workspace\.v1/);
assert.match(context, /buildWorkspaceAccess/);
assert.match(context, /setActiveOrganizationId/);
assert.match(context, /setActiveWorkspaceId/);
assert.match(route, /useWorkspace\(\)/);
assert.match(route, /canAccessUser\(scopedUser \?\? user, resource\)/);
assert.match(permissions, /isResourceEntitled/);
assert.match(permissions, /const permitted[\s\S]*if \(!permitted\) return false[\s\S]*isResourceEntitled/);
assert.match(sidebar, />Workspace</);
assert.match(sidebar, /getAllowedNavItemsForSession\(scopedUser, NAV_ITEMS, activeWorkspace\?\.id\)/);
assert.match(navigation, /workspaceIds/);
assert.match(app, /filterProjectsForOrganization\(projects, activeOrganization\)/);
assert.match(projectService, /organizationId: row\.organization_id/);
assert.doesNotMatch(sidebar, /role\s*===\s*['"](?:Owner|Designer|Contractor)['"]/);

console.log('workspaceNavigationUi: all checks passed');
