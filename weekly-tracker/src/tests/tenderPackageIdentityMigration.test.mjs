import{readFileSync}from'node:fs';const sql=readFileSync(new URL('../migrations/121_tender_package_identity.sql',import.meta.url),'utf8');let p=0,f=0;const c=(n,x)=>{if(x){p++;console.log(`  PASS ${n}`)}else{f++;console.error(`  FAIL ${n}`)}};
c('Tender Package can exist before setup',/create_project_tender_package/.test(sql)&&/INSERT INTO public\.project_tenders/.test(sql)&&!/project_tender_setup_versions[\s\S]{0,200}INSERT/.test(sql));
c('Tender Package links one or more Cost Packages',/project_tender_cost_packages/.test(sql)&&/cardinality\(p_cost_package_ids\),0\)=0/.test(sql));
c('BOQ mode is explicit and validated',/CONTRACTOR_MEASURED/.test(sql)&&/CONSULTANT_MEASURED/.test(sql));
c('identity locks after bid rounds',/TENDER_PACKAGE_IDENTITY_LOCKED/.test(sql)&&/project_tender_bid_rounds/.test(sql));
c('identity history is immutable',/TENDER_PACKAGE_EVENT_IMMUTABLE/.test(sql)&&/project_tender_package_events/.test(sql));
c('contractor identity read requires bidder access',/get_my_tender_commercial_identity/.test(sql)&&/bidder_user_id=u AND access\.status='ACTIVE'/.test(sql));
console.log(`\nTender Package identity migration: ${p} passed, ${f} failed`);if(f)process.exit(1);
