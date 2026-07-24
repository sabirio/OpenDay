import assert from 'node:assert/strict';
import { describeProjectLocation, formatArea, formatMoney } from './projectInfoPresentationModel.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  OK ${name}`); };

ok('Mall project derives LOCATION from shoppingMallName', () =>
  assert.deepEqual(
    describeProjectLocation({ locationType: 'Mall', shoppingMallName: 'MEGA Alma-Ata', street: null }),
    { locationType: 'Mall', fieldLabel: 'Shopping Mall Name', value: 'MEGA Alma-Ata' },
  ));

ok('Street project derives LOCATION from street', () =>
  assert.deepEqual(
    describeProjectLocation({ locationType: 'Street', shoppingMallName: null, street: 'Abay Ave 42' }),
    { locationType: 'Street', fieldLabel: 'Street Address', value: 'Abay Ave 42' },
  ));

ok('Mall project ignores a stray street value (never leaks the other field)', () =>
  assert.equal(
    describeProjectLocation({ locationType: 'Mall', shoppingMallName: 'MEGA', street: 'stray' }).value,
    'MEGA',
  ));

ok('no locationType yields all-null, not a guess', () =>
  assert.deepEqual(
    describeProjectLocation({ locationType: null, shoppingMallName: 'MEGA', street: 'X' }),
    { locationType: null, fieldLabel: null, value: null },
  ));

ok('formatArea renders a real 0 as "0 m²", not "—"', () => assert.equal(formatArea(0), '0 m²'));
ok('formatArea renders null as "—"', () => assert.equal(formatArea(null), '—'));
ok('formatArea renders undefined as "—"', () => assert.equal(formatArea(undefined), '—'));
ok('formatArea renders empty string as "—"', () => assert.equal(formatArea(''), '—'));
ok('formatArea formats a normal value with thousands separators', () => assert.equal(formatArea(1250), '1,250 m²'));

ok('formatMoney renders a real 0 as "0", not "—"', () => assert.equal(formatMoney(0, 'KZT'), '0 KZT'));
ok('formatMoney renders null as "—"', () => assert.equal(formatMoney(null, 'KZT'), '—'));
ok('formatMoney with no currency omits the suffix', () => assert.equal(formatMoney(500, null), '500'));
ok('formatMoney formats with thousands separators', () => assert.equal(formatMoney(125000, 'KZT'), '125,000 KZT'));

console.log(`\n-- RESULT: ${n} passed, 0 failed --\n`);
