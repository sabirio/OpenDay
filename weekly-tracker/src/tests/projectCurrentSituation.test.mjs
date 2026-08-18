import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { buildProjectCurrentSituation } from '../core/presentation/projectCurrentSituationModel.js';

const read = relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const tabs = read('../components/projects/projectDetailConfig.js');
const view = read('../components/projects/ProjectCurrentSituation.jsx');

let passed = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  passed += 1;
  console.log(`  PASS ${name}`);
};

const incomplete = buildProjectCurrentSituation({ id: 7, projectStatus: 'Active' });
const configured = buildProjectCurrentSituation({
  id: 8,
  projectStatus: 'Active',
  storeSizeSqm: 1000,
  currencyCode: 'EUR',
  targetOpeningDate: '2026-12-01',
  projectManager: 'Project Manager',
}, { daysLeft: 80 });

check('Portfolio default tab is named Current Situation',
  /id: "overview", label: "Current Situation"/.test(tabs));
check('incomplete project receives a setup recommendation',
  incomplete.recommendation.title === 'Complete the project setup'
    && incomplete.summaries[0].value === 'Needs attention');
check('configured project receives the procurement recommendation',
  configured.recommendation.title.includes('Review Plan & Budget')
    && configured.summaries[1].value === 'Configured');
check('all five lifecycle groups remain visible',
  configured.groups.map(group => group.title).join('|')
    === 'Plan & Budget|Tender|Delivery|Commercial Control|Closeout');
check('current situation keeps every workspace action available',
  configured.groups.flatMap(group => group.actions).length === 14
    && configured.groups.flatMap(group => group.actions).some(item => item.href === '/projects/8/closeout'));
check('recommendation is explanatory text and does not replace action buttons',
  /Recommended next step/.test(view)
    && /situation\.groups\.map/.test(view)
    && /className="btn btn-secondary"/.test(view));

console.log(`\nProject Current Situation: ${passed} passed, 0 failed`);
