import assert from 'node:assert/strict'; import { filterSiteVisitTasks, resolveCurrentSiteVisitItem, siteVisitReviewCounts } from './siteVisitNavigationModel.js';
let passed=0;const check=(n,f)=>{f();passed++;console.log(`  PASS ${n}`)};const tasks=[{id:'a',status:'completed',actual_progress:100},{id:'b',status:'in_progress',actual_progress:50}];const obs={a:{observed_status:'completed',observed_progress:100},b:{observed_status:'in_progress',observed_progress:20}};
check('incomplete filter',()=>assert.deepEqual(filterSiteVisitTasks(tasks,{a:obs.a},'incomplete').map(x=>x.id),['b']));
check('discrepant filter',()=>assert.deepEqual(filterSiteVisitTasks(tasks,obs,'discrepant').map(x=>x.id),['b']));
check('filter keeps source observation object',()=>{filterSiteVisitTasks(tasks,obs,'completed');assert.equal(obs.b.observed_progress,20)});
check('removed current item falls back',()=>assert.equal(resolveCurrentSiteVisitItem(tasks,'gone'),'a'));
check('review counts',()=>assert.deepEqual(siteVisitReviewCounts(tasks,obs),{completedCount:2,incompleteCount:0,discrepancyCount:1,totalCount:2}));
console.log(`\n-- RESULT: ${passed} passed, 0 failed --`);
