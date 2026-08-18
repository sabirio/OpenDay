export const PROCUREMENT_ROUTES = Object.freeze([
  { value: 'NOT_SELECTED', label: 'Not Selected' },
  { value: 'COMPETITIVE_TENDER', label: 'Competitive Tender' },
  { value: 'FRAMEWORK_AGREEMENT', label: 'Framework Agreement / Call-off' },
  { value: 'REQUEST_FOR_QUOTATION', label: 'Request for Quotation' },
  { value: 'DIRECT_AWARD', label: 'Direct Award' },
  { value: 'CLIENT_NOMINATED_CONTRACTOR', label: 'Client-Nominated Contractor' },
  { value: 'NOT_APPLICABLE', label: 'Not Applicable' },
]);

export const PROCUREMENT_SECTIONS = Object.freeze([
  { code: 'CONSTRUCTION', label: 'Construction', disciplineCodes: ['C100', 'E100', 'H100', 'P100', 'F100', 'V100', 'M100'] },
  { code: 'SECURITY', label: 'Security', disciplineCodes: ['S100'] },
  { code: 'IT_LOW_CURRENT', label: 'IT & Low Current', disciplineCodes: ['I100'] },
  { code: 'FURNITURE_JOINERY', label: 'Furniture & Joinery', disciplineCodes: ['J100'] },
  { code: 'SIGNAGE_GRAPHICS', label: 'Signage & Graphics', disciplineCodes: ['G100'] },
  { code: 'AUDIOVISUAL', label: 'Audiovisual', disciplineCodes: ['A100'] },
]);

const ROUTE_LABELS = Object.freeze(Object.fromEntries(PROCUREMENT_ROUTES.map(route => [route.value, route.label])));

function strategyRecordByCode(records) {
  return new Map((records || []).map(record => [record.sectionCode, record]));
}

export function buildProcurementStrategySections(ontology, records = []) {
  const recordByCode = strategyRecordByCode(records);
  const disciplines = ontology?.disciplines || [];
  const workGroups = ontology?.workGroups || [];
  return PROCUREMENT_SECTIONS.map(section => {
    const disciplineRows = disciplines
      .filter(discipline => section.disciplineCodes.includes(discipline.code))
      .map(discipline => ({
        ...discipline,
        workGroups: workGroups.filter(group => group.disciplineId === discipline.id),
      }));
    const record = recordByCode.get(section.code);
    const route = record?.procurementMethod || 'NOT_SELECTED';
    const workGroupCount = disciplineRows.reduce((total, discipline) => total + discipline.workGroups.length, 0);
    return {
      ...section,
      procurementMethod: route,
      procurementMethodLabel: ROUTE_LABELS[route] || route,
      revision: record?.revision || 0,
      disciplineCount: disciplineRows.length,
      disciplineCountDisplay: `${disciplineRows.length} ${disciplineRows.length === 1 ? 'discipline' : 'disciplines'}`,
      workGroupCount,
      workGroupCountDisplay: `${workGroupCount} Work Groups`,
      disciplines: disciplineRows,
      configured: !['NOT_SELECTED'].includes(route),
      tenderEligible: route === 'COMPETITIVE_TENDER',
    };
  });
}

export function createProcurementStrategyDraft(sections) {
  return (sections || []).map(section => ({
    sectionCode: section.code,
    procurementMethod: section.procurementMethod,
    expectedRevision: section.revision,
  }));
}

export function patchProcurementStrategyDraft(draft, sectionCode, procurementMethod) {
  return draft.map(row => row.sectionCode === sectionCode ? { ...row, procurementMethod } : row);
}

export function assessProcurementStrategyDraft(draft) {
  const issues = [];
  const expectedCodes = PROCUREMENT_SECTIONS.map(section => section.code);
  const actualCodes = (draft || []).map(row => row.sectionCode);
  if (actualCodes.length !== expectedCodes.length || new Set(actualCodes).size !== expectedCodes.length
    || expectedCodes.some(code => !actualCodes.includes(code))) issues.push({ code: 'PROCUREMENT_STRATEGY_SECTIONS_INVALID' });
  if ((draft || []).some(row => !PROCUREMENT_ROUTES.some(route => route.value === row.procurementMethod))) {
    issues.push({ code: 'PROCUREMENT_STRATEGY_ROUTE_INVALID' });
  }
  if ((draft || []).some(row => !Number.isInteger(row.expectedRevision) || row.expectedRevision < 0)) {
    issues.push({ code: 'PROCUREMENT_STRATEGY_REVISION_INVALID' });
  }
  return { issues, hasIssues: issues.length > 0, canSave: Boolean(draft?.length) && issues.length === 0 };
}

export function buildProcurementStrategyCommand(draft) {
  const assessment = assessProcurementStrategyDraft(draft);
  if (!assessment.canSave) throw Object.assign(new Error('INVALID_PROCUREMENT_STRATEGY'), { code: 'INVALID_PROCUREMENT_STRATEGY', issues: assessment.issues });
  return draft.map(row => ({ ...row }));
}

export function buildProcurementStrategyDraftPresentation(sections, draft) {
  const draftByCode = new Map((draft || []).map(row => [row.sectionCode, row]));
  const rows = (sections || []).map(section => {
    const selection = draftByCode.get(section.code);
    const method = selection?.procurementMethod || 'NOT_SELECTED';
    return {
      ...section,
      selectedMethod: method,
      selectedMethodLabel: ROUTE_LABELS[method] || method,
      pendingSelection: method === 'NOT_SELECTED',
    };
  });
  return { rows, configuredCount: rows.filter(row => !row.pendingSelection).length };
}
