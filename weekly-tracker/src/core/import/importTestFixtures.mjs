// importTestFixtures.mjs - shared fixture builders for Import v1 Phase 1
// tests. Not itself a test file (no .test.mjs suffix, not auto-discovered
// by runAll.mjs) — just realistic sample data + CSV/XLSX byte builders so
// parser tests don't need checked-in binary files.
import * as XLSX from 'xlsx';

// Headers as they would realistically appear in a historical retail
// project tracker someone has kept in Excel for years — not a
// one-field-per-test artificial shape.
export const HISTORICAL_HEADERS = [
  'Store Code', 'Mall', 'Country', 'City', 'Sqm', 'Project Type',
  'Construction Start', 'Target Opening', 'GC', 'Contractor Email',
];

export const CLEAN_ROW = ['KZ100', 'Silk Road Mall', 'Kazakhstan', 'Almaty', '1200', 'New Opening', '2024-01-15', '2024-11-01', 'BuildCo LLP', 'ops@buildco.example'];

export const DIRTY_BUT_VALID_ROW = ['kz101', '  Mega Center  ', 'UAE', 'Dubai', '1 250 m²', 'new opening', '15 March 2024', 'November 1, 2024', ' ACME Construction ', 'PM@ACME.EXAMPLE'];

export const HISTORICAL_SAMPLE_ROWS = [
  CLEAN_ROW,
  DIRTY_BUT_VALID_ROW,
  ['KZ102', 'Dostyk Plaza', 'Kazakhstan', 'Almaty', '1,250', 'Rebuilding', '2024-02-01', '2024-12-01', 'BuildCo LLP', ''],
];

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** @param {string[]} headers @param {Array<Array<unknown>>} rows @returns {string} CSV text */
export function buildCsv(headers, rows) {
  return [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
}

/** @param {string[]} headers @param {Array<Array<unknown>>} rows @returns {Buffer} a real .xlsx workbook's bytes */
export function buildXlsxBuffer(headers, rows) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Projects');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/** A deterministic mapping for HISTORICAL_HEADERS, as Phase 3's UI would eventually confirm. */
export const HISTORICAL_MAPPING = {
  'Store Code': 'store_code',
  Mall: 'shopping_mall_name',
  Country: 'country',
  City: 'city',
  Sqm: 'store_size_sqm',
  'Project Type': 'project_type',
  'Construction Start': 'construction_start_date',
  'Target Opening': 'target_opening_date',
  GC: 'general_contractor',
  'Contractor Email': 'contractor_email',
};
