/**
 * TRIDENT RAG Client — Browser P2P
 * Runs in any browser tab on phone, iPad, laptop.
 * Connects to peers via WebRTC DataChannel.
 * Signaling: minimal WebSocket handshake only.
 */

const TRIDENT_P2P = (() => {

  // ── Config ──
  const SIGNAL_URL = 'ws://localhost:8765';   // your signaling server
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
  const RAG_CHANNEL = 'rag';

  // ── State ──
  let deviceId   = localStorage.getItem('trident_device_id');
  if (!deviceId) { deviceId = 'dev_' + Math.random().toString(36).slice(2,10); localStorage.setItem('trident_device_id', deviceId); }

  let signalWs   = null;
  const peers    = {};     // peerId → RTCPeerConnection
  const channels = {};     // peerId → RTCDataChannel
  const pendingQ = {};     // queryId → { resolve, chunks, timer }

  // ── Local Chunk Store ──
  const store = {
    chunks: JSON.parse(localStorage.getItem('trident_chunks') || '[]'),

    save() { localStorage.setItem('trident_chunks', JSON.stringify(this.chunks)); },

    add(text, source = deviceId, headTag = 'any') {
      const id    = btoa(text.slice(0, 16)).replace(/=/g,'').slice(0,12);
      const embed = this._embed(text);
      const chunk = { id, text, source, headTag, embedding: embed, created: Date.now() };
      this.chunks.push(chunk);
      this.save();
      return chunk;
    },

    _embed(text) {
      // Deterministic pseudo-embed (128-dim).
      // Replace with ONNX sentence-transformer for real semantic search.
      const arr = new Float32Array(128);
      for (let i = 0; i < text.length && i < 128; i++) {
        const c = text.charCodeAt(i);
        arr[i % 128] += (c / 128.0) - 0.5;
      }
      // Normalize
      let norm = 0;
      for (let v of arr) norm += v * v;
      norm = Math.sqrt(norm) || 1;
      return Array.from(arr.map(v => v / norm));
    },

    cosineSim(a, b) {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
      return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
    },

    search(queryEmbed, topK = 3, headTag = null) {
      const scored = this.chunks
        .filter(c => !headTag || c.headTag === 'any' || c.headTag === headTag)
        .map(c => ({ sim: this.cosineSim(queryEmbed, c.embedding), chunk: c }))
        .sort((a, b) => b.sim - a.sim);
      return scored.slice(0, topK).map(s => s.chunk);
    }
  };

  // ── Signaling ──
  function connectSignaling(onReady) {
    signalWs = new WebSocket(SIGNAL_URL);

    signalWs.onopen = () => {
      signalWs.send(JSON.stringify({ type: 'register', deviceId }));
      console.log('[TRIDENT P2P] Registered as', deviceId);
      if (onReady) onReady(deviceId);
    };

    signalWs.onmessage = async (evt) => {
      const msg = JSON.parse(evt.data);

      if (msg.type === 'offer' && msg.to === deviceId) {
        await handleOffer(msg.from, msg.sdp);
      } else if (msg.type === 'answer' && msg.to === deviceId) {
        const pc = peers[msg.from];
        if (pc) await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
      } else if (msg.type === 'ice' && msg.to === deviceId) {
        const pc = peers[msg.from];
        if (pc && msg.candidate) await pc.addIceCandidate(msg.candidate);
      } else if (msg.type === 'peers') {
        // Server sent list of available peers — connect to them
        for (const pid of (msg.list || [])) {
          if (pid !== deviceId && !peers[pid]) await initiateConnection(pid);
        }
      }
    };

    signalWs.onerror = e => console.warn('[TRIDENT P2P] Signal error', e);
    signalWs.onclose = () => setTimeout(() => connectSignaling(), 3000);
  }

  async function initiateConnection(peerId) {
    const pc      = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const channel = pc.createDataChannel(RAG_CHANNEL);
    peers[peerId] = pc;

    setupChannel(peerId, channel);
    setupICE(pc, peerId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signalWs?.send(JSON.stringify({ type: 'offer', from: deviceId, to: peerId, sdp: offer.sdp }));
  }

  async function handleOffer(peerId, sdp) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers[peerId] = pc;

    pc.ondatachannel = e => {
      if (e.channel.label === RAG_CHANNEL) setupChannel(peerId, e.channel);
    };
    setupICE(pc, peerId);

    await pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    signalWs?.send(JSON.stringify({ type: 'answer', from: deviceId, to: peerId, sdp: answer.sdp }));
  }

  function setupICE(pc, peerId) {
    pc.onicecandidate = e => {
      if (e.candidate) signalWs?.send(JSON.stringify({ type: 'ice', from: deviceId, to: peerId, candidate: e.candidate }));
    };
    pc.onconnectionstatechange = () => {
      if (['disconnected','failed','closed'].includes(pc.connectionState)) {
        delete peers[peerId]; delete channels[peerId];
      }
    };
  }

  function setupChannel(peerId, channel) {
    channels[peerId] = channel;
    channel.onmessage = e => handleDataMessage(peerId, JSON.parse(e.data));
    channel.onopen    = () => console.log('[TRIDENT P2P] DataChannel open →', peerId);
  }

  function handleDataMessage(peerId, msg) {
    if (msg.type === 'rag_query') {
      // Peer wants our chunks
      const hits = store.search(msg.embedding, msg.topK || 3, msg.headTag);
      if (hits.length && channels[peerId]?.readyState === 'open') {
        channels[peerId].send(JSON.stringify({
          type: 'rag_results', queryId: msg.queryId,
          chunks: hits, from: deviceId
        }));
      }
    } else if (msg.type === 'rag_results') {
      const pending = pendingQ[msg.queryId];
      if (pending) pending.chunks.push(...(msg.chunks || []));
    } else if (msg.type === 'ping') {
      channels[peerId]?.send(JSON.stringify({ type: 'pong', from: deviceId }));
    }
  }

  // ── Query ──
  async function queryPeers(queryText, { headTag = null, topK = 3, timeoutMs = 300 } = {}) {
    const queryId   = Math.random().toString(36).slice(2);
    const queryEmb  = store._embed(queryText);
    const localHits = store.search(queryEmb, topK, headTag);

    const openChannels = Object.values(channels).filter(c => c.readyState === 'open');

    if (!openChannels.length) return localHits;

    return new Promise(resolve => {
      pendingQ[queryId] = { chunks: [], resolve };

      const msg = JSON.stringify({ type: 'rag_query', queryId, embedding: queryEmb, headTag, topK, from: deviceId });
      openChannels.forEach(ch => { try { ch.send(msg); } catch(e) {} });

      setTimeout(() => {
        const peer = pendingQ[queryId]?.chunks || [];
        delete pendingQ[queryId];

        // Merge + rank
        const all = [...localHits, ...peer];
        const seen = new Set();
        const ranked = all
          .map(c => ({ sim: store.cosineSim(queryEmb, c.embedding), c }))
          .sort((a, b) => b.sim - a.sim)
          .filter(({ c }) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; })
          .slice(0, topK)
          .map(({ c }) => c);

        resolve(ranked);
      }, timeoutMs);
    });
  }

  // ── Public API ──
  return {
    deviceId,
    store,
    connect: connectSignaling,
    query:   queryPeers,
    peers:   () => Object.keys(peers),

    // Convenience: add knowledge from the browser
    addChunk: (text, headTag = 'any') => store.add(text, deviceId, headTag),

    // Status
    status: () => ({
      deviceId,
      localChunks: store.chunks.length,
      connectedPeers: Object.keys(channels).filter(id => channels[id].readyState === 'open')
    })
  };
})();

// Export for module usage
if (typeof module !== 'undefined') module.exports = TRIDENT_P2P;
