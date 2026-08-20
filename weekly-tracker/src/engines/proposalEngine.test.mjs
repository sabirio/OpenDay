import assert from 'node:assert/strict';
import { buildProposalCommand, calculateProposalSections } from './proposalEngine.js';

const sections = [
  { id: '1', title: 'Concept design', description: '', amount: '1250.50' },
  { id: '2', title: 'Coordination', description: '', amount: '249.50' },
];
assert.equal(calculateProposalSections(sections).totalAmount, '1500.00');
assert.equal(buildProposalCommand({ pricingId: 'p', proposalNumber: 'q-001', title: 'Offer', currencyCode: 'EUR', sections }).proposalNumber, 'Q-001');
assert.throws(() => buildProposalCommand({}), /INVALID_COMMERCIAL_PROPOSAL/);

console.log('proposalEngine: all checks passed');
