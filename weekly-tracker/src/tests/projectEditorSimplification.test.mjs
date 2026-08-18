import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const editor = readFileSync(new URL('../components/projects/ProjectEditorModal.jsx', import.meta.url), 'utf8');
const projects = readFileSync(new URL('../pages/Projects.jsx', import.meta.url), 'utf8');

let passed = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  passed += 1;
  console.log(`  PASS ${name}`);
};

check('New Project has no Stakeholders card', !editor.includes('title="Stakeholders"'));
check('New Project has no Disciplines card', !editor.includes('title="Disciplines"'));
check('New Project has no Project Scope card or scope action',
  !editor.includes('title="Project Scope"') && !editor.includes('Configure Project Scope'));
check('legacy Construction Template and Configure Scope controls are absent',
  !editor.includes('title="Construction Template"') && !editor.includes('Configure Scope'));
check('Portfolio no longer mounts a scope configurator from the project editor',
  !projects.includes('onOpenScopeConfigurator') && !projects.includes('showScopeConfigurator'));

console.log(`\nProject editor simplification: ${passed} passed, 0 failed`);
