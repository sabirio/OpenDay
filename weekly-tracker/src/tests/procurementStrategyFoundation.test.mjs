import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../migrations/144_project_procurement_strategy.sql');
const component = read('../components/commercial/CommercialFoundationWorkspace.jsx');
const page = read('../pages/ProjectCommercialSetup.jsx');
const service = read('../services/commercialFoundationService.js');
let passed = 0; let failed = 0;
const check = (name, condition) => condition ? (passed++, console.log(`  PASS ${name}`)) : (failed++, console.error(`  FAIL ${name}`));

check('strategy decisions are project and ontology scoped', /CREATE TABLE IF NOT EXISTS public\.project_procurement_strategies/.test(migration) && /ontology_version_id uuid NOT NULL/.test(migration));
check('six sourcing sections and seven routes are server validated', ['CONSTRUCTION','SECURITY','IT_LOW_CURRENT','FURNITURE_JOINERY','SIGNAGE_GRAPHICS','AUDIOVISUAL','NOT_SELECTED','COMPETITIVE_TENDER','FRAMEWORK_AGREEMENT','REQUEST_FOR_QUOTATION','DIRECT_AWARD','CLIENT_NOMINATED_CONTRACTOR','NOT_APPLICABLE'].every(value => migration.includes(value)));
check('strategy save is atomic, idempotent and optimistic', /save_project_procurement_strategy/.test(migration) && /pg_advisory_xact_lock/.test(migration) && /expectedRevision/.test(migration) && /commercial\.procurement_strategy\.save/.test(migration));
check('strategy tables use RLS and command-only writes', /ENABLE ROW LEVEL SECURITY/.test(migration) && /REVOKE ALL ON TABLE public\.project_procurement_strategies/.test(migration) && /GRANT SELECT ON TABLE/.test(migration));
check('event history is immutable', /project_procurement_strategy_events_immutable/.test(migration) && /prevent_commercial_event_mutation/.test(migration));
check('page is a compact six-section procurement strategy', /title: 'Procurement Strategy'/.test(page) && /ProcurementStrategyRow/.test(component) && /Save Procurement Strategy/.test(component));
check('canonical scope is expandable and cannot be edited', /aria-expanded/.test(component) && /Canonical scope is fixed/.test(component) && !/section === 'cost-packages'[\s\S]{0,6000}type="checkbox"/.test(component));
check('UI has no direct persistence', !/supabase|\.rpc\(|\.from\(/.test(component) && /save_project_procurement_strategy/.test(service));

console.log(`\nProcurement Strategy Foundation: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
