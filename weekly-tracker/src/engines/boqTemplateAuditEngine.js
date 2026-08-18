function normalizeLabel(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function duplicateLabels(items) {
  const seen = new Map();
  for (const item of items) {
    const key = normalizeLabel(item.label);
    const matches = seen.get(key) || [];
    matches.push(item.code);
    seen.set(key, matches);
  }
  return [...seen.entries()].filter(([, codes]) => codes.length > 1).map(([label, codes]) => ({ label, codes }));
}

export function auditBoqTemplate(ontology) {
  const disciplines = ontology?.disciplines || [];
  const workGroups = ontology?.workGroups || [];
  const lines = ontology?.boqItemDefinitions || [];
  const lineCounts = new Map(workGroups.map(group => [group.id, 0]));
  for (const line of lines) lineCounts.set(line.workGroupId, (lineCounts.get(line.workGroupId) || 0) + 1);
  const categoryLineCountIssues = workGroups.filter(group => {
    const count = lineCounts.get(group.id) || 0;
    return count < 3 || count > 5;
  }).map(group => ({ code: group.code, lineCount: lineCounts.get(group.id) || 0 }));
  const emptyDisciplines = disciplines.filter(discipline => !workGroups.some(group => group.disciplineId === discipline.id)).map(item => item.code);
  const duplicateCategories = duplicateLabels(workGroups);
  const duplicateLines = workGroups.flatMap(group => duplicateLabels(lines.filter(line => line.workGroupId === group.id)).map(issue => ({ workGroupCode: group.code, ...issue })));
  const issues = [
    ...emptyDisciplines.map(code => ({ code: 'EMPTY_DISCIPLINE', disciplineCode: code })),
    ...duplicateCategories.map(value => ({ code: 'DUPLICATE_CATEGORY', ...value })),
    ...duplicateLines.map(value => ({ code: 'DUPLICATE_STANDARD_LINE', ...value })),
    ...categoryLineCountIssues.map(value => ({ code: 'CATEGORY_LINE_COUNT_OUTSIDE_3_TO_5', ...value })),
  ];
  return {
    decision: issues.length === 0 ? 'READY_TO_FREEZE' : 'REQUIRES_REVIEW',
    disciplineCount: disciplines.length,
    canonicalCategoryCount: workGroups.length,
    standardLineCount: lines.length,
    duplicateCategoryCount: duplicateCategories.length,
    duplicateLineCount: duplicateLines.length,
    emptyDisciplineCount: emptyDisciplines.length,
    categoryLineCountIssueCount: categoryLineCountIssues.length,
    issues,
  };
}
