import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveCapabilityClosure, validateCapabilityGraph } from '../domains/productCapabilities/capabilityGraph.js';

const migration = readFileSync(new URL('../migrations/151_product_capability_catalog.sql', import.meta.url), 'utf8');
const catalogSeed = migration.slice(
  migration.indexOf('INSERT INTO public.product_capability_catalog'),
  migration.indexOf('INSERT INTO public.product_capability_dependencies'),
);
const dependencySeed = migration.slice(
  migration.indexOf('INSERT INTO public.product_capability_dependencies'),
  migration.indexOf('SET CONSTRAINTS product_capability_dependency_graph_acyclic'),
);
const ids = [...catalogSeed.matchAll(/^\s*\('([a-z][a-z0-9.]+)'/gm)].map((match) => match[1]);
const dependencyRows = [...dependencySeed.matchAll(/^\s*\('([a-z][a-z0-9.]+)','([a-z][a-z0-9.]+)'\)/gm)]
  .map((match) => ({ capabilityId: match[1], requiredCapabilityId: match[2] }));

const expectedIds = [
  'core.projects','core.team','core.documents','core.notifications',
  'portfolio.overview','budgeting.departmental','financials.cost','tendering.main',
  'construction.control','weekly.reports','site.visits','snags.management',
  'opportunities.pipeline','estimating.delivery','pricing.commercial','proposals.issue',
  'proposals.revisions','design.delivery','construction.delivery','schedule.management',
  'deliverables.management','commercial.cost','commercial.revenue','commercial.margin',
  'commercial.forecast','variations.management','payments.management',
  'procurement.management','subcontractor.tendering','supplier.management',
  'benchmarking.cost','ai.intelligence','analytics.advanced',
];

assert.deepEqual(ids, expectedIds);
assert.equal(new Set(ids).size, 33);
assert.equal(dependencyRows.length, 31);
assert.deepEqual(validateCapabilityGraph({
  capabilities: ids.map((id) => ({ id })), dependencies: dependencyRows,
}), { ok: true, issues: [] });

const proposalClosure = resolveCapabilityClosure(['proposals.revisions'], {
  capabilities: ids.map((id) => ({ id })), dependencies: dependencyRows,
});
assert.equal(proposalClosure.ok, true);
for (const requiredId of [
  'proposals.issue','pricing.commercial','estimating.delivery',
  'opportunities.pipeline','core.documents',
]) assert.equal(proposalClosure.capabilityIds.includes(requiredId), true);

for (const projectPermission of [
  'PROJECT_MANAGE','TEAM_MANAGE','TENDER_MANAGE','BOQ_PREPARE',
  'BID_REVIEW','COMMERCIAL_APPROVE','EXECUTIVE_SUMMARY',
]) assert.equal(ids.includes(projectPermission), false);

assert.match(migration, /ALTER TABLE public\.product_capability_catalog ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /GRANT SELECT ON TABLE[\s\S]*product_capability_catalog[\s\S]*TO authenticated/);
assert.doesNotMatch(migration, /ALTER TABLE public\.project_capability_catalog/);
assert.doesNotMatch(migration, /INSERT INTO public\.project_capability_catalog/);
console.log('productCapabilityCatalog: all checks passed');
