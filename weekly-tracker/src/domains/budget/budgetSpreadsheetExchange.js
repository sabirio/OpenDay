export const PROJECT_BUDGET_EXCHANGE_FORMAT = 'OPENDAY_PROJECT_BUDGET';
export const PROJECT_BUDGET_EXCHANGE_SCHEMA_VERSION = '1';
export const PROJECT_BUDGET_INSTRUCTIONS_SHEET = 'Instructions';
export const PROJECT_BUDGET_ITEMS_SHEET = 'Budget';
export const PROJECT_BUDGET_METADATA_SHEET = '_OpenDay';

export const PROJECT_BUDGET_VISIBLE_HEADERS = Object.freeze([
  'Department Code', 'Department', 'Discipline Code', 'Discipline',
  'Work Group Code', 'Work Group', 'Amount', 'Usage', 'Note',
]);
export const PROJECT_BUDGET_TECHNICAL_HEADERS = Object.freeze([
  '__Work Group ID', '__Discipline ID', '__Revision',
]);
export const PROJECT_BUDGET_HEADERS = Object.freeze([
  ...PROJECT_BUDGET_VISIBLE_HEADERS, ...PROJECT_BUDGET_TECHNICAL_HEADERS,
]);

const HEADER_INDEX = Object.freeze(Object.fromEntries(PROJECT_BUDGET_HEADERS.map((header, index) => [header, index])));
const MONEY_PATTERN = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
const text = value => value == null ? '' : String(value).trim();
const issue = (code, rowNumber = null, details = {}) => ({ code, ...(rowNumber == null ? {} : { rowNumber }), ...details });

function metadataRows(input) {
  return [
    ['Key', 'Value'],
    ['Format', PROJECT_BUDGET_EXCHANGE_FORMAT],
    ['Schema Version', PROJECT_BUDGET_EXCHANGE_SCHEMA_VERSION],
    ['Project ID', String(input.projectId)],
    ['Project Code', input.workspace.projectCode],
    ['Budget Cycle ID', input.workspace.cycle.budgetCycleId],
    ['Budget Round', String(input.workspace.roundControl.currentRoundNumber)],
    ['Currency', input.workspace.cycle.currencyCode],
  ];
}

export function buildProjectBudgetSpreadsheetModel(input) {
  const rows = input.workspace.contributions.map(row => [
    row.departmentCode, row.departmentLabel, row.disciplineCode, row.disciplineLabel,
    row.workGroupCode, row.workGroupLabel, row.amount == null ? null : Number(row.amount),
    row.amount == null ? 'Not Applicable' : 'Included', row.note || null,
    row.workGroupId, row.disciplineId, row.revision,
  ]);
  return {
    instructions: [
      ['OpenDay Budget Excel Exchange'],
      ['OpenDay remains the source of truth. Import updates the current Draft budget.'],
      ['Edit only Amount and Note on the Budget sheet. Leave Amount blank for Not Applicable.'],
      ['Do not add, delete, reorder, or rename Work Groups, and do not edit hidden technical columns.'],
      ['Export a fresh file before editing if the budget was changed in OpenDay. Stale files are rejected.'],
      [`Currency: ${input.workspace.cycle.currencyCode}. Amounts must be zero or positive with no more than two decimals.`],
    ],
    headers: PROJECT_BUDGET_HEADERS,
    rows,
    metadata: metadataRows(input),
  };
}

function parseMetadata(rows) {
  const values = new Map();
  const issues = [];
  for (const row of (rows || []).slice(1)) {
    const key = text(row?.[0]);
    if (!key) continue;
    if (values.has(key)) issues.push(issue('BUDGET_IMPORT_DUPLICATE_METADATA_KEY', null, { key }));
    values.set(key, text(row?.[1]));
  }
  return { values, issues };
}

function validateMetadata(values, context) {
  if (values.get('Format') !== PROJECT_BUDGET_EXCHANGE_FORMAT || values.get('Schema Version') !== PROJECT_BUDGET_EXCHANGE_SCHEMA_VERSION) return [issue('BUDGET_IMPORT_UNSUPPORTED_FORMAT')];
  if (values.get('Project ID') !== String(context.projectId) || values.get('Project Code') !== context.workspace.projectCode) return [issue('BUDGET_IMPORT_DIFFERENT_PROJECT', null, { fileProjectCode: values.get('Project Code') || 'unknown', currentProjectCode: context.workspace.projectCode })];
  if (values.get('Budget Cycle ID') !== context.workspace.cycle.budgetCycleId) return [issue('BUDGET_IMPORT_DIFFERENT_CYCLE')];
  if (values.get('Budget Round') !== String(context.workspace.roundControl.currentRoundNumber)) return [issue('BUDGET_IMPORT_DIFFERENT_ROUND', null, { fileRound: values.get('Budget Round') || 'unknown', currentRound: context.workspace.roundControl.currentRoundNumber })];
  if (values.get('Currency') !== context.workspace.cycle.currencyCode) return [issue('BUDGET_IMPORT_DIFFERENT_CURRENCY', null, { fileCurrency: values.get('Currency') || 'unknown', currentCurrency: context.workspace.cycle.currencyCode })];
  return [];
}

function amountValue(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const normalized = String(value).trim();
  return MONEY_PATTERN.test(normalized) ? normalized : null;
}

function canonicalAmount(value) {
  const normalized = amountValue(value);
  if (normalized == null || normalized === '') return normalized;
  const [whole, fraction = ''] = normalized.split('.');
  const trimmedFraction = fraction.replace(/0+$/, '');
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

export function planProjectBudgetSpreadsheetImport(exchange, context) {
  if (context.workspace.roundControl.state !== 'DRAFT') return { ok: false, issues: [issue('BUDGET_IMPORT_REQUIRES_DRAFT_ROUND')] };
  if (JSON.stringify(exchange?.headers || []) !== JSON.stringify(PROJECT_BUDGET_HEADERS)) {
    return { ok: false, issues: [issue('BUDGET_IMPORT_HEADER_MISMATCH')] };
  }
  const metadata = parseMetadata(exchange.metadataRows);
  const issues = [...metadata.issues, ...validateMetadata(metadata.values, context)];
  if (issues.length > 0) return { ok: false, issues };
  const sourceRows = context.workspace.contributions || [];
  const sourceById = new Map(sourceRows.map(row => [row.workGroupId, row]));
  const seen = new Set();
  const changes = [];
  let includedCount = 0;

  (exchange.rows || []).forEach((row, index) => {
    const rowNumber = index + 2;
    const workGroupId = text(row?.[HEADER_INDEX['__Work Group ID']]);
    const disciplineId = text(row?.[HEADER_INDEX['__Discipline ID']]);
    const revision = Number(row?.[HEADER_INDEX.__Revision]);
    const source = sourceById.get(workGroupId);
    if (!workGroupId || !source) issues.push(issue('BUDGET_IMPORT_UNKNOWN_WORK_GROUP', rowNumber));
    if (seen.has(workGroupId)) issues.push(issue('BUDGET_IMPORT_DUPLICATE_WORK_GROUP', rowNumber, { workGroupId }));
    seen.add(workGroupId);
    if (!source) return;
    const identityMatches = disciplineId === source.disciplineId
      && text(row[HEADER_INDEX['Department Code']]) === source.departmentCode
      && text(row[HEADER_INDEX.Department]) === source.departmentLabel
      && text(row[HEADER_INDEX['Discipline Code']]) === source.disciplineCode
      && text(row[HEADER_INDEX.Discipline]) === source.disciplineLabel
      && text(row[HEADER_INDEX['Work Group Code']]) === source.workGroupCode
      && text(row[HEADER_INDEX['Work Group']]) === source.workGroupLabel;
    if (!identityMatches) issues.push(issue('BUDGET_IMPORT_WORK_GROUP_IDENTITY_MISMATCH', rowNumber, { workGroupId }));
    if (!Number.isInteger(revision) || revision !== source.revision) issues.push(issue('BUDGET_IMPORT_STALE_REVISION', rowNumber, { workGroupId }));
    const amount = amountValue(row[HEADER_INDEX.Amount]);
    if (amount == null) issues.push(issue('BUDGET_IMPORT_INVALID_AMOUNT', rowNumber, { workGroupId }));
    const note = text(row[HEADER_INDEX.Note]);
    if (note.length > 2000) issues.push(issue('BUDGET_IMPORT_NOTE_TOO_LONG', rowNumber, { workGroupId }));
    if (amount == null) return;
    if (amount !== '') includedCount += 1;
    const amountChanged = canonicalAmount(source.amount) !== canonicalAmount(amount);
    const noteChanged = (source.note || '') !== note;
    if (amountChanged || noteChanged) changes.push({
      disciplineId: source.disciplineId,
      workGroupId: source.workGroupId,
      amount,
      note,
      status: amount === '' ? 'NOT_STARTED' : (amountChanged ? 'IN_PROGRESS' : source.status),
      revision: source.revision,
    });
  });

  for (const source of sourceRows) if (!seen.has(source.workGroupId)) issues.push(issue('BUDGET_IMPORT_WORK_GROUP_MISSING', null, { workGroupId: source.workGroupId }));
  if (exchange.rows.length !== sourceRows.length) issues.push(issue('BUDGET_IMPORT_ROW_COUNT_MISMATCH'));
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    changes,
    summary: { rowCount: sourceRows.length, changedCount: changes.length, includedCount, notApplicableCount: sourceRows.length - includedCount },
  };
}
