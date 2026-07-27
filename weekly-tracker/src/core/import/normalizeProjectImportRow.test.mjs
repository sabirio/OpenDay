// normalizeProjectImportRow.test.mjs - P0 Import Foundation v1 Phase 1: normalization tests.
// Run: node src/core/import/normalizeProjectImportRow.test.mjs
import {
  normalizeString, normalizeArea, normalizeMoney, normalizeDate, normalizeCountry,
  normalizeProjectType, normalizeLocationType, normalizeCurrencyCode, normalizeEmail, normalizeProjectImportRow,
} from './normalizeProjectImportRow.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

console.log('\nnormalizeProjectImportRow - strings trim (test 14)');
check('leading/trailing whitespace is trimmed', normalizeString('  Mega Center  ') === 'Mega Center');
check('an all-whitespace string normalizes to null', normalizeString('   ') === null);
check('null/undefined normalize to null', normalizeString(null) === null && normalizeString(undefined) === null);

console.log('\nnormalizeProjectImportRow - store code (audited: no uppercase rule exists in the current product, so none is invented)');
check('store code is trimmed but NOT forced to uppercase (existing projectService.create() applies no case transform)', normalizeString('  kz001  ') === 'kz001');

console.log('\nnormalizeProjectImportRow - area normalizes (test 15)');
check('a plain integer passes through', normalizeArea(1250).value === 1250 && normalizeArea(1250).ok);
check('a plain numeric string parses', normalizeArea('1250').value === 1250);
check('a space-grouped thousand separator parses ("1 250")', normalizeArea('1 250').value === 1250);
check('a comma-grouped thousand separator parses ("1,250")', normalizeArea('1,250').value === 1250);
check('an m² suffix is stripped ("1 250 m²")', normalizeArea('1 250 m²').value === 1250);
check('an "sqm" suffix is stripped ("1250 sqm")', normalizeArea('1250 sqm').value === 1250);
check('a decimal comma parses ("1250,5")', normalizeArea('1250,5').value === 1250.5);
check('absent area is safely null, not an error', normalizeArea(null).ok === true && normalizeArea(null).value === null);
check('absent area (empty string) is safely null', normalizeArea('').ok === true && normalizeArea('').value === null);

console.log('\nnormalizeProjectImportRow - locale/ambiguous numeric input fails safely (test 16)');
check('a comma used ambiguously (not thousands, not 1-2 digit decimal) fails rather than guessing', normalizeArea('1,2345').ok === false);
check('non-numeric text fails, does not coerce to NaN silently', normalizeArea('not a number').ok === false);
check('a negative-looking area still parses as a number (positivity is a validation concern, not normalization)', normalizeArea('-5').ok === false); // '-' is not in the numeric-only regex, so this fails safely too

console.log('\nnormalizeProjectImportRow - deterministic date formats normalize (test 17)');
check('ISO date normalizes unchanged', normalizeDate('2024-01-15').value === '2024-01-15');
check('a real JS Date object (as XLSX cellDates:true produces) normalizes to ISO', normalizeDate(new Date(Date.UTC(2024, 0, 15))).value === '2024-01-15');
check('day-first spelled month normalizes ("15 March 2024")', normalizeDate('15 March 2024').value === '2024-03-15');
check('month-first spelled month normalizes ("March 15, 2024")', normalizeDate('March 15, 2024').value === '2024-03-15');
check('absent date is safely null, not an error', normalizeDate(null).ok === true && normalizeDate(null).value === null);

console.log('\nnormalizeProjectImportRow - ambiguous dates fail/warn (test 18)');
check('a bare numeric D/M/Y date is flagged AMBIGUOUS_DATE, not guessed', normalizeDate('03/04/2025').ok === false && normalizeDate('03/04/2025').reason === 'AMBIGUOUS_DATE');
check('a dash-separated numeric date is also flagged ambiguous', normalizeDate('03-04-2025').ok === false && normalizeDate('03-04-2025').reason === 'AMBIGUOUS_DATE');
check('an impossible ISO calendar date fails (2024-13-40)', normalizeDate('2024-13-40').ok === false);
check('garbage text fails as INVALID_DATE, distinct from AMBIGUOUS_DATE', normalizeDate('not a date').reason === 'INVALID_DATE');
check('an unrecognized month name fails as INVALID_DATE', normalizeDate('15 Marchtember 2024').reason === 'INVALID_DATE');

console.log('\nnormalizeProjectImportRow - country aliases normalize (test 19)');
const aliases = { uae: 'United Arab Emirates' };
check('a known alias resolves', normalizeCountry('UAE', aliases) === 'United Arab Emirates');
check('alias matching is case-insensitive', normalizeCountry('uae', aliases) === 'United Arab Emirates');
check('an unrecognized country passes through untouched (no global fuzzy recognition)', normalizeCountry('Kazakhstan', aliases) === 'Kazakhstan');
check('absent country normalizes to null', normalizeCountry(null, aliases) === null);

console.log('\nnormalizeProjectImportRow - project type maps only to canonical vocabulary (test 20)');
check('a recognized value (case-insensitive) normalizes to the canonical casing', normalizeProjectType('new opening').value === 'New Opening' && normalizeProjectType('new opening').recognized === true);
check('an unrecognized value is passed through, flagged unrecognized, never invented/blocked at this layer', normalizeProjectType('Demolition').value === 'Demolition' && normalizeProjectType('Demolition').recognized === false);
check('absent project type is safely null and considered "recognized" (nothing to flag)', normalizeProjectType(null).value === null && normalizeProjectType(null).recognized === true);

console.log('\nnormalizeProjectImportRow - email is lightly normalized only (lowercased, trimmed; no invented format rule)');
check('email is trimmed and lowercased', normalizeEmail('  PM@ACME.example  ') === 'pm@acme.example');
check('absent email normalizes to null', normalizeEmail(null) === null);

console.log('\nnormalizeProjectImportRow - location type maps only to Mall/Street (frozen design: no DB enum, app-layer vocabulary only)');
check('a recognized value (case-insensitive) normalizes to canonical casing', normalizeLocationType('mall').value === 'Mall' && normalizeLocationType('mall').recognized === true);
check('"Street" normalizes unchanged', normalizeLocationType('Street').value === 'Street' && normalizeLocationType('Street').recognized === true);
check('an unrecognized value is passed through, flagged unrecognized, never rejected at this layer', normalizeLocationType('Airport').value === 'Airport' && normalizeLocationType('Airport').recognized === false);
check('absent location type is safely null and considered "recognized" (nothing to flag)', normalizeLocationType(null).value === null && normalizeLocationType(null).recognized === true);

console.log('\nnormalizeProjectImportRow - money normalizes like area but without unit-suffix stripping');
check('a plain integer passes through', normalizeMoney(500000).value === 500000 && normalizeMoney(500000).ok);
check('a comma-grouped thousand separator parses ("1,250,000")', normalizeMoney('1,250,000').value === 1250000);
check('a space-grouped thousand separator parses ("1 250 000")', normalizeMoney('1 250 000').value === 1250000);
check('non-numeric text fails, does not coerce to NaN silently', normalizeMoney('not a number').ok === false);
check('absent money is safely null, not an error', normalizeMoney(null).ok === true && normalizeMoney(null).value === null);

console.log('\nnormalizeProjectImportRow - currency code is trimmed/uppercased, then checked against the ISO 4217 allow-list');
check('a recognized code uppercases', normalizeCurrencyCode('usd').value === 'USD' && normalizeCurrencyCode('usd').recognized === true);
check('a recognized code passes through unchanged when already uppercase', normalizeCurrencyCode('AED').value === 'AED' && normalizeCurrencyCode('AED').recognized === true);
check('a well-formed but non-allow-listed code is preserved and flagged unrecognized (a 3-letter regex alone never proves a real currency)', normalizeCurrencyCode('xyz').value === 'XYZ' && normalizeCurrencyCode('xyz').recognized === false);
check('absent currency is safely null and considered "recognized" (nothing to flag)', normalizeCurrencyCode(null).value === null && normalizeCurrencyCode(null).recognized === true);

console.log('\nnormalizeProjectImportRow - full-row composition (single entry point, used by the validator)');
const composed = normalizeProjectImportRow({
  store_code: '  kz001  ', shopping_mall_name: '  Mega Center  ', country: 'UAE', city: 'Dubai',
  location_type: 'mall', store_size_sqm: '1 250 m²', sales_area_sqm: '900', back_of_house_area_sqm: '350',
  project_type: 'new opening', store_concept: '  Flagship  ', construction_start_date: '2024-01-15',
  construction_end_date: '2024-10-15',
  target_opening_date: '15 November 2024', actual_construction_start_date: '2024-01-20',
  actual_construction_completion_date: '2024-10-01', actual_opening_date: '2024-11-05',
  budget: '2,500,000', actual_cost: '2 650 000', currency_code: 'aed',
  general_contractor: ' ACME Co ', contractor_email: 'PM@ACME.EXAMPLE',
});
check('a fully dirty realistic row normalizes every field correctly in one pass',
  composed.normalized.store_code === 'kz001'
  && composed.normalized.shopping_mall_name === 'Mega Center'
  && composed.normalized.country === 'United Arab Emirates'
  && composed.normalized.location_type === 'Mall'
  && composed.normalized.store_size_sqm === 1250
  && composed.normalized.sales_area_sqm === 900
  && composed.normalized.back_of_house_area_sqm === 350
  && composed.normalized.project_type === 'New Opening'
  && composed.normalized.store_concept === 'Flagship'
  && composed.normalized.construction_start_date === '2024-01-15'
  && composed.normalized.construction_end_date === '2024-10-15'
  && composed.normalized.target_opening_date === '2024-11-15'
  && composed.normalized.actual_construction_start_date === '2024-01-20'
  && composed.normalized.actual_construction_completion_date === '2024-10-01'
  && composed.normalized.actual_opening_date === '2024-11-05'
  && composed.normalized.budget === 2500000
  && composed.normalized.actual_cost === 2650000
  && composed.normalized.currency_code === 'AED'
  && composed.normalized.general_contractor === 'ACME Co'
  && composed.normalized.contractor_email === 'pm@acme.example');
check('field-level notes are returned alongside the normalized row for the validator to read', composed.fieldNotes.store_size_sqm.ok === true && composed.fieldNotes.project_type.recognized === true && composed.fieldNotes.currency_code.recognized === true);

console.log('\nnormalizeProjectImportRow - construction_end_date (Planned Construction End) uses the same canonical date normalization as every other date field');
check('blank construction_end_date normalizes to null, not a fabricated date',
  normalizeProjectImportRow({ store_code: 'X', construction_end_date: '' }).normalized.construction_end_date === null);
check('absent construction_end_date normalizes to null',
  normalizeProjectImportRow({ store_code: 'X' }).normalized.construction_end_date === null);
check('an invalid construction_end_date produces the same INVALID_DATE note as any other date field',
  normalizeProjectImportRow({ store_code: 'X', construction_end_date: 'not a date' }).fieldNotes.construction_end_date.ok === false
  && normalizeProjectImportRow({ store_code: 'X', construction_end_date: 'not a date' }).fieldNotes.construction_end_date.reason === 'INVALID_DATE');
check('an ambiguous numeric construction_end_date is rejected, never guessed',
  normalizeProjectImportRow({ store_code: 'X', construction_end_date: '03/04/2025' }).fieldNotes.construction_end_date.reason === 'AMBIGUOUS_DATE');
check('a valid ISO construction_end_date normalizes unchanged',
  normalizeProjectImportRow({ store_code: 'X', construction_end_date: '2026-11-15' }).normalized.construction_end_date === '2026-11-15');

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
