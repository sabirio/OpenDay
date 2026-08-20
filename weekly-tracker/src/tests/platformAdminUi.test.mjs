import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=relative=>readFileSync(new URL(relative,import.meta.url),'utf8');
const app=read('../App.jsx');
const route=read('../auth/PlatformAdminRoute.jsx');
const auth=read('../auth/authService.js');
const sidebar=read('../components/Sidebar.jsx');
const page=read('../pages/PlatformAdmin.jsx');
const hook=read('../hooks/usePlatformAdmin.js');
const service=read('../services/platformAdminService.js');

assert.match(app,/path="\/platform-admin"[\s\S]*<PlatformAdminRoute><PlatformAdmin/);
assert.match(app,/isPlatformAdminRoute[\s\S]*projectsState === 'error'/);
assert.match(route,/user\?\.platformSuperadmin !== true[\s\S]*Navigate to="\/unauthorized"/);
assert.doesNotMatch(route,/role\s*===|canAccess|PERMISSIONS/);
assert.match(auth,/rpc\('get_my_organization_context'\)/);
assert.match(auth,/platformSuperadmin: organizationContext\?\.platformSuperadmin === true/);
assert.match(sidebar,/user\?\.platformSuperadmin[\s\S]*\/platform-admin/);
assert.doesNotMatch(page,/from\(['"]@supabase|\.from\(|\.rpc\(/);
for(const section of ['general','subscription','entitlements','audit'])assert.match(page,new RegExp(`['"]${section}['"]`));
assert.match(page,/Organizations/);
assert.match(hook,/loadPlatformOrganizations[\s\S]*loadPlatformOrganization/);
for(const command of [
  'set_platform_organization_status','set_platform_organization_subscription',
  'set_platform_organization_entitlement',
])assert.match(service,new RegExp(`rpc\\('${command}'`));
assert.doesNotMatch(service,/\.from\('organization_(?:subscriptions|entitlements)'\)[\s\S]*\.(?:insert|update|upsert|delete)\(/);
console.log('platformAdminUi: all checks passed');
