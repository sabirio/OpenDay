import assert from 'node:assert/strict';
import { validatePhotoFile } from './photoValidation.js';
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`  PASS ${name}`); }
check('accepts JPEG', () => assert.equal(validatePhotoFile({ type: 'image/jpeg', size: 100 }).size, 100));
check('rejects invalid MIME', () => assert.throws(() => validatePhotoFile({ type: 'application/pdf', size: 100 }), /JPEG/));
check('rejects empty image', () => assert.throws(() => validatePhotoFile({ type: 'image/png', size: 0 }), /empty/));
check('rejects source above 20 MB', () => assert.throws(() => validatePhotoFile({ type: 'image/webp', size: 20_971_521 }), /20 MB/));
console.log(`\n-- RESULT: ${passed} passed, 0 failed --`);
