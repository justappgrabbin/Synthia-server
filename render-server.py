"""Render entrypoint for SYNTIA.

This file intentionally keeps the hyphenated filename requested for Render, so
Render should launch it with `python render-server.py` instead of importing it
as a Python module.
"""

import hashlib
import json
import os
import time
from typing import Any, Dict

import uvicorn
from fastapi import Request
from fastapi.responses import JSONResponse

from server import app, rag_add, rag_search, router_weights, trident_heuristic


def payload_hash(payload: Dict[str, Any]) -> str:
    raw = json.dumps(payload or {}, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]


def payload_summary(payload: Dict[str, Any]) -> Dict[str, Any]:
    content = payload.get("content") or payload.get("text") or payload.get("body") or ""
    filename = payload.get("filename") or payload.get("fileName") or payload.get("name") or "json-payload"
    return {
        "id": f"bridge_{payload_hash(payload)}",
        "filename": filename,
        "content_bytes": len(str(content).encode("utf-8")),
        "keys": sorted(list((payload or {}).keys())),
        "received_at": time.time(),
    }


@app.post("/ingest")
async def render_bridge_ingest(request: Request):
    payload = await request.json()
    summary = payload_summary(payload)
    content = payload.get("content") or payload.get("text") or payload.get("body") or json.dumps(payload, default=str)
    source = payload.get("source") or payload.get("filename") or payload.get("name") or "node-lite"

    chunks_added = 0
    text = str(content)
    for i in range(0, len(text), 500):
        chunk = text[i:i + 500].strip()
        if len(chunk) > 30:
            tag = "code" if any(marker in chunk for marker in ["function", "class", "import", "const ", "def "]) else "research"
            rag_add(chunk, source=source, head_tag=tag)
            chunks_added += 1

    return JSONResponse({
        "ok": True,
        "handled_by": "render-python-bridge",
        "summary": summary,
        "chunks_added": chunks_added,
        "message": "Payload accepted and indexed.",
    })


@app.post("/morph")
async def render_bridge_morph(request: Request):
    payload = await request.json()
    intent = payload.get("intent") or payload.get("text") or payload.get("goal") or "morph requested"
    weights = router_weights(str(intent))
    hits = rag_search(str(intent), top_k=3)
    proposal = trident_heuristic(str(intent), None, 80, 0.7, [h["text"][:160] for h in hits])
    return JSONResponse({"ok": True, "handled_by": "render-python-bridge", "intent": intent, "router_weights": weights, "proposal": proposal})


@app.post("/runtime")
async def render_bridge_runtime(request: Request):
    payload = await request.json()
    return JSONResponse({"ok": True, "handled_by": "render-python-bridge", "runtime": {"python": "online", "bridge": "ready", "accepted_payload_keys": sorted(list((payload or {}).keys()))}})


@app.post("/registry")
async def render_bridge_registry(request: Request):
    payload = await request.json()
    summary = payload_summary(payload)
    rag_add(json.dumps({"registry": summary, "payload": payload}, default=str)[:2000], source="registry", head_tag="code")
    return JSONResponse({"ok": True, "handled_by": "render-python-bridge", "entry": summary, "message": "Registry entry accepted and indexed."})


@app.post("/intent")
async def render_bridge_intent(request: Request):
    payload = await request.json()
    intent = payload.get("intent") or payload.get("text") or payload.get("message") or ""
    weights = router_weights(str(intent))
    chosen = max(weights, key=weights.get) if weights else "cynthia"
    hits = rag_search(str(intent), top_k=2)
    analysis = trident_heuristic(str(intent), chosen, 80, 0.75, [h["text"][:160] for h in hits])
    return JSONResponse({"ok": True, "handled_by": "render-python-bridge", "intent": intent, "head": chosen, "router_weights": weights, "analysis": analysis, "requires_confirmation": False})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
