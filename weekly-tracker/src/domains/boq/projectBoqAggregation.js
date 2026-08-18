const MONEY_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/;

function moneyToMinorUnits(value) {
  const text = typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(2)
    : typeof value === 'string' ? value.trim() : '';
  if (!MONEY_PATTERN.test(text)) {
    const error = new Error('INVALID_BOQ_LINE_TOTAL');
    error.code = 'INVALID_BOQ_LINE_TOTAL';
    error.value = value ?? null;
    throw error;
  }
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function formatMinorUnits(value) {
  const whole = value / 100n;
  const fraction = String(value % 100n).padStart(2, '0');
  return `${whole}.${fraction}`;
}

/**
 * Aggregates database-computed BOQ line totals without recalculating
 * Quantity x Unit Rate in the client. Output order is ontology order.
 */
export function aggregateProjectBoqItemsByWorkGroup(items, workGroups) {
  if (!Array.isArray(items) || !Array.isArray(workGroups)) {
    const error = new Error('INVALID_BOQ_AGGREGATION_INPUT');
    error.code = 'INVALID_BOQ_AGGREGATION_INPUT';
    throw error;
  }

  const groupsById = new Map(workGroups.map(group => [group.id, group]));
  const totals = new Map();
  for (const item of items) {
    const workGroup = groupsById.get(item?.workGroupId);
    if (!workGroup) {
      const error = new Error('UNKNOWN_BOQ_WORK_GROUP');
      error.code = 'UNKNOWN_BOQ_WORK_GROUP';
      error.referenceId = item?.workGroupId ?? null;
      throw error;
    }
    if (!['STANDARD', 'CUSTOM'].includes(item?.itemKind)) {
      const error = new Error('INVALID_BOQ_ITEM_KIND');
      error.code = 'INVALID_BOQ_ITEM_KIND';
      throw error;
    }

    const current = totals.get(workGroup.id) || {
      workGroupId: workGroup.id,
      workGroupCode: workGroup.code,
      workGroupLabel: workGroup.label,
      workGroupDisplayOrder: workGroup.displayOrder,
      disciplineId: workGroup.disciplineId,
      disciplineDisplayOrder: workGroup.disciplineDisplayOrder ?? 0,
      lineCount: 0,
      standardLineCount: 0,
      customLineCount: 0,
      pricedLineCount: 0,
      unpricedLineCount: 0,
      pricedTotalMinor: 0n,
    };
    current.lineCount += 1;
    if (item.itemKind === 'STANDARD') current.standardLineCount += 1;
    else current.customLineCount += 1;
    if (item.lineTotal == null) current.unpricedLineCount += 1;
    else {
      current.pricedLineCount += 1;
      current.pricedTotalMinor += moneyToMinorUnits(item.lineTotal);
    }
    totals.set(workGroup.id, current);
  }

  return [...totals.values()]
    .sort((a, b) => a.disciplineDisplayOrder - b.disciplineDisplayOrder
      || a.workGroupDisplayOrder - b.workGroupDisplayOrder
      || a.workGroupId.localeCompare(b.workGroupId))
    .map(({ pricedTotalMinor, ...group }) => ({
      ...group,
      pricedTotal: formatMinorUnits(pricedTotalMinor),
      isFullyPriced: group.unpricedLineCount === 0,
    }));
}

export function summarizeProjectBoqWorkGroups(groups) {
  if (!Array.isArray(groups)) {
    const error = new Error('INVALID_BOQ_WORK_GROUP_TOTALS');
    error.code = 'INVALID_BOQ_WORK_GROUP_TOTALS';
    throw error;
  }
  let totalMinor = 0n;
  const summary = groups.reduce((result, group) => {
    totalMinor += moneyToMinorUnits(group.pricedTotal);
    result.lineCount += group.lineCount;
    result.pricedLineCount += group.pricedLineCount;
    result.unpricedLineCount += group.unpricedLineCount;
    return result;
  }, { workGroupCount: groups.length, lineCount: 0, pricedLineCount: 0, unpricedLineCount: 0 });
  return { ...summary, pricedTotal: formatMinorUnits(totalMinor), isFullyPriced: summary.unpricedLineCount === 0 };
}
