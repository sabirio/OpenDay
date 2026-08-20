const PROPOSAL_STATUSES = new Set(['DRAFT', 'INTERNAL_REVIEW', 'APPROVED_FOR_ISSUE', 'SENT', 'REVISED', 'ACCEPTED', 'AWARDED', 'LOST', 'REJECTED']);

export function createProposalSection(id = crypto.randomUUID()) {
  return { id, title: '', description: '', amount: '' };
}

export function calculateProposalSections(sections = []) {
  const issues = [];
  let totalCents = 0n;
  const normalized = sections.map((section, index) => {
    const amount = String(section.amount ?? '').trim();
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
    if (!section.id) issues.push({ code: 'PROPOSAL_SECTION_ID_REQUIRED', index });
    if (!section.title?.trim()) issues.push({ code: 'PROPOSAL_SECTION_TITLE_REQUIRED', index });
    if (!match) issues.push({ code: 'PROPOSAL_SECTION_AMOUNT_INVALID', index });
    const cents = match ? BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0')) : null;
    if (cents != null) totalCents += cents;
    return { ...section, amount: cents == null ? null : `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}` };
  });
  return {
    valid: sections.length > 0 && issues.length === 0,
    issues: sections.length ? issues : [{ code: 'PROPOSAL_SECTIONS_REQUIRED', index: -1 }],
    sections: normalized,
    totalAmount: `${totalCents / 100n}.${String(totalCents % 100n).padStart(2, '0')}`,
  };
}
export function buildProposalCommand(input = {}) {
  const calculation = calculateProposalSections(input.sections);
  const issues = [...calculation.issues];
  if (!input.pricingId) issues.push({ code: 'PROPOSAL_PRICING_REQUIRED' });
  if (!input.proposalNumber?.trim()) issues.push({ code: 'PROPOSAL_NUMBER_REQUIRED' });
  if (!input.title?.trim()) issues.push({ code: 'PROPOSAL_TITLE_REQUIRED' });
  if (!/^[A-Z]{3}$/.test(input.currencyCode || '')) issues.push({ code: 'PROPOSAL_CURRENCY_INVALID' });
  if (!PROPOSAL_STATUSES.has(input.status || 'DRAFT')) issues.push({ code: 'PROPOSAL_STATUS_INVALID' });
  if (issues.length) {
    const error = new Error('INVALID_COMMERCIAL_PROPOSAL');
    error.code = 'INVALID_COMMERCIAL_PROPOSAL';
    error.issues = issues;
    throw error;
  }
  return {
    proposalId: input.proposalId || null,
    pricingId: input.pricingId,
    proposalNumber: input.proposalNumber.trim().toUpperCase(),
    title: input.title.trim(),
    currencyCode: input.currencyCode,
    validityDays: Number(input.validityDays || 30),
    commercialTerms: input.commercialTerms?.trim() || null,
    revisionReason: input.revisionReason?.trim() || 'Initial issue',
    expectedRevision: Number(input.expectedRevision || 0),
    sections: calculation.sections.map((section, index) => ({
      sectionId: section.id,
      title: section.title.trim(),
      description: section.description?.trim() || null,
      amount: section.amount,
      sortOrder: index + 1,
    })),
    totalAmount: calculation.totalAmount,
  };
}
