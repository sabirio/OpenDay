import{readFileSync}from'node:fs';const component=readFileSync(new URL('../components/tender/TenderAward.jsx',import.meta.url),'utf8'),hook=readFileSync(new URL('../hooks/useTenderSetup.js',import.meta.url),'utf8'),service=readFileSync(new URL('../services/tenderAwardService.js',import.meta.url),'utf8');let p=0,f=0;const check=(n,c)=>{if(c){p++;console.log(`  PASS ${n}`)}else{f++;console.error(`  FAIL ${n}`)}};
check('Award screen offers explicit Scope materialization',/Create Execution Scope/.test(component)&&/materializeAwardedScope/.test(component));
check('confirmation explains line to Work Group collapse',/awarded BOQ lines collapsed into/.test(component)&&/Work Groups/.test(component));
check('UI states that no Gantt activities or dates are created',/No Gantt activities or dates will be created/.test(component));
check('ready state shows immutable Scope revision',/Execution Scope R/.test(component)&&/ready to schedule/.test(component));
check('ready state preserves Contractor grouping and splitting ownership',/Contractor Schedule Setup may now group or split activities/.test(component));
check('hook reloads after atomic materialization',/commitAwardedExecutionScope/.test(hook)&&/await load\(\)/.test(hook));
check('service loads status and calls one atomic RPC',/get_awarded_execution_scope_status/.test(service)&&/materialize_execution_scope_from_awarded_boq/.test(service));
console.log(`\nAwarded BOQ Execution Scope UI: ${p} passed, ${f} failed`);if(f)process.exit(1);
