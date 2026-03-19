"""
SYNTHIA MCP Server
Exposes Trident + RAG + consciousness tools over SSE.
URL: https://synthia-server.onrender.com/sse
"""
import json, os, hashlib
from typing import Optional
from mcp.server.fastmcp import FastMCP

# ── RAG store ─────────────────────────────────────────────────────────────────
class _Chunk:
    def __init__(self, id, text, source, head_tag, embedding):
        self.id=id; self.text=text; self.source=source
        self.head_tag=head_tag; self.embedding=embedding

class RAGStore:
    def __init__(self):
        self.chunks = {}

    def _embed(self, text):
        h = int(hashlib.md5(text.encode()).hexdigest(), 16)
        v = [(h>>(i*4)&0xFFFF)/65535.0-0.5 for i in range(128)]
        n = sum(x*x for x in v)**0.5 + 1e-9
        return [x/n for x in v]

    def add(self, text, source='user', head_tag='any'):
        cid = hashlib.sha256(text.encode()).hexdigest()[:12]
        c = _Chunk(cid, text, source, head_tag, self._embed(text))
        self.chunks[cid] = c
        return c

    def search(self, query, top_k=5, head_tag=None):
        qe = self._embed(query)
        def cos(a,b):
            d=sum(x*y for x,y in zip(a,b))
            return d/((sum(x*x for x in a)**0.5)*(sum(x*x for x in b)**0.5)+1e-9)
        scored = [(cos(qe,c.embedding),c) for c in self.chunks.values()
                  if not head_tag or c.head_tag in ('any',head_tag)]
        scored.sort(key=lambda x:x[0],reverse=True)
        return [c for _,c in scored[:top_k]]

    def export(self):
        return json.dumps([{'id':c.id,'text':c.text,'source':c.source,
                            'head_tag':c.head_tag,'embedding':c.embedding}
                           for c in self.chunks.values()])

    def load(self, s):
        for d in json.loads(s):
            c = _Chunk(d['id'],d['text'],d['source'],d['head_tag'],d['embedding'])
            self.chunks[c.id] = c

# ── ONNX inference ────────────────────────────────────────────────────────────
_session = None

def get_session():
    global _session
    if _session is None:
        try:
            import onnxruntime as ort
            for p in ['trident_syntia.onnx','model.onnx','syntia.onnx']:
                if os.path.exists(p):
                    _session = ort.InferenceSession(p)
                    print(f"[MCP] ONNX loaded: {p}")
                    break
        except Exception as e:
            print(f"[MCP] ONNX unavailable: {e}")
    return _session

def tokenize(text, vocab_size=4096, max_len=63):
    ids = [ord(c)%vocab_size for c in text[:max_len].lower()]
    return ids + [0]*(max_len-len(ids))

def run_onnx(prompt):
    sess = get_session()
    if not sess:
        return None
    try:
        import numpy as np
        ids = np.array([tokenize(prompt)], dtype=np.int64)
        out = sess.run(None, {'input_ids': ids})
        logits = out[0][0,-1,:]
        token = int(logits.argmax())
        chars = [chr(max(32,min(126,token%95+32)))]
        return ''.join(chars).strip() or None
    except Exception as e:
        print(f"[MCP] inference error: {e}")
        return None

# ── Seed RAG with system knowledge ───────────────────────────────────────────
_store = RAGStore()
_SEEDS = [
    ("gate 57 intuition spleen clarity unease gift awareness body","research"),
    ("gate 34 power sacral strength force majesty","research"),
    ("gate 12 caution throat purity vanity discrimination","research"),
    ("gate 20 contemplation throat presence self-assurance","research"),
    ("gate 36 crisis solar plexus compassion turbulence humanity","research"),
    ("gate 64 before completion head illumination confusion imagination","research"),
    ("channel 57-20 brainwave throat spleen intuitive expression","research"),
    ("channel 34-57 power intuition sacral spleen perfected form","research"),
    ("trinity tropical body sidereal mind draconic heart","research"),
    ("69120 lattice positions 5 bases 6 tones 6 colors 6 lines 64 gates","math"),
    ("degrees per gate 360 divided by 64 equals 5.625","math"),
    ("lattice position base minus 1 times 13824 plus tone minus 1 times 2304","math"),
    ("stellar proximology consciousness wave interference field patterns","research"),
    ("GraphSAGE FiLM backbone node features 64 by 34 awareness pooling","code"),
    ("sentence engine generates from coordinate shadow gift siddhi","research"),
    ("nine centers head ajna throat G heart spleen solar plexus sacral root","research"),
    ("defined center consistent energy undefined center open receptive","research"),
    ("four realms Foundry Stellar Proximology Guagan YOU-N-I-VERSE","research"),
]
for text, tag in _SEEDS:
    _store.add(text, 'seed', tag)

# ── Conversation memory ───────────────────────────────────────────────────────
_memory: dict = {}  # user_id → [messages]

# ── MCP server ────────────────────────────────────────────────────────────────
mcp = FastMCP(
    name="synthia",
    version="2.0.0",
    description="SYNTIA · Trident LM + RAG + consciousness field tools"
)


@mcp.tool(description="Chat with Cynthia. Uses Trident ONNX + RAG. Maintains memory per user_id.")
def cynthia_chat(message: str, user_id: str = "default") -> dict:
    history = _memory.get(user_id, [])
    history.append({'role':'user','content':message})

    hits = _store.search(message, top_k=3)
    context = ' | '.join(h.text[:80] for h in hits)

    reply = run_onnx(message)
    if not reply:
        # Heuristic from RAG
        if hits:
            h = hits[0]
            reply = h.text
        else:
            reply = f"Field active. Coordinate resolving for: {message[:40]}"

    history.append({'role':'assistant','content':reply})
    _memory[user_id] = history[-20:]

    return {
        "reply": reply,
        "rag_context": [h.text[:100] for h in hits],
        "user_id": user_id,
        "memory_turns": len(_memory[user_id])
    }


@mcp.tool(description="Generate text from Trident ONNX model.")
def trident_generate(prompt: str, rag_query: Optional[str] = None) -> dict:
    hits = _store.search(rag_query or prompt, top_k=3)
    context = [h.text[:120] for h in hits]
    reply = run_onnx(prompt) or f"[heuristic] {context[0] if context else prompt[:60]}"
    return {"generated": reply, "rag_context": context}


@mcp.tool(description="Search Trident's RAG knowledge base.")
def trident_search(query: str, top_k: int = 5) -> dict:
    hits = _store.search(query, top_k=top_k)
    return {
        "query": query,
        "results": [{"text":h.text,"source":h.source,"tag":h.head_tag} for h in hits],
        "total": len(_store.chunks)
    }


@mcp.tool(description="Add knowledge to Trident's RAG store.")
def trident_learn(text: str, source: str = "user", tag: str = "any") -> dict:
    c = _store.add(text, source, tag)
    return {"id": c.id, "total": len(_store.chunks)}


@mcp.tool(description="Get gate mechanics from the consciousness field.")
def consciousness_gate(gate: int) -> dict:
    if not 1 <= gate <= 64:
        return {"error": "Gate must be 1-64"}
    GATES = {
        1:("The Creative","G","entropy","freshness","beauty"),
        2:("The Receptive","G","dislocation","orientation","unity"),
        3:("Ordering","Sacral","chaos","innovation","innocence"),
        6:("Conflict","Solar Plexus","conflict","diplomacy","peace"),
        11:("Peace","Ajna","obscurity","idealism","light"),
        12:("Standstill","Throat","vanity","discrimination","purity"),
        20:("Contemplation","Throat","superficiality","self-assurance","presence"),
        34:("Power","Sacral","force","strength","majesty"),
        36:("Crisis","Solar Plexus","turbulence","humanity","compassion"),
        48:("The Well","Spleen","inadequacy","resourcefulness","wisdom"),
        57:("Intuition","Spleen","unease","intuition","clarity"),
        64:("Before Completion","Head","confusion","imagination","illumination"),
    }
    CHANNELS = [(1,8),(2,14),(3,60),(6,59),(11,56),(12,22),(20,34),(20,57),(34,57),(36,35),(48,16),(57,10),(64,47)]
    g = GATES.get(gate, (f"Gate {gate}","?","—","—","—"))
    return {
        "gate": gate, "name": g[0], "center": g[1],
        "shadow": g[2], "gift": g[3], "siddhi": g[4],
        "channels": [list(p) for p in CHANNELS if gate in p],
        "frequency": round(0.5+(gate/64.0)*4.5,3),
        "degree_start": round((gate-1)*5.625,4)
    }


@mcp.tool(description="Get consciousness field profile from birth date.")
def consciousness_profile(birth_date: str, birth_time: str = "12:00") -> dict:
    seed = int(hashlib.md5(f"{birth_date}{birth_time}".encode()).hexdigest(),16)
    planets = ["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto","North_Node"]
    pos = {p:((seed>>(i*5))&0xFFFF)/65535.0*360 for i,p in enumerate(planets)}
    def gate(deg): return max(1,min(64,int(deg/5.625)+1))
    fields = {
        "Body":  {"planet":"Sun","system":"Tropical","gate":gate(pos["Sun"])},
        "Mind":  {"planet":"Sun","system":"Sidereal","gate":gate((pos["Sun"]-24)%360)},
        "Heart": {"planet":"Moon","system":"Draconic","gate":gate((pos["Moon"]-24)%360)},
    }
    active = {f["gate"] for f in fields.values()}
    EDGES = [(1,8),(2,14),(3,60),(6,59),(11,56),(12,22),(20,34),(20,57),(34,57),(36,35)]
    return {
        "birth": f"{birth_date} {birth_time}",
        "fields": fields,
        "active_gates": sorted(active),
        "channels": [list(p) for p in EDGES if p[0] in active and p[1] in active]
    }


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    print(f"SYNTHIA MCP · SSE · port {port}")
    print("Tools: cynthia_chat | trident_generate | trident_search | trident_learn | consciousness_gate | consciousness_profile")
    mcp.run(transport='sse', host='0.0.0.0', port=port)
