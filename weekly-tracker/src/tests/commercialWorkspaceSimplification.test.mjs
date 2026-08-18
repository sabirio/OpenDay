import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const detail = read('../components/projects/ProjectDetailPane.jsx');
const boq = read('../pages/ProjectBoq.jsx');
const closeout = read('../pages/ProjectCloseout.jsx');
const payments = read('../pages/ProjectPayments.jsx');
const variations = read('../pages/ProjectVariations.jsx');
const variationWorkspace = read('../components/variations/VariationWorkspace.jsx');
const forecast = read('../pages/ProjectCostForecast.jsx');
const app = read('../App.jsx');

const commercialBranch = detail.match(/if \(activeTab === "commercial"\)[\s\S]*?if \(activeTab === "additional-works"\)/)?.[0] || '';
const tenderBranch = detail.slice(detail.indexOf('if (activeTab === "tender")'));

assert.ok(!/Open BOQ editor/.test(commercialBranch), 'Commercial must not own the BOQ editor');
assert.ok(/Open BOQ editor/.test(tenderBranch) && /useProjectReturnHref\(project\.id, 'tender'\)/.test(boq), 'Tender must own the BOQ editor and its return path');
assert.equal((commercialBranch.match(/Project Closeout/g) || []).length, 1, 'Commercial must show one Project Closeout entry');
assert.ok(/closeout-flow/.test(closeout) && ['Cost', 'Schedule', 'Scope', 'Quality', 'Additional Works', 'Payments and retention', 'Lessons learned', 'Contractor scorecard', 'Historical record'].every(label => closeout.includes(`title="${label}"`)), 'Closeout must be one ordered collapsible flow');
assert.ok(/payment-flow/.test(payments) && ['Schedule', 'Retention', 'Certification', 'Payment tracking'].every(label => payments.includes(`title="${label}"`)), 'Payments must be one ordered four-step flow');
assert.ok(!/CostPackageFinancialOverview|CommercialReview/.test(variations) && /variationGroups/.test(variationWorkspace), 'Additional Works must be grouped by work without forecast controls');
assert.ok(/CostPackageFinancialOverview/.test(forecast) && /projects\/:projectId\/cost-forecast/.test(app), 'Cost Package forecast must have its own protected route');

console.log('Commercial Workspace Simplification: 7 passed, 0 failed');
