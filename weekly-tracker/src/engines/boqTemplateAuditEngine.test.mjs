import{strict as assert}from'node:assert';import{auditBoqTemplate}from'./boqTemplateAuditEngine.js';let p=0;const t=(n,f)=>{f();p++;console.log(`  PASS ${n}`)};const ontology={disciplines:[{id:'d',code:'E100'}],workGroups:[{id:'w',disciplineId:'d',code:'E100.01',label:'Cables'}],boqItemDefinitions:[1,2,3].map((n)=>({id:String(n),workGroupId:'w',code:`L${n}`,label:`Line ${n}`}))};
t('adequate canonical structure is freeze ready',()=>assert.equal(auditBoqTemplate(ontology).decision,'READY_TO_FREEZE'));
t('duplicate category labels are rejected',()=>assert.equal(auditBoqTemplate({...ontology,workGroups:[...ontology.workGroups,{id:'x',disciplineId:'d',code:'E100.02',label:'Cables'}]}).decision,'REQUIRES_REVIEW'));
t('over-detailed or empty standard categories are rejected',()=>assert.equal(auditBoqTemplate({...ontology,boqItemDefinitions:[]}).categoryLineCountIssueCount,1));
console.log(`\nBOQ Template audit engine: ${p} passed, 0 failed`);
