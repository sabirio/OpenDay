import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const app = read('../App.jsx');
const page = read('../pages/BusinessDevelopment.jsx');
const navigation = read('../auth/rolePermissions.js');
const workspaces = read('../domains/workspaces/workspaceModel.js');

for (const [path, resource] of [
  ['/business-development', 'business_development'],
  ['/business-development/opportunities', 'opportunities'],
  ['/business-development/estimates', 'estimates'],
  ['/business-development/proposals', 'proposals'],
]) {
  assert.match(app, new RegExp(`path=\\"${path}\\"[\\s\\S]*?resource=\\"${resource}\\"`));
  assert.match(navigation, new RegExp(`to: '${path}'[\\s\\S]*?resource: '${resource}'`));
}

assert.match(app, /startsWith\('\/business-development'\)/);
assert.match(workspaces, /defaultRoutes: \['\/business-development'\]/);
assert.match(page, /Internal cost stays internal/);
assert.match(page, /getAllowedNavItemsForSession\(scopedUser, MODULES\)/);
assert.doesNotMatch(page, /supabase|\.from\(|\.rpc\(/);

console.log('businessDevelopmentWorkspaceUi: all checks passed');
