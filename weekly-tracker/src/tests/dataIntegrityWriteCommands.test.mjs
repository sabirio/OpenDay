import { readFileSync } from 'node:fs';
import { register } from 'node:module';
const loaderSrc = `export async function resolve(s,c,n){if(s.startsWith('.')&&!s.match(/\\.[mc]?js$/)){try{return await n(s+'.js',c)}catch{return n(s+'/index.js',c)}}return n(s,c)}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { validateUniqueWPItems, normalizeWriteError } = await import('../core/write/writeCommand.js');
const { buildEvidencePath } = await import('../core/write/evidencePath.js');
const migration = readFileSync(new URL('../migrations/025_atomic_write_commands.sql', import.meta.url), 'utf8');
const contractorService = readFileSync(new URL('../services/contractorReportService.js', import.meta.url), 'utf8');
const siteVisitModel = readFileSync(new URL('../core/siteVisit/submitSiteVisitModel.js', import.meta.url), 'utf8');

let pass=0, fail=0;
function check(label, value){if(value){pass++;console.log(`  OK ${label}`)}else{fail++;console.error(`  FAIL ${label}`)}}
console.log('\nSprint 4 data integrity write commands');

check('append-only 025 migration exists', /025_atomic_write_commands/.test(migration));
check('request ledger has actor/operation/request uniqueness', /UNIQUE \(actor_id, operation, client_request_id\)/.test(migration));
check('contractor atomic wrapper calls existing transactional RPC', /submit_contractor_report_atomic[\s\S]*public\.submit_contractor_report\(/.test(migration));
check('contractor replay returns stored response', /contractor_report\.submit[\s\S]*v_request\.response IS NOT NULL[\s\S]*idempotentReplay/.test(migration));
check('site visit RPC writes header and observations', /submit_site_visit_atomic[\s\S]*INSERT INTO public\.site_visits[\s\S]*INSERT INTO public\.site_visit_wps/.test(migration));
check('site visit RPC writes discrepancy and history in same function', /submit_site_visit_atomic[\s\S]*INSERT INTO public\.site_visit_discrepancies[\s\S]*INSERT INTO public\.progress_history/.test(migration));
check('site visit RPC validates role and project access', /v_role NOT IN \('admin', 'pm'\)[\s\S]*can_write_project/.test(migration));
check('site visit RPC rejects duplicate WPs', /Duplicate WP observations/.test(migration));
check('site visit RPC persists sign convention/version', /'pm-minus-contractor'[\s\S]*discrepancy_version/.test(migration));
check('RPC execute is authenticated-only', /REVOKE ALL ON FUNCTION public\.submit_site_visit_atomic[\s\S]*GRANT EXECUTE[\s\S]*TO authenticated/.test(migration));
check('contractor service has no direct inserts', !contractorService.includes('.insert('));
check('site visit model has one atomic service call', /submitSiteVisitAtomic/.test(siteVisitModel) && !/insertSiteVisitHeader|updateGanttDiscrepancy/.test(siteVisitModel));

check('valid WP collection passes boundary validation', validateUniqueWPItems([{wpId:'a',progress_pct:50}], 'test').length === 1);
let duplicateRejected=false; try{validateUniqueWPItems([{wpId:'a',observed_progress:1},{wpId:'a',observed_progress:2}],'test')}catch{duplicateRejected=true}
check('duplicate WPs fail before RPC', duplicateRejected);
let rangeRejected=false; try{validateUniqueWPItems([{wpId:'a',progress_pct:101}],'test')}catch{rangeRejected=true}
check('progress outside 0-100 fails before RPC', rangeRejected);
const authError=normalizeWriteError({code:'42501',message:'denied'},'test','req');
check('authorization error is normalized and non-retryable', authError.code==='AUTHORIZATION_ERROR' && !authError.retryable && authError.requestId==='req');
const networkError=normalizeWriteError(new Error('network timeout'),'test','req');
check('network error is retryable with same request id', networkError.code==='NETWORK_ERROR' && networkError.retryable);
const evidencePath=buildEvidencePath(71,'00000000-0000-4000-8000-000000000001',new Date('2026-07-10T00:00:00Z'),'00000000-0000-4000-8000-000000000002');
check('evidence path is project/period/actor scoped',evidencePath==='71/2026-07/00000000-0000-4000-8000-000000000001_00000000-0000-4000-8000-000000000002.jpg');
let unsafePathRejected=false;try{buildEvidencePath('../other','bad/user',new Date(),'bad')}catch{unsafePathRejected=true}
check('unsafe evidence path inputs are rejected',unsafePathRejected);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail?1:0);
