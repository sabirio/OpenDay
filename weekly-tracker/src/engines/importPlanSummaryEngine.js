/**
 * importPlanSummaryEngine — the one formula that tallies a planned Import
 * v1 row set into the summary counts the Preview UI (Phase 3) will show.
 * Kept in engines/ per this codebase's architecture rule ("all formulas
 * live in engines/"); core/import/planProjectImport.js composes rows and
 * calls this rather than reducing them inline.
 */

/**
 * @param {Array<{action: 'CREATE'|'SKIP'|'BLOCK', warnings: Array}>} plannedRows
 * @returns {{total:number, create:number, skip:number, blocked:number, warnings:number}}
 */
export function summarizeImportPlan(plannedRows) {
  return (plannedRows || []).reduce((summary, row) => {
    summary.total += 1;
    if (row.action === 'CREATE') summary.create += 1;
    else if (row.action === 'SKIP') summary.skip += 1;
    else summary.blocked += 1;
    if (row.warnings?.length > 0) summary.warnings += 1;
    return summary;
  }, { total: 0, create: 0, skip: 0, blocked: 0, warnings: 0 });
}
