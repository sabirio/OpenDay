import assert from'node:assert/strict';import{allowedEvidenceTypes,DEFAULT_EVIDENCE_POLICY,evidenceRequirements,groupEvidence,reduceEvidenceUpload,safeEvidenceFilename,validateEvidenceFile}from'./evidenceModel.js';let n=0;const ok=(name,fn)=>{fn();n++;console.log(`  OK ${name}`)};
ok('safe filename removes path punctuation',()=>assert.equal(safeEvidenceFilename('../../fix photo (1).jpg'),'fix-photo-1-.jpg'));
ok('JPEG validates',()=>assert.equal(validateEvidenceFile({name:'fix.jpg',type:'image/jpeg',size:100}).mimeType,'image/jpeg'));
ok('unsupported type rejects',()=>assert.throws(()=>validateEvidenceFile({name:'x.svg',type:'image/svg+xml',size:1}),/JPEG/));
ok('oversize rejects',()=>assert.throws(()=>validateEvidenceFile({name:'x.jpg',type:'image/jpeg',size:DEFAULT_EVIDENCE_POLICY.maxFileBytes+1}),/smaller/));
ok('empty rejects',()=>assert.throws(()=>validateEvidenceFile({name:'x.jpg',type:'image/jpeg',size:0}),/non-empty/));
ok('contractor types are bounded',()=>assert.deepEqual(allowedEvidenceTypes('Contractor'),['CORRECTION','GENERAL']));
ok('PM types exclude correction',()=>assert.deepEqual(allowedEvidenceTypes('PM'),['CONDITION','VERIFICATION','GENERAL']));
ok('permissive review is satisfied',()=>assert.equal(evidenceRequirements(DEFAULT_EVIDENCE_POLICY,[],'review').satisfied,true));
ok('enabled review counts registered correction',()=>assert.equal(evidenceRequirements({...DEFAULT_EVIDENCE_POLICY,correctionRequiredForReview:true,requiredEvidenceCount:1},[{evidence_type:'CORRECTION',original_filename:'x.jpg'}],'review').satisfied,true));
// requiredEvidenceCount:1 is explicit here (DEFAULT_EVIDENCE_POLICY's own
// requiredEvidenceCount is 0, which alone would already satisfy any count —
// this test needs a real nonzero requirement to demonstrate that a note-only
// entry doesn't count as file evidence).
ok('notes do not count as file evidence',()=>assert.equal(evidenceRequirements({...DEFAULT_EVIDENCE_POLICY,correctionRequiredForReview:true,requiredEvidenceCount:1},[{evidence_type:'CORRECTION',original_filename:null}],'review').satisfied,false));
// Engine-audit fix (2026-07-16): requiredEvidenceCount:0 must be respected as
// "zero items satisfy this once required is true", not silently coerced to
// the 1-item default by a `||` fallback (currently dormant in production
// since get_snag_evidence_policy hardcodes required to false, but the JS
// itself must be correct if that policy is ever turned on).
ok('requiredEvidenceCount:0 is respected, not coerced to 1',()=>assert.equal(evidenceRequirements({...DEFAULT_EVIDENCE_POLICY,correctionRequiredForReview:true,requiredEvidenceCount:0},[],'review').satisfied,true));
ok('upload reducer reaches retryable failure',()=>assert.equal(reduceEvidenceUpload(reduceEvidenceUpload({status:'idle'},{type:'SELECT',file:{},previewUrl:'blob:x'}),{type:'FAIL',error:{code:'NETWORK_ERROR'}}).status,'failed'));
ok('cancel clears transient state',()=>assert.equal(reduceEvidenceUpload({status:'failed',file:{}},{type:'CANCEL'}).file,null));
ok('success clears file',()=>assert.equal(reduceEvidenceUpload({status:'registering',file:{}},{type:'SUCCESS',evidence:{id:'1'}}).file,null));
ok('group ordering is deterministic',()=>assert.deepEqual(groupEvidence([{id:'2',evidence_type:'GENERAL',created_at:'2026-01-01'},{id:'1',evidence_type:'CORRECTION',created_at:'2026-01-02'}]).map(x=>x.id),['1','2']));
console.log(`\n-- RESULT: ${n} passed, 0 failed --\n`);
