export const COMMITMENT_SOURCE_BY_METHOD = Object.freeze({
  FRAMEWORK_AGREEMENT: 'FRAMEWORK_CALLOFF',
  DIRECT_AWARD: 'DIRECT_AWARD',
  EXISTING_CONTRACT: 'EXISTING_CONTRACT',
  NOMINATED_SUPPLIER: 'NOMINATED_SUPPLIER',
});

export const FORECAST_SOURCES = Object.freeze([
  'TENDER_AWARD',
  'FRAMEWORK_QUOTE_CALLOFF',
  'SUPPLIER_QUOTATION',
  'EXISTING_CONTRACT',
  'LANDLORD_CONTRIBUTION',
  'MANUAL_ESTIMATE',
  'BUDGET_FALLBACK',
]);

const SCALE = 100n;

function cents(value) {
  if (value == null) return 0n;
  const text = String(value);
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const result = BigInt(whole || 0) * SCALE + BigInt(fraction.slice(0, 2).padEnd(2, '0') || 0);
  return negative ? -result : result;
}

function decimal(value) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / SCALE}.${String(absolute % SCALE).padStart(2, '0')}`;
}

function formatMoney(value, currency) {
  return value == null
    ? '—'
    : new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(Number(value));
}

const label = value => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/^./, character => character.toUpperCase());

export function presentCostPackageFinancialOverview(input) {
  if (!input) return null;
  const rows = (input.costPackages || []).map(item => ({
    ...item,
    procurementMethodLabel: label(item.procurementMethod),
    forecastSourceLabel: label(item.forecastSource),
    budgetDisplay: formatMoney(item.budgetValue, item.currencyCode),
    committedDisplay: formatMoney(item.committedValue, item.currencyCode),
    additionalWorksDisplay: formatMoney(item.additionalWorks, item.currencyCode),
    pendingExposureDisplay: formatMoney(item.pendingExposure, item.currencyCode),
    forecastDisplay: formatMoney(item.forecastValue, item.currencyCode),
    varianceDisplay: formatMoney(item.variance, item.currencyCode),
    lastUpdatedDisplay: item.lastUpdated ? new Date(item.lastUpdated).toLocaleString() : 'Not set',
    canCreateCommitment: Boolean(COMMITMENT_SOURCE_BY_METHOD[item.procurementMethod]),
    commitmentSource: COMMITMENT_SOURCE_BY_METHOD[item.procurementMethod] || null,
  }));
  const totals = rows.reduce((sum, row) => ({
    budget: sum.budget + cents(row.budgetValue),
    committed: sum.committed + cents(row.committedValue),
    additionalWorks: sum.additionalWorks + cents(row.additionalWorks),
    pendingExposure: sum.pendingExposure + cents(row.pendingExposure),
    forecast: sum.forecast + cents(row.forecastValue),
    variance: sum.variance + cents(row.variance),
  }), { budget: 0n, committed: 0n, additionalWorks: 0n, pendingExposure: 0n, forecast: 0n, variance: 0n });
  return {
    ...input,
    rows,
    forecastSourceOptions: FORECAST_SOURCES.map(value => ({ value, label: label(value) })),
    totals: {
      budgetDisplay: formatMoney(decimal(totals.budget), input.currencyCode),
      committedDisplay: formatMoney(decimal(totals.committed), input.currencyCode),
      additionalWorksDisplay: formatMoney(decimal(totals.additionalWorks), input.currencyCode),
      pendingExposureDisplay: formatMoney(decimal(totals.pendingExposure), input.currencyCode),
      forecastDisplay: formatMoney(decimal(totals.forecast), input.currencyCode),
      varianceDisplay: formatMoney(decimal(totals.variance), input.currencyCode),
    },
    hasUnmappedAdditionalWorks: Number(input.unmappedAdditionalWorksCount) > 0,
  };
}

export function validateCommercialCommitment(input, overview) {
  const issues = [];
  const row = (overview?.costPackages || []).find(item => item.costPackageId === input.costPackageId);
  if (!row) issues.push('COST_PACKAGE_REQUIRED');
  const expected = row ? COMMITMENT_SOURCE_BY_METHOD[row.procurementMethod] : null;
  if (!expected || input.sourceKind !== expected) issues.push('COMMITMENT_SOURCE_INVALID');
  if (!input.sourceReference?.trim()) issues.push('REFERENCE_REQUIRED');
  if (!input.counterpartyName?.trim()) issues.push('COUNTERPARTY_REQUIRED');
  if (input.committedValue === '' || !/^\d+(?:\.\d{1,2})?$/.test(String(input.committedValue))) issues.push('VALUE_REQUIRED');
  if (!input.committedOn) issues.push('COMMITTED_DATE_REQUIRED');
  if (input.effectiveFrom && input.effectiveTo && input.effectiveTo < input.effectiveFrom) issues.push('DATE_RANGE_INVALID');
  return issues;
}

export function validateCostPackageForecast(input, overview) {
  const issues = [];
  if (!(overview?.costPackages || []).some(item => item.costPackageId === input.costPackageId)) issues.push('COST_PACKAGE_REQUIRED');
  if (input.forecastValue === '' || !/^\d+(?:\.\d{1,2})?$/.test(String(input.forecastValue))) issues.push('VALUE_REQUIRED');
  if (!FORECAST_SOURCES.includes(input.forecastSource)) issues.push('FORECAST_SOURCE_REQUIRED');
  return issues;
}

export function createCommercialCommitmentDraft(row, now = new Date()) {
  return { costPackageId: row.costPackageId, sourceKind: row.commitmentSource, sourceReference: '', counterpartyName: '', committedValue: '', committedOn: now.toISOString().slice(0, 10), effectiveFrom: '', effectiveTo: '', note: '' };
}

export function createCostPackageForecastDraft(row) {
  return { costPackageId: row.costPackageId, forecastValue: row.forecastValue ?? '', forecastSource: 'MANUAL_ESTIMATE', note: '' };
}
