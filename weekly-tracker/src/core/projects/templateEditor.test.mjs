// templateEditor.test.mjs — run: node src/core/projects/templateEditor.test.mjs
import { setPhaseWeight, setWorkPackageDuration, movePhase, normalizeWeights } from './templateEditor.js';

let pass=0,fail=0; const ck=(n,c)=>{c?(pass++,console.log(`  ✅ ${n}`)):(fail++,console.log(`  ❌ ${n}`));};
const t = {
  phases:[{id:'a',label:'A',order:1,progressWeight:40},{id:'b',label:'B',order:2,progressWeight:60}],
  workPackages:[{id:'a.1',phaseId:'a',duration_pct:0.5},{id:'a.2',phaseId:'a',duration_pct:0.5}],
};

console.log('\n1) setPhaseWeight is immutable + correct');
const t1 = setPhaseWeight(t,'a',55);
ck('changes target', t1.phases.find(p=>p.id==='a').progressWeight===55);
ck('does NOT mutate original', t.phases.find(p=>p.id==='a').progressWeight===40);

console.log('\n2) setWorkPackageDuration');
const t2 = setWorkPackageDuration(t,'a.1',0.7);
ck('changes wp', t2.workPackages.find(w=>w.id==='a.1').duration_pct===0.7);

console.log('\n3) movePhase reorders + resequences');
const t3 = movePhase(t,'b','up');
ck('b is now first', [...t3.phases].sort((x,y)=>x.order-y.order)[0].id==='b');
ck('orders are 1..N', t3.phases.map(p=>p.order).sort().join()==='1,2');
ck('edge no-op', movePhase(t,'a','up').phases[0].id==='a');

console.log('\n4) normalizeWeights sums to exactly 100');
const t4 = normalizeWeights({phases:[{id:'a',progressWeight:1},{id:'b',progressWeight:2},{id:'c',progressWeight:1}],workPackages:[]});
ck('sum === 100', t4.phases.reduce((s,p)=>s+p.progressWeight,0)===100);

console.log('\n5) missing id → unchanged, no throw');
let threw=false; try{ setPhaseWeight(t,'ghost',9); }catch{threw=true;}
ck('no throw', threw===false);

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──`);
process.exit(fail?1:0);