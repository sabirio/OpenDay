import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/141_users_owned_project_team_membership.sql', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../components/commercial/CommercialFoundationWorkspace.jsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/commercialFoundationService.js', import.meta.url), 'utf8');
let passed = 0;
const check = (name, condition) => { assert.ok(condition, name); passed += 1; console.log(`  PASS ${name}`); };

check('Users role is the only source for Project Team access',
  /project_role_from_profile/.test(migration) && /profile\.role/.test(migration) && /roleSource','USERS'/.test(migration));
check('Project Team exposes membership-only add and remove commands',
  /add_project_team_member/.test(migration) && /remove_project_team_member/.test(migration)
    && /public\.save_project_team_membership\(bigint,uuid,uuid,text,text,date,date,boolean,text\[\],uuid\[\],text,integer,uuid\)[\s\S]*FROM PUBLIC,anon,authenticated,service_role/.test(migration));
check('active membership excludes removed people',
  /removed_at IS NULL/.test(migration) && /is_active_project_member/.test(migration));
check('browser service cannot send role or capability overrides',
  /add_project_team_member/.test(service) && !/p_project_role/.test(service) && !/p_capability_codes/.test(service));
check('Project Team UI is a simple internal colleague registry',
  /Add colleague/.test(workspace) && /Project access/.test(workspace) && /Add to project/.test(workspace) && /Remove/.test(workspace)
    && !/Project role<select/.test(workspace) && !/>Capabilities</.test(workspace) && !/>Responsibility</.test(workspace));
check('Project Team selects Users and assigns project responsibility without local permission controls',
  /Search by name, email, or role/.test(workspace) && /Project department/.test(workspace) && /system access remains in Users/.test(workspace)
    && !/capabilityCodes/.test(workspace) && !/notificationsEnabled/.test(workspace));
console.log(`\nUsers-owned Project Team: ${passed} passed, 0 failed`);
