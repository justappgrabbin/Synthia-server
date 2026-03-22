"""
TRIDENT RAG — P2P Retrieval over WebRTC
Each device holds chunks of the shared knowledge base.
Query flows: local embed → broadcast to peers → collect top-K → fuse into model.

P2P Signaling: minimal — only for initial handshake (WebSocket).
After handshake: pure WebRTC data channels, no server.
"""

import json, hashlib, time
from dataclasses import dataclass, asdict, field
from typing import List, Optional, Dict


# ─────────────────────────────────────────
#  CHUNK — unit of knowledge
# ─────────────────────────────────────────

@dataclass
class Chunk:
    id:       str
    text:     str
    source:   str          # filename, url, or device id
    head_tag: str          # 'code' | 'math' | 'research' | 'any'
    embedding: List[float] = field(default_factory=list)
    created:  float = field(default_factory=time.time)

    @classmethod
    def from_text(cls, text, source='local', head_tag='any'):
        cid = hashlib.sha256(text.encode()).hexdigest()[:12]
        return cls(id=cid, text=text, source=source, head_tag=head_tag)

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, d):
        return cls(**d)


# ─────────────────────────────────────────
#  LOCAL CHUNK STORE
# ─────────────────────────────────────────

class ChunkStore:
    """Holds this device's portion of the knowledge base."""

    def __init__(self, embed_fn=None):
        self.chunks: Dict[str, Chunk] = {}
        self.embed_fn = embed_fn or self._dummy_embed   # plug in real encoder

    def _dummy_embed(self, text: str) -> List[float]:
        """Placeholder — replace with sentence-transformers or ONNX encoder."""
        import hashlib
        h = int(hashlib.md5(text.encode()).hexdigest(), 16)
        return [(h >> i & 0xff) / 255.0 - 0.5 for i in range(128)]

    def add(self, text: str, source='local', head_tag='any') -> Chunk:
        chunk = Chunk.from_text(text, source, head_tag)
        chunk.embedding = self.embed_fn(text)
        self.chunks[chunk.id] = chunk
        return chunk

    def add_bulk(self, texts: List[str], **kwargs) -> List[Chunk]:
        return [self.add(t, **kwargs) for t in texts]

    def search(self, query_embedding: List[float], top_k=3, head_tag=None) -> List[Chunk]:
        """Cosine similarity search over local chunks."""
        import numpy as np
        q = np.array(query_embedding)
        results = []
        for chunk in self.chunks.values():
            if head_tag and chunk.head_tag not in ('any', head_tag):
                continue
            e = np.array(chunk.embedding)
            sim = float(np.dot(q, e) / (np.linalg.norm(q) * np.linalg.norm(e) + 1e-9))
            results.append((sim, chunk))
        results.sort(key=lambda x: x[0], reverse=True)
        return [c for _, c in results[:top_k]]

    def export_json(self) -> str:
        return json.dumps([c.to_dict() for c in self.chunks.values()], indent=2)

    def import_json(self, raw: str):
        for d in json.loads(raw):
            c = Chunk.from_dict(d)
            self.chunks[c.id] = c


# ─────────────────────────────────────────
#  P2P MESSAGE PROTOCOL
# ─────────────────────────────────────────

class MsgType:
    QUERY    = 'rag_query'     # broadcast: "who has chunks for this query?"
    RESULTS  = 'rag_results'   # response: "here are my top-K chunks"
    SYNC     = 'sync_chunks'   # share chunk list (ids + metadata, no embeddings)
    PING     = 'ping'
    PONG     = 'pong'

def make_msg(type_, **payload):
    return json.dumps({'type': type_, 'ts': time.time(), **payload})

def parse_msg(raw: str) -> dict:
    return json.loads(raw)


# ─────────────────────────────────────────
#  P2P RAG NODE (Python side — asyncio)
# ─────────────────────────────────────────

class P2PRagNode:
    """
    Manages WebRTC connections to peer devices.
    Uses aiortc for Python. Browser side uses native WebRTC API (see rag_client.js).

    Signaling server (minimal):  ws://localhost:8765
    After handshake:             pure DataChannel, no server involved
    """

    def __init__(self, store: ChunkStore, device_id: str = None):
        self.store     = store
        self.device_id = device_id or hashlib.sha256(str(time.time()).encode()).hexdigest()[:8]
        self.peers: Dict[str, object] = {}   # peer_id → RTCPeerConnection
        self.channels: Dict[str, object] = {}  # peer_id → RTCDataChannel
        self._pending_queries: Dict[str, list] = {}  # query_id → collected results

    async def connect_peer(self, peer_id: str, signaling_ws):
        """Initiate WebRTC connection via signaling server."""
        try:
            from aiortc import RTCPeerConnection, RTCSessionDescription
            pc      = RTCPeerConnection()
            channel = pc.createDataChannel('rag')
            self.peers[peer_id]   = pc
            self.channels[peer_id] = channel

            channel.on('message', lambda msg: self._handle_message(peer_id, msg))

            offer = await pc.createOffer()
            await pc.setLocalDescription(offer)

            await signaling_ws.send(json.dumps({
                'type': 'offer', 'from': self.device_id, 'to': peer_id,
                'sdp': pc.localDescription.sdp
            }))

            answer_raw = await signaling_ws.recv()
            answer     = json.loads(answer_raw)
            await pc.setRemoteDescription(RTCSessionDescription(sdp=answer['sdp'], type='answer'))

        except ImportError:
            print("[P2P] aiortc not installed — run: pip install aiortc")

    async def query_peers(self, query_text: str, head_tag: str = None, top_k: int = 3) -> List[Chunk]:
        """Broadcast RAG query to all peers, collect and rank results."""
        import asyncio, numpy as np

        qid        = hashlib.sha256(f"{query_text}{time.time()}".encode()).hexdigest()[:8]
        query_emb  = self.store.embed_fn(query_text)
        local_hits = self.store.search(query_emb, top_k=top_k, head_tag=head_tag)

        if not self.channels:
            return local_hits  # offline / no peers

        # Broadcast query
        msg = make_msg(MsgType.QUERY, query_id=qid, embedding=query_emb,
                       head_tag=head_tag, top_k=top_k, from_=self.device_id)
        for ch in self.channels.values():
            try:
                ch.send(msg)
            except Exception:
                pass

        # Wait for responses (200ms timeout)
        self._pending_queries[qid] = []
        await asyncio.sleep(0.2)
        peer_chunks = self._pending_queries.pop(qid, [])

        # Merge + re-rank all results
        all_chunks = local_hits + peer_chunks
        q = np.array(query_emb)
        scored = []
        for chunk in all_chunks:
            e   = np.array(chunk.embedding)
            sim = float(np.dot(q, e) / (np.linalg.norm(q) * np.linalg.norm(e) + 1e-9))
            scored.append((sim, chunk))
        scored.sort(key=lambda x: x[0], reverse=True)

        # Deduplicate by id
        seen, out = set(), []
        for _, c in scored:
            if c.id not in seen:
                seen.add(c.id); out.append(c)
            if len(out) >= top_k:
                break
        return out

    def _handle_message(self, peer_id: str, raw: str):
        msg = parse_msg(raw)
        t   = msg.get('type')

        if t == MsgType.QUERY:
            # Peer is asking for relevant chunks
            qid     = msg['query_id']
            emb     = msg['embedding']
            tag     = msg.get('head_tag')
            k       = msg.get('top_k', 3)
            hits    = self.store.search(emb, top_k=k, head_tag=tag)
            channel = self.channels.get(peer_id)
            if channel and hits:
                resp = make_msg(MsgType.RESULTS, query_id=qid,
                                chunks=[c.to_dict() for c in hits],
                                from_=self.device_id)
                channel.send(resp)

        elif t == MsgType.RESULTS:
            qid    = msg['query_id']
            chunks = [Chunk.from_dict(d) for d in msg.get('chunks', [])]
            if qid in self._pending_queries:
                self._pending_queries[qid].extend(chunks)

        elif t == MsgType.PING:
            ch = self.channels.get(peer_id)
            if ch: ch.send(make_msg(MsgType.PONG, from_=self.device_id))


# ─────────────────────────────────────────
#  QUICK DEMO
# ─────────────────────────────────────────

if __name__ == '__main__':
    store = ChunkStore()

    store.add("def fibonacci(n): return n if n<2 else fibonacci(n-1)+fibonacci(n-2)", source='demo', head_tag='code')
    store.add("The integral of x^2 dx = x^3/3 + C", source='demo', head_tag='math')
    store.add("Transformers use self-attention to model long-range dependencies", source='demo', head_tag='research')
    store.add("Python list comprehension: [x*2 for x in range(10)]", source='demo', head_tag='code')
    store.add("E = mc^2 — mass-energy equivalence", source='demo', head_tag='math')

    print(f"Store: {len(store.chunks)} chunks")

    query = "how to write a recursive function"
    q_emb = store.embed_fn(query)
    hits  = store.search(q_emb, top_k=2, head_tag='code')

    print(f"\nQuery: '{query}'")
    for h in hits:
        print(f"  [{h.head_tag}] {h.text[:60]}...")
