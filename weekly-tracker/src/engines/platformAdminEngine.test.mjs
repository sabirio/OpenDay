import assert from 'node:assert/strict';
import { countEnabledCapabilities } from './platformAdminEngine.js';

assert.equal(countEnabledCapabilities(),0);
assert.equal(countEnabledCapabilities([{enabled:true},{enabled:false},{enabled:true}]),2);
console.log('platformAdminEngine: all checks passed');
