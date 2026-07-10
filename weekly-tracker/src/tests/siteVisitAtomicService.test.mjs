import { register } from 'node:module';
function dataUrl(src){return `data:application/javascript;base64,${Buffer.from(src).toString('base64')}`}
const mockUrl=dataUrl(`export const supabase=globalThis.__siteVisitAtomicTest.supabase;`);
const loader=`export async function resolve(s,c,n){if(s==='../lib/supabase'&&c.parentURL?.endsWith('/services/siteVisitService.js'))return{url:'${mockUrl}',shortCircuit:true};if(s.startsWith('.')&&!s.match(/\\.[mc]?js$/))return n(s+'.js',c);return n(s,c)}`;
register('data:application/javascript,'+encodeURIComponent(loader),{parentURL:import.meta.url});
let pass=0,fail=0;const check=(l,v)=>{if(v){pass++;console.log(`  OK ${l}`)}else{fail++;console.error(`  FAIL ${l}`)}};
const calls=[];
globalThis.__siteVisitAtomicTest={error:null,supabase:{async rpc(name,params){calls.push({name,params});return globalThis.__siteVisitAtomicTest.error?{data:null,error:globalThis.__siteVisitAtomicTest.error}:{data:{siteVisit:{id:9},discrepancies:[],observationCount:1,idempotentReplay:false},error:null}},auth:{async getUser(){return{data:{user:{id:'u'}},error:null}}}}};
const {submitSiteVisitAtomic}=await import('../services/siteVisitService.js');
console.log('\nsiteVisitService atomic RPC contract');
const observations=[{wpId:'wp-1',observed_progress:20,gc_progress:30,signed_delta:-10,absolute_delta:10,discrepancy_status:'warning'}];
const result=await submitSiteVisitAtomic(7,5,observations,{visitDate:'2026-07-10',overallNote:'note',pmScheduleAssessment:'At Risk',photoUrls:['7/x.jpg'],calculatedAt:'2026-07-10T10:00:00Z',calculationVersion:'v1',clientRequestId:'00000000-0000-4000-8000-000000000002'});
const call=calls[0];
check('calls only submit_site_visit_atomic',calls.length===1&&call.name==='submit_site_visit_atomic');
check('maps project/report/date',call.params.p_project_id===7&&call.params.p_contractor_report_id===5&&call.params.p_visit_date==='2026-07-10');
check('maps observations unchanged',call.params.p_observations===observations);
check('maps stable request id',call.params.p_client_request_id==='00000000-0000-4000-8000-000000000002');
check('maps metadata and evidence',call.params.p_meta.pmScheduleAssessment==='At Risk'&&call.params.p_meta.photoUrls[0]==='7/x.jpg');
check('returns atomic persisted result',result.siteVisit.id===9&&result.observationCount===1);
globalThis.__siteVisitAtomicTest.error={code:'42501',message:'denied'};let threw=false;try{await submitSiteVisitAtomic(8,null,observations,{visitDate:'2026-07-10',clientRequestId:'00000000-0000-4000-8000-000000000003'})}catch(e){threw=e.code==='42501'}
check('propagates RPC authorization error for application normalization',threw);
console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);process.exit(fail?1:0);
