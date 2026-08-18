import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const component = readFileSync(new URL('../components/budget/DepartmentalBudgetWorkspace.jsx', import.meta.url), 'utf8');
let passed = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  passed += 1;
  console.log(`  PASS ${name}`);
};

const approvedBranch = component.match(/\{approved \? <>[\s\S]*?<\/\> : <>/)?.[0] || '';

check('approved budget has a dedicated top-level presentation branch', approvedBranch.length > 0);
check('approved status is presented before the approved table and Excel export',
  approvedBranch.indexOf('<ApprovalControl') < approvedBranch.indexOf('<ApprovedBudgetTable')
    && approvedBranch.indexOf('<ApprovedBudgetTable') < approvedBranch.indexOf('<BudgetExcelExchange'));
check('historical round and readiness cards do not render in the approved branch',
  !approvedBranch.includes('<RoundControl') && !approvedBranch.includes('<BudgetApprovalReport'));
check('top card describes the current reality as Budget approved and APPROVED',
  /Current budget status/.test(component) && /<h2>Budget approved<\/h2>/.test(component) && />APPROVED</.test(component));
check('approved section table identifies approved amounts and approved total',
  /aria-label="Approved budget by section"/.test(component)
    && /Approved amount/.test(component)
    && /TOTAL APPROVED/.test(component));
check('approved mode keeps Export Excel and removes Import Excel from its action row',
  /approved \? 'Export the approved budget baseline/.test(component)
    && /\{!approved && <>/.test(component));

console.log(`\nApproved budget hierarchy UI: ${passed} passed, 0 failed`);
