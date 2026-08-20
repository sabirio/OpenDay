import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const app = read('../App.jsx');
const page = read('../pages/BusinessDevelopment.jsx');
const shell = read('../components/businessDevelopment/BusinessDevelopmentShell.jsx');
const opportunities = read('../components/businessDevelopment/OpportunityWorkspace.jsx');
const estimates = read('../components/businessDevelopment/EstimateWorkspace.jsx');
const rateCards = read('../components/businessDevelopment/RateCardWorkspace.jsx');
const pricing = read('../components/businessDevelopment/PricingWorkspace.jsx');
const proposals = read('../components/businessDevelopment/ProposalWorkspace.jsx');
const primitives = read('../components/shared/UiPrimitives.jsx');
const layouts = read('../components/shared/LayoutPrimitives.jsx');
const patterns = read('../components/shared/UiPatterns.jsx');
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
  ['/business-development/rate-cards', 'rate_cards'],
  ['/business-development/pricing', 'pricing'],
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
assert.match(service, /save_organization_rate_card_entry/);
assert.match(service, /save_estimate_pricing/);
assert.match(service, /save_commercial_proposal_revision/);
assert.match(service, /transition_commercial_proposal/);
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
assert.match(estimates, /Apply organization rate card/);
assert.match(rateCards, /Organization rate cards/);
assert.match(pricing, /Commercial pricing/);
assert.match(pricing, /Target margin/);
assert.match(proposals, /Customer proposals/);
assert.match(proposals, /immutable revisions/);
assert.match(opportunities, /max-w-xl/);
assert.match(primitives, /focus:ring-2/);
assert.match(primitives, /export function Surface/);
assert.doesNotMatch(primitives, /PageShell|DataTable|FieldPage/);
assert.match(layouts, /export function PageShell/);
assert.match(layouts, /export function PageHeader/);
assert.match(patterns, /export function DataTable/);
assert.match(patterns, /export function EmptyState/);
assert.match(shell, /SharedPageHeader/);
assert.match(shell, /LayoutPrimitives\.jsx/);
assert.match(shell, /UiPatterns\.jsx/);
assert.match(opportunities, /<Surface elevated>/);
assert.match(estimates, /<Surface elevated>/);
assert.doesNotMatch(`${opportunities}\n${estimates}\n${rateCards}\n${pricing}\n${proposals}`, /supabase|\.rpc\(|\.from\(/);
assert.doesNotMatch(`${page}\n${shell}\n${opportunities}\n${estimates}\n${rateCards}\n${pricing}\n${proposals}`, /var\(--|#[0-9a-fA-F]{3,8}\b|rgba?\(/);

console.log('businessDevelopmentWorkspaceUi: all checks passed');
