// projectVocabularyArchitecture.test.mjs — proves Location Type / Project
// Type / Store Concept have exactly ONE literal owner (config/
// projectVocabulary.js) and that core/import/projectImportFieldMap.js
// re-exports rather than mirrors them. Guards against the duplication this
// cleanup removed (Project Information Architecture v1 cleanup) silently
// coming back — e.g. someone adds "Relocation" to one list and forgets the
// other.
// Run: node src/tests/projectVocabularyArchitecture.test.mjs

import { readFileSync } from 'node:fs';
import * as vocab from '../config/projectVocabulary.js';
import * as importFieldMap from '../core/import/projectImportFieldMap.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

console.log('\nprojectVocabularyArchitecture — Import re-exports the same array instances, never a second literal');

// Reference identity (===), not just deep-equal content — proves Import
// literally re-exports config/projectVocabulary.js's arrays rather than
// declaring its own array that merely happens to match today.
check('PROJECT_TYPE_VALUES (Import) is the exact same array as PROJECT_TYPE_OPTIONS (canonical)',
  importFieldMap.PROJECT_TYPE_VALUES === vocab.PROJECT_TYPE_OPTIONS);
check('LOCATION_TYPE_VALUES (Import) is the exact same array as LOCATION_TYPE_OPTIONS (canonical)',
  importFieldMap.LOCATION_TYPE_VALUES === vocab.LOCATION_TYPE_OPTIONS);
check('STORE_CONCEPT_SUGGESTIONS (Import) is the exact same array as STORE_CONCEPT_SUGGESTIONS (canonical)',
  importFieldMap.STORE_CONCEPT_SUGGESTIONS === vocab.STORE_CONCEPT_SUGGESTIONS);

console.log('\nprojectVocabularyArchitecture — no mirrored literal array remains in projectImportFieldMap.js');

const importFieldMapSource = readFileSync(
  new URL('../core/import/projectImportFieldMap.js', import.meta.url),
  'utf8',
);

// A literal re-declaration would look like `= Object.freeze([...'New Opening'...])`
// in this file; the only thing allowed to declare Object.freeze([...]) with
// these words is config/projectVocabulary.js itself.
check('projectImportFieldMap.js contains no literal "New Opening"/"Rebuilding" array',
  !/Object\.freeze\(\[[^\]]*New Opening/.test(importFieldMapSource));
check('projectImportFieldMap.js contains no literal "Mall"/"Street" location-type array',
  !/Object\.freeze\(\[\s*'Mall'/.test(importFieldMapSource));
check('projectImportFieldMap.js contains no literal Flagship/Standard/Small/Compact array',
  !/Object\.freeze\(\[[^\]]*Flagship/.test(importFieldMapSource));
check('projectImportFieldMap.js imports the three vocabularies from config/projectVocabulary.js',
  /from\s+['"]\.\.\/\.\.\/config\/projectVocabulary\.js['"]/.test(importFieldMapSource));

console.log('\nprojectVocabularyArchitecture — canonical values are exactly the current approved vocabulary');

check('Project Type is exactly ["New Opening", "Rebuilding"]',
  JSON.stringify(vocab.PROJECT_TYPE_OPTIONS) === JSON.stringify(['New Opening', 'Rebuilding']));
check('Location Type is exactly ["Mall", "Street"]',
  JSON.stringify(vocab.LOCATION_TYPE_OPTIONS) === JSON.stringify(['Mall', 'Street']));
check('Store Concept is exactly ["Flagship", "Standard", "Small", "Compact"]',
  JSON.stringify(vocab.STORE_CONCEPT_SUGGESTIONS) === JSON.stringify(['Flagship', 'Standard', 'Small', 'Compact']));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
if (fail > 0) process.exit(1);
