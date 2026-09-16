'use strict';

const REQUIRED_SHARED_SYSTEMS = Object.freeze([
  'resonance-network',
  'stellar-proximology',
  'you-n-i-verse',
  'grove',
  'foundry',
]);

const SHARED_SYSTEMS = Object.freeze({
  'resonance-network': Object.freeze({
    name: 'RESONANCE Network',
    repo: 'https://github.com/justappgrabbin/Resonance-Network',
    role: 'resonance matching, people, pods, connection logic and cooperative progression',
  }),
  'stellar-proximology': Object.freeze({
    name: 'Stellar Proximology',
    repo: 'https://github.com/justappgrabbin/Stellar-proximology',
    localBridges: ['../address.ts', '../ephemeris.py'],
    role: 'addressing, placement, timing, proximity, cycles and structured field interpretation',
  }),
  'you-n-i-verse': Object.freeze({
    name: 'YOU-N-I-VERSE',
    browserRepo: 'https://github.com/justappgrabbin/Smart-browser-',
    infrastructureRepo: 'https://github.com/justappgrabbin/You-n-i-verse',
    role: 'shared agentic reality browser and world surface',
  }),
  grove: Object.freeze({
    name: 'The Grove Store',
    repo: 'https://github.com/justappgrabbin/Synth-Ai.store',
    role: 'exchange layer for unlocked tools, creations, cosmetics, world objects and user-made assets',
  }),
  foundry: Object.freeze({
    name: 'Foundry',
    repo: 'https://github.com/justappgrabbin/Foundry',
    role: 'creation, transformation, asset identity and state-aware tool availability',
  }),
});

const PACKS = Object.freeze({
  prime: require('./prime/pack.json'),
  echo: require('./echo/pack.json'),
  venom: require('./venom/pack.json'),
  celestial: require('./celestial/pack.json'),
  siren: require('./siren/pack.json'),
});

function validatePack(pack) {
  if (!pack || typeof pack !== 'object') throw new TypeError('Pack must be an object');
  if (!pack.id || !pack.name || !pack.manifestation) throw new Error('Pack identity is incomplete');
  if (!Array.isArray(pack.sharedSystems)) throw new Error(`${pack.id}: sharedSystems must be an array`);

  const missing = REQUIRED_SHARED_SYSTEMS.filter((system) => !pack.sharedSystems.includes(system));
  if (missing.length) {
    throw new Error(`${pack.id}: missing shared systems: ${missing.join(', ')}`);
  }

  if (!pack.cultivation || !Array.isArray(pack.cultivation.loop) || pack.cultivation.loop.length < 3) {
    throw new Error(`${pack.id}: cultivation loop is incomplete`);
  }

  if (!pack.agenticReality || !pack.agenticReality.lens) {
    throw new Error(`${pack.id}: YOU-N-I-VERSE agentic-reality lens is required`);
  }

  return true;
}

Object.values(PACKS).forEach(validatePack);

function normalizePackId(id) {
  const value = String(id || '').trim().toLowerCase();
  if (value === 'dream') return 'celestial';
  if (value === 'softcore') return 'siren';
  return value;
}

function getPack(id) {
  const key = normalizePackId(id);
  const pack = PACKS[key];
  if (!pack) throw new Error(`Unknown Synthia pack: ${id}`);
  return pack;
}

function listPacks() {
  return Object.values(PACKS).map((pack) => ({
    id: pack.id,
    name: pack.name,
    manifestation: pack.manifestation,
    tagline: pack.tagline,
    browserTheme: pack.agenticReality.browserTheme,
    focus: pack.cultivation.focus,
  }));
}

function createCultivationSession(id, input = {}) {
  const pack = getPack(id);
  const stage = input.stage || pack.cultivation.loop[0];
  const stageIndex = Math.max(0, pack.cultivation.loop.indexOf(stage));
  const questType = pack.cultivation.questTypes[stageIndex % pack.cultivation.questTypes.length];

  return {
    packId: pack.id,
    manifestation: pack.manifestation,
    userId: input.userId || 'local-user',
    stage,
    questType,
    context: input.context || {},
    agenticReality: pack.agenticReality,
    theme: pack.theme,
    voice: pack.voice,
    progression: pack.cultivation.progression,
    sharedSystems: REQUIRED_SHARED_SYSTEMS.map((key) => ({
      key,
      ...SHARED_SYSTEMS[key],
      packHook: pack.hooks[key],
    })),
  };
}

module.exports = {
  REQUIRED_SHARED_SYSTEMS,
  SHARED_SYSTEMS,
  PACKS,
  validatePack,
  getPack,
  listPacks,
  createCultivationSession,
};
