// Regression contract: database-nullable project fields must never be passed
// directly to controlled React inputs. React treats null values as an error;
// the empty-string fallback keeps the editor controlled without changing data.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const component = readFileSync(
  path.join(here, '../components/projects/ProjectEditorModal.jsx'),
  'utf8',
);

const nullableFields = [
  'storeCode',
  'country',
  'city',
  'constructionStartDate',
  'constructionEndDate',
  'targetOpeningDate',
];

let passed = 0;
let failed = 0;
for (const field of nullableFields) {
  const normalized = `value={project.${field} ?? ""}`;
  const direct = `value={project.${field}}`;
  const ok = component.includes(normalized) && !component.includes(direct);
  if (ok) {
    passed += 1;
    console.log(`  OK ${field} is normalized for a controlled input`);
  } else {
    failed += 1;
    console.error(`  FAIL ${field} must use an empty-string fallback`);
  }
}

console.log(`\n-- RESULT: ${passed} passed, ${failed} failed --\n`);
process.exit(failed === 0 ? 0 : 1);
