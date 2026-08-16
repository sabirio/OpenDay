import{readFileSync}from'node:fs';const sql=readFileSync(new URL('../migrations/120_boq_template_v1_freeze.sql',import.meta.url),'utf8');let p=0,f=0;const c=(n,x)=>{if(x){p++;console.log(`  PASS ${n}`)}else{f++;console.error(`  FAIL ${n}`)}};
c('release audits exact active template shape',/v_disciplines<>12/.test(sql)&&/v_groups<>141/.test(sql)&&/v_lines<>563/.test(sql));
c('duplicates and category granularity block freezing',/v_duplicates<>0/.test(sql)&&/v_line_count_issues<>0/.test(sql));
c('release is linked to one ontology version',/ontology_version_id uuid NOT NULL UNIQUE/.test(sql));
c('release is immutable',/BOQ_TEMPLATE_RELEASE_IMMUTABLE/.test(sql)&&/BEFORE UPDATE OR DELETE/.test(sql));
c('comparison level is canonical category',/'comparisonLevel','CANONICAL_CATEGORY'/.test(sql));
console.log(`\nBOQ Template v1 freeze migration: ${p} passed, ${f} failed`);if(f)process.exit(1);
