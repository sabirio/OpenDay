export const ESTIMATE_ITEM_CATEGORIES = Object.freeze([
  'INTERNAL_LABOUR',
  'EXTERNAL_COST',
  'OTHER_DIRECT_COST',
]);

const CATEGORY_SET = new Set(ESTIMATE_ITEM_CATEGORIES);
const QUANTITY_SCALE = 1_000_000n;

function parseDecimal(value, scale, allowZero = true) {
  const text = String(value ?? '').trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match || (match[2]?.length || 0) > scale) return null;
  const factor = 10n ** BigInt(scale);
  const result = BigInt(match[1]) * factor + BigInt((match[2] || '').padEnd(scale, '0'));
  return !allowZero && result === 0n ? null : result;
}

function formatCents(value) {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

function lineAmountCents(item) {
  const quantity = parseDecimal(item.quantity, 6, false);
  const unitCost = parseDecimal(item.unitCostRate, 2, true);
  if (quantity == null || unitCost == null) return null;
  const unrounded = quantity * unitCost;
  return (unrounded + QUANTITY_SCALE / 2n) / QUANTITY_SCALE;
}

export function createEstimateItem(category = 'INTERNAL_LABOUR', id = crypto.randomUUID()) {
  if (!CATEGORY_SET.has(category)) throw new Error('INVALID_ESTIMATE_ITEM_CATEGORY');
  return {
    id,
    category,
    description: '',
    discipline: '',
    employeeGrade: '',
    supplierName: '',
    quantity: '1',
    unit: category === 'INTERNAL_LABOUR' ? 'hours' : 'item',
    unitCostRate: '',
    note: '',
  };
}

export function validateEstimateItem(item) {
  const issues = [];
  if (!item?.id) issues.push({ code: 'ESTIMATE_ITEM_ID_REQUIRED' });
  if (!CATEGORY_SET.has(item?.category)) issues.push({ code: 'ESTIMATE_ITEM_CATEGORY_INVALID' });
  if (!item?.description?.trim()) issues.push({ code: 'ESTIMATE_ITEM_DESCRIPTION_REQUIRED' });
  if (item?.category === 'INTERNAL_LABOUR' && !item?.discipline?.trim()) issues.push({ code: 'ESTIMATE_DISCIPLINE_REQUIRED' });
  if (item?.category === 'INTERNAL_LABOUR' && !item?.employeeGrade?.trim()) issues.push({ code: 'ESTIMATE_EMPLOYEE_GRADE_REQUIRED' });
  if (!item?.unit?.trim()) issues.push({ code: 'ESTIMATE_ITEM_UNIT_REQUIRED' });
  if (parseDecimal(item?.quantity, 6, false) == null) issues.push({ code: 'ESTIMATE_ITEM_QUANTITY_INVALID' });
  if (parseDecimal(item?.unitCostRate, 2, true) == null) issues.push({ code: 'ESTIMATE_ITEM_COST_RATE_INVALID' });
  if ((item?.note || '').length > 2000) issues.push({ code: 'ESTIMATE_ITEM_NOTE_TOO_LONG' });
  return issues;
}

export function calculateEstimate(input = {}) {
  const items = Array.isArray(input.items) ? input.items : [];
  const issues = items.flatMap((item, index) => validateEstimateItem(item).map(issue => ({ ...issue, itemId: item?.id ?? null, index })));
  const categoryCents = Object.fromEntries(ESTIMATE_ITEM_CATEGORIES.map(category => [category, 0n]));
  const lines = items.map(item => {
    const amountCents = lineAmountCents(item);
    if (amountCents != null && CATEGORY_SET.has(item.category)) categoryCents[item.category] += amountCents;
    return { ...item, amount: amountCents == null ? null : formatCents(amountCents) };
  });
  const totalCents = Object.values(categoryCents).reduce((sum, value) => sum + value, 0n);
  return {
    valid: issues.length === 0 && lines.length > 0,
    issues: lines.length ? issues : [{ code: 'ESTIMATE_ITEMS_REQUIRED', itemId: null, index: -1 }],
    lines,
    totals: {
      internalLabourCost: formatCents(categoryCents.INTERNAL_LABOUR),
      externalCost: formatCents(categoryCents.EXTERNAL_COST),
      otherDirectCost: formatCents(categoryCents.OTHER_DIRECT_COST),
      estimatedDeliveryCost: formatCents(totalCents),
    },
  };
}

export function validateEstimateHeader(input = {}) {
  const issues = [];
  if (!input.opportunityId) issues.push({ code: 'ESTIMATE_OPPORTUNITY_REQUIRED' });
  if (!input.estimateNumber?.trim()) issues.push({ code: 'ESTIMATE_NUMBER_REQUIRED' });
  if (!input.title?.trim()) issues.push({ code: 'ESTIMATE_TITLE_REQUIRED' });
  if (!/^[A-Z]{3}$/.test(input.currencyCode || '')) issues.push({ code: 'ESTIMATE_CURRENCY_INVALID' });
  return issues;
}

export function buildEstimateCommand(input = {}) {
  const calculation = calculateEstimate(input);
  const issues = [...validateEstimateHeader(input), ...calculation.issues];
  if (issues.length) {
    const error = new Error('INVALID_DELIVERY_ESTIMATE');
    error.code = 'INVALID_DELIVERY_ESTIMATE';
    error.issues = issues;
    throw error;
  }
  return {
    estimateId: input.estimateId,
    opportunityId: input.opportunityId,
    estimateNumber: input.estimateNumber.trim().toUpperCase(),
    title: input.title.trim(),
    currencyCode: input.currencyCode,
    expectedRevision: Number(input.expectedRevision || 0),
    items: calculation.lines.map((item, index) => ({
      itemId: item.id,
      category: item.category,
      description: item.description.trim(),
      discipline: item.discipline?.trim() || null,
      employeeGrade: item.employeeGrade?.trim() || null,
      supplierName: item.supplierName?.trim() || null,
      quantity: String(item.quantity),
      unit: item.unit.trim(),
      unitCostRate: String(item.unitCostRate),
      note: item.note?.trim() || null,
      sortOrder: index + 1,
    })),
    totals: calculation.totals,
  };
}

export function summarizeBusinessDevelopmentWorkspace(workspace = {}) {
  const opportunities = Array.isArray(workspace.opportunities) ? workspace.opportunities : [];
  const estimates = (Array.isArray(workspace.estimates) ? workspace.estimates : []).map(estimate => {
    const external = parseDecimal(estimate.externalCost ?? 0, 2, true) ?? 0n;
    const other = parseDecimal(estimate.otherDirectCost ?? 0, 2, true) ?? 0n;
    return { ...estimate, externalAndOtherCost: formatCents(external + other) };
  });
  const rateCards = Array.isArray(workspace.rateCards) ? workspace.rateCards : [];
  const pricings = Array.isArray(workspace.pricings) ? workspace.pricings : [];
  const proposals = Array.isArray(workspace.proposals) ? workspace.proposals : [];
  return {
    ...workspace,
    opportunities,
    estimates,
    rateCards,
    pricings,
    proposals,
    metrics: {
      opportunities: opportunities.length,
      activeOpportunities: opportunities.filter(item => !['WON', 'LOST'].includes(item.status)).length,
      estimates: estimates.length,
      estimatesInReview: estimates.filter(item => item.status === 'INTERNAL_REVIEW').length,
      approvedEstimates: estimates.filter(item => item.status === 'APPROVED').length,
      approvedPricings: pricings.filter(item => item.status === 'APPROVED').length,
      proposals: proposals.length,
    },
  };
}
