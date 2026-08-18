import{readFileSync}from'node:fs';const sql=readFileSync(new URL('../migrations/117_tender_bid_contractor_consultant_quantities.sql',import.meta.url),'utf8');let p=0,f=0;const check=(n,c)=>{if(c){p++;console.log(`  PASS ${n}`)}else{f++;console.error(`  FAIL ${n}`)}};
check('bidder Contractor Quantity may be blank',/project_tender_bid_draft_items[\s\S]*ALTER COLUMN quantity DROP NOT NULL/.test(sql)&&/CHECK \(quantity IS NULL OR quantity > 0\)/.test(sql));
check('bidder quantity is taken from its own payload',/apply_tender_bid_contractor_quantity/.test(sql)&&/NEW\.quantity := NULLIF\(v_item->>'quantity'/.test(sql));
check('Consultant Quantity comes only from immutable issued BOQ',/'consultantQuantity',source\.consultant_quantity/.test(sql)&&!/NEW\.consultant_quantity/.test(sql));
check('workspace distinguishes both quantities',/'contractorQuantity'/.test(sql)&&/'consultantQuantity'/.test(sql));
check('public save command retains closed ACL',/REVOKE ALL ON FUNCTION public\.save_my_tender_bid_draft/.test(sql)&&/GRANT EXECUTE ON FUNCTION public\.save_my_tender_bid_draft[\s\S]*TO authenticated/.test(sql));
console.log(`\nTender bid quantities migration: ${p} passed, ${f} failed`);if(f)process.exit(1);
