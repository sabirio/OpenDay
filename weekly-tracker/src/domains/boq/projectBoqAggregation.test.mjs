import { aggregateProjectBoqItemsByWorkGroup, summarizeProjectBoqWorkGroups } from './projectBoqAggregation.js';

let pass = 0, fail = 0;
const check = (label, condition) => {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
};
const groupA = { id: 'a', code: 'a', label: 'A', displayOrder: 2, disciplineId: 'd', disciplineDisplayOrder: 1 };
const groupB = { id: 'b', code: 'b', label: 'B', displayOrder: 1, disciplineId: 'd', disciplineDisplayOrder: 1 };
const items = [
  { workGroupId: 'a', itemKind: 'STANDARD', lineTotal: '1000.10' },
  { workGroupId: 'a', itemKind: 'CUSTOM', lineTotal: null },
  { workGroupId: 'a', itemKind: 'CUSTOM', lineTotal: '0.20' },
  { workGroupId: 'b', itemKind: 'STANDARD', lineTotal: '50.00' },
];

console.log('\nprojectBoqAggregation - Phase C.12');
const groups = aggregateProjectBoqItemsByWorkGroup(items, [groupA, groupB]);
check('outputs only populated Work Groups in ontology order', groups.length === 2 && groups[0].workGroupId === 'b');
check('counts standard and custom lines', groups[1].standardLineCount === 1 && groups[1].customLineCount === 2);
check('counts priced and unpriced lines', groups[1].pricedLineCount === 2 && groups[1].unpricedLineCount === 1);
check('adds database line totals exactly as decimal money', groups[1].pricedTotal === '1000.30');
check('marks incomplete commercial coverage', groups[1].isFullyPriced === false && groups[0].isFullyPriced === true);
const summary = summarizeProjectBoqWorkGroups(groups);
check('summarizes all Work Groups exactly', summary.workGroupCount === 2 && summary.pricedTotal === '1050.30');
check('project summary retains unpriced-line signal', summary.lineCount === 4 && summary.unpricedLineCount === 1 && !summary.isFullyPriced);

let unknown = null;
try { aggregateProjectBoqItemsByWorkGroup([{ workGroupId: 'missing', itemKind: 'CUSTOM', lineTotal: null }], [groupA]); } catch (error) { unknown = error; }
check('rejects a line outside the supplied ontology', unknown?.code === 'UNKNOWN_BOQ_WORK_GROUP');
let invalidMoney = null;
try { aggregateProjectBoqItemsByWorkGroup([{ workGroupId: 'a', itemKind: 'CUSTOM', lineTotal: '1.001' }], [groupA]); } catch (error) { invalidMoney = error; }
check('rejects monetary precision beyond database line totals', invalidMoney?.code === 'INVALID_BOQ_LINE_TOTAL');

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
