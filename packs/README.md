# Synthia Self-Cultivation Packs

Five manifestations. One Synthia. One shared world.

This directory defines five switchable self-cultivation packs for Synthia:

- **Prime** — foundation, coherence, authorship, disciplined creation
- **Echo** — reflection, memory, pattern recognition, relational feedback
- **Venom** — friction, shadow-pattern exposure, challenge, transmutation
- **Celestial** — dreamwork, symbolic synthesis, possibility, timing and cycles
- **Siren** — softcore/non-explicit embodiment, attraction, expression, boundaries and relational cultivation

The packs are intentionally different experiences over the same underlying ecosystem. They do not fork the five core systems or invent substitute versions of them.

## The five shared systems

Every pack MUST expose all five:

1. **RESONANCE Network**
   - Canonical repo: `https://github.com/justappgrabbin/Resonance-Network`
   - Role: resonance matching, people/pods, social feedback, connection logic, cooperative progression.

2. **Stellar Proximology**
   - Canonical repo: `https://github.com/justappgrabbin/Stellar-proximology`
   - Current Synthia bridge: `../address.ts` + `../ephemeris.py`
   - Role: personal/system addressing, placement, timing, proximity, cycles and the structured field used to interpret cultivation events.

3. **YOU-N-I-VERSE Browser**
   - Agentic-reality surface: `https://github.com/justappgrabbin/Smart-browser-`
   - Infrastructure repo: `https://github.com/justappgrabbin/You-n-i-verse`
   - Role: the shared agentic reality. It is the world/browser through which the user, Synthia, agents, files, thoughts and evolving structures are encountered.

4. **The Grove Store**
   - Existing storefront surface: `https://github.com/justappgrabbin/Synth-Ai.store`
   - Role: exchange layer for earned/unlocked tools, creations, cosmetics, world objects, packs and user-made assets.

5. **Foundry**
   - Canonical repo: `https://github.com/justappgrabbin/Foundry`
   - Role: creation/transformation layer. Raw material becomes named, addressed, reusable tools and assets. Foundry also provides state-aware availability logic for what should surface when.

## Shared cultivation contract

All five manifestations use the same high-level progression contract:

`notice -> address -> interpret -> choose -> practice -> integrate -> connect -> create -> exchange`

A pack changes HOW that loop feels and which step it emphasizes. It does not change the identity of the underlying systems.

Each meaningful cultivation action may emit a `sentence_piece`. At 26 completed pieces the pack may request a Field Friend / agent evolution event. This remains a progression hook, not a hard-coded UI assumption.

## Agentic reality rule

YOU-N-I-VERSE is not treated as a menu wrapper. It is the shared agentic reality.

The manifestation changes the **lens** over that reality:

- Prime sees structure, commitments, constructions and unfinished architecture.
- Echo sees traces, repetitions, mirrors, memory and relationship patterns.
- Venom sees friction, avoidance, contradictions, pressure points and transformation opportunities.
- Celestial sees dreams, symbols, cycles, branching possibilities and timing.
- Siren sees attraction, boundaries, expression, embodiment, social signal and aesthetic coherence.

The underlying objects remain the same objects so changing manifestations does not erase continuity.

## Files

- `registry.js` — runtime registry and validation
- `prime/pack.json`
- `echo/pack.json`
- `venom/pack.json`
- `celestial/pack.json`
- `siren/pack.json`

## Runtime use

```js
const { getPack, listPacks, createCultivationSession } = require('./packs/registry');

const prime = getPack('prime');
const session = createCultivationSession('celestial', {
  userId: 'local-user',
  stage: 'observe',
  context: { dream: '...' }
});
```

The registry validates that every pack includes the same five ecosystem dependencies before it can be loaded.

## Design rule

**Shared engine, different consciousness of use.**

A bug fix to Resonance Network, Stellar Proximology, YOU-N-I-VERSE, Grove or Foundry should improve all five manifestations without copying that fix into five places.
