import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEstimateCommand, calculateEstimate, createEstimateItem, summarizeBusinessDevelopmentWorkspace, validateEstimateItem } from './estimateEngine.js';

const item = (overrides = {}) => ({
  id: 'line-1', category: 'INTERNAL_LABOUR', description: 'Detailed design',
  discipline: 'Architecture', employeeGrade: 'Senior Architect', supplierName: '',
  quantity: '12.5', unit: 'hours', unitCostRate: '40.25', note: '', ...overrides,
});

test('Estimate Engine calculates each category and delivery cost exactly', () => {
  const output = calculateEstimate({ items: [
    item(),
    item({ id: 'line-2', category: 'EXTERNAL_COST', description: 'Survey', discipline: '', employeeGrade: '', quantity: '1', unit: 'service', unitCostRate: '1500.10' }),
    item({ id: 'line-3', category: 'OTHER_DIRECT_COST', description: 'Printing', discipline: '', employeeGrade: '', quantity: '2', unit: 'item', unitCostRate: '12.34' }),
  ] });
  assert.equal(output.valid, true);
  assert.deepEqual(output.totals, {
    internalLabourCost: '503.13', externalCost: '1500.10', otherDirectCost: '24.68', estimatedDeliveryCost: '2027.91',
  });
});

test('Estimate Engine uses half-up monetary rounding without floating point drift', () => {
  const output = calculateEstimate({ items: [item({ quantity: '0.333333', unitCostRate: '0.05' })] });
  assert.equal(output.lines[0].amount, '0.02');
});

test('internal labour requires discipline and employee grade', () => {
  const issues = validateEstimateItem(item({ discipline: '', employeeGrade: '' }));
  assert.deepEqual(issues.map(issue => issue.code), ['ESTIMATE_DISCIPLINE_REQUIRED', 'ESTIMATE_EMPLOYEE_GRADE_REQUIRED']);
});

test('external cost does not require confidential labour attributes', () => {
  assert.deepEqual(validateEstimateItem(item({ category: 'EXTERNAL_COST', discipline: '', employeeGrade: '' })), []);
});

test('invalid precision and zero quantity fail closed', () => {
  const issues = validateEstimateItem(item({ quantity: '0', unitCostRate: '10.001' }));
  assert.deepEqual(issues.map(issue => issue.code), ['ESTIMATE_ITEM_QUANTITY_INVALID', 'ESTIMATE_ITEM_COST_RATE_INVALID']);
});

test('command is normalized and does not accept a caller supplied total', () => {
  const command = buildEstimateCommand({ estimateId: 'estimate-1', opportunityId: 'opportunity-1', estimateNumber: ' est-001 ', title: ' Design ', currencyCode: 'EUR', expectedRevision: 2, items: [item()], total: '1.00' });
  assert.equal(command.estimateNumber, 'EST-001');
  assert.equal(command.title, 'Design');
  assert.equal(command.totals.estimatedDeliveryCost, '503.13');
  assert.equal('total' in command.items[0], false);
});

test('empty estimates are invalid', () => assert.equal(calculateEstimate({ items: [] }).valid, false));

test('new line defaults reflect labour and external semantics', () => {
  assert.equal(createEstimateItem('INTERNAL_LABOUR', 'a').unit, 'hours');
  assert.equal(createEstimateItem('EXTERNAL_COST', 'b').unit, 'item');
});

test('workspace summary derives status metrics and exact combined external cost', () => {
  const output = summarizeBusinessDevelopmentWorkspace({
    opportunities: [{ status: 'QUALIFYING' }, { status: 'WON' }],
    estimates: [
      { status: 'INTERNAL_REVIEW', externalCost: '10.10', otherDirectCost: '0.20' },
      { status: 'APPROVED', externalCost: '0.00', otherDirectCost: '1.05' },
    ],
  });
  assert.deepEqual(output.metrics, {
    opportunities: 2, activeOpportunities: 1, estimates: 2, estimatesInReview: 1, approvedEstimates: 1,
    approvedPricings: 0, proposals: 0,
  });
  assert.deepEqual(output.estimates.map(estimate => estimate.externalAndOtherCost), ['10.30', '1.05']);
});
