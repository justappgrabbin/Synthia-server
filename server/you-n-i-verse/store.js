'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

class PlayerStore {
  constructor({ baseDir, supabase = null, tables = {} } = {}) {
    this.baseDir = baseDir || process.env.YOUNIVERSE_DATA_DIR || path.join(process.cwd(), 'data', 'you-n-i-verse');
    this.supabase = supabase;
    this.tables = {
      players: process.env.YOUNIVERSE_PLAYER_TABLE || 'youniverse_players',
      games: process.env.YOUNIVERSE_GAME_TABLE || 'youniverse_game_states',
      morphs: process.env.YOUNIVERSE_MORPH_TABLE || 'youniverse_morph_states',
      ...tables,
    };
    this.paths = {
      players: path.join(this.baseDir, 'players'),
      games: path.join(this.baseDir, 'games'),
      morphs: path.join(this.baseDir, 'morphs'),
      assets: path.join(this.baseDir, 'assets'),
      events: path.join(this.baseDir, 'events.jsonl'),
      registry: path.join(this.baseDir, 'registry.json'),
    };
    Object.values(this.paths).filter(p => !p.endsWith('.jsonl') && !p.endsWith('.json')).forEach(ensureDir);
    ensureDir(this.baseDir);
  }

  async atomicWriteJson(filePath, value) {
    ensureDir(path.dirname(filePath));
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fs.promises.rename(tmp, filePath);
  }

  async readJson(filePath) {
    try {
      return JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  playerPath(playerId) {
    return path.join(this.paths.players, `${safeId(playerId)}.json`);
  }

  gamePath(playerId, gameId) {
    return path.join(this.paths.games, safeId(playerId), `${safeId(gameId)}.json`);
  }

  morphPath(playerId, morphId) {
    return path.join(this.paths.morphs, safeId(playerId), `${safeId(morphId)}.json`);
  }

  async savePlayer(player) {
    await this.atomicWriteJson(this.playerPath(player.playerId), player);
    await this._mirror(this.tables.players, { id: player.playerId, player_id: player.playerId, user_id: player.userId, payload: player, updated_at: new Date().toISOString() });
    return player;
  }

  async loadPlayer(playerId) {
    const local = await this.readJson(this.playerPath(playerId));
    if (local) return local;
    return this._loadMirror(this.tables.players, 'player_id', playerId);
  }

  async saveGameState(playerId, gameId, state) {
    const payload = { ...state, playerId, gameId };
    await this.atomicWriteJson(this.gamePath(playerId, gameId), payload);
    await this._mirror(this.tables.games, { id: `${playerId}:${gameId}`, player_id: playerId, game_id: gameId, payload, updated_at: new Date().toISOString() });
    return payload;
  }

  async loadGameState(playerId, gameId) {
    const local = await this.readJson(this.gamePath(playerId, gameId));
    if (local) return local;
    if (!this.supabase) return null;
    try {
      const { data, error } = await this.supabase.from(this.tables.games).select('payload').eq('player_id', playerId).eq('game_id', gameId).maybeSingle();
      if (error) throw error;
      return data?.payload || null;
    } catch (error) {
      await this.appendEvent({ type: 'persistence.mirror.read_failed', table: this.tables.games, error: error.message, at: new Date().toISOString() });
      return null;
    }
  }

  async saveMorph(playerId, morph) {
    await this.atomicWriteJson(this.morphPath(playerId, morph.morphId), morph);
    await this._mirror(this.tables.morphs, { id: morph.morphId, player_id: playerId, morph_id: morph.morphId, payload: morph, updated_at: new Date().toISOString() });
    return morph;
  }

  async loadMorph(playerId, morphId) {
    const local = await this.readJson(this.morphPath(playerId, morphId));
    if (local) return local;
    if (!this.supabase) return null;
    try {
      const { data, error } = await this.supabase.from(this.tables.morphs).select('payload').eq('morph_id', morphId).maybeSingle();
      if (error) throw error;
      return data?.payload || null;
    } catch (error) {
      await this.appendEvent({ type: 'persistence.mirror.read_failed', table: this.tables.morphs, error: error.message, at: new Date().toISOString() });
      return null;
    }
  }

  async saveAsset(buffer, { mimeType = 'application/octet-stream', kind = 'asset', ownerId = 'global', extension = null } = {}) {
    if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext = extension || ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[mimeType] || 'bin');
    const assetId = `${safeId(kind)}_${sha256.slice(0, 24)}`;
    const fileName = `${assetId}.${safeId(ext)}`;
    const dir = path.join(this.paths.assets, safeId(ownerId));
    ensureDir(dir);
    const filePath = path.join(dir, fileName);
    await fs.promises.writeFile(filePath, buffer);
    await this.registerEntity({
      entityId: assetId,
      entityType: 'asset',
      ownerId,
      status: 'accepted',
      capabilities: [kind],
      location: filePath,
      provenance: { sha256, mimeType, byteSize: buffer.length },
    });
    return { assetId, sha256, mimeType, byteSize: buffer.length, filePath, fileName, ownerId };
  }

  async findAsset(assetId) {
    const registry = await this._loadRegistry();
    const hit = registry.entities?.[assetId];
    if (!hit?.location) return null;
    try {
      await fs.promises.access(hit.location, fs.constants.R_OK);
      return hit;
    } catch {
      return null;
    }
  }

  async registerEntity(entity) {
    const registry = await this._loadRegistry();
    registry.entities = registry.entities || {};
    const now = new Date().toISOString();
    registry.entities[entity.entityId] = {
      registeredAt: registry.entities[entity.entityId]?.registeredAt || now,
      updatedAt: now,
      ...registry.entities[entity.entityId],
      ...entity,
    };
    await this.atomicWriteJson(this.paths.registry, registry);
    return registry.entities[entity.entityId];
  }

  async _loadRegistry() {
    return (await this.readJson(this.paths.registry)) || { version: 1, entities: {} };
  }

  async appendEvent(event) {
    ensureDir(path.dirname(this.paths.events));
    await fs.promises.appendFile(this.paths.events, `${JSON.stringify(event)}\n`, 'utf8');
  }

  async _mirror(table, row) {
    if (!this.supabase) return { mirrored: false, reason: 'supabase_unavailable' };
    try {
      const { error } = await this.supabase.from(table).upsert(row);
      if (error) throw error;
      return { mirrored: true };
    } catch (error) {
      await this.appendEvent({ type: 'persistence.mirror.write_failed', table, error: error.message, at: new Date().toISOString() });
      return { mirrored: false, reason: error.message };
    }
  }

  async _loadMirror(table, key, value) {
    if (!this.supabase) return null;
    try {
      const { data, error } = await this.supabase.from(table).select('payload').eq(key, value).maybeSingle();
      if (error) throw error;
      return data?.payload || null;
    } catch (error) {
      await this.appendEvent({ type: 'persistence.mirror.read_failed', table, error: error.message, at: new Date().toISOString() });
      return null;
    }
  }
}

module.exports = { PlayerStore, safeId };
