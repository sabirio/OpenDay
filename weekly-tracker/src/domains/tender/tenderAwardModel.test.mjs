import{strict as assert}from'node:assert';import{getAwardCandidateIssues,validateTenderAward}from'./tenderAwardModel.js';let p=0;const test=(n,fn)=>{fn();p++;console.log(`  PASS ${n}`)};
const eligible={submissionId:1,submitted:true,missingLineCount:0,reviewStatus:'REVIEWED',openClarificationCount:0};
test('eligible candidate has no issues',()=>assert.deepEqual(getAwardCandidateIssues(eligible),[]));
test('candidate requires submission complete pricing review and closed clarifications',()=>assert.deepEqual(getAwardCandidateIssues({submitted:true,missingLineCount:2,reviewStatus:'IN_REVIEW',openClarificationCount:1}),['BID_NOT_FULLY_PRICED','BID_NOT_REVIEWED','OPEN_CLARIFICATIONS']));
test('award requires latest open round selected candidate and note',()=>assert.deepEqual(validateTenderAward({canApprove:true,tenderStatus:'DRAFT',latestRound:{status:'CLOSED'},candidates:[]},null,''),['LATEST_ROUND_NOT_OPEN','CANDIDATE_REQUIRED','AWARD_NOTE_REQUIRED']));
test('valid award command has no issues',()=>assert.deepEqual(validateTenderAward({canApprove:true,tenderStatus:'DRAFT',latestRound:{status:'OPEN'},candidates:[eligible]},1,'Approved commercial decision'),[]));
test('commercial approval capability is mandatory',()=>assert.ok(validateTenderAward({canApprove:false,tenderStatus:'DRAFT',latestRound:{status:'OPEN'},candidates:[eligible]},1,'Approved').includes('APPROVAL_CAPABILITY_REQUIRED')));
test('awarded tender cannot be awarded again',()=>assert.ok(validateTenderAward({canApprove:true,tenderStatus:'AWARDED',latestRound:{status:'CLOSED'},candidates:[eligible]},1,'Again').includes('TENDER_ALREADY_AWARDED')));
console.log(`\nTender award model: ${p} passed, 0 failed`);
