import {readFileSync} from 'node:fs';const sql=readFileSync(new URL('../migrations/072_tender_setup.sql',import.meta.url),'utf8');let p=0,f=0;const check=(n,c)=>{if(c){p++;console.log(`  PASS ${n}`)}else{f++;console.error(`  FAIL ${n}`)}};
check('creates tender identity and immutable setup snapshots',/CREATE TABLE IF NOT EXISTS public\.project_tenders/.test(sql)&&/project_tender_setup_versions_immutable/.test(sql));
check('pins setup to project BOQ and ontology',/FOREIGN KEY \(issued_boq_version_id, issued_boq_id, project_id, ontology_version_id\)/.test(sql));
check('persists canonical scope and participants',/project_tender_scope_work_groups/.test(sql)&&/project_tender_participants/.test(sql));
check('PM Admin server authorization remains final',/v_role NOT IN \('pm', 'admin'\)/.test(sql)&&/can_write_project/.test(sql));
check('does not grant bidder access in D17',!/Contractor/.test(sql)&&!/GRANT (INSERT|UPDATE|DELETE)/.test(sql));
check('save is idempotent and concurrency guarded',/tender\.save_setup/.test(sql)&&/TENDER_REVISION_CONFLICT/.test(sql));
console.log(`\nTender setup migration: ${p} passed, ${f} failed`);if(f)process.exit(1);
