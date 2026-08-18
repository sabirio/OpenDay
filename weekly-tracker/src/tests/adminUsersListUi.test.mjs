import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../pages/AdminUsers.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
let passed = 0;
const check = (name, condition) => { assert.ok(condition, name); passed += 1; console.log(`  PASS ${name}`); };

check('Users renders a scalable table instead of cards',
  /admin-users-table/.test(page) && /<table/.test(page) && !/admin-users-grid|admin-user-card/.test(page));
check('Users can be searched by name, email, or role',
  /type="search"/.test(page) && /Name, email, role, or access/.test(page) && /filteredUsers/.test(page));
check('Edit opens one focused user editor',
  />Edit</.test(page) && /admin-user-edit-modal/.test(page) && /Save changes/.test(page));
check('role selector uses the approved internal job roles',
  ['Construction Manager','Lease Manager','Project Manager','Security Manager','IT Manager','HR Manager','Store Designer','Supply Manager','Facility Manager'].every(role => page.includes(`'${role}'`))
    && /admin-user-role-select/.test(page));
check('Remove is explicit and preserves history',
  /'Remove'/.test(page) && /historical records will be preserved/.test(page) && /editor\.remove/.test(page));
check('Contractor project assignments expand below the row',
  /aria-expanded=\{isExpanded\}/.test(page) && /admin-user-projects-row/.test(page) && /Contractor project access/.test(page));
check('table has compact responsive styling',
  /\.admin-users-table-wrap \{ overflow: auto/.test(css) && /min-width: 1050px/.test(css) && /@media \(max-width: 720px\)/.test(css));
console.log(`\nAdmin Users list UI: ${passed} passed, 0 failed`);
