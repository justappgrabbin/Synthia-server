'use strict';

function normalizeChoice(input) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return { verb: 'observe', raw: '' };
  if (/wait|stay|pause|listen/.test(text)) return { verb: 'wait', raw: text };
  if (/investigate|inspect|look|search|study|examine/.test(text)) return { verb: 'investigate', raw: text };
  if (/cross|advance|go|move|enter|climb/.test(text)) return { verb: 'cross', raw: text };
  if (/retreat|leave|back|withdraw/.test(text)) return { verb: 'retreat', raw: text };
  if (/help|aid|assist|repair|rescue/.test(text)) return { verb: 'help', raw: text };
  if (/bargain|trade|offer|negotiate|persuade|ask/.test(text)) return { verb: 'bargain', raw: text };
  return { verb: 'improvise', raw: text };
}

function initialScene(player) {
  const gates = player.iChingGateState?.activeGates || player.humanDesignState?.canonical?.active_gates || [29];
  const firstGate = Number(gates[0] || 29);
  const line = Number(player.iChingGateState?.activeLines?.[String(firstGate)] || 1);
  return {
    gameId: 'i-ching-story',
    worldVersion: '1.0.0',
    sceneId: 'flooded-bridge',
    turn: 0,
    activeHexagram: firstGate,
    activeLine: line,
    storyPosition: ['threshold', 'river-crossing'],
    currentQuest: 'Find a way across without losing the thread of the journey.',
    localInventory: [],
    localRelationships: {
      ferryman: { trust: 0, stance: 'refuses_crossing', history: [] },
    },
    localWorldState: {
      place: 'Flooded Bridge',
      waterLevel: 3,
      bridgeIntegrity: 0.42,
      alternatePathVisible: false,
      hiddenRouteVisible: false,
      stormPressure: 0.7,
      narrativeTension: 0.5,
      clock: 0,
      tags: ['flood', 'threshold', 'uncertain-crossing'],
    },
    availableActions: ['wait', 'investigate', 'cross', 'retreat', 'help', 'bargain'],
    currentMorph: player.currentEmbodiment || null,
    log: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function applyEnvironmentalEffect(state, effect) {
  const w = state.localWorldState;
  if (!effect || typeof effect !== 'object') return;
  if (effect.kind === 'hazard_intensity') {
    const delta = Number(effect.value || 0);
    w.waterLevel = Math.max(0, Number((w.waterLevel + delta).toFixed(2)));
    w.stormPressure = Math.max(0, Math.min(1.5, Numben((w.stormPressure + delta * 0.08).toFixed(3))));
  }
  if (effect.kind === 'route_visibility' && ['reveal','open'].includes(effect.op)) {
    if (effect.target === 'hidden') w.hiddenRouteVisible = true;
    else w.alternatePathVisible = true;
  }
  if (effect.kind === 'structure_integrity') {
    w.bridgeIntegrity = Math.max(0, Math.min(1, Numben((w.bridgeIntegrity + Number(effect.value || 0)).toFixed(3))));
  }
  if (effect.kind === 'weather_pressure') {
    w.stormPressure = Math.max(0, Math.min(1.5, Number((w.stormPressure + Number(effect.value || 0)).toFixed(3))));
  }
  if (effect.kind === 'time_shift') w.clock += Number(effect.value || 1);
}

function applyRelationshipEffect(state, effect) {
  if (!effect) return;
  const target = effect.target || 'ferryman';
  if (!state.localRelationships[target]) state.localRelationships[target] = { trust: 0, stance: 'unknown', history: [] };
  const rel = state.localRelationships[target];
  rel.trust = Number((rel.trust + Number(effect.trustDelta || 0)).toFixed(3));
  if (effect.stance) rel.stance = effect.stance;
  rel.history.push({ ...effect, at: new Date().toISOString() });
}

function renderScene(state, resolution, choice) {
  const w = state.localWorldState;
  const ferryman = state.localRelationships.ferryman;
  const sentences = [];
  if (w.waterLevel >= 4) sentences.push('The river climbs over another row of stones and begins striking the bridge supports sideways.');
  else if (w.waterLevel <= 2) sentences.push('The river lowers enough to expose the shape of the old crossing beneath the foam.');
  else sentences.push('The river keeps pressing against the bridge, fast enough that every decision has weight.');

  if (w.hiddenRouteVisible) sentences.push('Behind a curtain of reeds, a narrow maintenance path is now visible.');
  else if (w.alternatePathVisible) sentences.push('A broken service path appears along the bank where the mud has shifted.');

  if (ferryman.trust > 0.4) sentences.push('The ferryman stops blocking your way and starts pointing out where the current is weakest.');
  else if (ferryman.trust < -0.2) sentences.push('The ferryman turns away and pulls the rope bridge line closer to himself.');
  else sentences.push('The ferryman watches you carefully, still unwilling to commit.');

  if (resolution?.stateMovement === 'advance') sentences.push('The scene opens forward.');
  if (resolution?.stateMovement === 'hold') sentences.push('The scene holds its shape and asks for timing rather than force.');
  if (resolution?.stateMovement === 'reverse') sentences.push('The obvious route closes while a different direction becomes more coherent.');
  if (resolution?.stateMovement === 'transform') sentences.push('The conditions reorganize around the action you just took.');

  if (choice.verb === 'improvise' && choice.raw) sentences.push(`Your action, "${choice.raw}," becomes part of the world state rather than a menu branch.`);
  return sentences.join(' ');
}

function createStoryWorld() {
  return {
    id: 'i-ching-story',
    title: 'I Ching Story Adventure',
    version: '1.0.0',
    async enter({ player, services, previousState }) {
      const state = previousState || initialScene(player);
      state.updatedAt = new Date().toISOString();
      if (!state.currentMorph) {
        const morph = await services.createMorph({
          playerId: player.playerId,
          gameId: this.id,
          sceneId: state.sceneId,
          narrativeRole: 'wanderer',
          environmentalInfluence: state.localWorldState,
          transformationRules: { archetype: 'wanderer', element: 'water' },
          reason: 'world_entry',
        });
        state.currentMorph = morph.morphId;
      }
      return state;
    },

    async act({ player, state, action, services }) {
      const choice = normalizeChoice(action);
      const previous = JSON.parse(JSON.stringify(state));
      const resolution = await services.resolveIChing({
        playerState: player,
        worldState: state.localWorldState,
        relationshipState: state.localRelationships,
        activeHexagram: state.activeHexagram,
        activeLine: state.activeLine,
        previousState: previous.localWorldState,
        event: 'player_choice',
        choice,
        temporalState: { turn: state.turn, clock: state.localWorldState.clock },
      });

      for (const effect of resolution.environmentalEffects || []) applyEnvironmentalEffect(state, effect);
      for (const effect of resolution.relationshipEffects || []) applyRelationshipEffect(state, effect);
      if (resolution.narrativePressure?.delta) {
        state.localWorldState.narrativeTension = Math.max(0, Math.min(1.5,
          Number((state.localWorldState.narrativeTension + Number(resolution.narrativePressure.delta)).toFixed(3))));
      }
      if (Array.isArray(resolution.availableActions) && resolution.availableActions.length) {
        state.availableActions = [...new Set([...state.availableActions, ...resolution.availableActions])];
      }
      state.turn += 1;
      state.localWorldState.clock += 1;
      state.updatedAt = new Date().toISOString();

      let morph = null;
      if ((resolution.morphEffects || []).length) {
        const first = resolution.morphEffects[0];
        morph = await services.createMorph({
          playerId: player.playerId,
          gameId: this.id,
          sceneId: state.sceneId,
          narrativeRole: first.role || 'wanderer',
          environmentalInfluence: state.localWorldState,
          transformationRules: {
            archetype: first.archetype || 'wanderer',
            element: first.element || (state.localWorldState.waterLevel > 3 ? 'water' : 'aether'),
            bodyScale: first.bodyScale,
            agePhase: first.agePhase,
          },
          reason: first.reason || `iching_transition:${resolution.stateMovement}`,
        });
        state.currentMorph = morph.morphId;
      }

      const narrative = renderScene(state, resolution, choice);
      const entry = {
        turn: state.turn,
        choice,
        resolution,
        narrative,
        morphId: morph?.morphId || state.currentMorph,
        at: new Date().toISOString(),
      };
      state.log.push(entry);
      return { state, narrative, resolution, morph };
    },
  };
}

module.exports = { createStoryWorld, normalizeChoice, initialScene };
