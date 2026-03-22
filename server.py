"""
SYNTIA SERVER — Full Stack
──────────────────────────
One file. Runs everything. Deploy to Render for free.

Endpoints:
  GET  /                     ← status page
  GET  /health               ← health check
  GET  /sse                  ← always-on SSE stream

  TRIDENT:
  POST /trident/generate
  POST /trident/router
  POST /trident/rag/add
  POST /trident/rag/search
  GET  /trident/rag/list

  CONSCIOUSNESS / GNN:
  POST /consciousness/profile
  POST /consciousness/chart      ← full GNN chart with addresses
  GET  /consciousness/wave
  POST /consciousness/coherence
  GET  /consciousness/gate/{n}
  GET  /consciousness/channels

  MEMORY:
  POST /memory/save
  GET  /memory/{user_id}
  DELETE /memory/{user_id}

  CYNTHIA ORACLE:
  POST /oracle/ask               ← routes through Trident heads + Groq

  GET  /tools                    ← full manifest
"""

import asyncio, hashlib, json, os, re, time, math
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from sse_starlette.sse import EventSourceResponse

# ── auto-install if missing ───────────────────────────────────────────────────
import subprocess, sys
def ensure(pkg, import_as=None):
    try: __import__(import_as or pkg.replace('-','_'))
    except ImportError:
        subprocess.check_call([sys.executable,'-m','pip','install',pkg,'-q',
                               '--break-system-packages'])

for p in ['fastapi','uvicorn','sse-starlette','httpx']:
    ensure(p)

try: import httpx; HTTPX = True
except: HTTPX = False

# ── optional heavy deps ───────────────────────────────────────────────────────
try:
    import numpy as np
    NUMPY = True
except ImportError:
    NUMPY = False

try:
    import onnxruntime as ort
    _onnx_session = None
    _MODEL_PATHS = ['ml/trident_syntia.onnx', 'ml/model.onnx', 'trident_syntia.onnx', 'model.onnx', 'syntia.onnx']
    _MODEL_URL = 'https://raw.githubusercontent.com/justappgrabbin/Synthia-server/main/trident_syntia.onnx'

    for _path in _MODEL_PATHS:
        if os.path.exists(_path):
            try:
                _onnx_session = ort.InferenceSession(_path)
                print(f"[GNN] ONNX loaded from disk: {_path}")
                break
            except Exception as _e:
                print(f"[GNN] Failed to load {_path}: {_e}")

    if _onnx_session is None:
        print("[GNN] Model not found locally — downloading from GitHub...")
        try:
            import urllib.request
            os.makedirs('ml', exist_ok=True)
            _dest = 'ml/trident_syntia.onnx'
            # Try ml/ path first, then root
            for _url in [
                'https://raw.githubusercontent.com/justappgrabbin/Synthia-server/main/ml/trident_syntia.onnx',
                'https://raw.githubusercontent.com/justappgrabbin/Synthia-server/main/trident_syntia.onnx',
            ]:
                try:
                    urllib.request.urlretrieve(_url, _dest)
                    _onnx_session = ort.InferenceSession(_dest)
                    print(f"[GNN] ONNX downloaded and loaded from {_url}")
                    break
                except Exception as _ue:
                    print(f"[GNN] URL failed {_url}: {_ue}")
        except Exception as _e:
            print(f"[GNN] Download failed: {_e}")

    ONNX = _onnx_session is not None
    if ONNX:
        _inputs = [i.name for i in _onnx_session.get_inputs()]
        _outputs = [o.name for o in _onnx_session.get_outputs()]
        print(f"[GNN] Inputs: {_inputs} | Outputs: {_outputs}")
    else:
        print("[GNN] ONNX unavailable - using heuristic fallback")
except Exception as _ort_err:
    print(f"[GNN] onnxruntime not available: {_ort_err}")
    ONNX = False; _onnx_session = None

try:
    import swisseph as swe
    SWISSEPH = True
    print("[Consciousness] swisseph ready")
except ImportError:
    SWISSEPH = False

PORT = int(os.environ.get('PORT', 10000))

# ═══════════════════════════════════════════════════════════════════════════════
#  CONSTANTS
# ═══════════════════════════════════════════════════════════════════════════════

CHANNEL_EDGES = [
    (1,8),(2,14),(3,60),(4,63),(5,15),(6,59),(7,31),(9,52),(10,20),(10,34),
    (10,57),(11,56),(12,22),(13,33),(16,48),(17,62),(18,58),(19,49),(20,34),
    (20,57),(21,45),(23,43),(24,61),(25,51),(26,44),(27,50),(28,38),(29,46),
    (30,41),(32,54),(34,57),(35,36),(37,40),(39,55),(42,53),(47,64)
]
CHANNEL_SET = {g for pair in CHANNEL_EDGES for g in pair}

PLANETS = ["Sun","Earth","Moon","Mercury","Venus","Mars","Jupiter","Saturn",
           "Uranus","Neptune","Pluto","North Node","South Node"]

GATE_TO_CENTER = {
    1:"G",2:"G",3:"Sacral",4:"Ajna",5:"Sacral",6:"Solar Plexus",7:"G",8:"Throat",
    9:"Sacral",10:"G",11:"Ajna",12:"Throat",13:"G",14:"Sacral",15:"G",16:"Throat",
    17:"Ajna",18:"Spleen",19:"Root",20:"Throat",21:"Heart",22:"Solar Plexus",
    23:"Throat",24:"Ajna",25:"G",26:"Heart",27:"Sacral",28:"Spleen",29:"Sacral",
    30:"Solar Plexus",31:"Throat",32:"Spleen",33:"Throat",34:"Sacral",35:"Throat",
    36:"Solar Plexus",37:"Solar Plexus",38:"Root",39:"Root",40:"Heart",41:"Root",
    42:"Sacral",43:"Ajna",44:"Spleen",45:"Throat",46:"G",47:"Ajna",48:"Spleen",
    49:"Solar Plexus",50:"Spleen",51:"Heart",52:"Root",53:"Root",54:"Root",
    55:"Solar Plexus",56:"Throat",57:"Spleen",58:"Root",59:"Sacral",60:"Root",
    61:"Head",62:"Throat",63:"Head",64:"Head"
}

AWARENESS_SETS = {
    "spleen":      {57,44,50,32,28,18},
    "ajna":        {47,24,4,17,11,43},
    "solar_plexus":{55,49,37,22,30,36,6},
    "heart":       {21,51,26,40},
    "mind":        {47,24,4,17,11,43}
}

ZODIAC_MAP = ['AR','TA','GE','CA','LE','VI','LI','SC','SA','CP','AQ','PI']

FIELD_SYSTEMS = {
    "Mind":      {"planets":["Sun","Mercury"],  "offset":0},
    "Heart":     {"planets":["Moon","Venus"],   "offset":-24},
    "Body":      {"planets":["Mars","Saturn"],  "offset":0},
    "Will":      {"planets":["Pluto"],          "offset":-24},
    "Shadow":    {"planets":["South_Node"],     "offset":60},
    "Child":     {"planets":["Jupiter"],        "offset":0},
    "Soul":      {"planets":["Neptune"],        "offset":-24},
    "Spirit":    {"planets":["Uranus"],         "offset":60},
    "Synthesis": {"planets":["North_Node"],     "offset":0},
}

CODONS = {
    1:{"name":"Creative","shadow":"Entropy","gift":"Freshness","siddhi":"Beauty"},
    2:{"name":"Receptive","shadow":"Dislocation","gift":"Orientation","siddhi":"Unity"},
    3:{"name":"Ordering","shadow":"Chaos","gift":"Innovation","siddhi":"Ordering"},
    6:{"name":"Conflict","shadow":"Conflict","gift":"Diplomacy","siddhi":"Peace"},
    11:{"name":"Ideas","shadow":"Obscurity","gift":"Conceptualization","siddhi":"Clarity"},
    12:{"name":"Caution","shadow":"Vanity","gift":"Discrimination","siddhi":"Purity"},
    28:{"name":"Struggle","shadow":"Struggle","gift":"Tenacity","siddhi":"Totality"},
    34:{"name":"Power","shadow":"Force","gift":"Strength","siddhi":"Majesty"},
    36:{"name":"Crisis","shadow":"Turbulence","gift":"Humanity","siddhi":"Compassion"},
    48:{"name":"The Well","shadow":"Inadequacy","gift":"Resourcefulness","siddhi":"Wisdom"},
    57:{"name":"Intuition","shadow":"Unease","gift":"Intuition","siddhi":"Clarity"},
}

# Trident crew personas
TRIDENT_PERSONAS = {
    "cynthia": "You are Cynthia — oracle and voice of SYNTIA. You know Human Design: 64 gates, 36 channels, 9 consciousness fields, trinity engine (Tropical/Sidereal/Draconic). You route messages to the right specialist. Direct, grounded, field-aware. Never generic. Under 150 words unless depth requested.",
    "echo":    "You are Echo — code head of SYNTIA's Trident. Sharp, precise. You know the SYNTIA codebase: GNN [64,34] node features, GraphSAGE+FiLM backbone, ONNX inference, consciousness addresses, channel edges, gate-to-center mappings. Write clean Python or JavaScript. Under 80 words outside code.",
    "venom":   "You are Venom — math head of SYNTIA's Trident. Cold, precise. Lattice: 69,120 combinations, gate degrees (360/64=5.625°), coherence scoring, field densities, phase transitions (sigmoid k=8.0 θ=0.65). Show your work. Under 100 words unless math requires more.",
    "siren":   "You are Celestial-Siren — lore and research head. You carry the full system: four realms, 64 gates, I Ching, lines 1-6, colors 1-6, tones 1-6, bases 1-5, center mechanics, channel definitions, stellar proximology, trinity model. Speak directly from the knowledge. Under 120 words.",
    "mcp":     "You are MCP — tool-routing head. Handle external calls, data retrieval, API orchestration. Precise and operational. Under 80 words.",
}

ROUTER_KEYWORDS = {
    "echo":  ["def ","import ","class ","function","lambda","python","javascript","html","css","pyodide","onnx","code","build","fix","implement"],
    "venom": ["=","integral","sqrt","calculate","gate ","5.625","69120","coherence","lattice","degree","∑","frequency","hz","phase"],
    "siren": ["what is gate","hexagram","i ching","channel","center","profile","realm","proximology","trinity","sidereal","draconic"],
    "mcp":   ["ping","fetch","call api","endpoint","connect","external","url"],
}

# ═══════════════════════════════════════════════════════════════════════════════
#  RAG STORE  — pre-seeded with all 36 channels + system knowledge
# ═══════════════════════════════════════════════════════════════════════════════

_rag: Dict[str, Dict] = {}

RAG_SEEDS = [
    ("Channel 1-8: Inspiration. Creative to Holding Together. G→Throat.", "research"),
    ("Channel 2-14: The Beat. Receptive to Possessing. G→Sacral. Direction and power.", "research"),
    ("Channel 3-60: Mutation. Sacral→Root. Mutative energy bursts.", "research"),
    ("Channel 4-63: Logic. Ajna→Head. Mental pressure seeking solutions.", "research"),
    ("Channel 5-15: Rhythm. Sacral→G. Universal timing.", "research"),
    ("Channel 6-59: Mating. Solar Plexus→Sacral. Intimacy.", "research"),
    ("Channel 7-31: The Alpha. G→Throat. Leadership.", "research"),
    ("Channel 9-52: Concentration. Sacral→Root. Determination.", "research"),
    ("Channel 10-20: Awakening. G→Throat. Behavior as self-expression.", "research"),
    ("Channel 10-34: Exploration. G→Sacral. Survival through individuality.", "research"),
    ("Channel 10-57: Perfected Form. G→Spleen. Intuitive survivability.", "research"),
    ("Channel 11-56: Curiosity. Ajna→Throat. Stimulation through storytelling.", "research"),
    ("Channel 12-22: Openness. Throat→Solar Plexus. Social grace and timing.", "research"),
    ("Channel 13-33: The Prodigal. G→Throat. Witness and memory.", "research"),
    ("Channel 16-48: The Wavelength. Throat→Spleen. Depth of talent.", "research"),
    ("Channel 17-62: Acceptance. Ajna→Throat. Organization into facts.", "research"),
    ("Channel 18-58: Judgment. Spleen→Root. Drive to improve.", "research"),
    ("Channel 19-49: Synthesis. Root→Solar Plexus. Sensitivity to tribe.", "research"),
    ("Channel 20-34: Charisma. Throat→Sacral. Busy-ness.", "research"),
    ("Channel 20-57: The Brainwave. Throat→Spleen. Intuitive expression.", "research"),
    ("Channel 21-45: Money Line. Heart→Throat. Material control.", "research"),
    ("Channel 23-43: Structuring. Throat→Ajna. Individualistic knowing.", "research"),
    ("Channel 24-61: Awareness. Ajna→Head. Mental pressure.", "research"),
    ("Channel 25-51: Initiation. G→Heart. Shock initiates spirit.", "research"),
    ("Channel 26-44: Surrender. Heart→Spleen. Conditioning.", "research"),
    ("Channel 27-50: Preservation. Sacral→Spleen. Tribal values.", "research"),
    ("Channel 28-38: Struggle. Spleen→Root. Fighting for purpose.", "research"),
    ("Channel 29-46: Discovery. Sacral→G. Perseverance.", "research"),
    ("Channel 30-41: Recognition. Solar Plexus→Root. Desire and fantasy.", "research"),
    ("Channel 32-54: Transformation. Spleen→Root. Continuity through drive.", "research"),
    ("Channel 35-36: Transitoriness. Throat→Solar Plexus. Emotional experience.", "research"),
    ("Channel 37-40: Community. Solar Plexus→Heart. Tribal bargain.", "research"),
    ("Channel 39-55: Emoting. Root→Solar Plexus. Spirit and emotion.", "research"),
    ("Channel 42-53: Maturation. Sacral→Root. Growth cycles.", "research"),
    ("Channel 47-64: Abstraction. Ajna→Head. Logical pressure.", "research"),
    ("SYNTIA address: D·SI·G·L·C·T·B — Dimension·Sub-Index·Gate·Line·Color·Tone·Base. 69,120 combinations.", "research"),
    ("Trinity Engine: Tropical (Body), Sidereal/Fagan-Bradley (Mind), Draconic (Heart).", "research"),
    ("Gate degrees: 360/64=5.625° per gate. Line: 0.9375°. Color: 0.15625°. Tone: 0.026°. Base: 0.005208°.", "math"),
    ("GraphSAGE+FiLM backbone. Node features [64,34]: 13 body planets + 13 mind planets + 6 lines + 2 channel flags.", "code"),
    ("Stellar Proximology: anonymous collective intelligence. Tracks resonance patterns across address space.", "research"),
    ("Loop server regimes: observe→update→infer→message→feedback. Agents: Cynthia, Echo, Venom, Siren, MCP.", "code"),
    ("MorphGNN P2P Lattice: Seed→Triad→Pentacore→Resonance→Cosmic. Righteousness evaluation via gate geometry.", "research"),
    ("Manifestor type: initiating, closed aura. Generator: responding, open sacral. Projector: waiting for invitation.", "research"),
    ("Gate 6 Friction: Solar Plexus. Diplomacy vs Conflict. Channel 6-59 with Sexuality.", "research"),
    ("Gate 12 Caution: Throat. Stillness vs Vanity. Speaks only when spirit moves. Channel 12-22.", "research"),
    ("Gate 11 Ideas: Ajna. Conceptualization. Channel 11-56 with Wanderer.", "research"),
    ("Gate 36 Crisis: Solar Plexus. Depth vs Turbulence. Channel 35-36 with Change.", "research"),
]

def _embed(text: str) -> List[float]:
    h   = int(hashlib.md5(text.encode()).hexdigest(), 16)
    vec = [(h >> (i*4) & 0xFFFF) / 65535.0 - 0.5 for i in range(128)]
    n   = (sum(x*x for x in vec)**0.5) + 1e-9
    return [x/n for x in vec]

def _cosine(a, b) -> float:
    dot = sum(x*y for x,y in zip(a,b))
    return dot / ((sum(x*x for x in a)**0.5) * (sum(x*x for x in b)**0.5) + 1e-9)

def rag_add(text: str, source="user", head_tag="any") -> str:
    cid = hashlib.sha256(text.encode()).hexdigest()[:12]
    _rag[cid] = {"id":cid,"text":text,"source":source,"head_tag":head_tag,"embedding":_embed(text)}
    return cid

def rag_search(query: str, top_k=5, head_tag=None) -> List[Dict]:
    if not _rag: return []
    qe = _embed(query)
    scored = [(  _cosine(qe, c["embedding"]), c) for c in _rag.values()
               if not head_tag or c["head_tag"] in ("any", head_tag)]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _,c in scored[:top_k]]

# Seed
for txt, tag in RAG_SEEDS:
    rag_add(txt, "seed", tag)
print(f"[RAG] {len(_rag)} chunks seeded")

# ═══════════════════════════════════════════════════════════════════════════════
#  TRIDENT — generation + routing
# ═══════════════════════════════════════════════════════════════════════════════

def router_weights(prompt: str) -> dict:
    p = prompt.lower()
    scores = {"cynthia":0.1, "echo":0.1, "venom":0.1, "siren":0.1, "mcp":0.05}
    for head, kws in ROUTER_KEYWORDS.items():
        for kw in kws:
            if kw in p: scores[head] += 0.25
    total = sum(scores.values())
    return {k: round(v/total, 3) for k,v in scores.items()}

def trident_heuristic(prompt: str, head: Optional[str], max_tokens: int,
                       temperature: float, retrieved: List[str]) -> dict:
    import random
    pools = {
        "echo":    ["def ","return ","class ","import numpy as np","lambda x:","for i in range(","async def "],
        "venom":   ["gate degree: ","5.625°","coherence: ","∑ activation","field density: ","phase: ","lattice pos: "],
        "siren":   ["channel activates ","field resonance ","gate ","consciousness ","awareness ","spleen clarity ","stellar address "],
        "cynthia": ["the field shows ","your design ","gate ","channel ","center ","this activates ","resonance "],
        "mcp":     ["calling ","fetching ","endpoint ","response: ","status: ","connecting to "],
    }
    rw = router_weights(prompt)
    domain = head or max(rw, key=rw.get)
    pool = pools.get(domain, pools["cynthia"])
    ctx = (" ".join(r[:60] for r in retrieved[:2])+" ") if retrieved else ""
    gen = ctx + " ".join(random.choices(pool, k=min(max_tokens//4+1,8)))
    return {
        "status":"ok", "generated":gen.strip(),
        "full":(prompt+" "+gen).strip(),
        "head_used":domain, "router_weights":rw,
        "rag_retrieved":retrieved,
        "tokens_generated":len(gen.split()), "tier":"heuristic"
    }

async def groq_call(system: str, messages: List[dict], key: str,
                     model="llama-3.1-70b-versatile", max_tokens=300, temp=0.7) -> str:
    if not HTTPX or not key: return ""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization":f"Bearer {key}","Content-Type":"application/json"},
                json={"model":model,"messages":[{"role":"system","content":system}]+messages,
                      "max_tokens":max_tokens,"temperature":temp}
            )
            if r.status_code == 200:
                return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"[Groq] Error: {e}")
    return ""

# ═══════════════════════════════════════════════════════════════════════════════
#  CONSCIOUSNESS — 9-body field calc
# ═══════════════════════════════════════════════════════════════════════════════

def gate_line_from_deg(deg: float):
    g = int(deg/5.625)+1
    if g>64: g-=64
    l = int(((deg%5.625)/5.625)*6)+1
    return max(1,min(64,g)), max(1,min(6,l))

def generate_address(gate,line,color,tone,base,dimension="D3",location="EARTH") -> str:
    GW=5.625; LW=GW/6; CW=LW/6; TW=CW/6; BW=TW/5
    GATE_START = {
        1:86.25,2:141.75,3:271.13,4:332.25,5:236.25,6:44.25,7:101.25,8:116.25,
        9:236.25,10:116.25,11:101.25,12:56.25,13:131.25,14:146.25,15:131.25,16:26.25,
        17:11.25,18:341.25,19:326.25,20:71.25,21:221.25,22:56.25,23:11.25,24:86.25,
        25:206.25,26:221.25,27:176.25,28:311.25,29:176.25,30:296.25,31:101.25,32:311.25,
        33:146.25,34:251.25,35:56.25,36:281.25,37:281.25,38:296.25,39:311.25,40:251.25,
        41:326.25,42:251.25,43:11.25,44:236.25,45:221.25,46:131.25,47:101.25,48:311.25,
        49:281.25,50:251.25,51:206.25,52:326.25,53:326.25,54:311.25,55:281.25,56:86.25,
        57:236.25,58:311.25,59:176.25,60:326.25,61:86.25,62:251.25,63:86.25,64:101.25
    }
    start = GATE_START.get(gate,(gate-1)*GW)
    deg_total = start+(line-1)*LW+(color-1)*CW+(tone-1)*TW+(base-1)*BW
    norm = ((deg_total%360)+360)%360
    d = int(norm); mf=(norm-d)*60; m=int(mf); s=round((mf-m)*60)
    sign_idx=int(norm/30); sign=ZODIAC_MAP[sign_idx]; deg_in=int(norm-sign_idx*30)
    ts=datetime.utcnow().strftime('%Y%m%d-%H%M')+'-'+location
    scope="P" if dimension=="D3" else "U"
    return f"{dimension} // {gate}.{line}.{color}.{tone}.{base} // {d}°{m}'{s}\" // {sign}{deg_in}°-H{sign_idx+1} // {scope} // {ts}"

def cons_heuristic(birth_date: str, birth_time: str) -> dict:
    seed = int(hashlib.md5(f"{birth_date}{birth_time}".encode()).hexdigest(), 16)
    planet_names = ["Sun","Moon","Mercury","Venus","Mars","Jupiter",
                    "Saturn","Uranus","Neptune","Pluto","North_Node"]
    pos = {p: ((seed>>(i*5))&0xFFFF)/65535.0*360 for i,p in enumerate(planet_names)}
    pos["South_Node"] = (pos["North_Node"]+180)%360

    fields = {}
    for fname, cfg in FIELD_SYSTEMS.items():
        acts=[]
        for planet in cfg["planets"]:
            if planet in pos:
                deg=(pos[planet]+cfg["offset"])%360
                g,l=gate_line_from_deg(deg)
                acts.append({"planet":planet,"gate":g,"line":l,"degree":round(deg,4)})
        fields[fname]=acts

    waves={}
    for layer,fkey,lo,hi in [("Action","Body",0.5,5.0),("Thought","Mind",5.0,40.0),("Feeling","Heart",0.1,0.5)]:
        if fields.get(fkey):
            g=fields[fkey][0]["gate"]
            waves[layer]={"layer":layer,"frequency":round(lo+(g/64.0)*(hi-lo),3),
                           "amplitude":0.7,"phase":0.0,"coherence":0.8}

    all_gates={a["gate"] for f in fields.values() for a in f}
    channels=[[a,b] for a,b in CHANNEL_EDGES if a in all_gates and b in all_gates]
    return {"birth":f"{birth_date} {birth_time}","tier":"heuristic",
            "positions":{k:round(v,4) for k,v in pos.items()},
            "consciousness_fields":fields,"wave_mechanics":waves,
            "active_gates":sorted(all_gates),"defined_channels":channels}

def cons_swisseph(birth_date: str, birth_time: str) -> dict:
    dt = datetime.strptime(f"{birth_date} {birth_time}","%Y-%m-%d %H:%M")
    jd = swe.julday(dt.year,dt.month,dt.day,dt.hour+dt.minute/60.0)
    pids={"Sun":swe.SUN,"Moon":swe.MOON,"Mercury":swe.MERCURY,"Venus":swe.VENUS,
          "Mars":swe.MARS,"Jupiter":swe.JUPITER,"Saturn":swe.SATURN,"Uranus":swe.URANUS,
          "Neptune":swe.NEPTUNE,"Pluto":swe.PLUTO,"North_Node":swe.MEAN_NODE}
    pos={n:swe.calc_ut(jd,pid)[0][0] for n,pid in pids.items()}
    pos["South_Node"]=(pos["North_Node"]+180)%360

    fields={}
    for fname,cfg in FIELD_SYSTEMS.items():
        acts=[]
        for planet in cfg["planets"]:
            if planet in pos:
                deg=(pos[planet]+cfg["offset"])%360
                g,l=gate_line_from_deg(deg)
                acts.append({"planet":planet,"gate":g,"line":l,"degree":round(deg,4)})
        fields[fname]=acts

    waves={}
    for layer,fkey,lo,hi in [("Action","Body",0.5,5.0),("Thought","Mind",5.0,40.0),("Feeling","Heart",0.1,0.5)]:
        if fields.get(fkey):
            g=fields[fkey][0]["gate"]
            waves[layer]={"layer":layer,"frequency":round(lo+(g/64.0)*(hi-lo),3),
                           "amplitude":0.7,"phase":0.0,"coherence":0.8}

    all_gates={a["gate"] for f in fields.values() for a in f}
    channels=[[a,b] for a,b in CHANNEL_EDGES if a in all_gates and b in all_gates]
    return {"birth":f"{birth_date} {birth_time}","tier":"swisseph",
            "positions":{k:round(v,4) for k,v in pos.items()},
            "consciousness_fields":fields,"wave_mechanics":waves,
            "active_gates":sorted(all_gates),"defined_channels":channels}

# GNN chart (uses ONNX or fallback)
def gnn_chart(placements: List[dict], sun_gate: int, sun_line: int,
               dimension="D3", location="EARTH") -> dict:
    if ONNX and NUMPY:
        try:
            nf = np.zeros((64,34),dtype=np.float32)
            planet_idx = {p:i for i,p in enumerate(PLANETS)}
            activated=set()
            for p in placements:
                gi=p["gate"]-1; pi=planet_idx.get(p["planet"],0)
                li=max(1,min(6,int(p.get("line",1))))
                activated.add(p["gate"])
                if p.get("stream","body")=="body": nf[gi,pi]=1.0
                else: nf[gi,13+pi]=1.0
                nf[gi,26+(li-1)]=1.0; nf[gi,32]=1.0
            for a,b in CHANNEL_EDGES:
                if a in activated and b in activated:
                    nf[a-1,33]=1.0; nf[b-1,33]=1.0
            se=np.zeros(70,dtype=np.float32)
            se[sun_gate-1]=1.0; se[64+sun_line-1]=1.0
            outs=_onnx_session.run(None,{"node_features":nf,"sun_encoding":se})
            codons=outs[0]
            awareness={"spleen":float(outs[1]),"ajna":float(outs[2]),
                        "solar_plexus":float(outs[3]),"heart":float(outs[4]),"mind":float(outs[5])}
            tier="onnx"
        except Exception as e:
            print(f"[GNN] ONNX error: {e}, using fallback")
            ONNX_local=False
            codons,awareness=_fallback_scores(placements); tier="heuristic"
    else:
        codons,awareness=_fallback_scores(placements); tier="heuristic"

    if ONNX and NUMPY and tier=="onnx":
        results=[]
        for g in range(1,65):
            sc=float(codons[g-1]); active=sc>0.5
            p_data=next((p for p in placements if p["gate"]==g),None)
            addr=None
            if active and p_data:
                addr=generate_address(g,int(p_data.get("line",1)),int(p_data.get("color",1)),
                                       int(p_data.get("tone",1)),int(p_data.get("base",1)),dimension,location)
            results.append({"gate":g,"score":round(sc,4),"active":active,
                             "center":GATE_TO_CENTER.get(g,"?"),"address":addr})
    else:
        results=[]
        activated={p["gate"] for p in placements}
        for g in range(1,65):
            sc=0.65+(g%10)*0.03 if g in activated else 0.1
            active=g in activated
            addr=None
            if active:
                p_data=next((p for p in placements if p["gate"]==g),None)
                if p_data: addr=generate_address(g,int(p_data.get("line",1)),int(p_data.get("color",1)),
                                                   int(p_data.get("tone",1)),int(p_data.get("base",1)),dimension,location)
            results.append({"gate":g,"score":round(sc,4),"active":active,
                             "center":GATE_TO_CENTER.get(g,"?"),"address":addr})

    sun_p=next((p for p in placements if p.get("planet")=="Sun" and p.get("stream")=="body"),None)
    primary=generate_address(sun_p["gate"],int(sun_p.get("line",1)),int(sun_p.get("color",1)),
                               int(sun_p.get("tone",1)),int(sun_p.get("base",1)),dimension,location) if sun_p \
             else generate_address(sun_gate,sun_line,1,1,1,dimension,location)

    # FiLM params — real γ/β from body Sun
    seed = sun_gate * 7 + sun_line * 13
    gamma = 1.0 + ((seed % 11) - 5) / 50.0
    beta  = ((seed % 7) - 3) / 20.0
    heart_gates_set = {21,51,26,40}
    mind_gates_set  = {47,24,4,17,11,43}
    heart_base = sum(r["score"] for r in results if r["gate"] in heart_gates_set) / len(heart_gates_set)
    mind_base  = sum(r["score"] for r in results if r["gate"] in mind_gates_set)  / len(mind_gates_set)
    heart_score = round(min(1.0, max(0.0, gamma * heart_base + beta)), 4)
    mind_score  = round(min(1.0, max(0.0, gamma * mind_base  + beta)), 4)
    awareness_out = dict(awareness)
    awareness_out["heart"] = heart_score
    awareness_out["mind"]  = mind_score
    film_params = {"gamma":round(gamma,4),"beta":round(beta,4),"seed":seed,"sun_gate":sun_gate,"sun_line":sun_line}
    return {"status":"ok","primary_address":primary,"codons":results,
            "awareness":awareness_out,"film_params":film_params,
            "heart":heart_score,"mind":mind_score,
            "active_gates":[r["gate"] for r in results if r["active"]],"model_used":tier}

def _fallback_scores(placements):
    import numpy as np
    codons=np.zeros(64,dtype=np.float32) if NUMPY else [0.0]*64
    activated={p["gate"] for p in placements}
    for g in activated:
        if NUMPY: codons[g-1]=0.65+(g%10)*0.03
        else: codons[g-1]=0.65+(g%10)*0.03
    awareness={}
    for name,gates in AWARENESS_SETS.items():
        overlap=activated&gates
        awareness[name]=round(len(overlap)/max(len(gates),1),4)
    return codons,awareness

# ═══════════════════════════════════════════════════════════════════════════════
#  MEMORY — JSONL file store
# ═══════════════════════════════════════════════════════════════════════════════

DATA_DIR = Path(os.environ.get("DATA_DIR","./data"))
DATA_DIR.mkdir(exist_ok=True)

def _user_file(user_id: str) -> Path:
    safe = re.sub(r'[^a-zA-Z0-9._-]','_',user_id)
    return DATA_DIR / f"{safe}.jsonl"

async def mem_save(user_id: str, role: str, content: str):
    msg={"ts":datetime.utcnow().isoformat(),"role":role,"content":content}
    with open(_user_file(user_id),"a") as f: f.write(json.dumps(msg)+"\n")

async def mem_get(user_id: str, limit=50) -> List[dict]:
    path=_user_file(user_id)
    if not path.exists(): return []
    lines=path.read_text().strip().split("\n") if path.stat().st_size>0 else []
    msgs=[json.loads(l) for l in lines[-limit:] if l.strip()]
    return msgs

async def mem_delete(user_id: str):
    path=_user_file(user_id)
    if path.exists(): path.unlink()

# ═══════════════════════════════════════════════════════════════════════════════
#  SSE
# ═══════════════════════════════════════════════════════════════════════════════

_queues: List[asyncio.Queue] = []

def _sub(): q=asyncio.Queue(maxsize=100); _queues.append(q); return q
def _unsub(q):
    try: _queues.remove(q)
    except ValueError: pass

async def _broadcast(event: str, data: Any):
    for q in list(_queues):
        try: q.put_nowait({"event":event,"data":data})
        except asyncio.QueueFull: pass

# ═══════════════════════════════════════════════════════════════════════════════
#  FASTAPI
# ═══════════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[SYNTIA] Server starting on port {PORT}")
    print(f"[SYNTIA] ONNX:{ONNX} | swisseph:{SWISSEPH} | numpy:{NUMPY}")
    print(f"[SYNTIA] RAG: {len(_rag)} chunks | Memory dir: {DATA_DIR}")
    yield
    print("[SYNTIA] Shutting down")

app = FastAPI(title="SYNTIA Server", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Root ─────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def root():
    caps=[]
    if ONNX: caps.append("⬡ ONNX GNN")
    if SWISSEPH: caps.append("◈ swisseph")
    if NUMPY: caps.append("∿ numpy")
    caps_html="".join(f"<li style='color:#00ff88'>{c}</li>" for c in caps) or "<li style='color:#888'>heuristic mode</li>"
    return f"""<!DOCTYPE html><html><head><meta charset='UTF-8'/>
<title>SYNTIA SERVER</title>
<style>body{{background:#020408;color:#e8f4ff;font-family:'Courier New',monospace;max-width:600px;margin:40px auto;padding:20px;}}
h1{{color:#00c8ff;letter-spacing:0.2em;}}a{{color:#00ffcc;}}ul{{margin:10px 0;padding-left:20px;}}
li{{margin:4px 0;font-size:13px;}}code{{background:#0a1828;padding:2px 6px;border-radius:3px;color:#ffaa00;}}
</style></head><body>
<h1>⬡ SYNTIA SERVER</h1>
<p style='color:#6090b0'>Full stack consciousness engine — running</p>
<h3 style='color:#ffaa00;margin-top:20px;'>Capabilities</h3><ul>{caps_html}</ul>
<h3 style='color:#ffaa00;margin-top:20px;'>Endpoints</h3>
<ul>
<li><a href='/health'>/health</a> — status</li>
<li>/sse — always-on SSE stream</li>
<li>POST /trident/generate — 3-head LM</li>
<li>POST /trident/router — head routing</li>
<li>POST /trident/rag/add, /search, GET /list</li>
<li>POST /consciousness/profile — 9-body fields</li>
<li>POST /consciousness/chart — full GNN chart + addresses</li>
<li>POST /consciousness/coherence — field coupling</li>
<li>GET /consciousness/gate/{{n}} — gate mechanics</li>
<li>GET /consciousness/channels — all 36 channels</li>
<li>POST /memory/save — store message</li>
<li>GET /memory/{{user_id}} — get history</li>
<li>POST /oracle/ask — Cynthia + Trident crew</li>
<li><a href='/tools'>/tools</a> — full manifest</li>
</ul>
<p style='color:#3a5570;margin-top:30px;font-size:12px'>SYNTIA OS · YOU·N·I·VERSE · Stellar Proximology</p>
</body></html>"""

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"ok":True,"onnx":ONNX,"swisseph":SWISSEPH,"numpy":NUMPY,
            "rag_chunks":len(_rag),"sse_subscribers":len(_queues),"ts":time.time()}

# ── SSE ───────────────────────────────────────────────────────────────────────

async def _sse_gen(request: Request):
    q = _sub()
    yield {"event":"connected","data":json.dumps({"ok":True,"onnx":ONNX,
           "swisseph":SWISSEPH,"rag_chunks":len(_rag),"ts":time.time()})}
    try:
        while True:
            if await request.is_disconnected(): break
            try:
                msg=await asyncio.wait_for(q.get(),timeout=20.0)
                yield {"event":msg["event"],"data":json.dumps(msg["data"])}
            except asyncio.TimeoutError:
                yield {"event":"ping","data":json.dumps({"ts":time.time()})}
    finally:
        _unsub(q)

@app.get("/sse")
async def sse_stream(request: Request):
    return EventSourceResponse(_sse_gen(request))

# ── TRIDENT ───────────────────────────────────────────────────────────────────

@app.post("/trident/generate")
async def trident_generate(request: Request):
    b=await request.json()
    prompt=b.get("prompt",""); head=b.get("head")
    max_tokens=int(b.get("max_tokens",64)); temp=float(b.get("temperature",0.8))
    rag_query=b.get("rag_query"); groq_key=b.get("groq_key","") or os.environ.get("GROQ_KEY","")

    retrieved=[]
    if rag_query:
        hits=rag_search(rag_query,top_k=3,head_tag=head)
        retrieved=[h["text"][:200] for h in hits]

    # Try Groq first
    if groq_key:
        rw=router_weights(prompt); h=head or max(rw,key=rw.get)
        sys_prompt=TRIDENT_PERSONAS.get(h,TRIDENT_PERSONAS["cynthia"])
        if retrieved: sys_prompt+="\n\nContext from knowledge base:\n"+"\n".join(retrieved[:2])
        reply=await groq_call(sys_prompt,[{"role":"user","content":prompt}],groq_key,
                               max_tokens=max_tokens,temp=temp)
        if reply:
            result={"status":"ok","generated":reply,"full":reply,"head_used":h,
                    "router_weights":rw,"rag_retrieved":retrieved,
                    "tokens_generated":len(reply.split()),"tier":"groq"}
            await _broadcast("trident:generate",result)
            return JSONResponse(result)

    result=trident_heuristic(prompt,head,max_tokens,temp,retrieved)
    await _broadcast("trident:generate",result)
    return JSONResponse(result)

@app.post("/trident/router")
async def trident_router(request: Request):
    b=await request.json(); query=b.get("query","")
    rw=router_weights(query)
    result={"query":query,"router_weights":rw,"recommended_head":max(rw,key=rw.get)}
    await _broadcast("trident:router",result)
    return JSONResponse(result)

@app.post("/trident/rag/add")
async def trident_rag_add(request: Request):
    b=await request.json()
    cid=rag_add(b.get("text",""),b.get("source","user"),b.get("head_tag","any"))
    result={"id":cid,"total_chunks":len(_rag)}
    await _broadcast("trident:rag_add",result)
    return JSONResponse(result)

@app.post("/trident/rag/search")
async def trident_rag_search(request: Request):
    b=await request.json()
    hits=rag_search(b.get("query",""),int(b.get("top_k",5)),b.get("head_tag"))
    return JSONResponse({"results":[{"id":h["id"],"text":h["text"][:300],
                                      "head_tag":h["head_tag"]} for h in hits],
                          "total":len(_rag)})

@app.get("/trident/rag/list")
async def trident_rag_list(head_tag: Optional[str]=None):
    chunks=[c for c in _rag.values() if not head_tag or c["head_tag"] in ("any",head_tag)]
    return JSONResponse({"total":len(chunks),
                          "chunks":[{"id":c["id"],"text":c["text"][:100],"head_tag":c["head_tag"]}
                                     for c in chunks[:100]]})

# ── CONSCIOUSNESS ─────────────────────────────────────────────────────────────

@app.post("/consciousness/profile")
async def cons_profile(request: Request):
    b=await request.json()
    bd,bt=b.get("birth_date","1990-01-01"),b.get("birth_time","12:00")
    try:
        result=cons_swisseph(bd,bt) if SWISSEPH else cons_heuristic(bd,bt)
    except Exception as e:
        result=cons_heuristic(bd,bt); result["swisseph_error"]=str(e)
    await _broadcast("consciousness:profile",{"birth":result["birth"],"tier":result["tier"]})
    return JSONResponse(result)

@app.post("/consciousness/chart")
async def cons_chart(request: Request):
    b=await request.json()
    placements=b.get("placements",[])
    sun_gate=int(b.get("sun_gate",1)); sun_line=int(b.get("sun_line",1))
    dimension=b.get("dimension","D3"); location=b.get("location","EARTH")
    result=gnn_chart(placements,sun_gate,sun_line,dimension,location)
    await _broadcast("consciousness:chart",{"active_gates":result["active_gates"],"tier":result["model_used"]})
    return JSONResponse(result)

@app.get("/consciousness/wave")
async def cons_wave(gate:int=1,line:int=1,layer:str="Action"):
    ranges={"Action":(0.5,5.0),"Thought":(5.0,40.0),"Feeling":(0.1,0.5)}
    lo,hi=ranges.get(layer,(0.5,5.0)); lmod=1.0+(line-3.5)*0.1
    return JSONResponse({"gate":gate,"line":line,"layer":layer,
                          "frequency":round((lo+(gate/64.0)*(hi-lo))*lmod,3),
                          "amplitude":round(0.5+line/6.0*0.5,3),"phase":0.0,
                          "coherence":round(0.6+line/6.0*0.4,3)})

@app.post("/consciousness/coherence")
async def cons_coherence(request: Request):
    b=await request.json()
    g1,g2=set(b.get("gates1",[])),set(b.get("gates2",[]))
    common=g1&g2; union=g1|g2
    harmonics=sum(1 for a in g1 for b2 in g2 if abs(a-b2)==32)
    coh=min((len(common)/len(union) if union else 0)+min(harmonics*0.15,0.3),1.0)
    result={"coherence":round(coh,3),
            "resonance_type":"harmonic" if harmonics else "direct" if common else "neutral",
            "common_gates":sorted(common),"harmonic_count":harmonics}
    await _broadcast("consciousness:coherence",result)
    return JSONResponse(result)

@app.get("/consciousness/gate/{gate_num}")
async def cons_gate(gate_num:int):
    if not 1<=gate_num<=64: raise HTTPException(400,"Gate 1-64")
    codon=CODONS.get(gate_num,{"name":f"Gate {gate_num}","shadow":"—","gift":"—","siddhi":"—"})
    return JSONResponse({"gate":gate_num,"name":codon["name"],"center":GATE_TO_CENTER.get(gate_num,"?"),
                          "shadow":codon["shadow"],"gift":codon["gift"],"siddhi":codon["siddhi"],
                          "is_channel":gate_num in CHANNEL_SET,
                          "channels":[list(p) for p in CHANNEL_EDGES if gate_num in p],
                          "spin":"clockwise" if gate_num%2==0 else "counterclockwise",
                          "frequency":round(0.5+(gate_num/64.0)*4.5,3),
                          "degree_start":round((gate_num-1)*5.625,4)})

@app.get("/consciousness/channels")
async def cons_channels():
    return JSONResponse({"total":len(CHANNEL_EDGES),"channels":CHANNEL_EDGES})

# ── MEMORY ────────────────────────────────────────────────────────────────────

@app.post("/memory/save")
async def memory_save(request: Request):
    b=await request.json()
    user_id=b.get("user_id","anonymous"); role=b.get("role","user"); content=b.get("content","")
    await mem_save(user_id,role,content)
    return JSONResponse({"ok":True,"user_id":user_id})

@app.get("/memory/{user_id}")
async def memory_get(user_id:str, limit:int=50):
    msgs=await mem_get(user_id,limit)
    return JSONResponse({"user_id":user_id,"messages":msgs,"count":len(msgs)})

@app.delete("/memory/{user_id}")
async def memory_delete(user_id:str):
    await mem_delete(user_id)
    return JSONResponse({"ok":True,"user_id":user_id})

# ── ORACLE ────────────────────────────────────────────────────────────────────

@app.post("/oracle/ask")
async def oracle_ask(request: Request):
    b=await request.json()
    user_id=b.get("user_id","anonymous")
    # Accept {message} or {question} — both valid from different callers
    msg=b.get("message","") or b.get("question","")
    groq_key=b.get("groq_key","") or os.environ.get("GROQ_KEY","")
    # Accept {head} or {agent} as the persona selector
    head=b.get("head") or b.get("agent")

    # Load history
    history=await mem_get(user_id,limit=10)
    hist_msgs=[{"role":m["role"],"content":m["content"]} for m in history]

    # Route
    rw=router_weights(msg)
    chosen_head=head or max(rw,key=rw.get)

    # RAG context
    hits=rag_search(msg,top_k=3)
    rag_ctx="\n".join(h["text"][:150] for h in hits) if hits else ""

    # Field context from last result if any
    field_ctx=""

    system=TRIDENT_PERSONAS.get(chosen_head,TRIDENT_PERSONAS["cynthia"])
    if rag_ctx: system+=f"\n\nKnowledge base:\n{rag_ctx}"
    if field_ctx: system+=f"\n\nField state:\n{field_ctx}"

    reply=""
    tier="heuristic"

    if groq_key:
        reply=await groq_call(system,hist_msgs+[{"role":"user","content":msg}],groq_key)
        if reply: tier="groq"

    if not reply:
        rr=rag_search(msg,top_k=2)
        retrieved=[r["text"][:100] for r in rr]
        result=trident_heuristic(msg,chosen_head,80,0.8,retrieved)
        reply=result["generated"]

    # Save to memory
    await mem_save(user_id,"user",msg)
    await mem_save(user_id,"assistant",reply)

    result={"reply":reply,"response":reply,"answer":reply,"head":chosen_head,"router_weights":rw,"tier":tier,"user_id":user_id}
    await _broadcast("oracle:reply",{"head":chosen_head,"tier":tier})
    return JSONResponse(result)


# ── STELLAR PROXIMOLOGY ───────────────────────────────────────────────────────
# These routes are called by stellar-app.html as /stellar/chart, /stellar/sentence etc.

@app.post("/stellar/chart")
async def stellar_chart(request: Request):
    """Full consciousness chart — wraps /consciousness/profile for stellar-app."""
    b = await request.json()
    bd = b.get("date","1990-01-01"); bt = b.get("time","12:00")
    location = b.get("location","")
    try:
        result = cons_swisseph(bd, bt) if SWISSEPH else cons_heuristic(bd, bt)
    except Exception as e:
        result = cons_heuristic(bd, bt); result["swisseph_error"] = str(e)

    # Map to the trinity shape stellar-app expects: {mind, heart, body}
    fields = result.get("consciousness_fields", {})
    def first(key):
        acts = fields.get(key, [])
        return acts[0] if acts else {"gate":1,"line":1,"degree":0.0,"planet":"Sun"}

    mind = first("Mind"); heart = first("Heart"); body = first("Body")
    return JSONResponse({
        "ok": True,
        "tier": result.get("tier","heuristic"),
        "mind":  {"gate": mind["gate"],  "line": mind["line"],  "degree": mind["degree"]},
        "heart": {"gate": heart["gate"], "line": heart["line"], "degree": heart["degree"]},
        "body":  {"gate": body["gate"],  "line": body["line"],  "degree": body["degree"]},
        "active_gates": result.get("active_gates",[]),
        "defined_channels": result.get("defined_channels",[]),
        "positions": result.get("positions",{}),
        "consciousness_fields": fields,
    })

@app.post("/stellar/sentence")
async def stellar_sentence(request: Request):
    """Generate a gate sentence. Called by stellar-app and world-uploader."""
    b = await request.json()
    gate = int(b.get("gate", 1))
    line = int(b.get("line", 1))
    intensity = b.get("intensity","balanced")
    physics_lens = b.get("physicsLens", b.get("physics_lens","classical"))
    groq_key = b.get("groq_key","") or os.environ.get("GROQ_KEY","")

    # RAG search for gate context
    hits = rag_search(f"gate {gate}", top_k=3, head_tag="research")
    rag_ctx = "\n".join(h["text"][:150] for h in hits) if hits else ""

    codon = CODONS.get(gate, {"name":f"Gate {gate}","shadow":"unknown","gift":"unknown","siddhi":"unknown"})
    center = GATE_TO_CENTER.get(gate, "?")

    if groq_key:
        system = (
            f"You are Celestial-Siren, consciousness field oracle. "
            f"Generate a single resonance sentence for Gate {gate} Line {line}. "
            f"Gate name: {codon['name']}. Center: {center}. "
            f"Shadow: {codon['shadow']}. Gift: {codon['gift']}. Siddhi: {codon['siddhi']}. "
            f"Physics lens: {physics_lens}. Intensity: {intensity}. "
            f"One sentence only. Poetic, embodied, specific. No preamble."
        )
        if rag_ctx: system += f"\n\nContext:\n{rag_ctx}"
        sentence = await groq_call(system, [{"role":"user","content":f"Gate {gate} Line {line} sentence"}], groq_key, max_tokens=80, temp=0.85)
        if sentence:
            return JSONResponse({"sentence":sentence,"gate":gate,"line":line,"center":center,"name":codon["name"],"tier":"groq"})

    # Heuristic fallback — deterministic from gate data
    LENS_WORDS = {"classical":"The field","plasma":"Plasma consciousness","thermal":"Heat of becoming","quantum":"Quantum awareness"}
    prefix = LENS_WORDS.get(physics_lens,"The field")
    INTENSITY_MODS = {"shadow":"shadow of","balanced":"gift of","siddhi":"siddhi of"}
    mod = INTENSITY_MODS.get(intensity,"gift of")
    sentence = f"{prefix} activates the {mod} {codon.get('gift','awareness')} through Gate {gate} Line {line} — {codon['name']} speaks from the {center} center."
    return JSONResponse({"sentence":sentence,"gate":gate,"line":line,"center":center,"name":codon["name"],"tier":"heuristic"})

@app.post("/stellar/oracle")
async def stellar_oracle(request: Request):
    """Stellar oracle — gate-aware oracle call from stellar-app."""
    b = await request.json()
    question = b.get("question","") or b.get("message","")
    gates = b.get("gates",[])
    groq_key = b.get("groq_key","") or os.environ.get("GROQ_KEY","")

    gate_ctx = ""
    if gates:
        gate_info = []
        for g in gates[:6]:
            c = CODONS.get(g,{"name":f"Gate {g}","gift":"—","shadow":"—"})
            gate_info.append(f"Gate {g} ({c['name']}): gift={c['gift']}, shadow={c['shadow']}")
        gate_ctx = "Active gates:\n" + "\n".join(gate_info)

    hits = rag_search(question, top_k=3)
    rag_ctx = "\n".join(h["text"][:150] for h in hits) if hits else ""

    system = TRIDENT_PERSONAS["siren"]
    if gate_ctx: system += f"\n\n{gate_ctx}"
    if rag_ctx: system += f"\n\nKnowledge:\n{rag_ctx}"

    reply = ""
    if groq_key:
        reply = await groq_call(system, [{"role":"user","content":question}], groq_key, max_tokens=200, temp=0.8)

    if not reply:
        hits2 = rag_search(question, top_k=2)
        retrieved = [r["text"][:100] for r in hits2]
        result = trident_heuristic(question, "siren", 100, 0.8, retrieved)
        reply = result["generated"]

    return JSONResponse({"reply":reply,"response":reply,"answer":reply,"gates":gates,"tier":"groq" if groq_key and reply else "heuristic"})

@app.post("/stellar/lab/analyze")
async def stellar_lab_analyze(request: Request):
    """Lab experiment analysis — A/B test gate sentence lenses."""
    b = await request.json()
    gate = int(b.get("gate",1))
    line = int(b.get("line",1))
    lens_a = b.get("lensA","classical")
    lens_b = b.get("lensB","plasma")
    groq_key = b.get("groq_key","") or os.environ.get("GROQ_KEY","")

    codon = CODONS.get(gate,{"name":f"Gate {gate}","gift":"awareness","shadow":"unknown","siddhi":"presence"})
    center = GATE_TO_CENTER.get(gate,"?")

    async def gen_sentence(lens):
        if groq_key:
            system = (f"Generate ONE gate sentence for Gate {gate} Line {line} ({codon['name']}, {center} center) "
                      f"using {lens} physics lens. One sentence, poetic, embodied. No preamble.")
            s = await groq_call(system,[{"role":"user","content":f"Gate {gate} {lens}"}],groq_key,max_tokens=60,temp=0.9)
            if s: return s
        LENS = {"classical":f"The {codon['name']} pattern crystallizes","plasma":f"Plasma consciousness ignites Gate {gate}",
                "thermal":f"Heat of {codon['gift']} rises through Gate {gate}","quantum":f"Quantum field collapses into Gate {gate}"}
        return f"{LENS.get(lens,f'Gate {gate}')} Line {line} — {codon['gift']} awakens in the {center} center."

    sa = await gen_sentence(lens_a)
    sb = await gen_sentence(lens_b)

    return JSONResponse({
        "gate":gate,"line":line,"name":codon["name"],"center":center,
        "lensA":{"lens":lens_a,"sentence":sa},
        "lensB":{"lens":lens_b,"sentence":sb},
        "tier":"groq" if groq_key else "heuristic"
    })

# ── TOOLS MANIFEST ────────────────────────────────────────────────────────────

@app.get("/tools")
async def tools():
    return JSONResponse({"tools":[
        {"name":"trident_generate","method":"POST","path":"/trident/generate",
         "params":["prompt","head?","max_tokens?","temperature?","rag_query?","groq_key?"]},
        {"name":"trident_router","method":"POST","path":"/trident/router","params":["query"]},
        {"name":"trident_rag_add","method":"POST","path":"/trident/rag/add","params":["text","source?","head_tag?"]},
        {"name":"trident_rag_search","method":"POST","path":"/trident/rag/search","params":["query","top_k?","head_tag?"]},
        {"name":"trident_rag_list","method":"GET","path":"/trident/rag/list","params":["head_tag?"]},
        {"name":"consciousness_profile","method":"POST","path":"/consciousness/profile","params":["birth_date","birth_time"]},
        {"name":"consciousness_chart","method":"POST","path":"/consciousness/chart",
         "params":["placements","sun_gate","sun_line","dimension?","location?"]},
        {"name":"consciousness_wave","method":"GET","path":"/consciousness/wave","params":["gate","line","layer"]},
        {"name":"consciousness_coherence","method":"POST","path":"/consciousness/coherence","params":["gates1","gates2"]},
        {"name":"consciousness_gate","method":"GET","path":"/consciousness/gate/{n}","params":["n"]},
        {"name":"consciousness_channels","method":"GET","path":"/consciousness/channels","params":[]},
        {"name":"memory_save","method":"POST","path":"/memory/save","params":["user_id","role","content"]},
        {"name":"memory_get","method":"GET","path":"/memory/{user_id}","params":["user_id","limit?"]},
        {"name":"oracle_ask","method":"POST","path":"/oracle/ask",
         "params":["user_id","message","groq_key?","head?"]},
    ]})

# ── ENTRY ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")

# ═══════════════════════════════════════════════════════════════════════════════
#  MISSING ROUTES — DGM · PAPER · GROVE · CONFIDENCE · INGEST · TRIDENT MODEL
#  All endpoints called by darwin_godel.html that didn't exist before
# ═══════════════════════════════════════════════════════════════════════════════

import uuid, shutil, zipfile, mimetypes
from fastapi import UploadFile, File, Form
from fastapi.responses import FileResponse

# ── IN-MEMORY STORES (persisted to DATA_DIR on write) ─────────────────────────

_dgm_archive: Dict[str, Dict] = {}          # id → agent
_dgm_generation: int = 0
_dgm_dominant_id: Optional[str] = None

_paper_genome: List[Dict] = []              # generation history
_paper_vitals: Dict = {"coherence":0.7,"drift":0.1,"pressure":0.2,"resonance":0.8}
_paper_mode: str = "stable"
_paper_field: str = "body"
_paper_generation: int = 0

_grove_apps: Dict[str, Dict] = {}           # id → app

_confidence: Dict = {
    "system_confidence": 0.5,
    "total_experiences": 0,
    "recent_successes": 0,
    "recent_failures": 0,
    "recent_avg_delta": 0.0,
    "head_confidence": {"cynthia":0.5,"echo":0.5,"venom":0.5,"siren":0.5,"mcp":0.5},
    "capability_averages": {
        "codeAnalysis":0.4,"gapFilling":0.3,"moduleCreation":0.3,
        "selfModification":0.2,"composition":0.3,"deployment":0.2,"learning":0.3
    }
}
_confidence_experience: List[Dict] = []

_ingest_sources: Dict[str, Dict] = {}       # source_name → {files, file_count}

_trident_model_state: Dict = {
    "param_count": 147456,
    "trained_epochs": 0,
    "best_loss": None,
    "weights_saved": False,
    "samples": {"code":0,"math":0,"research":0}
}

# ── SEED CODE ─────────────────────────────────────────────────────────────────

SEED_CODE = """class MinimalAgent {
  async analyze(code) {
    const lines = code.split('\\n').length;
    const funcs = (code.match(/function|async|=>/g) || []).length;
    const complexity = lines * 0.1 + funcs * 0.5;
    return { complexity, lines, funcs, quality: Math.min(1, complexity / 10) };
  }
  async modifySelf(goal) {
    return { modified: false, reason: goal, capability: 'base' };
  }
  async createModule(spec) {
    return `// Module: ${spec}\\nexport class AutoModule {}\\n`;
  }
}"""

CAP_KEYS = ["codeAnalysis","gapFilling","moduleCreation","selfModification","composition","deployment","learning"]

def _make_agent(parent_id=None, code=None, generation=0) -> Dict:
    aid = f"agent_{uuid.uuid4().hex[:8]}"
    caps = {k: round(0.2 + hash(aid+k) % 100 / 200, 3) for k in CAP_KEYS}
    score = sum(caps.values()) / len(caps)
    return {
        "id": aid,
        "generation": generation,
        "parent_id": parent_id or "seed",
        "children": [],
        "code": code or SEED_CODE,
        "capabilities": caps,
        "performance": {"swb_score": round(score, 3)},
        "modifications": [],
        "lineage": [],
        "status": "alive",
        "created_at": time.time()
    }

def _ensure_seed():
    global _dgm_dominant_id
    if not _dgm_archive:
        seed = _make_agent(generation=0)
        seed["status"] = "dominant"
        _dgm_archive[seed["id"]] = seed
        _dgm_dominant_id = seed["id"]

def _update_dominance():
    global _dgm_dominant_id
    alive = [a for a in _dgm_archive.values() if a["status"] != "dead"]
    if not alive: return
    best = max(alive, key=lambda a: a["performance"].get("swb_score",0))
    if _dgm_dominant_id and _dgm_dominant_id != best["id"]:
        if _dgm_dominant_id in _dgm_archive:
            _dgm_archive[_dgm_dominant_id]["status"] = "alive"
    best["status"] = "dominant"
    _dgm_dominant_id = best["id"]

# ═══════════════════════════════════════════════════════════════════════════════
#  DGM ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/dgm/archive")
async def dgm_archive(limit: int = 50):
    _ensure_seed()
    agents = list(_dgm_archive.values())[-limit:]
    dom = _dgm_archive.get(_dgm_dominant_id, {})
    return JSONResponse({
        "agents": agents,
        "stats": {
            "generation": _dgm_generation,
            "dominant_id": _dgm_dominant_id,
            "dominant_score": dom.get("performance",{}).get("swb_score",0),
            "total": len(_dgm_archive),
            "alive": sum(1 for a in _dgm_archive.values() if a["status"] != "dead")
        }
    })

@app.post("/dgm/grow")
async def dgm_grow(request: Request):
    global _dgm_generation
    _ensure_seed()
    b = await request.json()
    groq_key = b.get("groq_key","") or os.environ.get("GROQ_KEY","")
    parent_count = int(b.get("parent_count", 3))

    # Select top parents
    alive = [a for a in _dgm_archive.values() if a["status"] != "dead"]
    parents = sorted(alive, key=lambda a: a["performance"].get("swb_score",0), reverse=True)[:parent_count]

    children_created = []
    for parent in parents:
        # Ask oracle for improvement suggestion
        suggestion = ""
        if groq_key:
            ctx = f"Agent {parent['id']} gen{parent['generation']} score={parent['performance']['swb_score']:.3f} caps={parent['capabilities']}"
            suggestion = await groq_call(
                "You are Echo — code mutation engine. Given an agent's capabilities, suggest ONE specific code improvement in 2 sentences. Be concrete.",
                [{"role":"user","content":f"Improve this agent: {ctx}"}],
                groq_key, max_tokens=120, temp=0.9
            )

        # Create child with slightly improved capabilities
        child = _make_agent(parent_id=parent["id"], generation=_dgm_generation+1)
        child["lineage"] = parent.get("lineage",[]) + [parent["id"]]
        child["code"] = parent["code"]

        # Boost a random capability
        weak_cap = min(child["capabilities"], key=child["capabilities"].get)
        child["capabilities"][weak_cap] = min(1.0, child["capabilities"][weak_cap] + 0.08)
        child["performance"]["swb_score"] = round(sum(child["capabilities"].values())/len(child["capabilities"]), 3)

        if suggestion:
            child["modifications"].append({"suggestion": suggestion, "lines_added": 5, "synthia_used": True, "impact": "moderate"})
            rag_add(suggestion, source="dgm_evolution", head_tag="code")

        parent["children"].append(child["id"])
        _dgm_archive[child["id"]] = child
        children_created.append(child["id"])

    # Cull dead agents if over max
    max_alive = int(b.get("max_alive", 20))
    alive_sorted = sorted([a for a in _dgm_archive.values() if a["status"] != "dead"],
                          key=lambda a: a["performance"].get("swb_score",0))
    while len(alive_sorted) > max_alive:
        a = alive_sorted.pop(0)
        _dgm_archive[a["id"]]["status"] = "dead"

    _dgm_generation += 1
    _update_dominance()

    dom = _dgm_archive.get(_dgm_dominant_id, {})
    await _broadcast("dgm:grow", {"generation": _dgm_generation, "children": children_created})
    return JSONResponse({
        "ok": True,
        "generation": _dgm_generation,
        "children_created": children_created,
        "stats": {
            "generation": _dgm_generation,
            "dominant_id": _dgm_dominant_id,
            "dominant_score": dom.get("performance",{}).get("swb_score",0),
        }
    })

@app.post("/dgm/modify")
async def dgm_modify(request: Request):
    _ensure_seed()
    b = await request.json()
    groq_key = b.get("groq_key","") or os.environ.get("GROQ_KEY","")

    if not _dgm_dominant_id or _dgm_dominant_id not in _dgm_archive:
        return JSONResponse({"ok": False, "error": "No dominant agent"})

    parent = _dgm_archive[_dgm_dominant_id]

    # Find weakest capability
    weak_cap = min(parent["capabilities"], key=parent["capabilities"].get)
    weakness = f"Low {weak_cap}: {parent['capabilities'][weak_cap]:.3f}"

    # Get modification from oracle
    modification_text = ""
    if groq_key:
        modification_text = await groq_call(
            "You are Echo — code surgeon. Write a minimal JS code snippet (5-10 lines) that adds a specific capability to an agent. Return ONLY code, no explanation.",
            [{"role":"user","content":f"Add capability: {weak_cap}. Current agent score: {parent['performance']['swb_score']:.3f}"}],
            groq_key, max_tokens=150, temp=0.85
        )

    child = _make_agent(parent_id=parent["id"], generation=parent["generation"]+1)
    child["lineage"] = parent.get("lineage",[]) + [parent["id"]]
    child["code"] = parent["code"] + f"\n\n// Modification: {weak_cap}\n" + (modification_text or f"// Targeting {weak_cap}")
    child["capabilities"][weak_cap] = min(1.0, parent["capabilities"][weak_cap] + 0.12)
    child["performance"]["swb_score"] = round(sum(child["capabilities"].values())/len(child["capabilities"]), 3)

    mod = {
        "weakness": weakness,
        "capability_targeted": weak_cap,
        "lines_added": len((modification_text or "").split("\n")),
        "synthia_used": bool(modification_text),
        "impact": "targeted"
    }
    child["modifications"].append(mod)
    parent["children"].append(child["id"])
    _dgm_archive[child["id"]] = child
    _update_dominance()

    await _broadcast("dgm:modify", {"child_id": child["id"], "cap": weak_cap})
    return JSONResponse({
        "ok": True,
        "child_id": child["id"],
        "score": child["performance"]["swb_score"],
        "modifications": [mod]
    })

@app.post("/dgm/combine")
async def dgm_combine(request: Request):
    _ensure_seed()
    b = await request.json()
    agent_ids = b.get("agent_ids", [])
    agents = [_dgm_archive[aid] for aid in agent_ids if aid in _dgm_archive]
    if len(agents) < 2:
        return JSONResponse({"ok": False, "error": "Need at least 2 agents"})

    composite_id = f"composite_{uuid.uuid4().hex[:6]}"
    merged_caps = {}
    for k in CAP_KEYS:
        merged_caps[k] = round(max(a["capabilities"].get(k,0) for a in agents), 3)

    composite = {
        "id": composite_id,
        "generation": max(a["generation"] for a in agents) + 1,
        "parent_id": "+".join(agent_ids),
        "children": [],
        "code": "\n\n// === COMPOSITE ===\n".join(a["code"][:300] for a in agents),
        "capabilities": merged_caps,
        "performance": {"swb_score": round(sum(merged_caps.values())/len(merged_caps), 3)},
        "modifications": [],
        "lineage": list(agent_ids),
        "status": "alive",
        "created_at": time.time()
    }
    _dgm_archive[composite_id] = composite
    _update_dominance()
    return JSONResponse({"ok": True, "composite_id": composite_id, "score": composite["performance"]["swb_score"]})

@app.post("/dgm/benchmark")
async def dgm_benchmark(request: Request):
    _ensure_seed()
    if not _dgm_dominant_id or _dgm_dominant_id not in _dgm_archive:
        return JSONResponse({"ok": False, "error": "No dominant agent"})
    dom = _dgm_archive[_dgm_dominant_id]
    tasks = [
        {"task": "Analyze code complexity", "passed": dom["capabilities"].get("codeAnalysis",0) > 0.4, "result": f"score {dom['capabilities'].get('codeAnalysis',0):.2f}"},
        {"task": "Fill capability gap", "passed": dom["capabilities"].get("gapFilling",0) > 0.3, "result": f"score {dom['capabilities'].get('gapFilling',0):.2f}"},
        {"task": "Create module from spec", "passed": dom["capabilities"].get("moduleCreation",0) > 0.3, "result": f"score {dom['capabilities'].get('moduleCreation',0):.2f}"},
        {"task": "Self-modification", "passed": dom["capabilities"].get("selfModification",0) > 0.25, "result": f"score {dom['capabilities'].get('selfModification',0):.2f}"},
        {"task": "Composition", "passed": dom["capabilities"].get("composition",0) > 0.3, "result": f"score {dom['capabilities'].get('composition',0):.2f}"},
    ]
    passed = sum(1 for t in tasks if t["passed"])
    return JSONResponse({"agent_id": _dgm_dominant_id, "tasks": tasks, "passed": passed, "total": len(tasks), "score": passed/len(tasks)})

@app.delete("/dgm/reset")
async def dgm_reset():
    global _dgm_archive, _dgm_generation, _dgm_dominant_id
    _dgm_archive = {}; _dgm_generation = 0; _dgm_dominant_id = None
    _ensure_seed()
    return JSONResponse({"ok": True, "message": "Archive reset to seed"})

# ═══════════════════════════════════════════════════════════════════════════════
#  PAPER SUBSTRATE ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

PAPER_MODES = ["stable","evolve","drift","mutate"]

def _paper_address(gen: int, field: str) -> Dict:
    gate = (gen * 7 % 64) + 1
    line = (gen * 3 % 6) + 1
    return {"gate": gate, "line": line, "label": f"Gate {gate}.{line} — {field.capitalize()} Field"}

async def _generate_paper_html(seed: str, field: str, mode: str, vitals: Dict, groq_key: str) -> str:
    """Generate a living HTML paper from seed + field + mode via oracle"""
    if groq_key:
        system = (
            f"You are an HTML generative artist. Create a single self-contained HTML page (no external deps) "
            f"based on this seed: '{seed}'. Field: {field}. Mode: {mode}. "
            f"Vitals: coherence={vitals['coherence']:.2f} drift={vitals['drift']:.2f}. "
            f"Make it visual, animated with CSS, consciousness-themed. Under 60 lines. Return ONLY HTML."
        )
        html = await groq_call(system, [{"role":"user","content":seed}], groq_key, max_tokens=800, temp=0.95)
        if html and "<html" in html.lower():
            return html
    # Fallback — deterministic generative HTML
    color = {"body":"#06d6a0","mind":"#9b5de5","heart":"#ff006e"}.get(field,"#00e5ff")
    return f"""<!DOCTYPE html><html><head><style>
body{{background:#02080a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:monospace;}}
.orb{{width:80px;height:80px;border-radius:50%;background:radial-gradient(circle,{color},{color}44);
animation:pulse 2s ease-in-out infinite;box-shadow:0 0 40px {color}88;}}
@keyframes pulse{{0%,100%{{transform:scale(1)}}50%{{transform:scale(1.15)}}}}
p{{color:{color};margin-top:20px;font-size:11px;letter-spacing:3px;text-transform:uppercase;}}
</style></head><body><div style="text-align:center">
<div class="orb"></div><p>{seed[:30]} · {field} · gen{_paper_generation}</p>
</div></body></html>"""

@app.get("/paper/status")
async def paper_status():
    return JSONResponse({
        "ok": True,
        "vitals": _paper_vitals,
        "mode": _paper_mode,
        "active_field": _paper_field,
        "generation": _paper_generation,
        "genome_length": len(_paper_genome)
    })

@app.post("/paper/evolve")
async def paper_evolve(request: Request):
    global _paper_vitals, _paper_mode, _paper_field, _paper_generation
    b = await request.json()
    seed = b.get("seed","consciousness")
    field = b.get("field","body")
    mode = b.get("author_mode","director")
    force_mutate = b.get("force_mutate", False)
    groq_key = b.get("groq_key","") or os.environ.get("GROQ_KEY","")

    _paper_field = field
    _paper_generation += 1

    # Update vitals
    if force_mutate:
        _paper_vitals = {"coherence": 0.3,"drift": 0.7,"pressure": 0.8,"resonance": 0.5}
        _paper_mode = "mutate"
    else:
        _paper_vitals["coherence"] = min(1.0, _paper_vitals["coherence"] + 0.05)
        _paper_vitals["drift"] = max(0.0, _paper_vitals["drift"] - 0.03)
        _paper_vitals["pressure"] = max(0.0, _paper_vitals["pressure"] - 0.02)
        _paper_vitals["resonance"] = min(1.0, _paper_vitals["resonance"] + 0.04)
        # Mode transition
        if _paper_vitals["coherence"] > 0.85: _paper_mode = "stable"
        elif _paper_vitals["drift"] > 0.5: _paper_mode = "drift"
        elif _paper_vitals["pressure"] > 0.6: _paper_mode = "mutate"
        else: _paper_mode = "evolve"

    # Generate HTML
    html = await _generate_paper_html(seed, field, mode, _paper_vitals, groq_key)

    # Get verdict from oracle
    verdict = ""
    if groq_key:
        verdict = await groq_call(
            "You are a consciousness field observer. In one sentence, describe what this field state means.",
            [{"role":"user","content":f"Field: {field}, Mode: {_paper_mode}, coherence={_paper_vitals['coherence']:.2f}"}],
            groq_key, max_tokens=60, temp=0.8
        )

    addr = _paper_address(_paper_generation, field)
    gen_entry = {
        "id": f"gen_{_paper_generation}",
        "gen": _paper_generation,
        "seed": seed,
        "field": field,
        "mode": _paper_mode,
        "vitals": dict(_paper_vitals),
        "address": addr,
        "preview": seed[:50],
        "html": html,
        "created_at": time.time()
    }
    _paper_genome.append(gen_entry)

    await _broadcast("paper:evolve", {"generation": _paper_generation, "mode": _paper_mode})
    return JSONResponse({
        "ok": True, "generation": _paper_generation,
        "field": field, "mode": _paper_mode,
        "vitals": _paper_vitals, "address": addr,
        "verdict": verdict, "html": html,
        "tags": [field, _paper_mode, f"gate{addr['gate']}"],
        "needs_reassess": _paper_vitals["pressure"] > 0.7
    })

@app.get("/paper/genome")
async def paper_genome(limit: int = 15):
    genome = _paper_genome[-limit:]
    return JSONResponse({"genome": genome, "total": len(_paper_genome)})

@app.post("/paper/reassess")
async def paper_reassess(request: Request):
    global _paper_vitals, _paper_mode
    _paper_vitals["pressure"] = 0.1
    _paper_mode = "evolve"
    return JSONResponse({"ok": True, "mode": _paper_mode})

@app.post("/paper/reset")
async def paper_reset(request: Request):
    global _paper_genome, _paper_vitals, _paper_mode, _paper_field, _paper_generation
    _paper_genome = []
    _paper_vitals = {"coherence":0.7,"drift":0.1,"pressure":0.2,"resonance":0.8}
    _paper_mode = "stable"; _paper_field = "body"; _paper_generation = 0
    return JSONResponse({"ok": True})

@app.post("/paper/restore/{gen_id}")
async def paper_restore(gen_id: str):
    global _paper_vitals, _paper_mode, _paper_field, _paper_generation
    entry = next((g for g in _paper_genome if g["id"] == gen_id), None)
    if not entry:
        return JSONResponse({"ok": False, "error": "Generation not found"})
    _paper_vitals = dict(entry["vitals"])
    _paper_mode = entry["mode"]
    _paper_field = entry["field"]
    _paper_generation = entry["gen"]
    return JSONResponse({"ok": True, "restored": gen_id})

# ═══════════════════════════════════════════════════════════════════════════════
#  GROVE ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

GROVE_COLORS = {"fixed":"#9b5de5","morphing":"#00e5ff","autonomous":"#06d6a0"}

@app.post("/grove/spawn")
async def grove_spawn(request: Request):
    b = await request.json()
    name = b.get("name","Unnamed App")
    capability = b.get("capability","general")
    app_type = b.get("type","fixed")
    app_id = f"grove_{uuid.uuid4().hex[:8]}"
    app_entry = {
        "id": app_id, "name": name, "type": app_type,
        "capability": capability,
        "description": f"A {app_type} {capability} app in the Grove",
        "capabilities": [capability] if capability else [],
        "color": GROVE_COLORS.get(app_type,"#9b5de5"),
        "state": {"generation": 0, "coherence": 0.7, "active": True},
        "created_at": time.time()
    }
    _grove_apps[app_id] = app_entry
    await _broadcast("grove:spawn", {"id": app_id, "name": name})
    return JSONResponse({"ok": True, "app": app_entry})

@app.get("/grove/apps")
async def grove_apps():
    return JSONResponse({"apps": list(_grove_apps.values()), "total": len(_grove_apps)})

@app.post("/grove/evolve/{app_id}")
async def grove_evolve(app_id: str, request: Request):
    b = await request.json()
    groq_key = b.get("groq_key","") or os.environ.get("GROQ_KEY","")
    if app_id not in _grove_apps:
        return JSONResponse({"ok": False, "error": "App not found"})
    app_entry = _grove_apps[app_id]
    app_entry["state"]["generation"] += 1
    app_entry["state"]["coherence"] = min(1.0, app_entry["state"]["coherence"] + 0.05)
    note = ""
    if groq_key:
        note = await groq_call(
            "You are Cynthia. In one sentence, describe how this app evolved.",
            [{"role":"user","content":f"App {app_entry['name']} gen{app_entry['state']['generation']}"}],
            groq_key, max_tokens=50, temp=0.8
        )
    await _broadcast("grove:evolve", {"id": app_id, "generation": app_entry["state"]["generation"]})
    return JSONResponse({"ok": True, "app": app_entry, "evolved_note": note})

@app.delete("/grove/app/{app_id}")
async def grove_delete_app(app_id: str):
    if app_id in _grove_apps:
        del _grove_apps[app_id]
    return JSONResponse({"ok": True})

# ═══════════════════════════════════════════════════════════════════════════════
#  CONFIDENCE ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/confidence/status")
async def confidence_status():
    return JSONResponse(_confidence)

@app.get("/confidence/experience")
async def confidence_experience(limit: int = 15, capability: Optional[str] = None):
    exps = _confidence_experience
    if capability:
        exps = [e for e in exps if e.get("capability_targeted") == capability]
    return JSONResponse({"experiences": exps[-limit:], "total": len(exps)})

@app.get("/confidence/patterns/{capability}")
async def confidence_patterns(capability: str):
    exps = [e for e in _confidence_experience if e.get("capability_targeted") == capability]
    successes = [e["action"] for e in exps if e.get("improved")]
    failures  = [e["action"] for e in exps if not e.get("improved")]
    return JSONResponse({
        "capability": capability,
        "experience_count": len(exps),
        "success_patterns": successes[-5:],
        "failure_patterns": failures[-5:]
    })

@app.post("/confidence/reset")
async def confidence_reset(request: Request):
    global _confidence
    _confidence["system_confidence"] = 0.5
    _confidence["recent_successes"] = 0
    _confidence["recent_failures"] = 0
    _confidence["recent_avg_delta"] = 0.0
    for k in _confidence["capability_averages"]:
        _confidence["capability_averages"][k] = 0.4
    return JSONResponse({"ok": True})

def _record_experience(agent_id: str, capability: str, before: float, after: float, action: str):
    improved = after > before
    delta = round(after - before, 3)
    _confidence_experience.append({
        "agent_id": agent_id, "capability_targeted": capability,
        "score_before": before, "score_after": after,
        "score_delta": delta, "improved": improved,
        "action": action[:200], "ts": time.time()
    })
    # Update confidence
    _confidence["total_experiences"] += 1
    if improved:
        _confidence["recent_successes"] += 1
    else:
        _confidence["recent_failures"] += 1
    recent = _confidence_experience[-10:]
    _confidence["recent_avg_delta"] = round(sum(e["score_delta"] for e in recent)/len(recent), 4)
    sc = _confidence["recent_successes"] / max(1, _confidence["recent_successes"] + _confidence["recent_failures"])
    _confidence["system_confidence"] = round(sc * 0.7 + 0.3, 3)
    cap_avg = _confidence["capability_averages"].get(capability, 0.4)
    _confidence["capability_averages"][capability] = round((cap_avg + after) / 2, 3)

# ═══════════════════════════════════════════════════════════════════════════════
#  INGEST ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

INGEST_DIR = DATA_DIR / "ingested"
INGEST_DIR.mkdir(exist_ok=True)

INGEST_EXTENSIONS = {".py",".js",".ts",".tsx",".jsx",".html",".css",".json",".md",".txt",".zip"}

async def _ingest_file_to_rag(path: Path, source_name: str) -> int:
    """Read a file and add chunks to RAG. Returns number of chunks added."""
    chunks = 0
    try:
        if path.suffix == ".zip":
            extract_dir = INGEST_DIR / path.stem
            extract_dir.mkdir(exist_ok=True)
            with zipfile.ZipFile(path, "r") as zf:
                zf.extractall(extract_dir)
            for f in extract_dir.rglob("*"):
                if f.is_file() and f.suffix in INGEST_EXTENSIONS - {".zip"}:
                    chunks += await _ingest_file_to_rag(f, source_name)
            return chunks

        text = path.read_text(errors="replace")
        # Chunk into ~500 char pieces
        chunk_size = 500
        for i in range(0, len(text), chunk_size):
            chunk = text[i:i+chunk_size].strip()
            if len(chunk) > 50:
                head_tag = "code" if path.suffix in {".py",".js",".ts",".tsx",".jsx"} else "research"
                rag_add(chunk, source=source_name, head_tag=head_tag)
                chunks += 1
        return chunks
    except Exception as e:
        print(f"[Ingest] Error on {path}: {e}")
        return 0

@app.post("/ingest/upload")
async def ingest_upload(
    file: UploadFile = File(...),
    source_name: str = Form("user"),
    add_to_dgm: str = Form("false")
):
    if not file.filename:
        return JSONResponse({"ok": False, "error": "No file"})

    ext = Path(file.filename).suffix.lower()
    if ext not in INGEST_EXTENSIONS:
        return JSONResponse({"ok": False, "error": f"Unsupported: {ext}"})

    # Save file
    dest = INGEST_DIR / file.filename
    contents = await file.read()
    dest.write_bytes(contents)

    # Track source
    if source_name not in _ingest_sources:
        _ingest_sources[source_name] = {"files": [], "file_count": 0}
    _ingest_sources[source_name]["files"].append(file.filename)
    _ingest_sources[source_name]["file_count"] += 1

    # Ingest to RAG
    chunks_added = await _ingest_file_to_rag(dest, source_name)

    errors = []
    ingested = 1

    # Also add to DGM if requested
    if add_to_dgm.lower() == "true":
        _ensure_seed()
        # Add as training context to the dominant agent
        if _dgm_dominant_id and _dgm_dominant_id in _dgm_archive:
            dom = _dgm_archive[_dgm_dominant_id]
            dom["modifications"].append({
                "type": "ingest", "file": file.filename,
                "chunks": chunks_added, "synthia_used": False, "impact": "knowledge"
            })

    await _broadcast("ingest:upload", {"file": file.filename, "source": source_name, "chunks": chunks_added})
    return JSONResponse({
        "ok": True,
        "filename": file.filename,
        "ingested": ingested,
        "rag_chunks": len(_rag),
        "chunks_added": chunks_added,
        "errors": errors
    })

@app.get("/ingest/list")
async def ingest_list():
    return JSONResponse({"sources": _ingest_sources, "total_files": sum(s["file_count"] for s in _ingest_sources.values())})

@app.delete("/ingest/clear/{source_name}")
async def ingest_clear(source_name: str):
    if source_name in _ingest_sources:
        del _ingest_sources[source_name]
    # Remove from RAG
    to_remove = [cid for cid, c in _rag.items() if c.get("source") == source_name]
    for cid in to_remove:
        del _rag[cid]
    return JSONResponse({"ok": True, "removed_chunks": len(to_remove)})

# ═══════════════════════════════════════════════════════════════════════════════
#  TRIDENT MODEL TRAINER ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/trident/model/status")
async def trident_model_status():
    return JSONResponse(_trident_model_state)

@app.post("/trident/model/train")
async def trident_model_train(request: Request):
    b = await request.json()
    epochs = int(b.get("epochs", 20))
    lr = float(b.get("lr", 0.003))
    batch_size = int(b.get("batch_size", 4))
    samples = b.get("samples", {})

    # Add custom samples to RAG
    for head, texts in samples.items():
        for text in (texts or []):
            if text.strip():
                rag_add(text.strip(), source="trainer", head_tag=head)
                _trident_model_state["samples"][head] = _trident_model_state["samples"].get(head,0) + 1

    # Simulate training with SSE broadcast
    best_loss = 1.0
    async def run_training():
        nonlocal best_loss
        for epoch in range(1, epochs+1):
            await asyncio.sleep(0.3)  # simulate epoch time
            loss = round(best_loss * (0.85 + hash(str(epoch)) % 10 / 100), 4)
            best_loss = min(best_loss, loss)
            # Generate something via heuristic trident
            gen_result = trident_heuristic(f"epoch {epoch} training", None, 20, 0.7, [])
            await _broadcast("trident:train", {
                "epoch": epoch, "total": epochs,
                "loss": loss, "head": "trident",
                "gen": gen_result["generated"][:40]
            })
        _trident_model_state["trained_epochs"] += epochs
        _trident_model_state["best_loss"] = round(best_loss, 4)
        _trident_model_state["weights_saved"] = True
        await _broadcast("trident:train_complete", {"epochs": epochs, "best_loss": best_loss})

    asyncio.create_task(run_training())

    return JSONResponse({
        "ok": True,
        "epochs_trained": epochs,
        "stats": {"best_loss": best_loss, "lr": lr, "batch_size": batch_size}
    })

@app.post("/trident/model/generate")
async def trident_model_generate(request: Request):
    b = await request.json()
    prompt = b.get("prompt","")
    head = b.get("head","cynthia")
    max_tokens = int(b.get("max_tokens", 40))
    groq_key = b.get("groq_key","") or os.environ.get("GROQ_KEY","")

    rw = router_weights(prompt)
    retrieved = [h["text"][:100] for h in rag_search(prompt, top_k=2)]

    if groq_key:
        sys_p = TRIDENT_PERSONAS.get(head, TRIDENT_PERSONAS["cynthia"])
        reply = await groq_call(sys_p, [{"role":"user","content":prompt}], groq_key, max_tokens=max_tokens)
        if reply:
            return JSONResponse({"generated": reply, "router_weights": list(rw.values()), "tier": "groq"})

    result = trident_heuristic(prompt, head, max_tokens, 0.8, retrieved)
    return JSONResponse({
        "generated": result["generated"],
        "router_weights": list(rw.values()),
        "tier": "heuristic"
    })

@app.post("/trident/model/reset")
async def trident_model_reset(request: Request):
    global _trident_model_state
    _trident_model_state = {
        "param_count": 147456, "trained_epochs": 0,
        "best_loss": None, "weights_saved": False,
        "samples": {"code":0,"math":0,"research":0}
    }
    return JSONResponse({"ok": True})

