export const PRICING_METHODS = Object.freeze([
  'COST_PLUS',
  'TARGET_MARGIN',
  'FIXED_PRICE',
  'RATE_BASED',
]);

const METHOD_SET = new Set(PRICING_METHODS);
const PERCENT_FACTOR = 1_000_000n;
const QUANTITY_FACTOR = 1_000_000n;

function parseUnsignedDecimal(value, scale, { allowZero = true } = {}) {
  const text = String(value ?? '').trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match || (match[2]?.length || 0) > scale) return null;
  const factor = 10n ** BigInt(scale);
  const result = BigInt(match[1]) * factor + BigInt((match[2] || '').padEnd(scale, '0'));
  return !allowZero && result === 0n ? null : result;
}

function divideRounded(numerator, denominator) {
  return (numerator + denominator / 2n) / denominator;
}

function formatScaled(value, scale) {
  const factor = 10n ** BigInt(scale);
  return `${value / factor}.${String(value % factor).padStart(scale, '0')}`;
}

function money(value) {
  return formatScaled(value, 2);
}

function pricingError(issues) {
  const error = new Error('INVALID_COMMERCIAL_PRICING');
  error.code = 'INVALID_COMMERCIAL_PRICING';
  error.issues = issues;
  return error;
}

export function createPricingDraft(estimate = {}) {
  return {
    pricingId: null,
    estimateId: estimate.estimateId || '',
    pricingMethod: 'TARGET_MARGIN',
    adjustmentValue: '25',
    basisQuantity: '1',
    rateAmount: '',
    fixedPrice: '',
    status: 'DRAFT',
    expectedRevision: 0,
  };
}
export function calculatePricing(input = {}) {
  const issues = [];
  const method = input.pricingMethod;
  const costCents = parseUnsignedDecimal(input.estimatedDeliveryCost, 2, { allowZero: false });
  if (!METHOD_SET.has(method)) issues.push({ code: 'PRICING_METHOD_INVALID' });
  if (costCents == null) issues.push({ code: 'PRICING_ESTIMATED_COST_INVALID' });

  let sellingCents = null;
  if (costCents != null && method === 'COST_PLUS') {
    const markup = parseUnsignedDecimal(input.adjustmentValue, 4);
    if (markup == null) issues.push({ code: 'PRICING_MARKUP_INVALID' });
    else sellingCents = divideRounded(costCents * (PERCENT_FACTOR + markup), PERCENT_FACTOR);
  }
  if (costCents != null && method === 'TARGET_MARGIN') {
    const margin = parseUnsignedDecimal(input.adjustmentValue, 4);
    if (margin == null || margin >= PERCENT_FACTOR) issues.push({ code: 'PRICING_TARGET_MARGIN_INVALID' });
    else sellingCents = divideRounded(costCents * PERCENT_FACTOR, PERCENT_FACTOR - margin);
  }
  if (costCents != null && method === 'FIXED_PRICE') {
    sellingCents = parseUnsignedDecimal(input.fixedPrice, 2, { allowZero: false });
    if (sellingCents == null) issues.push({ code: 'PRICING_FIXED_PRICE_INVALID' });
  }
  if (costCents != null && method === 'RATE_BASED') {
    const quantity = parseUnsignedDecimal(input.basisQuantity, 6, { allowZero: false });
    const rate = parseUnsignedDecimal(input.rateAmount, 2, { allowZero: false });
    if (quantity == null) issues.push({ code: 'PRICING_BASIS_QUANTITY_INVALID' });
    if (rate == null) issues.push({ code: 'PRICING_RATE_AMOUNT_INVALID' });
    if (quantity != null && rate != null) sellingCents = divideRounded(quantity * rate, QUANTITY_FACTOR);
  }

  const profitCents = sellingCents == null || costCents == null ? null : sellingCents - costCents;
  const marginScaled = sellingCents && profitCents != null
    ? divideRounded(profitCents * PERCENT_FACTOR, sellingCents)
    : null;

  return {
    valid: issues.length === 0,
    issues,
    estimatedDeliveryCost: costCents == null ? null : money(costCents),
    sellingPrice: sellingCents == null ? null : money(sellingCents),
    expectedProfit: profitCents == null ? null : money(profitCents),
    expectedMargin: marginScaled == null ? null : formatScaled(marginScaled, 4),
  };
}

export function buildPricingCommand(input = {}) {
  const calculation = calculatePricing(input);
  const issues = [...calculation.issues];
  if (!input.estimateId) issues.push({ code: 'PRICING_ESTIMATE_REQUIRED' });
  if (!['DRAFT', 'INTERNAL_REVIEW', 'APPROVED'].includes(input.status)) issues.push({ code: 'PRICING_STATUS_INVALID' });
  if (issues.length) throw pricingError(issues);
  return {
    pricingId: input.pricingId || null,
    estimateId: input.estimateId,
    pricingMethod: input.pricingMethod,
    adjustmentValue: ['COST_PLUS', 'TARGET_MARGIN'].includes(input.pricingMethod) ? String(input.adjustmentValue) : null,
    basisQuantity: input.pricingMethod === 'RATE_BASED' ? String(input.basisQuantity) : null,
    rateAmount: input.pricingMethod === 'RATE_BASED' ? String(input.rateAmount) : null,
    fixedPrice: input.pricingMethod === 'FIXED_PRICE' ? String(input.fixedPrice) : null,
    status: input.status,
    expectedRevision: Number(input.expectedRevision || 0),
    ...calculation,
  };
}
