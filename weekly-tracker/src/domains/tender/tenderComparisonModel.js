const POW10 = Array.from({ length: 12 }, (_, index) => 10n ** BigInt(index));

function parseScaled(value, scale) {
  const text = String(value ?? '0').trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new Error('INVALID_COMPARISON_DECIMAL');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const scaled = BigInt(whole) * POW10[scale] + BigInt(fraction.slice(0, scale).padEnd(scale, '0') || '0');
  return negative ? -scaled : scaled;
}

function formatScaled(value, scale) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = POW10[scale];
  return `${negative ? '-' : ''}${absolute / base}.${String(absolute % base).padStart(scale, '0')}`;
}

function medianAtExtraScale(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] * 10n : (sorted[middle - 1] + sorted[middle]) * 5n;
}

function ratioBps(delta, baseline) {
  if (baseline === 0n) return null;
  const negative = delta < 0n;
  const absolute = negative ? -delta : delta;
  const value = (absolute * 10000n + baseline / 2n) / baseline;
  return Number(negative ? -value : value);
}

function compareMetrics(values, scale) {
  const parsed = values.map(value => ({ id: value.id, value: parseScaled(value.value, scale) }));
  const median = medianAtExtraScale(parsed.map(item => item.value));
  if (median == null) return { median: null, byId: new Map() };
  const sorted = [...parsed].sort((a, b) => a.value < b.value ? -1 : a.value > b.value ? 1 : 0);
  const minimum = sorted[0]?.value;
  const maximum = sorted.at(-1)?.value;
  const byId = new Map(parsed.map(entry => {
    const scaled = entry.value * 10n;
    const delta = scaled - median;
    return [entry.id, {
      value: formatScaled(entry.value, scale),
      rank: sorted.findIndex(item => item.value === entry.value) + 1,
      isLowest: entry.value === minimum,
      isHighest: entry.value === maximum,
      deviationFromMedian: formatScaled(delta, scale + 1),
      deviationBps: ratioBps(delta, median),
    }];
  }));
  return { median: formatScaled(median, scale + 1), byId };
}

const isIncluded = item => item.lineAction !== 'EXCLUDED';

function sumMoney(items) {
  return formatScaled(items.reduce((sum, item) => sum + (!isIncluded(item) || item.lineTotal == null ? 0n : parseScaled(item.lineTotal, 2)), 0n), 2);
}

function varianceAgainstBudget(value, budget) {
  if (value == null || budget == null) return { budgetVariance: null, budgetVarianceBps: null };
  const valueScaled = parseScaled(value, 2);
  const budgetScaled = parseScaled(budget, 2);
  const delta = valueScaled - budgetScaled;
  return { budgetVariance: formatScaled(delta, 2), budgetVarianceBps: budgetScaled === 0n ? null : ratioBps(delta * 10n, budgetScaled * 10n) };
}

function quantityVariance(contractorQuantity, consultantQuantity) {
  if (contractorQuantity == null || consultantQuantity == null) return { quantityVariance: null, quantityVarianceBps: null };
  const contractor = parseScaled(contractorQuantity, 6);
  const consultant = parseScaled(consultantQuantity, 6);
  const delta = contractor - consultant;
  return { quantityVariance: formatScaled(delta, 6), quantityVarianceBps: consultant === 0n ? null : ratioBps(delta, consultant) };
}

function summarizeBidder(participant) {
  const submission = participant.submission;
  if (!submission) return { id: participant.participantId, participantId: participant.participantId, contractorName: participant.contractorName, submitted: false };
  const items = submission.items || [];
  return {
    id: participant.participantId,
    participantId: participant.participantId,
    contractorName: participant.contractorName,
    submitted: true,
    submissionId: submission.submissionId,
    total: String(submission.total),
    currencyCode: submission.currencyCode,
    lineCount: submission.lineCount,
    pricedLineCount: submission.pricedLineCount,
    missingLineCount: submission.missingLineCount,
    excludedLineCount: submission.excludedLineCount ?? items.filter(item => !isIncluded(item)).length,
    contractorAddedLineCount: submission.contractorAddedLineCount ?? items.filter(item => item.lineOrigin === 'CONTRACTOR_ADDED').length,
    zeroRateCount: items.filter(item => isIncluded(item) && item.unitRate != null && parseScaled(item.unitRate, 6) === 0n).length,
    changedLineCount: items.filter(item => !['FIRST_ROUND', 'UNCHANGED'].includes(item.changeType)).length,
    items,
  };
}

function hierarchyRows(bidders, keyOf, metaOf, budgetByKey) {
  const keys = [];
  const metadata = new Map();
  for (const bidder of bidders.filter(item => item.submitted)) {
    for (const item of bidder.items) {
      const key = keyOf(item);
      if (!metadata.has(key)) {
        metadata.set(key, metaOf(item));
        keys.push(key);
      }
    }
  }
  for (const [key, entry] of budgetByKey) {
    if (!metadata.has(key)) {
      metadata.set(key, entry.meta);
      keys.push(key);
    }
  }
  return keys.map(key => {
    const values = bidders.filter(item => item.submitted).map(bidder => {
      const items = bidder.items.filter(item => keyOf(item) === key);
      return {
        id: bidder.id,
        value: sumMoney(items),
        missingLineCount: items.filter(item => isIncluded(item) && (item.quantity == null || item.unitRate == null)).length,
        excludedLineCount: items.filter(item => !isIncluded(item)).length,
        contractorAddedLineCount: items.filter(item => item.lineOrigin === 'CONTRACTOR_ADDED').length,
        zeroRateCount: items.filter(item => isIncluded(item) && item.unitRate != null && parseScaled(item.unitRate, 6) === 0n).length,
      };
    });
    const metrics = compareMetrics(values, 2);
    const budgetAmount = budgetByKey.get(key)?.amount ?? null;
    const consultantReferenceLineCount = bidders.find(item => item.submitted)?.items.filter(item => keyOf(item) === key && item.consultantQuantity != null).length ?? 0;
    return {
      ...metadata.get(key),
      budgetAmount,
      consultantReferenceLineCount,
      median: metrics.median,
      bidders: values.map(value => ({ ...value, ...metrics.byId.get(value.id), ...varianceAgainstBudget(value.value, budgetAmount) })),
    };
  });
}

function itemRows(bidders) {
  const submitted = bidders.filter(item => item.submitted);
  const identities = new Map();
  for (const bidder of submitted) for (const item of bidder.items) if (!identities.has(item.lineId)) identities.set(item.lineId, item);
  return [...identities.values()].map(item => {
    const values = submitted.map(bidder => {
      const bidItem = bidder.items.find(candidate => candidate.lineId === item.lineId);
      return { id: bidder.id, value: isIncluded(bidItem || {}) ? bidItem?.unitRate : null, bidItem };
    });
    const priced = values.filter(value => value.value != null).map(value => ({ id: value.id, value: value.value }));
    const metrics = compareMetrics(priced, 6);
    const includedQuantities = values.filter(value => value.bidItem && isIncluded(value.bidItem)).map(value => String(value.bidItem.quantity));
    const quantitySet = new Set(includedQuantities);
    return {
      lineId: item.lineId,
      disciplineCode: item.disciplineCode,
      disciplineLabel: item.disciplineLabel,
      workGroupId: item.workGroupId,
      workGroupCode: item.workGroupCode,
      workGroupLabel: item.workGroupLabel,
      description: item.description,
      unit: item.unit,
      lineOrigin: item.lineOrigin,
      consultantQuantity: item.consultantQuantity,
      quantityMismatch: quantitySet.size > 1,
      pricedBidCount: priced.length,
      medianUnitRate: metrics.median,
      bidders: values.map(value => {
        if (!value.bidItem) return { id: value.id, status: 'MISSING', missing: true, zero: false, excluded: false, contractorAdded: false };
        const excluded = !isIncluded(value.bidItem);
        const variance = quantityVariance(value.bidItem.quantity, value.bidItem.consultantQuantity);
        if (excluded) return { id: value.id, status: 'EXCLUDED', missing: false, zero: false, excluded: true, contractorAdded: value.bidItem.lineOrigin === 'CONTRACTOR_ADDED', changeType: value.bidItem.changeType, ...variance };
        if (value.value == null) return { id: value.id, status: 'UNPRICED', unitRate: null, lineTotal: value.bidItem.lineTotal ?? null, missing: true, zero: false, excluded: false, contractorAdded: value.bidItem.lineOrigin === 'CONTRACTOR_ADDED', contractorQuantity: value.bidItem.quantity, changeType: value.bidItem.changeType, ...variance };
        const metric = metrics.byId.get(value.id);
        return { id: value.id, status: value.bidItem.lineOrigin === 'CONTRACTOR_ADDED' ? 'ADDED' : 'INCLUDED', unitRate: String(value.value), lineTotal: value.bidItem.lineTotal ?? null, missing: false, zero: parseScaled(value.value, 6) === 0n, excluded: false, contractorAdded: value.bidItem.lineOrigin === 'CONTRACTOR_ADDED', contractorQuantity: value.bidItem.quantity, changeType: value.bidItem.changeType, ...variance, ...metric, isAnomaly: priced.length >= 3 && metric.deviationBps != null && Math.abs(metric.deviationBps) >= 2000 };
      }),
    };
  });
}

export function buildTenderComparison(round) {
  const participants = round?.participants || [];
  const budget = round?.budgetComparison || null;
  const budgetAvailable = budget?.available === true;
  const budgetWorkGroups = budget?.workGroups || [];
  const workGroupBudget = new Map(budgetWorkGroups.map(item => [item.workGroupId, { amount: item.budgetAmount, meta: { disciplineCode: item.disciplineCode, disciplineLabel: item.disciplineLabel, workGroupId: item.workGroupId, workGroupCode: item.workGroupCode, workGroupLabel: item.workGroupLabel } }]));
  const disciplineBudget = new Map();
  for (const item of budgetWorkGroups) {
    const current = disciplineBudget.get(item.disciplineCode) || { amount: 0n, meta: { disciplineCode: item.disciplineCode, disciplineLabel: item.disciplineLabel } };
    current.amount += parseScaled(item.budgetAmount ?? 0, 2);
    disciplineBudget.set(item.disciplineCode, current);
  }
  const formattedDisciplineBudget = new Map([...disciplineBudget].map(([key, value]) => [key, { ...value, amount: formatScaled(value.amount, 2) }]));
  const bidders = participants.map(summarizeBidder);
  const submitted = bidders.filter(item => item.submitted);
  const totalMetrics = compareMetrics(submitted.map(item => ({ id: item.id, value: item.total })), 2);
  const totals = bidders.map(bidder => bidder.submitted ? { ...bidder, ...totalMetrics.byId.get(bidder.id), ...varianceAgainstBudget(bidder.total, budgetAvailable ? budget.scopeBudgetTotal : null) } : bidder);
  const disciplines = hierarchyRows(bidders, item => item.disciplineCode, item => ({ disciplineCode: item.disciplineCode, disciplineLabel: item.disciplineLabel }), budgetAvailable ? formattedDisciplineBudget : new Map());
  const categories = hierarchyRows(bidders, item => item.workGroupId, item => ({ disciplineCode: item.disciplineCode, disciplineLabel: item.disciplineLabel, workGroupId: item.workGroupId, workGroupCode: item.workGroupCode, workGroupLabel: item.workGroupLabel }), budgetAvailable ? workGroupBudget : new Map());
  return {
    bidRoundId: round?.bidRoundId,
    roundNumber: round?.roundNumber,
    status: round?.status,
    comparisonLevel: 'CANONICAL_CATEGORY',
    currencyCode: submitted[0]?.currencyCode || budget?.tenderCurrencyCode || null,
    participantCount: bidders.length,
    submittedCount: submitted.length,
    missingSubmissionCount: bidders.length - submitted.length,
    medianTotal: totalMetrics.median,
    budgetComparisonAvailable: budgetAvailable,
    budgetUnavailableReason: budget?.unavailableReason || null,
    scopeBudgetTotal: budget?.scopeBudgetTotal ?? null,
    budgetCurrencyCode: budget?.budgetCurrencyCode || null,
    tenderScopeWorkGroupCount: budget?.tenderScopeWorkGroupCount || 0,
    budgetedWorkGroupCount: budget?.budgetedWorkGroupCount || 0,
    missingBudgetWorkGroupCount: budget?.missingBudgetWorkGroupCount || 0,
    baselineOutsideTenderCount: budget?.baselineOutsideTenderCount || 0,
    bidders: totals,
    disciplines,
    categories,
    workGroups: categories,
    items: itemRows(bidders),
  };
}

export function formatComparisonPercent(bps) {
  return bps == null ? 'n/a' : `${bps > 0 ? '+' : ''}${(bps / 100).toFixed(2)}%`;
}
