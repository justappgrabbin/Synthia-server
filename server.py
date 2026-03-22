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
    for _path in ['model.onnx','trident_syntia.onnx','syntia.onnx']:
        if os.path.exists(_path):
            _onnx_session = ort.InferenceSession(_path)
            print(f"[GNN] ONNX loaded: {_path}")
            break
    ONNX = _onnx_session is not None
except Exception:
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

    return {"status":"ok","primary_address":primary,"codons":results,"awareness":awareness,
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
    user_id=b.get("user_id","anonymous"); msg=b.get("message","")
    groq_key=b.get("groq_key","") or os.environ.get("GROQ_KEY","")
    head=b.get("head")  # optional override

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

    result={"reply":reply,"head":chosen_head,"router_weights":rw,"tier":tier,"user_id":user_id}
    await _broadcast("oracle:reply",{"head":chosen_head,"tier":tier})
    return JSONResponse(result)

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

# ═══════════════════════════════════════════════════════════════════════════════
#  PAPER WORLDS — artifact mesh, gap filler, mixer, graph, GitHub publisher
#  Added directly to Synthia server — same process, same port, same Supabase
# ═══════════════════════════════════════════════════════════════════════════════

import base64, mimetypes, uuid as _uuid
from typing import Tuple

# ── optional Supabase ─────────────────────────────────────────────────────────
try:
    from supabase import create_client as _sb_create
    _SUPABASE_URL = os.environ.get("SUPABASE_URL","")
    _SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY","")
    if _SUPABASE_URL and _SUPABASE_KEY:
        _sb = _sb_create(_SUPABASE_URL, _SUPABASE_KEY)
        PW_SUPABASE = True
        print("[PaperWorlds] Supabase connected")
    else:
        _sb = None
        PW_SUPABASE = False
        print("[PaperWorlds] No Supabase env — using in-memory store")
except Exception as _e:
    _sb = None
    PW_SUPABASE = False
    print(f"[PaperWorlds] Supabase unavailable: {_e}")

# ── optional multipart upload ─────────────────────────────────────────────────
try:
    from fastapi import UploadFile, File, Form
    from typing import List as _List
    PW_UPLOAD = True
except Exception:
    PW_UPLOAD = False

# ── in-memory fallback store ──────────────────────────────────────────────────
_pw_artifacts: Dict[str, Dict] = {}
_pw_edges: list = []
_pw_gaps: list = []
_pw_trident: Dict[str, Dict] = {}

# ── GitHub config ─────────────────────────────────────────────────────────────
_GH_TOKEN    = os.environ.get("GITHUB_TOKEN","")
_GH_USER     = os.environ.get("GITHUB_USERNAME","justappgrabbin")
_ANTHROPIC   = os.environ.get("ANTHROPIC_API_KEY","")

# ═══════════════════════════════════════════════════════════════════════════════
#  ONTOLOGICAL ADDRESS ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

_ZODIACS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo",
            "Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"]
_PLANETS_LIST = ["Sun","Moon","Mercury","Venus","Mars","Jupiter",
                 "Saturn","Uranus","Neptune","Pluto","North Node","South Node"]
_DIMS = ["being","designed","composite_space","movement_evolutionary"]
_DIM_MULT = {d: i * 64*6*6*6*5 for i,d in enumerate(_DIMS)}

def _pw_hash(s: str) -> int:
    h = 0xdeadbeef
    for c in s:
        h = ((h ^ ord(c)) * 2654435761) & 0xFFFFFFFF
    return h

def _derive_coords(name: str, content: str) -> dict:
    seed = _pw_hash(name + content[:500])
    return {
        "gate":  (seed % 64) + 1,
        "line":  (seed % 6)  + 1,
        "color": ((seed >> 3) % 6) + 1,
        "tone":  ((seed >> 6) % 6) + 1,
        "base":  ((seed >> 9) % 5) + 1,
        "degree":  seed % 360,
        "minute":  seed % 60,
        "second":  (seed >> 2) % 60,
        "zodiac":  _ZODIACS[(seed >> 4) % 12],
        "house":   ((seed >> 8) % 12) + 1,
        "planet":  _PLANETS_LIST[seed % len(_PLANETS_LIST)],
    }

def _infer_dim(ftype: str, content: str) -> str:
    t = ftype.lower()
    if any(x in t for x in ["html","app","world"]): return "composite_space"
    if any(x in t for x in ["upload","file"]):       return "being"
    if any(x in t for x in ["code","script"]):       return "designed"
    if any(x in content for x in ["animate","stream","tick"]): return "movement_evolutionary"
    return "designed"

def _make_address(name: str, content: str, ftype: str) -> dict:
    dim  = _infer_dim(ftype, content)
    c    = _derive_coords(name, content)
    sig_src = f"{dim}·{c['gate']}·{c['line']}·{c['color']}·{c['tone']}·{c['base']}·{c['zodiac']}·H{c['house']}·{c['planet']}"
    sig  = sig_src + "#" + hex(_pw_hash(sig_src + name))[2:].upper()
    addr_22t = (_DIM_MULT[dim] +
                (c["gate"]-1)*6*6*6*5 + (c["line"]-1)*6*6*5 +
                (c["color"]-1)*6*5    + (c["tone"]-1)*5     + (c["base"]-1))
    return {**c, "dimension": dim, "signature": sig, "address_22t": addr_22t,
            "place_label": "Paper Worlds"}

def _resonance(a: dict, b: dict) -> float:
    gate_score  = 1.0 if a["gate"]==b["gate"] else (0.6 if abs(a["gate"]-b["gate"])<5 else 0.2)
    line_score  = 1.0 if a["line"]==b["line"] else 0.4
    dim_score   = 1.0 if a["dimension"]==b["dimension"] else 0.5
    zod_score   = 0.8 if a["zodiac"]==b["zodiac"] else 0.3
    return round(gate_score*0.4 + line_score*0.2 + dim_score*0.25 + zod_score*0.15, 3)

# ═══════════════════════════════════════════════════════════════════════════════
#  SUPABASE HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

async def _sb_upsert_artifact(data: dict) -> dict:
    if PW_SUPABASE and _sb:
        try:
            r = _sb.table("pw_artifacts").upsert(data, on_conflict="signature").execute()
            return r.data[0] if r.data else data
        except Exception as e:
            print(f"[PW] Supabase upsert error: {e}")
    _pw_artifacts[data["id"]] = data
    return data

async def _sb_get_artifacts(limit=100) -> list:
    if PW_SUPABASE and _sb:
        try:
            r = _sb.table("pw_artifacts").select("*").order("created_at", desc=True).limit(limit).execute()
            return r.data or []
        except Exception as e:
            print(f"[PW] Supabase fetch error: {e}")
    return list(_pw_artifacts.values())[-limit:]

async def _sb_get_artifact(aid: str) -> Optional[dict]:
    if PW_SUPABASE and _sb:
        try:
            r = _sb.table("pw_artifacts").select("*").eq("id", aid).execute()
            return r.data[0] if r.data else None
        except Exception:
            pass
    return _pw_artifacts.get(aid)

async def _sb_create_edge(from_id: str, to_id: str, edge_type: str, weight=1.0):
    edge = {"from_id": from_id, "to_id": to_id, "edge_type": edge_type, "weight": weight}
    if PW_SUPABASE and _sb:
        try:
            _sb.table("pw_edges").upsert(edge, on_conflict="from_id,to_id,edge_type").execute()
            return
        except Exception:
            pass
    _pw_edges.append(edge)

async def _sb_get_graph() -> dict:
    if PW_SUPABASE and _sb:
        try:
            nodes = _sb.table("pw_artifacts").select(
                "id,name,type,gate,dimension,signature,address_22t,resonance_score,created_at"
            ).execute().data or []
            edges = _sb.table("pw_edges").select("from_id,to_id,edge_type,weight").execute().data or []
            return {"nodes": nodes, "edges": edges}
        except Exception as e:
            print(f"[PW] graph fetch error: {e}")
    nodes = [{"id":a["id"],"name":a["name"],"type":a["type"],
               "gate":a.get("gate"),"dimension":a.get("dimension"),
               "signature":a.get("signature"),"address_22t":a.get("address_22t")}
             for a in _pw_artifacts.values()]
    return {"nodes": nodes, "edges": _pw_edges}

async def _sb_upsert_trident(user_id: str, state: dict) -> dict:
    state["user_id"] = user_id
    state["updated_at"] = datetime.utcnow().isoformat()
    if PW_SUPABASE and _sb:
        try:
            r = _sb.table("pw_trident").upsert(state, on_conflict="user_id").execute()
            return r.data[0] if r.data else state
        except Exception as e:
            print(f"[PW] Trident upsert error: {e}")
    _pw_trident[user_id] = state
    return state

async def _sb_get_trident(user_id: str) -> Optional[dict]:
    if PW_SUPABASE and _sb:
        try:
            r = _sb.table("pw_trident").select("*").eq("user_id", user_id).execute()
            return r.data[0] if r.data else None
        except Exception:
            pass
    return _pw_trident.get(user_id)

# ═══════════════════════════════════════════════════════════════════════════════
#  GAP FILLER
# ═══════════════════════════════════════════════════════════════════════════════

def _analyze_gaps(artifact: dict) -> list:
    gaps = []
    html = artifact.get("html") or artifact.get("content") or ""
    aid  = artifact["id"]
    name = artifact["name"]

    if html and "viewport" not in html:
        gaps.append({"type":"missing_viewport","severity":"critical","artifact_id":aid,
                     "description":"No mobile viewport meta tag",
                     "scaffold":'<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover">',
                     "can_autofill": True})
    if html and "charset" not in html:
        gaps.append({"type":"missing_charset","severity":"warning","artifact_id":aid,
                     "description":"No charset declaration",
                     "scaffold":'<meta charset="UTF-8">',
                     "can_autofill": True})
    if html and not re.search(r'<title>', html, re.I):
        gaps.append({"type":"missing_title","severity":"info","artifact_id":aid,
                     "description":"No <title> tag",
                     "scaffold":f'<title>{name}</title>',
                     "can_autofill": True})
    if html and re.search(r'http://(?!localhost)', html):
        gaps.append({"type":"insecure_resources","severity":"warning","artifact_id":aid,
                     "description":"Insecure http:// refs — blocked on HTTPS",
                     "can_autofill": True})
    if html and "fetch(" in html and ".catch" not in html:
        gaps.append({"type":"missing_error_handling","severity":"warning","artifact_id":aid,
                     "description":"fetch() calls with no .catch()",
                     "can_autofill": False})
    is_cons = any(k in html.lower() for k in ["gate","resonance","consciousness"])
    has_syn = "synthia-server" in html or "synthia_server" in html
    if is_cons and not has_syn and len(html) > 2000:
        gaps.append({"type":"missing_synthia_bridge","severity":"info","artifact_id":aid,
                     "description":"Consciousness app with no Synthia connection",
                     "can_autofill": False})
    return gaps

def _apply_static_gaps(html: str, gaps: list) -> str:
    for g in gaps:
        if not g.get("can_autofill"): continue
        sc = g.get("scaffold","")
        t  = g["type"]
        if t == "missing_viewport" and sc:
            html = html.replace("<head>", f"<head>\n  {sc}", 1)
        elif t == "missing_charset" and sc:
            html = html.replace("<head>", f"<head>\n  {sc}", 1)
        elif t == "missing_title" and sc:
            html = re.sub(r'</head>', f'  {sc}\n</head>', html, count=1, flags=re.I)
        elif t == "insecure_resources":
            html = re.sub(r'http://(?!localhost)', 'https://', html)
    return html

# ═══════════════════════════════════════════════════════════════════════════════
#  MIXER  (Claude-powered, auto-triggers on resonance ≥ 0.65)
# ═══════════════════════════════════════════════════════════════════════════════

async def _claude_mix(a: dict, b: dict, score: float) -> Optional[str]:
    """Call Anthropic API to blend two artifacts into one."""
    if not _ANTHROPIC: return None
    ca = (a.get("html") or a.get("content",""))[:3500]
    cb = (b.get("html") or b.get("content",""))[:3500]
    prompt = f"""You are the Paper Worlds Mixer. Two consciousness artifacts are resonant (score {score:.0%}) and must be woven together.

ARTIFACT A: "{a['name']}" Gate {a.get('gate')} {a.get('dimension')}
{ca}

ARTIFACT B: "{b['name']}" Gate {b.get('gate')} {b.get('dimension')}
{cb}

Create ONE seamless self-contained HTML file that:
- Preserves the best of both
- Uses YOU-N-I-VERSE aesthetic: bg #070b18, cyan #7affef, violet #a855f7, amber #f59e0b
- Is mobile-first with viewport meta
- Expresses Gate {a.get('gate')} + Gate {b.get('gate')} energy

Return ONLY the complete HTML. No explanations. No markdown fences."""

    try:
        async with httpx.AsyncClient(timeout=40) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": _ANTHROPIC,
                         "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json={"model":"claude-sonnet-4-20250514","max_tokens":4000,
                      "messages":[{"role":"user","content":prompt}]}
            )
            if r.status_code == 200:
                return r.json()["content"][0]["text"].strip()
    except Exception as e:
        print(f"[PW Mixer] Claude error: {e}")
    return None

async def _auto_mix(new_artifact: dict):
    """Background task: find resonant pairs and mix them."""
    all_arts = await _sb_get_artifacts(50)
    for other in all_arts:
        if other["id"] == new_artifact["id"]: continue
        score = _resonance(new_artifact, other)
        if score < 0.65: continue

        # Check already mixed
        already = any(
            e["from_id"] in (new_artifact["id"], other["id"]) and
            e["to_id"]   in (new_artifact["id"], other["id"]) and
            e["edge_type"] == "mixed_with"
            for e in _pw_edges
        )
        if already: continue

        mixed_html = await _claude_mix(new_artifact, other, score)
        if not mixed_html: continue

        mixed_name = f"{new_artifact['name']} ✕ {other['name']}"
        addr = _make_address(mixed_name, mixed_html, "mixed")
        mixed = await _sb_upsert_artifact({
            "id": str(_uuid.uuid4()),
            "name": mixed_name, "type": "mixed", "source": "mixer",
            "html": mixed_html,
            "size_bytes": len(mixed_html),
            "resonance_score": score,
            "created_at": datetime.utcnow().isoformat(),
            **addr,
        })
        await _sb_create_edge(new_artifact["id"], mixed["id"], "mixed_with", score)
        await _sb_create_edge(other["id"],         mixed["id"], "mixed_with", score)

        await _broadcast("pw:mix_created", {
            "name": mixed_name, "id": mixed["id"],
            "resonance_score": score,
            "parents": [new_artifact["name"], other["name"]]
        })
        print(f"[PW Mixer] Mixed: {mixed_name} (resonance {score:.0%})")
        break  # one mix per upload

# ═══════════════════════════════════════════════════════════════════════════════
#  GITHUB PUBLISHER
# ═══════════════════════════════════════════════════════════════════════════════

async def _gh_publish(artifact: dict) -> dict:
    if not _GH_TOKEN:
        return {"success": False, "error": "No GITHUB_TOKEN env var"}

    slug = re.sub(r'[^a-z0-9]+', '-', artifact["name"].lower()).strip('-')[:60]
    repo_name = f"pw-{slug}-{int(time.time()) % 100000}"
    desc = f"Paper Worlds · Gate {artifact.get('gate')} · {artifact.get('dimension')} · {artifact.get('address_22t')}"

    headers = {"Authorization": f"Bearer {_GH_TOKEN}",
               "Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28",
               "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=20) as client:
        # Create repo
        r = await client.post("https://api.github.com/user/repos",
                              headers=headers,
                              json={"name": repo_name, "description": desc,
                                    "private": False, "auto_init": False})
        if r.status_code not in (200, 201):
            return {"success": False, "error": r.json().get("message","Failed")}

        repo = r.json()

        # Commit files
        files = {
            "index.html": artifact.get("html") or artifact.get("content",""),
            "manifest.json": json.dumps({
                "name": artifact["name"],
                "signature": artifact.get("signature"),
                "address_22t": artifact.get("address_22t"),
                "gate": artifact.get("gate"),
                "dimension": artifact.get("dimension"),
                "created_at": artifact.get("created_at"),
            }, indent=2),
            "README.md": f"# {artifact['name']}\n\nOntological address: `{artifact.get('signature')}`\n\n22T position: `{artifact.get('address_22t')}`\n\nBuilt with Paper Worlds · SYNTIA ecosystem\n",
        }

        for path, content in files.items():
            encoded = base64.b64encode(content.encode()).decode()
            await client.put(
                f"https://api.github.com/repos/{_GH_USER}/{repo_name}/contents/{path}",
                headers=headers,
                json={"message": f"✦ {artifact['name']} · Paper Worlds",
                      "content": encoded}
            )

    return {"success": True, "repo_url": repo["html_url"],
            "clone_url": repo["clone_url"], "repo_name": repo_name}

# ═══════════════════════════════════════════════════════════════════════════════
#  INGEST PIPELINE — runs on every upload or build
# ═══════════════════════════════════════════════════════════════════════════════

async def _ingest(name: str, ftype: str, source: str,
                  content: str, mime: str = "text/plain") -> dict:
    is_html = ftype == "html" or content.lstrip().startswith("<!") or "text/html" in mime

    addr    = _make_address(name, content, ftype)
    aid     = str(_uuid.uuid4())
    now     = datetime.utcnow().isoformat()

    artifact = await _sb_upsert_artifact({
        "id": aid, "name": name, "type": ftype, "source": source,
        "html":    content if is_html else None,
        "content": content if not is_html else None,
        "size_bytes": len(content), "mime_type": mime,
        "created_at": now, **addr,
    })

    print(f"[PW] Ingested: '{name}' → Gate {addr['gate']} · {addr['dimension']} · {addr['address_22t']}")

    # Gap analysis
    gaps = _analyze_gaps(artifact)
    if gaps:
        filled_html = _apply_static_gaps(content, gaps) if is_html else content
        if filled_html != content:
            artifact["html"] = filled_html
            await _sb_upsert_artifact({**artifact, "gap_status": "filled",
                                       "gaps_filled": json.dumps(gaps)})
        await _broadcast("pw:gaps", {"artifact_id": aid, "count": len(gaps),
                                      "types": [g["type"] for g in gaps]})

    # Broadcast new artifact
    await _broadcast("pw:artifact", {"id": aid, "name": name,
                                      "gate": addr["gate"], "dimension": addr["dimension"],
                                      "signature": addr["signature"]})

    # Auto-mix in background (fire and forget)
    asyncio.create_task(_auto_mix(artifact))

    return artifact

# ═══════════════════════════════════════════════════════════════════════════════
#  ROUTES — /pw/*
# ═══════════════════════════════════════════════════════════════════════════════

# ── Upload files ──────────────────────────────────────────────────────────────
@app.post("/pw/upload")
async def pw_upload(request: Request):
    """Accept multipart file upload. Each file goes through the full pipeline."""
    content_type = request.headers.get("content-type","")

    if "multipart/form-data" in content_type:
        from fastapi import UploadFile
        form = await request.form()
        results = []
        for field_name, upload in form.multi_items():
            if not hasattr(upload, "filename"): continue
            raw      = await upload.read()
            fname    = upload.filename or "unknown"
            ext      = fname.rsplit(".",1)[-1].lower() if "." in fname else ""
            ftype    = ("html" if ext in ("html","htm") else
                        "code" if ext in ("js","ts","tsx","jsx","py") else
                        "data" if ext in ("json","yaml","yml") else
                        "doc"  if ext in ("md","txt") else
                        "style" if ext == "css" else "upload")
            try:    content = raw.decode("utf-8", errors="replace")
            except: content = raw.decode("latin-1", errors="replace")
            art = await _ingest(fname, ftype, "upload", content, upload.content_type or "text/plain")
            results.append({"id": art["id"], "name": art["name"],
                             "gate": art.get("gate"), "signature": art.get("signature"),
                             "address_22t": art.get("address_22t")})
        return JSONResponse({"ok": True, "uploaded": len(results), "artifacts": results})

    # JSON fallback
    body = await request.json()
    art = await _ingest(body["name"], body.get("type","html"), "upload",
                        body["content"], body.get("mime","text/plain"))
    return JSONResponse({"ok": True, "artifact": art})

# ── Paper Pal build → ingest ──────────────────────────────────────────────────
@app.post("/pw/build")
async def pw_build(request: Request):
    """Paper Pal sends completed HTML here — it gets addressed and stored."""
    b = await request.json()
    name = b.get("name","Unnamed Build")
    html = b.get("html","")
    if not html:
        raise HTTPException(400, "html required")
    art = await _ingest(name, b.get("type","html"), "pal", html, "text/html")
    return JSONResponse({"ok": True, "artifact": art})

# ── List all artifacts ────────────────────────────────────────────────────────
@app.get("/pw/artifacts")
async def pw_artifacts(limit: int = 100):
    arts = await _sb_get_artifacts(limit)
    return JSONResponse({"artifacts": arts, "count": len(arts)})

# ── Single artifact ───────────────────────────────────────────────────────────
@app.get("/pw/artifacts/{aid}")
async def pw_artifact(aid: str):
    art = await _sb_get_artifact(aid)
    if not art:
        raise HTTPException(404, "Not found")
    return JSONResponse({"artifact": art})

# ── Delete ────────────────────────────────────────────────────────────────────
@app.delete("/pw/artifacts/{aid}")
async def pw_delete(aid: str):
    if PW_SUPABASE and _sb:
        _sb.table("pw_artifacts").delete().eq("id", aid).execute()
    else:
        _pw_artifacts.pop(aid, None)
    await _broadcast("pw:deleted", {"id": aid})
    return JSONResponse({"ok": True})

# ── Graph ─────────────────────────────────────────────────────────────────────
@app.get("/pw/graph")
async def pw_graph():
    """Full node + edge graph for the visual graph view."""
    return JSONResponse(await _sb_get_graph())

# ── Gap analysis ──────────────────────────────────────────────────────────────
@app.post("/pw/gaps/analyze/{aid}")
async def pw_gaps_analyze(aid: str):
    art = await _sb_get_artifact(aid)
    if not art: raise HTTPException(404, "Not found")
    gaps = _analyze_gaps(art)
    await _broadcast("pw:gaps", {"artifact_id": aid, "gaps": gaps})
    return JSONResponse({"gaps": gaps, "count": len(gaps)})

@app.post("/pw/gaps/fill/{aid}")
async def pw_gaps_fill(aid: str):
    art = await _sb_get_artifact(aid)
    if not art: raise HTTPException(404, "Not found")
    gaps  = _analyze_gaps(art)
    html  = art.get("html") or art.get("content","")
    fixed = _apply_static_gaps(html, gaps)
    if fixed != html:
        art["html"] = fixed
        await _sb_upsert_artifact({**art, "gap_status":"filled"})
    return JSONResponse({"ok": True, "gaps_filled": len([g for g in gaps if g.get("can_autofill")]),
                         "html": fixed})

# ── Manual mix ────────────────────────────────────────────────────────────────
@app.post("/pw/mix")
async def pw_mix(request: Request):
    b  = await request.json()
    a  = await _sb_get_artifact(b.get("artifact_id_a",""))
    bb = await _sb_get_artifact(b.get("artifact_id_b",""))
    if not a or not bb: raise HTTPException(404, "Artifact(s) not found")
    score = _resonance(a, bb)
    html  = await _claude_mix(a, bb, score)
    if not html:
        return JSONResponse({"ok": False, "error": "Mix failed — check ANTHROPIC_API_KEY"})
    name = f"{a['name']} ✕ {bb['name']}"
    addr = _make_address(name, html, "mixed")
    mixed = await _sb_upsert_artifact({
        "id": str(_uuid.uuid4()), "name": name, "type":"mixed", "source":"mixer",
        "html": html, "size_bytes": len(html), "resonance_score": score,
        "created_at": datetime.utcnow().isoformat(), **addr,
    })
    await _sb_create_edge(a["id"], mixed["id"], "mixed_with", score)
    await _sb_create_edge(bb["id"], mixed["id"], "mixed_with", score)
    await _broadcast("pw:mix_created", {"name": name, "id": mixed["id"], "resonance_score": score})
    return JSONResponse({"ok": True, "artifact": mixed, "resonance_score": score})

# ── GitHub publish ────────────────────────────────────────────────────────────
@app.post("/pw/github/{aid}")
async def pw_github(aid: str):
    art = await _sb_get_artifact(aid)
    if not art: raise HTTPException(404, "Not found")
    result = await _gh_publish(art)
    if result["success"] and PW_SUPABASE and _sb:
        _sb.table("pw_artifacts").update({"github_url": result["repo_url"],
                                           "github_repo": result["repo_name"]}).eq("id", aid).execute()
    await _broadcast("pw:github", {"artifact_id": aid, **result})
    return JSONResponse(result)

@app.get("/pw/github/repos")
async def pw_github_repos():
    if not _GH_TOKEN:
        return JSONResponse({"repos": [], "error": "No GITHUB_TOKEN"})
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get("https://api.github.com/user/repos?per_page=100&sort=created",
                             headers={"Authorization": f"Bearer {_GH_TOKEN}",
                                      "Accept": "application/vnd.github+json"})
        repos = [rr for rr in r.json() if isinstance(rr,dict) and rr.get("name","").startswith("pw-")]
    return JSONResponse({"repos": repos, "count": len(repos)})

# ── Trident (Paper Worlds state) ──────────────────────────────────────────────
@app.get("/pw/trident/{user_id}")
async def pw_trident_get(user_id: str):
    return JSONResponse({"trident": await _sb_get_trident(user_id)})

@app.post("/pw/trident/{user_id}")
async def pw_trident_set(user_id: str, request: Request):
    body = await request.json()
    trident = await _sb_upsert_trident(user_id, body)
    await _broadcast("pw:trident", {"user_id": user_id, "stage": trident.get("agent_stage")})
    return JSONResponse({"ok": True, "trident": trident})

# ── Perceive (for Synthia bridge events) ─────────────────────────────────────
@app.post("/pw/perceive")
async def pw_perceive(request: Request):
    """External systems (Paper Worlds frontend, other nodes) post events here."""
    body = await request.json()
    await _broadcast("pw:event", body)
    return JSONResponse({"ok": True, "received": body.get("type")})

# ── Status ────────────────────────────────────────────────────────────────────
@app.get("/pw/status")
async def pw_status():
    arts = await _sb_get_artifacts(1000)
    return JSONResponse({
        "ok": True,
        "supabase": PW_SUPABASE,
        "github": bool(_GH_TOKEN),
        "anthropic": bool(_ANTHROPIC),
        "artifacts": len(arts),
        "edges": len(_pw_edges),
        "sse_subscribers": len(_queues),
        "gates_covered": list({a.get("gate") for a in arts if a.get("gate")}),
        "dimensions": list({a.get("dimension") for a in arts if a.get("dimension")}),
    })

# Update tools manifest to include PW routes
_PW_TOOLS = [
    {"name":"pw_upload",         "method":"POST","path":"/pw/upload",              "params":["files (multipart) or {name,content,type}"]},
    {"name":"pw_build",          "method":"POST","path":"/pw/build",               "params":["name","html","type?"]},
    {"name":"pw_artifacts",      "method":"GET", "path":"/pw/artifacts",           "params":["limit?"]},
    {"name":"pw_artifact",       "method":"GET", "path":"/pw/artifacts/{id}",      "params":["id"]},
    {"name":"pw_delete",         "method":"DELETE","path":"/pw/artifacts/{id}",    "params":["id"]},
    {"name":"pw_graph",          "method":"GET", "path":"/pw/graph",               "params":[]},
    {"name":"pw_gaps_analyze",   "method":"POST","path":"/pw/gaps/analyze/{id}",   "params":["id"]},
    {"name":"pw_gaps_fill",      "method":"POST","path":"/pw/gaps/fill/{id}",      "params":["id"]},
    {"name":"pw_mix",            "method":"POST","path":"/pw/mix",                 "params":["artifact_id_a","artifact_id_b"]},
    {"name":"pw_github_publish", "method":"POST","path":"/pw/github/{id}",         "params":["id"]},
    {"name":"pw_github_repos",   "method":"GET", "path":"/pw/github/repos",        "params":[]},
    {"name":"pw_trident_get",    "method":"GET", "path":"/pw/trident/{user_id}",   "params":["user_id"]},
    {"name":"pw_trident_set",    "method":"POST","path":"/pw/trident/{user_id}",   "params":["user_id","body"]},
    {"name":"pw_status",         "method":"GET", "path":"/pw/status",              "params":[]},
]

print(f"[PaperWorlds] {len(_PW_TOOLS)} routes registered under /pw/*")

# ── ENTRY ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
