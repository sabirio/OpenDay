import {readFileSync} from 'node:fs';
import {buildSnagListModel,formatPublishNoticeMessage,formatSnagEvent,normalizeSnagForm,snagErrorMessage} from '../core/presentation/snagPresentationModel.js';
import {getAvailableSnagActions} from '../core/snags/workflow.js';
let pass=0,fail=0;const check=(n,v)=>{if(v){pass++;console.log(`  OK ${n}`)}else{fail++;console.error(`  FAIL ${n}`)}};const expect=(n,fn)=>{try{fn();check(n,false)}catch{check(n,true)}};
const snag={id:'1',projectId:'10',snagNumber:1,title:'Door damage',description:'',categoryCode:'GENERAL',disciplineCode:'ARCH',priority:'HIGH',status:'IN_PROGRESS',assigneeId:'contractor-1',dueDate:'2026-07-14',location:{zoneId:'sales',level:'L1',room:'101',text:'North'},createdBy:'pm-1',createdAt:'2026-07-01T00:00:00Z',updatedAt:'2026-07-02T00:00:00Z',version:2};
check('assigned contractor sees only work/evidence actions',JSON.stringify(getAvailableSnagActions(snag,{id:'contractor-1',role:'Contractor'}).sort())===JSON.stringify(['addSnagEvidence','markSnagReadyForReview'].sort()));
check('other contractor receives no actions',getAvailableSnagActions(snag,{id:'contractor-2',role:'Contractor'}).length===0);
check('viewer receives no actions',getAvailableSnagActions(snag,{id:'viewer',role:'Viewer'}).length===0);
check('PM actions include explicit reassignment and details',getAvailableSnagActions(snag,{id:'pm',role:'PM'}).includes('assignSnag')&&getAvailableSnagActions(snag,{id:'pm',role:'PM'}).includes('updateSnagDetails'));
// Engine-audit regression (2026-07-16): assigning a still-CAPTURED (unpublished)
// observation via the legacy assignSnag action gets silently overwritten by
// publishObservation once trade/stakeholder are set — assignSnag/unassignSnag
// must not be offered while publicationState is CAPTURED.
const capturedSnag={...snag,status:'OPEN',assigneeId:null,publicationState:'CAPTURED'};
check('captured observation hides assignSnag for PM',!getAvailableSnagActions(capturedSnag,{id:'pm',role:'PM'}).includes('assignSnag'));
check('captured observation hides unassignSnag for PM',!getAvailableSnagActions({...capturedSnag,status:'ASSIGNED',assigneeId:'contractor-1'},{id:'pm',role:'PM'}).includes('unassignSnag'));
check('published observation still offers assignSnag for PM',getAvailableSnagActions({...snag,status:'OPEN',assigneeId:null,publicationState:'PUBLISHED'},{id:'pm',role:'PM'}).includes('assignSnag'));
const model=buildSnagListModel([snag],{dueState:'OVERDUE'},{id:'pm',role:'PM'},'2026-07-20T12:00:00Z');
check('list model uses canonical due state and summary once',model.rows[0].dueState==='OVERDUE'&&model.statusCounts.IN_PROGRESS===1);
check('location presentation is structured',model.rows[0].locationLabel==='sales · L1 · 101 · North');
check('unknown future event remains visible',formatSnagEvent({id:1,event_type:'SNAG_FUTURE',occurred_at:'2026-07-01T00:00:00Z'}).label.includes('SNAG_FUTURE'));
check('known event reason is presented',formatSnagEvent({id:2,event_type:'SNAG_REJECTED',reason:'Incomplete'}).reason==='Incomplete');
const normalized=normalizeSnagForm({title:'  Issue ',categoryCode:'GENERAL',disciplineCode:'MEP',priority:'CRITICAL',locationText:'Plant room'});
check('form normalization delegates canonical validation',normalized.title==='Issue'&&normalized.location.text==='Plant room');
expect('form rejects missing location',()=>normalizeSnagForm({title:'Issue',categoryCode:'GENERAL',disciplineCode:'MEP'}));
check('stale version has actionable safe copy',/changed/.test(snagErrorMessage({code:'VERSION_CONFLICT'}))&&!/postgres|table/i.test(snagErrorMessage({code:'VERSION_CONFLICT'})));
check('conflicting replay has actionable safe copy',/action ID/.test(snagErrorMessage({code:'IDEMPOTENCY_CONFLICT'})));
// Engine-audit regression (2026-07-16): publish_snag_observations returns
// {published, needsDetails} — the notice must surface how many were skipped,
// and stay silent when every selected observation actually published.
check('publish notice reports skipped observations',formatPublishNoticeMessage({published:['a'],needsDetails:['b','c']})==='2 of the selected observations still need a trade, stakeholder, or description/evidence before they can be published.');
check('publish notice is null when nothing was skipped',formatPublishNoticeMessage({published:['a','b'],needsDetails:[]})===null);
check('publish notice is null for a missing/malformed result',formatPublishNoticeMessage(null)===null&&formatPublishNoticeMessage({})===null);
const app=readFileSync(new URL('../App.jsx',import.meta.url),'utf8');const service=readFileSync(new URL('../services/snags/snagService.js',import.meta.url),'utf8');const pages=['SnagListPage','SnagCreatePage','SnagDetailPage'].map(name=>readFileSync(new URL(`../pages/snags/${name}.jsx`,import.meta.url),'utf8')).join('\n');
check('required routes are registered',/projects\/:projectId\/snags/.test(app)&&/projects\/:projectId\/snags\/new/.test(app)&&/projects\/:projectId\/snags\/:snagId/.test(app));
check('browser writes use RPC only',service.includes("rpc('execute_snag_command'")&&!service.match(/from\('snags'\)\.(insert|update|delete)/));
check('contractor lookup uses narrow authorized RPC',service.includes("rpc('list_snag_project_contractors'")&&!service.includes("from('profiles')"));
check('pages import hooks, not workflow or service internals',!pages.match(/core\/snags|services\/snags|engines\//));
check('pages define no independent transition maps',!pages.includes('TRANSITIONS'));
console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);process.exit(fail?1:0);
