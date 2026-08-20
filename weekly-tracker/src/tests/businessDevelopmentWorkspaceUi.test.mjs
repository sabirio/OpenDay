import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const app = read('../App.jsx');
const page = read('../pages/BusinessDevelopment.jsx');
const shell = read('../components/businessDevelopment/BusinessDevelopmentShell.jsx');
const opportunities = read('../components/businessDevelopment/OpportunityWorkspace.jsx');
const estimates = read('../components/businessDevelopment/EstimateWorkspace.jsx');
const hook = read('../hooks/useBusinessDevelopmentWorkspace.js');
const service = read('../services/businessDevelopmentService.js');
const orchestration = read('../core/businessDevelopment/businessDevelopmentOrchestration.js');
const presentation = read('../core/presentation/businessDevelopmentPresentationModel.js');
const navigation = read('../auth/rolePermissions.js');
const workspaces = read('../domains/workspaces/workspaceModel.js');
const packageJson = read('../../package.json');
const vite = read('../../vite.config.js');
const globalCss = read('../index.css');

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
assert.match(packageJson, /"tailwindcss": "4\.3\.0"/);
assert.match(packageJson, /"@tailwindcss\/vite": "4\.3\.0"/);
assert.match(vite, /import tailwindcss from '@tailwindcss\/vite'/);
assert.match(vite, /plugins: \[react\(\), tailwindcss\(\)\]/);
assert.match(globalCss, /@import "tailwindcss"/);

assert.match(service, /get_business_development_workspace/);
assert.match(service, /save_commercial_opportunity/);
assert.match(service, /save_delivery_estimate/);
assert.doesNotMatch(service, /\.from\(/);
assert.match(hook, /commitDeliveryEstimate/);
assert.match(hook, /presentEstimateCalculation/);
assert.match(orchestration, /prepareDeliveryEstimateCommand/);
assert.match(presentation, /buildEstimateCommand/);
assert.match(presentation, /calculateEstimate/);
assert.match(opportunities, /Opportunity register/);
assert.match(opportunities, /Create estimate/);
assert.match(estimates, /Internal labour/);
assert.match(estimates, /External cost/);
assert.match(estimates, /Other direct cost/);
assert.match(estimates, /Estimated delivery cost/);
assert.match(estimates, /Quantity/);
assert.match(estimates, /Cost rate/);
assert.match(opportunities, /max-w-xl/);
assert.match(shell, /focus:ring-2/);
assert.doesNotMatch(`${opportunities}\n${estimates}`, /supabase|\.rpc\(|\.from\(/);

console.log('businessDevelopmentWorkspaceUi: all checks passed');
