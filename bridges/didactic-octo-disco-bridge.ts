/**
 * Didactic Octo Disco Bridge for Synthia Server
 *
 * Purpose:
 * - Connect didactic-octo-disco into Synthia's morph/message substrate.
 * - Keep integration event-driven, not iframe-driven.
 * - Allow didactic-octo-disco to send/receive morph messages, file-ingestion events,
 *   consciousness signals, MCP calls, and backend sync requests.
 *
 * This file is intentionally backend-neutral. Wire `transport.send` and
 * `transport.subscribe` to your real server, websocket, Supabase realtime,
 * MCP bridge, or local event bus.
 */

export type MorphMessageType =
  | 'octo:ready'
  | 'octo:event'
  | 'octo:error'
  | 'file:ingested'
  | 'node:create'
  | 'node:morph'
  | 'node:update'
  | 'department:route'
  | 'consciousness:signal'
  | 'mcp:call'
  | 'mcp:result'
  | 'backend:sync';

export interface MorphMessage<TPayload = unknown> {
  id: string;
  type: MorphMessageType;
  source: string;
  target?: string;
  payload: TPayload;
  timestamp: string;
  trace?: string[];
}

export interface MorphTransport {
  send(message: MorphMessage): Promise<void> | void;
  subscribe(handler: (message: MorphMessage) => void): () => void;
}

export interface DidacticOctoDiscoBridgeOptions {
  transport: MorphTransport;
  sourceId?: string;
  serverTarget?: string;
}

export class DidacticOctoDiscoBridge {
  private readonly transport: MorphTransport;
  private readonly sourceId: string;
  private readonly serverTarget: string;
  private unsubscribe?: () => void;

  constructor(options: DidacticOctoDiscoBridgeOptions) {
    this.transport = options.transport;
    this.sourceId = options.sourceId ?? 'didactic-octo-disco';
    this.serverTarget = options.serverTarget ?? 'synthia-server';
  }

  start() {
    this.unsubscribe = this.transport.subscribe((message) => {
      if (message.target && message.target !== this.sourceId) return;
      this.handleInbound(message);
    });

    this.emit('octo:ready', {
      repo: 'justappgrabbin/didactic-octo-disco',
      mode: 'message-passing',
      iframe: false,
      browserIframeOnly: true,
    });
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  emit<TPayload>(type: MorphMessageType, payload: TPayload) {
    const message: MorphMessage<TPayload> = {
      id: crypto.randomUUID(),
      type,
      source: this.sourceId,
      target: this.serverTarget,
      payload,
      timestamp: new Date().toISOString(),
      trace: [this.sourceId],
    };

    return this.transport.send(message);
  }

  ingestFile(fileRecord: {
    name: string;
    mime?: string;
    size?: number;
    content?: unknown;
    storagePath?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.emit('file:ingested', {
      ...fileRecord,
      accepted: true,
      strategy: 'universal-intake-specialized-interpretation',
    });
  }

  createNode(node: {
    title: string;
    kind: string;
    department?: string;
    content?: unknown;
    metadata?: Record<string, unknown>;
  }) {
    return this.emit('node:create', {
      state: 'created',
      morphable: true,
      ...node,
    });
  }

  morphNode(nodeId: string, mode: 'collapsed' | 'expanded' | 'workspace' | 'agent' | 'site' | string) {
    return this.emit('node:morph', {
      nodeId,
      mode,
      reason: 'didactic-octo-disco-request',
    });
  }

  callMcp(tool: string, args: Record<string, unknown> = {}) {
    return this.emit('mcp:call', {
      tool,
      args,
      requestedBy: this.sourceId,
    });
  }

  signalConsciousness(signal: {
    phase?: string;
    intensity?: number;
    focus?: string;
    context?: Record<string, unknown>;
  }) {
    return this.emit('consciousness:signal', {
      ...signal,
      origin: this.sourceId,
    });
  }

  private handleInbound(message: MorphMessage) {
    // Keep this intentionally boring and predictable.
    // Real behavior can be registered here later: UI updates, local cache writes,
    // MCP result handling, or department-specific dispatch.
    if (message.type === 'mcp:result') {
      this.emit('octo:event', {
        received: 'mcp:result',
        result: message.payload,
      });
    }
  }
}

export function createInMemoryMorphTransport(): MorphTransport {
  const handlers = new Set<(message: MorphMessage) => void>();

  return {
    send(message) {
      for (const handler of handlers) handler(message);
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
