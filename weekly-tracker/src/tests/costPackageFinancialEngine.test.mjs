import assert from 'node:assert/strict';
import {
  COMMITMENT_SOURCE_BY_METHOD,
  FORECAST_SOURCES,
  presentCostPackageFinancialOverview,
  validateCommercialCommitment,
  validateCostPackageForecast,
} from '../engines/costPackageFinancialEngine.js';

const overview = {
  currencyCode: 'EUR',
  unmappedAdditionalWorksCount: 1,
  costPackages: [
    { costPackageId: 'cp-1', code: 'CP-01', name: 'Construction', procurementMethod: 'DIRECT_AWARD', currencyCode: 'EUR', budgetValue: '100.10', committedValue: '80.05', additionalWorks: '5.05', pendingExposure: '3.00', forecastValue: '110.25', forecastSource: 'MANUAL_ESTIMATE', variance: '10.15' },
    { costPackageId: 'cp-2', code: 'CP-02', name: 'Security', procurementMethod: 'TENDER', currencyCode: 'EUR', budgetValue: '50.20', committedValue: '40.10', additionalWorks: '0.00', pendingExposure: '0.00', forecastValue: '40.10', forecastSource: 'TENDER_AWARD', variance: '-10.10' },
  ],
};

const presentation = presentCostPackageFinancialOverview(overview);
assert.equal(presentation.rows.length, 2);
assert.equal(presentation.hasUnmappedAdditionalWorks, true);
assert.equal(presentation.rows[0].commitmentSource, 'DIRECT_AWARD');
assert.equal(presentation.rows[1].canCreateCommitment, false);
assert.match(presentation.totals.budgetDisplay, /150[.,]30/);
assert.match(presentation.totals.committedDisplay, /120[.,]15/);
assert.match(presentation.totals.varianceDisplay, /0[.,]05/);
assert.equal(COMMITMENT_SOURCE_BY_METHOD.FRAMEWORK_AGREEMENT, 'FRAMEWORK_CALLOFF');
assert.ok(FORECAST_SOURCES.includes('LANDLORD_CONTRIBUTION'));
assert.deepEqual(validateCommercialCommitment({ costPackageId: 'cp-1', sourceKind: 'DIRECT_AWARD', sourceReference: 'DA-1', counterpartyName: 'Builder', committedValue: '75.50', committedOn: '2026-08-16' }, overview), []);
assert.ok(validateCommercialCommitment({ costPackageId: 'cp-2', sourceKind: 'DIRECT_AWARD', sourceReference: '', counterpartyName: '', committedValue: '-1', committedOn: '' }, overview).length >= 4);
assert.deepEqual(validateCostPackageForecast({ costPackageId: 'cp-1', forecastValue: '115.00', forecastSource: 'SUPPLIER_QUOTATION' }, overview), []);
assert.equal(validateCostPackageForecast({ costPackageId: 'missing', forecastValue: '', forecastSource: 'UNKNOWN' }, overview).length, 3);

console.log('Cost Package financial engine: 12 passed, 0 failed');
