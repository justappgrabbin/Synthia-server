# 🌍 Paper Worlds Server

Backend for the Paper Worlds consciousness artifact mesh.  
Runs **alongside Synthia** on Render. Separate service, shared Supabase.

## What it does

Every file you upload goes through a pipeline:

```
Upload (any file type)
  ↓
Ontological Address assigned (Gate.Line.Color.Tone.Base → 22T position)
  ↓
Stored in Supabase (pw_artifacts table)
  ↓
Gap Analysis (missing viewport? broken refs? orphaned node?)
  ↓
Auto-fill static gaps (viewport, charset, title, http→https)
  ↓
Resonance scan → auto-mix with matching artifacts
  ↓
Notify Synthia server
  ↓
WebSocket broadcast to all connected clients
  ↓
Graph updated (nodes + edges live)
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Server + Synthia status |
| `POST` | `/api/upload` | Upload files (multipart) |
| `POST` | `/api/build` | Ingest Paper Pal HTML build |
| `GET`  | `/api/artifacts` | All artifacts |
| `GET`  | `/api/artifacts/:id` | One artifact |
| `DELETE` | `/api/artifacts/:id` | Delete |
| `GET`  | `/api/artifacts/:id/zip` | Download as zip |
| `GET`  | `/api/graph` | Full graph (nodes + edges) |
| `POST` | `/api/gaps/analyze/:id` | Run gap analysis |
| `POST` | `/api/gaps/fill/:id` | Auto-fill all static gaps |
| `GET`  | `/api/gaps/graph` | Graph-level gap analysis |
| `GET`  | `/api/gaps` | All open gaps |
| `POST` | `/api/mix` | Manually mix two artifacts |
| `POST` | `/api/github/publish/:id` | Publish to GitHub |
| `GET`  | `/api/github/repos` | List Paper Worlds repos |
| `GET`  | `/api/trident/:userId` | Get Trident state |
| `POST` | `/api/trident/:userId` | Update Trident state |
| `GET`  | `/api/synthia/status` | Synthia server status |

## WebSocket events (ws://your-server/ws)

```json
{ "type": "artifact_created",  "data": { "id", "name", "gate", "signature" } }
{ "type": "gaps_detected",     "data": { "artifact_id", "gaps": [...] } }
{ "type": "mix_created",       "data": { "result_name", "result_id", "resonance_score" } }
{ "type": "artifact_updated",  "data": { "id", "name" } }
{ "type": "artifact_deleted",  "data": { "id" } }
{ "type": "github_published",  "data": { "artifact_id", "repo_url" } }
{ "type": "trident_updated",   "data": { "user_id", "stage" } }
```

## Setup

### 1. Supabase — run the schema

Copy the SQL from `src/db.ts` → `SCHEMA_SQL` constant.  
Paste into your Supabase SQL editor and run.  
(Your project: `leisphnjslcuepflefri.supabase.co`)

### 2. Environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in:
- `SUPABASE_SERVICE_KEY` — from Supabase → Settings → API → service_role key
- `ANTHROPIC_API_KEY` — for mixer + gap filler AI
- `GITHUB_TOKEN` — Personal Access Token with `repo` scope
- `CORS_ORIGINS` — your frontend URL(s)

### 3. Deploy to Render

1. Push this folder to a new GitHub repo
2. Go to render.com → New Web Service → connect the repo
3. It will detect `render.yaml` automatically
4. Add env vars in Render dashboard
5. Deploy

Or use the GitHub Action (add `RENDER_API_KEY` + `RENDER_SERVICE_ID` to repo secrets).

### 4. Wire the frontend

In `paper-worlds-complete.html`, set:
```js
const BACKEND_URL = 'https://paper-worlds-server.onrender.com';
```

The frontend will then:
- Upload files to `/api/upload` instead of localStorage
- Fetch the graph from `/api/graph`
- Subscribe to WebSocket for live updates
- Push Paper Pal builds to `/api/build`

## Architecture

```
paper-worlds-server (Render, port 3002)
    │
    ├── /api/upload ──────────► Supabase pw_artifacts
    │                              ↓
    ├── Gap Filler ────────────► pw_gaps
    │                              ↓
    ├── Mixer ─────────────────► pw_artifacts (mixed)
    │                              ↓
    ├── GitHub Publisher ──────► GitHub repos
    │                              ↓
    └── Synthia Bridge ────────► synthia-server.onrender.com
                                   ↓
                               Trident ONNX model
```

## Adaya's HD Gates (pre-loaded)

Gates 6, 17, 18, 25, 32, 46, 51, 57, 59 are pre-loaded as the baseline
consciousness coordinates. Uploads resonating with these gates get flagged
as high-resonance and prioritized in the mixer.
