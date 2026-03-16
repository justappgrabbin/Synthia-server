# SYNTIA SERVER

Full stack consciousness engine. One file. Deploys to Render for free.

## What this does

- **Trident** — 3-head LM (code/math/research) with RAG store, 36 channels pre-seeded
- **Consciousness** — 9-body field calculator (swisseph if available, heuristic fallback)
- **GNN Chart** — ONNX model inference, gate addresses, codon scores
- **Memory** — per-user JSONL conversation history
- **Oracle** — Cynthia + Trident crew, routes through Groq if key provided
- **SSE** — always-on event stream

## Deploy to Render (from your phone, 5 minutes)

### Step 1 — GitHub
1. Go to **github.com** on your phone
2. Sign in (or create free account)
3. Tap **+** → **New repository**
4. Name it `syntia-server`, make it **Private**, hit **Create**
5. Tap **Add file** → **Upload files**
6. Upload all 4 files: `server.py`, `requirements.txt`, `render.yaml`, `README.md`
7. If you have `model.onnx` — upload that too (makes GNN real instead of heuristic)
8. Commit

### Step 2 — Render
1. Go to **render.com** on your phone
2. Sign up with GitHub (free)
3. Tap **New +** → **Web Service**
4. Connect your `syntia-server` repo
5. Render auto-detects `render.yaml` — just tap **Deploy**
6. Wait ~2 minutes for first build

### Step 3 — Add your keys (optional but recommended)
In Render dashboard → your service → **Environment**:
- `GROQ_KEY` = your Groq key (free at console.groq.com — makes oracle actually smart)
- Keep `PORT` and `DATA_DIR` as-is

### Step 4 — Get your URL
Render gives you: `https://syntia-server.onrender.com`

Put that URL in the SYNTIA OS app → Config → MCP Bridge URL → Save → Connect

## Your URL goes in the app

In `syntia-os.html` → Config tab → paste your Render URL.

Or hardcode it: find `stellarproximology-syntia-mcp.hf.space` and replace with your URL.

## Endpoints

| Method | Path | What it does |
|--------|------|--------------|
| GET | `/` | Status page |
| GET | `/health` | Health check |
| GET | `/sse` | Always-on SSE stream |
| POST | `/trident/generate` | 3-head LM generation |
| POST | `/trident/router` | Route to best head |
| POST | `/trident/rag/add` | Add to knowledge base |
| POST | `/trident/rag/search` | Search knowledge base |
| GET | `/trident/rag/list` | List all chunks |
| POST | `/consciousness/profile` | 9-body field from birth data |
| POST | `/consciousness/chart` | Full GNN chart + addresses |
| GET | `/consciousness/wave` | Wave state for gate/line/layer |
| POST | `/consciousness/coherence` | Field coupling between two gate sets |
| GET | `/consciousness/gate/{n}` | Gate mechanics + gift/shadow/siddhi |
| GET | `/consciousness/channels` | All 36 HD channels |
| POST | `/memory/save` | Save message to user history |
| GET | `/memory/{user_id}` | Get conversation history |
| DELETE | `/memory/{user_id}` | Clear user history |
| POST | `/oracle/ask` | Full Cynthia oracle with memory |
| GET | `/tools` | Full tool manifest |

## Capability tiers

**Without any extras (free heuristic mode):**
- All endpoints work
- Trident generates patterned text from head pools
- Consciousness uses deterministic birth-date heuristic
- RAG search works (pre-seeded with 47 chunks)
- Memory saves/loads conversation history
- Oracle routes and responds

**With `GROQ_KEY` (free at console.groq.com):**
- Oracle becomes actually intelligent — Cynthia, Echo, Venom, Siren, MCP all work
- Trident generate hits real LLM

**With `model.onnx` uploaded:**
- GNN chart uses real ONNX inference
- Codon scores come from your trained model

**With `pyswisseph` installed (auto from requirements.txt):**
- Consciousness profile uses real ephemeris
- 9-body fields are astrologically accurate

## Windows setup (when you're back at your PC)

```bash
pip install -r requirements.txt
python server.py
```
Server runs at `http://localhost:10000`

## Notes

- Free Render tier sleeps after 15min idle but **wakes in ~30 seconds** on request
- Upgrade to Render Starter ($7/mo) for always-on
- Data (`./data` folder) persists between deploys on Render
- All keys stay on Render — never in the HTML
