import { buildProjectBoqRevisionPayload } from './projectBoqModel.js';
import { validateProjectBoqItemIdentityTransitions } from './projectBoqItemLifecycle.js';

export const PROJECT_BOQ_EXCHANGE_FORMAT = 'OPENDAY_PROJECT_BOQ';
export const PROJECT_BOQ_EXCHANGE_SCHEMA_VERSION = '4';
export const PROJECT_BOQ_INSTRUCTIONS_SHEET = 'Instructions';
export const PROJECT_BOQ_ITEMS_SHEET = 'BOQ';
export const PROJECT_BOQ_METADATA_SHEET = '_OpenDay';

export const PROJECT_BOQ_VISIBLE_HEADERS = Object.freeze([
  'Discipline Code', 'Discipline', 'Work Group Code', 'Work Group',
  'Description', 'Unit', 'Qty by Contractor', 'Qty by Consultant', 'Variance %', 'Labour', 'Material', 'Total',
  'Contractor Note', 'Reference', 'Specification',
]);

export const PROJECT_BOQ_TECHNICAL_HEADERS = Object.freeze([
  '__Line ID', '__Work Group ID', '__Item Kind', '__Standard Definition ID',
]);

export const PROJECT_BOQ_HEADERS = Object.freeze([
  ...PROJECT_BOQ_VISIBLE_HEADERS,
  ...PROJECT_BOQ_TECHNICAL_HEADERS,
]);

const HEADER_INDEX = Object.freeze(Object.fromEntries(PROJECT_BOQ_HEADERS.map((header, index) => [header, index])));

function text(value) {
  return value == null ? '' : String(value).trim();
}

function nullableText(value) {
  const normalized = text(value);
  return normalized || null;
}

function decimalCell(value, originalValue = null) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '__INVALID_NUMBER__';
    if (originalValue != null && Number(originalValue) === value) return String(originalValue);
    return String(value);
  }
  if (typeof value !== 'string') return '__INVALID_NUMBER__';
  return value.trim();
}

function issue(code, rowNumber = null, details = {}) {
  return { code, ...(rowNumber == null ? {} : { rowNumber }), ...details };
}

function metadataRows(input) {
  return [
    ['Key', 'Value'],
    ['Format', PROJECT_BOQ_EXCHANGE_FORMAT],
    ['Schema Version', PROJECT_BOQ_EXCHANGE_SCHEMA_VERSION],
    ['BOQ ID', input.boq.id],
    ['BOQ Version ID', String(input.version.id)],
    ['BOQ Revision', String(input.version.revisionNumber)],
    ['Ontology Version ID', input.boq.ontologyVersionId],
    ['Title', input.boq.title],
    ['Currency', input.boq.currencyCode],
  ];
}

export function buildProjectBoqSpreadsheetModel(input, { blankCustomRows = 25 } = {}) {
  const disciplines = new Map((input?.ontology?.disciplines || []).map(item => [item.id, item]));
  const workGroups = new Map((input?.ontology?.workGroups || []).map(item => [item.id, item]));
  const rows = (input?.items || []).map(item => {
    const workGroup = workGroups.get(item.workGroupId);
    const discipline = disciplines.get(workGroup?.disciplineId);
    if (!workGroup || !discipline) {
      const error = new Error('BOQ_EXPORT_UNKNOWN_WORK_GROUP');
      error.code = 'BOQ_EXPORT_UNKNOWN_WORK_GROUP';
      error.lineId = item.lineId;
      throw error;
    }
    return [
      discipline.code, discipline.label, workGroup.code, workGroup.label,
      item.description, item.unit, item.quantity == null ? null : Number(item.quantity),
      item.consultantQuantity == null ? null : Number(item.consultantQuantity), null,
      item.labourRate == null ? null : Number(item.labourRate),
      item.materialRate == null ? null : Number(item.materialRate),
      item.lineTotal == null ? null : Number(item.lineTotal), item.contractorNote ?? null,
      item.reference ?? null, item.specification ?? null, item.lineId, item.workGroupId,
      item.itemKind, item.standardDefinitionId ?? null,
    ];
  });

  for (let index = 0; index < blankCustomRows; index += 1) {
    rows.push(Array(PROJECT_BOQ_HEADERS.length).fill(null));
  }

  return {
    instructions: [
      ['OpenDay BOQ Excel Compatibility'],
      ['OpenDay remains the source of truth. Import creates a new immutable BOQ revision.'],
      ['Edit Qty by Contractor, Qty by Consultant, Labour, Material, notes, reference, and specification. Existing custom descriptions and units may also be edited.'],
      ['To add a row, use an empty row and enter an exact Work Group Code, Description, and Unit. Contractor quantity may remain blank. New rows are always CUSTOM.'],
      ['Do not delete existing rows or edit hidden technical columns. Identity loss or tampering blocks the import.'],
      ['Variance % is (Qty by Contractor - Qty by Consultant) / Qty by Consultant. Total uses Qty by Contractor × (Labour + Material).'],
      ['A completely empty new row is ignored. Blank Labour and Material preserve an explicitly unpriced line.'],
    ],
    headers: PROJECT_BOQ_HEADERS,
    rows,
    sourceItemCount: input?.items?.length || 0,
    metadata: metadataRows(input),
  };
}

function parseMetadata(rows) {
  const values = new Map();
  const issues = [];
  for (const row of (rows || []).slice(1)) {
    const key = text(row?.[0]);
    if (!key) continue;
    if (values.has(key)) issues.push(issue('BOQ_IMPORT_DUPLICATE_METADATA_KEY', null, { key }));
    values.set(key, text(row?.[1]));
  }
  return { values, issues };
}

function rowIsEmpty(row) {
  return PROJECT_BOQ_VISIBLE_HEADERS
    .filter(header => header !== 'Total')
    .every(header => text(row?.[HEADER_INDEX[header]]) === '');
}

function valuesMatchMetadata(values, context) {
  const expected = new Map([
    ['Format', PROJECT_BOQ_EXCHANGE_FORMAT],
    ['Schema Version', PROJECT_BOQ_EXCHANGE_SCHEMA_VERSION],
    ['BOQ ID', context.boq.id],
    ['BOQ Version ID', String(context.version.id)],
    ['BOQ Revision', String(context.version.revisionNumber)],
    ['Ontology Version ID', context.boq.ontologyVersionId],
    ['Title', context.boq.title],
    ['Currency', context.boq.currencyCode],
  ]);
  const issues = [];
  for (const [key, expectedValue] of expected) {
    if (values.get(key) !== String(expectedValue)) {
      issues.push(issue('BOQ_IMPORT_METADATA_MISMATCH', null, { key, expected: String(expectedValue) }));
    }
  }
  return issues;
}

export function planProjectBoqSpreadsheetImport(exchange, context) {
  const issues = [];
  if (JSON.stringify(exchange?.headers || []) !== JSON.stringify(PROJECT_BOQ_HEADERS)) {
    return { ok: false, issues: [issue('BOQ_IMPORT_HEADER_MISMATCH')] };
  }

  const metadata = parseMetadata(exchange.metadataRows);
  issues.push(...metadata.issues, ...valuesMatchMetadata(metadata.values, context));

  const sourceItems = context.items || [];
  const sourceByLineId = new Map(sourceItems.map(item => [item.lineId, item]));
  const workGroupsByCode = new Map();
  for (const workGroup of context.ontology?.workGroups || []) {
    if (workGroupsByCode.has(workGroup.code)) {
      issues.push(issue('BOQ_IMPORT_AMBIGUOUS_WORK_GROUP_CODE', null, { workGroupCode: workGroup.code }));
    }
    workGroupsByCode.set(workGroup.code, workGroup);
  }

  const seenLineIds = new Set();
  const items = [];
  let addedLineCount = 0;
  (exchange.rows || []).forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    if (rowIsEmpty(row)) return;

    const lineId = text(row[HEADER_INDEX['__Line ID']]);
    const workGroupCode = text(row[HEADER_INDEX['Work Group Code']]);
    const hiddenWorkGroupId = text(row[HEADER_INDEX['__Work Group ID']]);
    const hiddenItemKind = text(row[HEADER_INDEX['__Item Kind']]);
    const hiddenDefinitionId = nullableText(row[HEADER_INDEX['__Standard Definition ID']]);
    const description = text(row[HEADER_INDEX.Description]);
    const unit = text(row[HEADER_INDEX.Unit]);
    const source = lineId ? sourceByLineId.get(lineId) : null;
    const workGroup = workGroupsByCode.get(workGroupCode);

    if (lineId && seenLineIds.has(lineId)) issues.push(issue('BOQ_IMPORT_DUPLICATE_LINE_ID', rowNumber, { lineId }));
    if (lineId) seenLineIds.add(lineId);
    if (lineId && !source) issues.push(issue('BOQ_IMPORT_UNKNOWN_LINE_ID', rowNumber, { lineId }));
    if (!workGroup) issues.push(issue('BOQ_IMPORT_UNKNOWN_WORK_GROUP_CODE', rowNumber, { workGroupCode }));

    if (source) {
      if (hiddenWorkGroupId !== source.workGroupId
        || hiddenItemKind !== source.itemKind
        || hiddenDefinitionId !== (source.standardDefinitionId ?? null)
        || workGroup?.id !== source.workGroupId) {
        issues.push(issue('BOQ_IMPORT_LINE_IDENTITY_MISMATCH', rowNumber, { lineId }));
      }
      if (source.itemKind === 'STANDARD' && (description !== source.description || unit !== source.unit)) {
        issues.push(issue('BOQ_IMPORT_STANDARD_METADATA_MISMATCH', rowNumber, { lineId }));
      }
    } else if (!lineId) {
      if ((hiddenItemKind && hiddenItemKind !== 'CUSTOM') || hiddenDefinitionId != null
        || (hiddenWorkGroupId && hiddenWorkGroupId !== workGroup?.id)) {
        issues.push(issue('BOQ_IMPORT_NEW_LINE_TECHNICAL_FIELDS_INVALID', rowNumber));
      }
    }

    const quantity = decimalCell(row[HEADER_INDEX['Qty by Contractor']], source?.quantity);
    const consultantQuantity = decimalCell(row[HEADER_INDEX['Qty by Consultant']], source?.consultantQuantity);
    const labourRate = decimalCell(row[HEADER_INDEX.Labour], source?.labourRate);
    const materialRate = decimalCell(row[HEADER_INDEX.Material], source?.materialRate);
    const resolvedLineId = source ? source.lineId : context.createLineId?.();
    if (!source && !resolvedLineId) issues.push(issue('BOQ_IMPORT_LINE_ID_FACTORY_REQUIRED', rowNumber));

    items.push({
      lineId: resolvedLineId || '',
      workGroupId: source?.workGroupId || workGroup?.id || '',
      itemKind: source?.itemKind || 'CUSTOM',
      standardDefinitionId: source?.standardDefinitionId ?? null,
      description: source?.itemKind === 'STANDARD' ? source.description : description,
      unit: source?.itemKind === 'STANDARD' ? source.unit : unit,
      quantity,
      consultantQuantity,
      labourRate,
      materialRate,
      contractorNote: nullableText(row[HEADER_INDEX['Contractor Note']]),
      reference: nullableText(row[HEADER_INDEX.Reference]),
      specification: nullableText(row[HEADER_INDEX.Specification]),
      sortOrder: items.length,
    });
    if (!source) addedLineCount += 1;
  });

  for (const source of sourceItems) {
    if (!seenLineIds.has(source.lineId)) {
      issues.push(issue('BOQ_IMPORT_EXISTING_LINE_MISSING', null, { lineId: source.lineId }));
    }
  }

  issues.push(...validateProjectBoqItemIdentityTransitions(sourceItems, items));
  let payload = null;
  if (issues.length === 0) {
    try {
      payload = buildProjectBoqRevisionPayload({
        boqId: context.boq.id,
        title: context.boq.title,
        currencyCode: context.boq.currencyCode,
        expectedLatestRevision: context.version.revisionNumber,
        revisionNote: `Imported from Excel based on BOQ revision ${context.version.revisionNumber}`,
        items,
      });
    } catch (error) {
      issues.push(...(error.issues || [issue(error.code || 'INVALID_PROJECT_BOQ_REVISION')]));
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    payload,
    summary: { sourceRevision: context.version.revisionNumber, retainedLineCount: sourceItems.length, addedLineCount, importedLineCount: items.length },
    warnings: [{ code: 'BOQ_IMPORT_TOTAL_RECALCULATED_BY_DATABASE' }],
  };
}
