'use strict';

class AutomatonRegistry {
  constructor({ store, clock = () => new Date().toISOString() } = {}) {
    this.store = store;
    this.clock = clock;
    this.definitions = new Map();
    this.health = new Map();
  }

  register(definition) {
    if (!definition || !definition.id) throw new Error('automaton_id_required');
    const def = {
      version: '1.0.0',
      capabilities: [],
      inputs: [],
      outputs: [],
      provenance: 'YOU-N-I-VERSE persistent player runtime',
      ...definition,
    };
    this.definitions.set(def.id, def);
    if (!this.health.has(def.id)) {
      this.health.set(def.id, {
        id: def.id,
        status: 'ready',
        runs: 0,
        failures: 0,
        lastRunAt: null,
        lastError: null,
      });
    }
    return def;
  }

  list() {
    return [...this.definitions.values()].map(def => ({
      ...def,
      health: this.health.get(def.id),
    }));
  }

  async run(id, input, handler, context = {}) {
    const def = this.definitions.get(id);
    if (!def) throw new Error(`automaton_not_registered:${id}`);
    const h = this.health.get(id);
    h.status = 'running';
    h.runs += 1;
    h.lastRunAt = this.clock();
    h.lastError = null;

    const eventBase = {
      automatonId: id,
      automatonVersion: def.version,
      playerId: context.playerId || input?.playerId || null,
      worldId: context.worldId || input?.worldId || null,
    };

    try {
      if (this.store?.appendEvent) {
        await this.store.appendEvent({
          type: 'automaton.started',
          ...eventBase,
          at: h.lastRunAt,
        });
      }
      const output = await handler(input, context);
      h.status = 'ready';
      if (this.store?.appendEvent) {
        await this.store.appendEvent({
          type: 'automaton.completed',
          ...eventBase,
          at: this.clock(),
        });
      }
      return output;
    } catch (error) {
      h.status = 'error';
      h.failures += 1;
      h.lastError = error?.message || String(error);
      if (this.store?.appendEvent) {
        await this.store.appendEvent({
          type: 'automaton.failed',
          ...eventBase,
          error: h.lastError,
          at: this.clock(),
        });
      }
      throw error;
    }
  }
}

module.exports = { AutomatonRegistry };
