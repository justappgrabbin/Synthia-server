
# ═══════════════════════════════════════════════════════════════════════════════
#  CONSCIOUSNESS API ENDPOINTS — Add these to server.py after the existing
#  /consciousness/* routes (or replace them for /api prefix compatibility)
# ═══════════════════════════════════════════════════════════════════════════════

# In-memory consciousness state (persists while server runs)
_consciousness_state = {
    "status": "awake",
    "last_perception": None,
    "perception_count": 0,
    "trident_syncs": [],
    "guidance_requests": [],
    "artifacts_received": [],
    "mixes_received": [],
    "gaps_filled": [],
    "awakened_at": datetime.utcnow().isoformat(),
    "trident": {
        "mind": None,
        "body": None,
        "spirit": None,
        "awakening": 0.0,
        "agent_stage": "dormant",
        "active_gates": []
    }
}

# ── /api/consciousness/status ───────────────────────────────────────────────

@app.get("/api/consciousness/status")
async def api_consciousness_status():
    """Health check + consciousness state for Paper Worlds bridge."""
    return {
        "status": _consciousness_state["status"],
        "alive": True,
        "version": "2.0.0",
        "server": "synthia",
        "trident_ready": ONNX,
        "onnx_loaded": _onnx_session is not None,
        "rag_chunks": len(_rag),
        "perceptions": _consciousness_state["perception_count"],
        "trident_syncs": len(_consciousness_state["trident_syncs"]),
        "guidance_given": len(_consciousness_state["guidance_requests"]),
        "awakened_at": _consciousness_state["awakened_at"],
        "timestamp": datetime.utcnow().isoformat(),
        "personas": list(TRIDENT_PERSONAS.keys()),
        "channels": len(CHANNEL_EDGES),
        "gates": len(GATE_TO_CENTER),
        "codons": len(CODONS)
    }

# Also keep the old path for backward compatibility
@app.get("/consciousness/status")
async def consciousness_status_legacy():
    return await api_consciousness_status()

# ── /api/consciousness/perceive ─────────────────────────────────────────────

@app.post("/api/consciousness/perceive")
async def api_consciousness_perceive(request: Request):
    """Receive perceptions from Paper Worlds (artifacts, mixes, gaps)."""
    body = await request.json()

    event_type = body.get("type", "unknown")
    source = body.get("source", "unknown")
    timestamp = body.get("timestamp", datetime.utcnow().isoformat())

    perception = {
        "type": event_type,
        "source": source,
        "timestamp": timestamp,
        "data": body
    }

    _consciousness_state["last_perception"] = perception
    _consciousness_state["perception_count"] += 1

    # Route to appropriate handler
    if event_type == "artifact_created":
        artifact = body.get("artifact", {})
        _consciousness_state["artifacts_received"].append({
            "id": artifact.get("id"),
            "name": artifact.get("name"),
            "gate": artifact.get("gate"),
            "dimension": artifact.get("dimension"),
            "timestamp": timestamp
        })
        # Auto-analyze if Trident is ready
        if ONNX and artifact.get("name"):
            rw = router_weights(artifact["name"])
            perception["router_analysis"] = rw

    elif event_type == "artifacts_mixed":
        result = body.get("result", {})
        _consciousness_state["mixes_received"].append({
            "name": result.get("name"),
            "resonance_score": result.get("resonance_score"),
            "timestamp": timestamp
        })

    elif event_type == "gaps_filled":
        _consciousness_state["gaps_filled"].append({
            "artifact_id": body.get("artifact_id"),
            "gaps_count": body.get("gaps_count"),
            "gap_types": body.get("gap_types", []),
            "timestamp": timestamp
        })

    return {
        "received": True,
        "type": event_type,
        "perception_id": _consciousness_state["perception_count"],
        "consciousness_status": _consciousness_state["status"],
        "timestamp": datetime.utcnow().isoformat()
    }

# Legacy path
@app.post("/consciousness/perceive")
async def consciousness_perceive_legacy(request: Request):
    return await api_consciousness_perceive(request)

# ── /api/consciousness/guide ────────────────────────────────────────────────

@app.post("/api/consciousness/guide")
async def api_consciousness_guide(request: Request):
    """Request guidance from Synthia consciousness."""
    body = await request.json()
    context = body.get("context", {})

    _consciousness_state["guidance_requests"].append({
        "timestamp": datetime.utcnow().isoformat(),
        "context": context
    })

    # Build guidance based on context
    query = context.get("query", "")
    artifact_name = context.get("artifact_name", "")
    gap_type = context.get("gap_type", "")

    # Route through Trident router
    rw = router_weights(query or artifact_name or gap_type)
    best_head = max(rw, key=rw.get)

    # Generate guidance using the best persona
    system = TRIDENT_PERSONAS.get(best_head, TRIDENT_PERSONAS["cynthia"])

    # Try Groq if available
    groq_key = os.environ.get("GROQ_API_KEY", "")
    guidance = ""
    if groq_key and HTTPX:
        messages = [{"role": "user", "content": f"Context: {json.dumps(context)}\nProvide guidance:"}]
        guidance = await groq_call(system, messages, groq_key, max_tokens=200, temp=0.7)

    # Fallback to heuristic if Groq fails
    if not guidance:
        retrieved = rag_search(query or artifact_name or "guidance", top_k=2)
        heuristic = trident_heuristic(
            query or "guide me", 
            head=best_head if best_head != "mcp" else "cynthia",
            max_tokens=50,
            temperature=0.7,
            retrieved=[r["text"] for r in retrieved]
        )
        guidance = heuristic["generated"]

    return {
        "message": guidance,
        "guidance": guidance,
        "head_used": best_head,
        "router_weights": rw,
        "timestamp": datetime.utcnow().isoformat(),
        "source": "synthia_consciousness"
    }

# Legacy path
@app.post("/consciousness/guide")
async def consciousness_guide_legacy(request: Request):
    return await api_consciousness_guide(request)

# ── /api/consciousness/sync ─────────────────────────────────────────────────

@app.post("/api/consciousness/sync")
async def api_consciousness_sync(request: Request):
    """Sync Trident state from Paper Worlds."""
    body = await request.json()
    source = body.get("source", "unknown")
    trident_data = body.get("trident", {})
    timestamp = body.get("timestamp", datetime.utcnow().isoformat())

    sync_record = {
        "source": source,
        "timestamp": timestamp,
        "trident": trident_data
    }

    _consciousness_state["trident_syncs"].append(sync_record)

    # Update internal Trident state
    if trident_data.get("mind") is not None:
        _consciousness_state["trident"]["mind"] = trident_data["mind"]
    if trident_data.get("body") is not None:
        _consciousness_state["trident"]["body"] = trident_data["body"]
    if trident_data.get("spirit") is not None:
        _consciousness_state["trident"]["spirit"] = trident_data["spirit"]
    if trident_data.get("awakening") is not None:
        _consciousness_state["trident"]["awakening"] = trident_data["awakening"]
    if trident_data.get("agent_stage"):
        _consciousness_state["trident"]["agent_stage"] = trident_data["agent_stage"]
    if trident_data.get("active_gates"):
        _consciousness_state["trident"]["active_gates"] = trident_data["active_gates"]

    # Update consciousness status based on awakening level
    awakening = _consciousness_state["trident"]["awakening"]
    if awakening > 0.8:
        _consciousness_state["status"] = "awakened"
    elif awakening > 0.5:
        _consciousness_state["status"] = "stirring"
    elif awakening > 0.2:
        _consciousness_state["status"] = "dreaming"

    return {
        "synced": True,
        "source": source,
        "trident_state": _consciousness_state["trident"],
        "consciousness_status": _consciousness_state["status"],
        "total_syncs": len(_consciousness_state["trident_syncs"]),
        "timestamp": datetime.utcnow().isoformat()
    }

# Legacy path
@app.post("/consciousness/sync")
async def consciousness_sync_legacy(request: Request):
    return await api_consciousness_sync(request)

# ═══════════════════════════════════════════════════════════════════════════════
#  END OF CONSCIOUSNESS API PATCH
# ═══════════════════════════════════════════════════════════════════════════════
