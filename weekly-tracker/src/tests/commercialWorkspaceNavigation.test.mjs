import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../components/projects/ProjectDetailPane.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../pages/ProjectCommercialSetup.jsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../components/commercial/CommercialFoundationWorkspace.jsx', import.meta.url), 'utf8');
const tender = readFileSync(new URL('../engines/tenderPresentationEngine.js', import.meta.url), 'utf8');
let passed = 0;
const check = (name, condition) => { assert.ok(condition, name); passed += 1; console.log(`  PASS ${name}`); };

check('commercial destinations use three distinct routes',
  /\/cost-packages/.test(app) && /\/project-team/.test(app) && /\/tender-packages/.test(app));
check('project drawer actions no longer share Commercial Setup',
  /Manage Cost Packages[\s\S]*\/cost-packages/.test(detail) === false
    && /to={`\/projects\/\$\{project\.id\}\/cost-packages`} state=\{returnState\}>Procurement Strategy/.test(detail)
    && /to={`\/projects\/\$\{project\.id\}\/project-team`} state=\{returnState\}>Manage Project Team/.test(detail)
    && /to={`\/projects\/\$\{project\.id\}\/tender-packages`} state=\{returnState\}>Manage Tender Packages/.test(detail));
check('each route renders only its own workspace section',
  /section === 'cost-packages'/.test(workspace)
    && /section === 'project-team'/.test(workspace)
    && /section === 'tender-packages'/.test(workspace));
check('page heading follows the selected destination',
  /'cost-packages': \{ title: 'Procurement Strategy'/.test(page)
    && /'project-team': \{ title: 'Project Team'/.test(page)
    && /'tender-packages': \{ title: 'Tender Packages'/.test(page));
check('Tender prerequisite opens Tender Packages directly',
  /actionLabel: 'Open Tender Packages'/.test(tender) && /\/tender-packages/.test(tender));
console.log(`\nCommercial workspace navigation: ${passed} passed, 0 failed`);
