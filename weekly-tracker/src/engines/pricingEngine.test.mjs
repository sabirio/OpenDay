import assert from 'node:assert/strict';
import { buildPricingCommand, calculatePricing } from './pricingEngine.js';

assert.deepEqual(calculatePricing({ pricingMethod: 'COST_PLUS', estimatedDeliveryCost: '1000.00', adjustmentValue: '20' }), {
  valid: true, issues: [], estimatedDeliveryCost: '1000.00', sellingPrice: '1200.00', expectedProfit: '200.00', expectedMargin: '16.6667',
});
assert.equal(calculatePricing({ pricingMethod: 'TARGET_MARGIN', estimatedDeliveryCost: '750.00', adjustmentValue: '25' }).sellingPrice, '1000.00');
assert.equal(calculatePricing({ pricingMethod: 'FIXED_PRICE', estimatedDeliveryCost: '750.00', fixedPrice: '990.50' }).expectedProfit, '240.50');
assert.equal(calculatePricing({ pricingMethod: 'RATE_BASED', estimatedDeliveryCost: '750.00', basisQuantity: '125.5', rateAmount: '12.20' }).sellingPrice, '1531.10');
assert.equal(calculatePricing({ pricingMethod: 'TARGET_MARGIN', estimatedDeliveryCost: '750.00', adjustmentValue: '100' }).valid, false);
assert.throws(() => buildPricingCommand({ estimateId: 'e', pricingMethod: 'FIXED_PRICE', estimatedDeliveryCost: '750.00', fixedPrice: '', status: 'DRAFT' }), /INVALID_COMMERCIAL_PRICING/);

console.log('pricingEngine: all checks passed');
