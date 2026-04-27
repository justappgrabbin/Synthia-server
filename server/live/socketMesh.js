const { Server: SocketIOServer } = require('socket.io');

function attachSocketMesh(httpServer, { tridentBridge, primarySupabase } = {}) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || process.env.CORS_ORIGIN || '*',
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  const clients = new Map();

  function statusPayload(extra = {}) {
    return {
      ok: true,
      service: 'synthia-os-live-mesh',
      trident_ready: Boolean(tridentBridge && tridentBridge.ready),
      database: primarySupabase ? 'connected' : 'degraded',
      connected_clients: clients.size,
      p2p_rag: 'preserved',
      timestamp: new Date().toISOString(),
      ...extra
    };
  }

  io.on('connection', (socket) => {
    const client = {
      id: socket.id,
      hexagramAddress: null,
      role: 'unknown',
      connectedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString()
    };

    clients.set(socket.id, client);

    socket.emit('synthia:status', statusPayload({ socket_id: socket.id }));
    io.emit('mesh:clients', Array.from(clients.values()));

    socket.on('register', (payload = {}) => {
      const existing = clients.get(socket.id) || client;
      const updated = {
        ...existing,
        role: payload.role || existing.role,
        hexagramAddress: payload.hexagramAddress || payload.address || existing.hexagramAddress,
        deviceId: payload.deviceId || existing.deviceId,
        registeredAt: new Date().toISOString()
      };
      clients.set(socket.id, updated);
      socket.emit('registered', updated);
      io.emit('mesh:clients', Array.from(clients.values()));
    });

    socket.on('heartbeat', () => {
      const existing = clients.get(socket.id) || client;
      existing.lastHeartbeat = new Date().toISOString();
      clients.set(socket.id, existing);
      socket.emit('heartbeat:ack', existing);
    });

    socket.on('trident:status', () => {
      socket.emit('trident:status', statusPayload());
    });

    socket.on('intent', async (payload = {}) => {
      try {
        if (!payload.intent) {
          return socket.emit('error', { error: 'intent required' });
        }
        const result = await tridentBridge.analyzeIntent(payload.intent, payload.context || {});
        socket.emit('intent:result', { result, timestamp: new Date().toISOString() });
      } catch (error) {
        socket.emit('error', { error: error.message });
      }
    });

    socket.on('drop', async (payload = {}) => {
      try {
        if (!payload.filename || !payload.content) {
          return socket.emit('error', { error: 'filename and content required' });
        }
        const result = await tridentBridge.analyzeCode(payload.filename, payload.content, payload.ast || {});
        socket.emit('drop:result', { result, timestamp: new Date().toISOString() });
      } catch (error) {
        socket.emit('error', { error: error.message });
      }
    });

    socket.on('admin:broadcast', (payload = {}) => {
      io.emit('admin:broadcast', {
        ...payload,
        from: socket.id,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('mesh:broadcast', (payload = {}) => {
      socket.broadcast.emit('mesh:broadcast', {
        ...payload,
        from: socket.id,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('disconnect', () => {
      clients.delete(socket.id);
      io.emit('mesh:clients', Array.from(clients.values()));
    });
  });

  return { io, clients, status: () => statusPayload() };
}

module.exports = attachSocketMesh;
