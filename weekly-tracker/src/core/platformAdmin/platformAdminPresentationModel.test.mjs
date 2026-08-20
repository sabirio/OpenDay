import assert from 'node:assert/strict';
import { buildPlatformOrganizationSummary,groupPlatformCapabilities,indexEffectiveCapabilities,indexManualOverrides } from './platformAdminPresentationModel.js';

assert.deepEqual(groupPlatformCapabilities([
  { id:'a',group_code:'CORE' },{ id:'b',group_code:'OWNER' },{ id:'c',group_code:'CORE' },
]).map(([group,rows])=>[group,rows.map(row=>row.id)]),[['CORE',['a','c']],['OWNER',['b']]]);
assert.equal(indexEffectiveCapabilities([{ capabilityId:'a',enabled:true }]).a.enabled,true);
assert.deepEqual(Object.keys(indexManualOverrides([
  { capability_id:'a',source:'plan' },{ capability_id:'b',source:'manual_override' },
])),['b']);
assert.deepEqual(buildPlatformOrganizationSummary({
  organization:{status:'ACTIVE'},subscription:{plan_id:'owner'},adminUsers:[{}],
  effective:{capabilities:[{enabled:true},{enabled:false}]},
}),{status:'ACTIVE',plan:'owner',adminUsers:1,effectiveCapabilities:1});
console.log('platformAdminPresentationModel: all checks passed');
