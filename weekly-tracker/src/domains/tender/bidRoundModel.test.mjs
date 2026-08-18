import { appendContractorBidLine, buildBidDraftPayload, createBidRoundDraft, setBidLineInclusion, summarizeBidDraft, validateBidRoundDraft } from './bidRoundModel.js';

let passed = 0;
let failed = 0;
const check = (name, condition) => {
  if (condition) { passed += 1; console.log(`  PASS ${name}`); }
  else { failed += 1; console.error(`  FAIL ${name}`); }
};

const draft = createBidRoundDraft({
  bidRoundId: 4,
  roundNumber: 2,
  draftRevision: 0,
  currencyCode: 'USD',
  items: [
    { lineId: 'a', workGroupId: 'w', description: 'A', unit: 'ea', contractorQuantity: '2', consultantQuantity: '3', labourRate: '2', materialRate: '3', previousLabourRate: '1', previousMaterialRate: '3', bidderNote: null },
    { lineId: 'b', workGroupId: 'w', description: 'B', unit: 'ea', contractorQuantity: null, consultantQuantity: '4', labourRate: null, materialRate: null, previousLabourRate: null, previousMaterialRate: null },
  ],
});

check('context makes only contractor quantity editable', draft.items[0].contractorQuantity === '2' && draft.items[0].consultantQuantity === '3' && draft.items[1].contractorQuantity === '');
check('nullable prices and contractor quantity are valid', validateBidRoundDraft(draft).length === 0);
check('invalid contractor quantity is rejected', validateBidRoundDraft({ ...draft, items: [{ ...draft.items[0], contractorQuantity: '0' }] }).some(issue => issue.code === 'INVALID_CONTRACTOR_QUANTITY'));
check('negative rates rejected', validateBidRoundDraft({ ...draft, items: [{ ...draft.items[0], labourRate: '-1' }] }).some(issue => issue.code === 'INVALID_LABOUR_RATE'));
check('payload preserves contractor quantity and null unpriced rows', buildBidDraftPayload(draft).items[0].quantity === '2' && buildBidDraftPayload(draft).items[1].quantity === null && buildBidDraftPayload(draft).items[1].labourRate === null);
const summary = summarizeBidDraft(draft);
check('summary prices only contractor quantity', summary.total === 10 && summary.pricedLineCount === 1 && summary.changedLineCount === 1);

const withCustom = appendContractorBidLine(draft, 'w', '00000000-0000-4000-8000-000000000099');
check('contractor line is added inside selected Work Group', withCustom.items.at(-1).workGroupId === 'w' && withCustom.items.at(-1).lineOrigin === 'CONTRACTOR_ADDED');
check('custom description and unit are mandatory', validateBidRoundDraft(withCustom).some(issue => issue.code === 'CUSTOM_DESCRIPTION_REQUIRED') && validateBidRoundDraft(withCustom).some(issue => issue.code === 'CUSTOM_UNIT_REQUIRED'));

const excluded = setBidLineInclusion(draft, 'a', false);
const excludedPayload = buildBidDraftPayload(excluded).items[0];
check('excluded line is explicit and carries no commercial total inputs', excludedPayload.lineAction === 'EXCLUDED' && excludedPayload.quantity === null && excludedPayload.labourRate === null && excludedPayload.materialRate === null);
check('excluded line is omitted from commercial total', summarizeBidDraft(excluded).total === 0 && summarizeBidDraft(excluded).excludedLineCount === 1);

console.log(`\nBid round model: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
