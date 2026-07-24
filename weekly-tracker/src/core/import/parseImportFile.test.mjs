// parseImportFile.test.mjs - P0 Import Foundation v1 Phase 1: parser tests.
// Run: node src/core/import/parseImportFile.test.mjs
import { parseImportFile, SUPPORTED_EXTENSIONS, DEFAULT_MAX_ROWS } from './parseImportFile.js';
import { buildCsv, buildXlsxBuffer, HISTORICAL_HEADERS, HISTORICAL_SAMPLE_ROWS } from './importTestFixtures.mjs';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

console.log('\nparseImportFile - CSV and XLSX both parse to the same format-independent shape');

const csvText = buildCsv(HISTORICAL_HEADERS, HISTORICAL_SAMPLE_ROWS);
const csvResult = parseImportFile({ filename: 'historical.csv', data: csvText });
check('CSV parses successfully', csvResult.ok === true);
check('CSV headers match the source header row', JSON.stringify(csvResult.headers) === JSON.stringify(HISTORICAL_HEADERS));
check('CSV produces one row per data row', csvResult.rows.length === HISTORICAL_SAMPLE_ROWS.length);

const xlsxBuffer = buildXlsxBuffer(HISTORICAL_HEADERS, HISTORICAL_SAMPLE_ROWS);
const xlsxResult = parseImportFile({ filename: 'historical.xlsx', data: xlsxBuffer });
check('XLSX parses successfully', xlsxResult.ok === true);
check('XLSX headers match the source header row', JSON.stringify(xlsxResult.headers) === JSON.stringify(HISTORICAL_HEADERS));
check('XLSX produces one row per data row', xlsxResult.rows.length === HISTORICAL_SAMPLE_ROWS.length);

check('CSV and XLSX produce byte-identical row shapes for identical source data',
  JSON.stringify(csvResult.rows) === JSON.stringify(xlsxResult.rows));
check('CSV and XLSX results carry the same top-level keys (format-independence)',
  JSON.stringify(Object.keys(csvResult).sort()) === JSON.stringify(Object.keys(xlsxResult).sort()));

console.log('\nparseImportFile - file-level failure modes');

check('unsupported file type fails with UNSUPPORTED_FILE_TYPE', parseImportFile({ filename: 'projects.pdf', data: 'irrelevant' }).error?.code === 'UNSUPPORTED_FILE_TYPE');
check('missing filename extension fails with UNSUPPORTED_FILE_TYPE', parseImportFile({ filename: 'projects', data: 'irrelevant' }).error?.code === 'UNSUPPORTED_FILE_TYPE');
check('empty data fails with UNREADABLE_FILE', parseImportFile({ filename: 'projects.csv', data: '' }).error?.code === 'UNREADABLE_FILE');
check('garbage binary as XLSX fails safely (no rows silently accepted), does not throw', (() => {
  // SheetJS is deliberately best-effort: non-format bytes are read as one
  // literal text cell rather than raising a parse error, so the concrete
  // failure surfaces as NO_USABLE_ROWS (no real data row exists) rather
  // than UNREADABLE_FILE — both are safe, structured rejections; what
  // matters is that garbage input is never silently treated as a valid
  // importable file.
  try {
    const result = parseImportFile({ filename: 'projects.xlsx', data: Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]) });
    return result.ok === false && ['UNREADABLE_FILE', 'NO_USABLE_ROWS', 'MISSING_HEADER_ROW'].includes(result.error?.code);
  } catch { return false; }
})());
check('a sheet with only a header row (no data) fails with NO_USABLE_ROWS', parseImportFile({ filename: 'empty.csv', data: buildCsv(HISTORICAL_HEADERS, []) }).error?.code === 'NO_USABLE_ROWS');
check('a completely blank first row fails with MISSING_HEADER_ROW', parseImportFile({ filename: 'blank.csv', data: ',,,\nKZ001,Mall,Kazakhstan,Almaty' }).error?.code === 'MISSING_HEADER_ROW');

console.log('\nparseImportFile - row ceiling');
const manyRows = Array.from({ length: 12 }, (_, i) => [`KZ${i}`, 'Mall', 'Kazakhstan', 'Almaty', '1000', 'New Opening', '2024-01-01', '2024-12-01', 'BuildCo', '']);
const limited = parseImportFile({ filename: 'many.csv', data: buildCsv(HISTORICAL_HEADERS, manyRows), maxRows: 10 });
check('row ceiling rejects a file exceeding the configured maxRows', limited.ok === false && limited.error?.code === 'ROW_LIMIT_EXCEEDED');
const withinLimit = parseImportFile({ filename: 'many.csv', data: buildCsv(HISTORICAL_HEADERS, manyRows), maxRows: 20 });
check('a file within the configured maxRows still succeeds', withinLimit.ok === true && withinLimit.rows.length === 12);
check('DEFAULT_MAX_ROWS is a sane, exported, configurable default', typeof DEFAULT_MAX_ROWS === 'number' && DEFAULT_MAX_ROWS > 0);

console.log('\nparseImportFile - supported extensions and non-domain behavior');
check('csv and xlsx are both supported extensions', SUPPORTED_EXTENSIONS.includes('csv') && SUPPORTED_EXTENSIONS.includes('xlsx'));
check('the parser return shape has no OpenDay field-mapping concept (headers stay verbatim source text)',
  csvResult.headers.every(header => HISTORICAL_HEADERS.includes(header)));
check('ragged rows are padded to header width rather than dropped', (() => {
  const ragged = parseImportFile({ filename: 'ragged.csv', data: 'A,B,C\n1,2\n' });
  return ragged.ok === true && ragged.rows[0].length === 3;
})());

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
