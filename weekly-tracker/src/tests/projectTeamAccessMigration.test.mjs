import{readFileSync}from'node:fs';const sql=readFileSync(new URL('../migrations/119_project_team_access_foundation.sql',import.meta.url),'utf8');let p=0,f=0;const c=(n,x)=>{if(x){p++;console.log(`  PASS ${n}`)}else{f++;console.error(`  FAIL ${n}`)}};
c('Viewer is replaced by Executive',/UPDATE public\.profiles SET role='Executive' WHERE lower\(role\)='viewer'/.test(sql)&&/DEFAULT 'Executive'/.test(sql));
c('membership history is time bounded and immutable',/starts_on date NOT NULL/.test(sql)&&/ends_on date/.test(sql)&&/PROJECT_TEAM_EVENT_IMMUTABLE/.test(sql));
c('capabilities are data driven',/project_capability_catalog/.test(sql)&&/allowed_project_roles/.test(sql)&&/has_project_capability/.test(sql));
c('Cost Package responsibility scope is explicit',/project_cost_package_responsibilities/.test(sql)&&/cost_package_id uuid NOT NULL/.test(sql));
c('PM project access is membership based',/v_role='pm' THEN RETURN public\.has_project_capability\(p_project_id,'PROJECT_MANAGE'/.test(sql));
c('consultant and approver are not granted generic operational access',/IF v_role='contractor'[\s\S]*RETURN false;/.test(sql));
c('team writes use one command RPC and immutable event',/save_project_team_membership/.test(sql)&&/project_team_membership_events/.test(sql)&&/write_command_requests/.test(sql));
console.log(`\nProject Team access migration: ${p} passed, ${f} failed`);if(f)process.exit(1);
