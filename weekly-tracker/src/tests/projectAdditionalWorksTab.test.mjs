import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const tabs = readFileSync(new URL('../components/projects/projectDetailConfig.js', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../components/projects/ProjectDetailPane.jsx', import.meta.url), 'utf8');
const variations = readFileSync(new URL('../pages/ProjectVariations.jsx', import.meta.url), 'utf8');

let passed = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  passed += 1;
  console.log(`  PASS ${name}`);
};

const commercialBranch = detail.match(/if \(activeTab === "commercial"\)[\s\S]*?if \(activeTab === "additional-works"\)/)?.[0] || '';
const additionalWorksBranch = detail.match(/if \(activeTab === "additional-works"\)[\s\S]*?if \(activeTab === "team"\)/)?.[0] || '';

check('Portfolio exposes a dedicated Additional Works tab',
  /id: "additional-works", label: "Additional Works"/.test(tabs));
check('Commercial no longer duplicates Tender setup',
  !/Set up tender/.test(commercialBranch) && !/\/tender`/.test(commercialBranch));
check('Commercial no longer shows the Additional Works / Variations action',
  !/>Additional Works \/ Variations</.test(commercialBranch));
check('Additional Works tab owns the Variations entry point',
  /title="Additional Works \/ Variations"/.test(additionalWorksBranch)
    && /\/variations`/.test(additionalWorksBranch)
    && /Open Additional Works \/ Variations/.test(additionalWorksBranch));
check('direct Variations return falls back to the Additional Works tab',
  /useProjectReturnHref\(projectId, 'additional-works'\)/.test(variations));

console.log(`\nProject Additional Works tab: ${passed} passed, 0 failed`);
