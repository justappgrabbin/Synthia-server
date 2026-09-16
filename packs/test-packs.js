'use strict';

const assert = require('assert');
const {
  REQUIRED_SHARED_SYSTEMS,
  listPacks,
  getPack,
  createCultivationSession,
} = require('./registry');

const packs = listPacks();
assert.strictEqual(packs.length, 5, 'Expected exactly five Synthia manifestation packs');

for (const id of ['prime', 'echo', 'venom', 'celestial', 'siren']) {
  const pack = getPack(id);
  assert.strictEqual(pack.id, id);
  for (const system of REQUIRED_SHARED_SYSTEMS) {
    assert.ok(pack.sharedSystems.includes(system), `${id} missing ${system}`);
  }
  const session = createCultivationSession(id, { userId: 'smoke-test' });
  assert.strictEqual(session.packId, id);
  assert.strictEqual(session.sharedSystems.length, 5);
  assert.ok(session.agenticReality.lens);
}

assert.strictEqual(getPack('dream').id, 'celestial');
assert.strictEqual(getPack('softcore').id, 'siren');

console.log('Synthia packs OK:', packs.map((pack) => pack.id).join(', '));
