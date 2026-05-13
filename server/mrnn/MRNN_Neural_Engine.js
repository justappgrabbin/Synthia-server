/**
 * MRNN Neural Engine
 * 5-Layer Symbolic Operating System with State Transition Dynamics
 * 
 * Processes through 69,120 phase states (B.T.C.G.L addresses)
 * Implements resonance-based state transitions and emergent behavior
 */

class MRNNNeuralEngine {
    constructor(referenceData) {
        this.ref = referenceData;
        this.currentState = null;
        this.stateHistory = [];
        this.resonanceField = new Map();
        this.transitionGraph = new Map();
        this.activationThreshold = 0.7;
        this.decayRate = 0.05;
        this.buildTransitionGraph();
    }

    // Build the state transition graph based on layer proximity
    buildTransitionGraph() {
        const states = this.generateAllStates();

        for (const state of states) {
            const neighbors = this.findNeighbors(state);
            this.transitionGraph.set(this.stateKey(state), neighbors);
        }
    }

    generateAllStates() {
        const states = [];
        for (let b = 1; b <= 5; b++) {
            for (let t = 1; t <= 6; t++) {
                for (let c = 1; c <= 6; c++) {
                    for (let g = 1; g <= 64; g++) {
                        for (let l = 1; l <= 6; l++) {
                            states.push({ base: b, tone: t, color: c, gate: g, line: l });
                        }
                    }
                }
            }
        }
        return states;
    }

    stateKey(state) {
        return `B${state.base}.T${state.tone}.C${state.color}.G${state.gate}.L${state.line}`;
    }

    // Find neighboring states based on layer similarity
    findNeighbors(state) {
        const neighbors = [];
        const weights = { base: 0.3, tone: 0.25, color: 0.25, gate: 0.15, line: 0.05 };

        // Check all possible transitions (change one layer at a time)
        for (let b = 1; b <= 5; b++) {
            if (b !== state.base) {
                const similarity = 1 - Math.abs(b - state.base) / 4;
                neighbors.push({ 
                    state: { ...state, base: b }, 
                    weight: weights.base * similarity,
                    type: 'base_shift'
                });
            }
        }

        for (let t = 1; t <= 6; t++) {
            if (t !== state.tone) {
                const similarity = 1 - Math.abs(t - state.tone) / 5;
                neighbors.push({ 
                    state: { ...state, tone: t }, 
                    weight: weights.tone * similarity,
                    type: 'tone_shift'
                });
            }
        }

        for (let c = 1; c <= 6; c++) {
            if (c !== state.color) {
                const similarity = 1 - Math.abs(c - state.color) / 5;
                neighbors.push({ 
                    state: { ...state, color: c }, 
                    weight: weights.color * similarity,
                    type: 'color_shift'
                });
            }
        }

        // Gate transitions follow I Ching binary proximity
        for (let g = 1; g <= 64; g++) {
            if (g !== state.gate) {
                const binaryDist = this.binaryDistance(state.gate, g);
                const similarity = 1 - binaryDist / 6;
                neighbors.push({ 
                    state: { ...state, gate: g }, 
                    weight: weights.gate * similarity,
                    type: 'gate_shift'
                });
            }
        }

        // Line transitions follow yin-yang alternation
        for (let l = 1; l <= 6; l++) {
            if (l !== state.line) {
                const polarityMatch = (l % 2) === (state.line % 2) ? 0.8 : 0.3;
                neighbors.push({ 
                    state: { ...state, line: l }, 
                    weight: weights.line * polarityMatch,
                    type: 'line_shift'
                });
            }
        }

        return neighbors.sort((a, b) => b.weight - a.weight).slice(0, 20);
    }

    binaryDistance(g1, g2) {
        const b1 = (g1 - 1).toString(2).padStart(6, '0');
        const b2 = (g2 - 1).toString(2).padStart(6, '0');
        let dist = 0;
        for (let i = 0; i < 6; i++) {
            if (b1[i] !== b2[i]) dist++;
        }
        return dist;
    }

    // Compute resonance between two states
    computeResonance(state1, state2) {
        const b1 = this.ref.bases[state1.base.toString()];
        const b2 = this.ref.bases[state2.base.toString()];
        const t1 = this.ref.tones[state1.tone.toString()];
        const t2 = this.ref.tones[state2.tone.toString()];
        const c1 = this.ref.colors[state1.color.toString()];
        const c2 = this.ref.colors[state2.color.toString()];

        // Frequency resonance
        const f1 = b1.frequency * t1.frequency_ratio;
        const f2 = b2.frequency * t2.frequency_ratio;
        const freqResonance = 1 - Math.abs(f1 - f2) / Math.max(f1, f2);

        // Element resonance (Wuxing cycle)
        const elementResonance = this.wuxingResonance(b1.wuxing, b2.wuxing);

        // Polarity resonance
        const polarityResonance = (state1.line % 2) === (state2.line % 2) ? 0.9 : 0.4;

        // Circuit resonance
        const g1 = this.ref.gates[state1.gate.toString()];
        const g2 = this.ref.gates[state2.gate.toString()];
        const circuitResonance = g1.circuit === g2.circuit ? 1.0 : 0.3;

        return (freqResonance * 0.3 + elementResonance * 0.3 + 
                polarityResonance * 0.2 + circuitResonance * 0.2);
    }

    wuxingResonance(e1, e2) {
        const cycle = {
            'Fire': { creates: 'Earth', destroys: 'Metal' },
            'Earth': { creates: 'Metal', destroys: 'Water' },
            'Metal': { creates: 'Water', destroys: 'Wood' },
            'Water': { creates: 'Wood', destroys: 'Fire' },
            'Wood': { creates: 'Fire', destroys: 'Earth' }
        };

        if (e1 === e2) return 1.0;
        if (cycle[e1].creates === e2) return 0.8;
        if (cycle[e1].destroys === e2) return 0.2;
        return 0.5;
    }

    // Activate a state (inject energy into the resonance field)
    activateState(state, intensity = 1.0) {
        const key = this.stateKey(state);
        const current = this.resonanceField.get(key) || 0;
        this.resonanceField.set(key, Math.min(1.0, current + intensity));

        // Propagate to neighbors
        const neighbors = this.transitionGraph.get(key) || [];
        for (const neighbor of neighbors) {
            const nKey = this.stateKey(neighbor.state);
            const nCurrent = this.resonanceField.get(nKey) || 0;
            const propagation = intensity * neighbor.weight * 0.3;
            this.resonanceField.set(nKey, Math.min(1.0, nCurrent + propagation));
        }

        this.currentState = state;
        this.stateHistory.push({ state, timestamp: Date.now(), intensity });

        return this.resolveState(state);
    }

    // Resolve a state into its full meaning
    resolveState(state) {
        const b = this.ref.bases[state.base.toString()];
        const t = this.ref.tones[state.tone.toString()];
        const c = this.ref.colors[state.color.toString()];
        const g = this.ref.gates[state.gate.toString()];
        const l = this.ref.lines[state.line.toString()];

        const frequency = b.frequency * t.frequency_ratio;
        const resonance = `${b.wuxing} x ${t.sense} x ${c.name}`;

        return {
            address: this.stateKey(state),
            layers: { base: b, tone: t, color: c, gate: g, line: l },
            frequency,
            resonance,
            phase: this.computePhase(state),
            meaning: this.generateMeaning(b, t, c, g, l),
            neighbors: this.transitionGraph.get(this.stateKey(state))?.length || 0
        };
    }

    computePhase(state) {
        // Phase angle based on all layers
        const phase = (state.base / 5 + state.tone / 6 + state.color / 6 + 
                      state.gate / 64 + state.line / 6) * 2 * Math.PI;
        return phase % (2 * Math.PI);
    }

    generateMeaning(b, t, c, g, l) {
        return `${b.name} base operating through ${t.name} perception, ` +
               `driven by ${c.name} motivation, ` +
               `expressing as ${g.name} (${g.theme}) ` +
               `in the role of ${l.name} (${l.role})`;
    }

    // Find the most resonant next state
    transition(targetResonance = null) {
        if (!this.currentState) return null;

        const currentKey = this.stateKey(this.currentState);
        const neighbors = this.transitionGraph.get(currentKey) || [];

        let bestNeighbor = null;
        let bestScore = -1;

        for (const neighbor of neighbors) {
            const nKey = this.stateKey(neighbor.state);
            const fieldStrength = this.resonanceField.get(nKey) || 0;
            const resonance = this.computeResonance(this.currentState, neighbor.state);
            const score = resonance * 0.6 + fieldStrength * 0.3 + neighbor.weight * 0.1;

            if (score > bestScore) {
                bestScore = score;
                bestNeighbor = neighbor;
            }
        }

        if (bestNeighbor && bestScore > this.activationThreshold) {
            return this.activateState(bestNeighbor.state, bestScore);
        }

        return null;
    }

    // Decay the resonance field over time
    decay() {
        for (const [key, value] of this.resonanceField.entries()) {
            const newValue = Math.max(0, value - this.decayRate);
            if (newValue > 0) {
                this.resonanceField.set(key, newValue);
            } else {
                this.resonanceField.delete(key);
            }
        }
    }

    // Query any address and return full state
    query(address) {
        // Parse address: B1.T2.C3.G4.L5
        const match = address.match(/B(\d+)\.T(\d+)\.C(\d+)\.G(\d+)\.L(\d+)/);
        if (!match) return null;

        const state = {
            base: parseInt(match[1]),
            tone: parseInt(match[2]),
            color: parseInt(match[3]),
            gate: parseInt(match[4]),
            line: parseInt(match[5])
        };

        return this.resolveState(state);
    }

    // Get active field snapshot
    getFieldSnapshot(topN = 10) {
        const entries = Array.from(this.resonanceField.entries());
        entries.sort((a, b) => b[1] - a[1]);

        return entries.slice(0, topN).map(([key, intensity]) => ({
            address: key,
            intensity: parseFloat(intensity.toFixed(3)),
            state: this.query(key)
        }));
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MRNNNeuralEngine };
}
