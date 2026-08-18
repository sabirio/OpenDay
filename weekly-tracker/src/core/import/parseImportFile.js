/**
 * parseImportFile — the ONLY module in core/import/ that touches file bytes.
 * Format-independent by design: everything downstream (mapping,
 * normalization, validation, planning) works off the same
 * `{ sheetName, headers, rows }` shape whether the source was a .csv or an
 * .xlsx workbook. This module knows nothing about OpenDay project fields —
 * it does not map, normalize, detect duplicates, or write anything.
 *
 * Uses the `xlsx` (SheetJS) library, installed from SheetJS's own CDN
 * (https://cdn.sheetjs.com) rather than the npm registry build — the
 * registry build has an unpatched high-severity prototype-pollution
 * advisory (GHSA-4r6h-8v6p-xvw6) with no fix available on npm; the CDN
 * build is SheetJS's own documented distribution and is not affected.
 * SheetJS's own CSV/XLSX reader is reused for both formats through one
 * `XLSX.read()` call — this is why one dependency is sufficient for both.
 */
import * as XLSX from 'xlsx';

const SUPPORTED_EXTENSIONS = Object.freeze(['csv', 'xlsx', 'xls']);
const DEFAULT_MAX_ROWS = 5000;

function extensionOf(filename) {
  const match = /\.([a-z0-9]+)$/i.exec(String(filename || ''));
  return match ? match[1].toLowerCase() : '';
}

function fail(code, message) {
  return { ok: false, error: { code, message } };
}

function readWorkbook({ filename, data }) {
  const extension = extensionOf(filename);
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    return fail('UNSUPPORTED_FILE_TYPE', `Unsupported file type "${extension || 'unknown'}". Supported types: ${SUPPORTED_EXTENSIONS.join(', ')}.`);
  }
  if (data == null || (typeof data !== 'string' && data.byteLength === 0) || (typeof data === 'string' && data.trim() === '')) {
    return fail('UNREADABLE_FILE', 'The file is empty or contains no data.');
  }
  try {
    const readType = typeof data === 'string' ? 'string' : (data instanceof ArrayBuffer ? 'array' : 'buffer');
    const bytes = readType === 'array' ? new Uint8Array(data) : data;
    return { ok: true, workbook: XLSX.read(bytes, { type: readType, cellDates: true, raw: true }) };
  } catch {
    return fail('UNREADABLE_FILE', 'The file could not be read as a valid workbook.');
  }
}

export function parseWorkbookTables({ filename, data, maxRows = DEFAULT_MAX_ROWS } = {}) {
  const parsed = readWorkbook({ filename, data });
  if (!parsed.ok) return parsed;
  const workbook = parsed.workbook;
  const visibilityByName = new Map((workbook.Workbook?.Sheets || []).map(sheet => [sheet.name, sheet.Hidden || 0]));
  const sheets = [];
  let rowCount = 0;
  try {
    for (const name of workbook.SheetNames || []) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null, blankrows: true });
      rowCount += rows.length;
      if (rowCount > maxRows) return fail('ROW_LIMIT_EXCEEDED', `The workbook exceeds the ${maxRows}-row limit for one import.`);
      sheets.push({ name, hidden: visibilityByName.get(name) || 0, rows });
    }
  } catch {
    return fail('UNREADABLE_FILE', 'The workbook sheets could not be parsed into rows.');
  }
  if (sheets.length === 0) return fail('UNREADABLE_FILE', 'The workbook contains no readable sheet.');
  return { ok: true, sheets };
}

/**
 * @param {object} input
 * @param {string} input.filename - used only to check the extension
 * @param {string|Uint8Array|ArrayBuffer|Buffer} input.data - raw file bytes/text
 * @param {number} [input.maxRows] - configurable row ceiling (default 5000)
 * @returns {{ok:true, sheetName:string, headers:string[], rows:unknown[][]}
 *         | {ok:false, error:{code:string, message:string}}}
 */
export function parseImportFile({ filename, data, maxRows = DEFAULT_MAX_ROWS } = {}) {
  const parsed = readWorkbook({ filename, data });
  if (!parsed.ok) return parsed;
  const workbook = parsed.workbook;

  const sheetName = workbook?.SheetNames?.[0];
  if (!sheetName || !workbook.Sheets[sheetName]) {
    return fail('UNREADABLE_FILE', 'The workbook contains no readable sheet.');
  }

  let table;
  try {
    // blankrows kept (SheetJS default: true) so a genuinely blank header row
    // is still visible to the MISSING_HEADER_ROW check below, rather than
    // being silently skipped in favor of the next (real data) row. Blank
    // *data* rows are filtered explicitly, further down, instead.
    table = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });
  } catch {
    return fail('UNREADABLE_FILE', 'The sheet could not be parsed into rows.');
  }

  if (!Array.isArray(table) || table.length === 0) {
    return fail('MISSING_HEADER_ROW', 'The sheet has no header row.');
  }

  const rawHeaderRow = table[0];
  const headers = rawHeaderRow.map(value => String(value ?? '').trim());
  if (headers.every(header => header === '')) {
    return fail('MISSING_HEADER_ROW', 'The first row does not contain any usable column headers.');
  }

  const dataRows = table.slice(1).filter(row => row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''));
  if (dataRows.length === 0) {
    return fail('NO_USABLE_ROWS', 'The sheet has a header row but no usable data rows.');
  }
  if (dataRows.length > maxRows) {
    return fail('ROW_LIMIT_EXCEEDED', `The sheet has ${dataRows.length} data rows, exceeding the ${maxRows}-row limit for one import.`);
  }

  // Pad/truncate every row to the header width so downstream mapping can
  // always index positionally, even if a sheet has ragged rows. An empty
  // string is also collapsed to null here — CSV cannot represent "empty
  // cell" separately from "missing cell", so XLSX's distinct empty-string
  // cells are normalized to the same null the CSV path already produces,
  // keeping the two formats genuinely indistinguishable downstream.
  const rows = dataRows.map(row => headers.map((_, index) => {
    const cell = index < row.length ? row[index] : null;
    return cell === '' ? null : cell;
  }));

  return { ok: true, sheetName, headers, rows };
}

export { SUPPORTED_EXTENSIONS, DEFAULT_MAX_ROWS };
