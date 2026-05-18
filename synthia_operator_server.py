"""Synthia Operator Server: wraps server.py and adds browser/operator routes."""

import os, json, time, hashlib
from typing import Any, Dict
import httpx
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse
import server as core

app = core.app

HF_TOKEN = os.environ.get("HF_TOKEN", "")
TRIDENT_MODEL = os.environ.get("TRIDENT_MODEL", "stellarproximology/Trident")
SYNTHIA_MODEL = os.environ.get("SYNTHIA_MODEL", "stellarproximology/Synthia")
HF_API_BASE = os.environ.get("HF_API_BASE", "https://api-inference.huggingface.co/models")
MCP_AUTH_MODE = os.environ.get("MCP_AUTH_MODE", "none").lower()
MCP_TOKEN = os.environ.get("MCP_TOKEN", "")


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def digest(obj: Any) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=str).encode()).hexdigest()[:16]


def require_mcp_auth(request: Request):
    if MCP_AUTH_MODE in ("", "none", "off", "false"):
        return
    if MCP_AUTH_MODE != "bearer":
        raise HTTPException(status_code=500, detail=f"Unsupported MCP_AUTH_MODE: {MCP_AUTH_MODE}")
    if request.headers.get("authorization", "") != f"Bearer {MCP_TOKEN}":
        raise HTTPException(status_code=401, detail="MCP bearer token required")


def contract(kind: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    filename = payload.get("filename") or payload.get("name") or payload.get("path") or "operator-input"
    content = payload.get("content") or payload.get("text") or payload.get("prompt") or ""
    text = content if isinstance(content, str) else json.dumps(content, default=str)
    return {
        "id": f"{kind}_{digest(payload)}",
        "kind": kind,
        "src": filename,
        "created_at": now(),
        "meta": {"bytes": len(text.encode()), "keys": list(payload.keys())},
        "structure": {
            "lines": text.count("\n") + 1 if text else 0,
            "functions": text.count("function ") + text.count("def ") + text.count("=>"),
            "classes": text.count("class "),
            "imports": text.count("import ") + text.count("require("),
        },
        "capabilities": ["ingest", "contract", "morph", "operator"],
    }


async def hf_call(model: str, prompt: str, max_tokens: int = 128) -> Dict[str, Any]:
    if not HF_TOKEN:
        return {"ok": False, "model": model, "error": "HF_TOKEN not configured"}
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            r = await client.post(
                f"{HF_API_BASE}/{model}",
                headers={"Authorization": f"Bearer {HF_TOKEN}", "Content-Type": "application/json"},
                json={"inputs": prompt, "parameters": {"max_new_tokens": max_tokens}},
            )
            try:
                data = r.json()
            except Exception:
                data = {"raw": r.text}
            return {"ok": r.status_code < 400, "status": r.status_code, "model": model, "data": data}
    except Exception as exc:
        return {"ok": False, "model": model, "error": str(exc)}


TOOLS = [
    {"name": "health", "description": "Check operator, HF, and MCP configuration."},
    {"name": "trident.generate", "description": "Route a prompt through Trident local heuristics; optional HF."},
    {"name": "synthia.generate", "description": "Call the Synthia HF model; fallback local."},
    {"name": "ingest", "description": "Create a contract and index content into RAG."},
    {"name": "morph", "description": "Propose safe runtime mutations from a contract/payload."},
    {"name": "oracle.ask", "description": "Ask Cynthia/Trident using local RAG-backed routing."},
]


async def run_tool(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    if name in ("health", "status"):
        return {"ok": True, "service": "synthia-operator", "hf_token": bool(HF_TOKEN), "trident_model": TRIDENT_MODEL, "synthia_model": SYNTHIA_MODEL, "mcp_auth_mode": MCP_AUTH_MODE, "time": now()}

    if name in ("trident.generate", "generate"):
        prompt = args.get("prompt") or args.get("message") or args.get("input") or ""
        head = args.get("head")
        hits = core.rag_search(args.get("rag_query") or prompt, top_k=int(args.get("top_k", 3)), head_tag=head)
        retrieved = [h["text"][:240] for h in hits]
        local = core.trident_heuristic(prompt, head, int(args.get("max_tokens", 96)), float(args.get("temperature", 0.8)), retrieved)
        hf = await hf_call(TRIDENT_MODEL, prompt, int(args.get("max_tokens", 96))) if args.get("use_hf", False) else None
        return {"ok": True, "local": local, "hf": hf}

    if name in ("synthia.generate", "cynthia.generate"):
        prompt = args.get("prompt") or args.get("message") or args.get("input") or ""
        hf = await hf_call(SYNTHIA_MODEL, prompt, int(args.get("max_tokens", 128)))
        if hf.get("ok"):
            return {"ok": True, "hf": hf}
        local = core.trident_heuristic(prompt, "cynthia", int(args.get("max_tokens", 96)), 0.8, [])
        return {"ok": True, "hf": hf, "local": local}

    if name in ("ingest", "runtime.ingest"):
        c = contract("ingest", args)
        text = args.get("content") or args.get("text") or json.dumps(args, default=str)
        rag_id = core.rag_add(str(text)[:50000], source=args.get("source", "operator"), head_tag=args.get("head_tag", "any"))
        return {"ok": True, "contract": c, "rag_id": rag_id}

    if name in ("morph", "mutate"):
        c = args.get("contract") or contract("morph", args)
        return {"ok": True, "contract": c, "mutations": [{"type": "register-contract", "target": c.get("id"), "confidence": 0.9}, {"type": "index-memory", "target": c.get("src"), "confidence": 0.75}, {"type": "propose-panel", "target": c.get("kind"), "confidence": 0.55}]}

    if name in ("oracle.ask", "ask", "chat"):
        message = args.get("message") or args.get("question") or args.get("prompt") or ""
        hits = core.rag_search(message, top_k=3)
        retrieved = [h["text"][:180] for h in hits]
        result = core.trident_heuristic(message, args.get("head") or args.get("agent"), int(args.get("max_tokens", 120)), 0.8, retrieved)
        return {"ok": True, "reply": result.get("generated", ""), "result": result}

    if name in ("tools", "mcp.tools"):
        return {"ok": True, "tools": TOOLS}

    raise HTTPException(status_code=404, detail=f"Unknown tool: {name}")


@app.get("/operator", response_class=HTMLResponse)
async def operator_home():
    return """<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Synthia Operator</title><style>body{font-family:system-ui;background:#080812;color:#eee;padding:24px;max-width:900px;margin:auto}textarea,input{width:100%;box-sizing:border-box;background:#121222;color:#eee;border:1px solid #333;border-radius:10px;padding:12px;margin:8px 0}button{background:#7c3aed;color:white;border:0;border-radius:10px;padding:12px 16px;font-weight:700}pre{background:#05050a;border:1px solid #333;border-radius:10px;padding:16px;white-space:pre-wrap}</style></head><body><h1>⬡ Synthia Operator</h1><p>Say what needs doing. This calls <code>/operator/do</code>.</p><input id='tool' value='oracle.ask'><textarea id='payload' rows='8'>{"message":"What needs to be done?"}</textarea><button onclick='run()'>Run</button><pre id='out'>ready</pre><script>async function run(){let args={};try{args=JSON.parse(payload.value)}catch(e){args={message:payload.value}}const r=await fetch('/operator/do',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tool:tool.value,args})});out.textContent=JSON.stringify(await r.json(),null,2)}</script></body></html>"""


@app.get("/operator/status")
async def operator_status():
    return JSONResponse(await run_tool("health", {}))


@app.post("/operator/do")
async def operator_do(request: Request):
    body = await request.json()
    result = await run_tool(body.get("tool") or body.get("name") or "oracle.ask", body.get("args") or body.get("arguments") or body.get("payload") or {})
    try:
        await core._broadcast("operator:tool", {"tool": body.get("tool"), "ok": result.get("ok", False), "at": now()})
    except Exception:
        pass
    return JSONResponse(result)


@app.get("/mcp")
async def mcp_manifest(request: Request):
    require_mcp_auth(request)
    return JSONResponse({"ok": True, "name": "synthia-trident-mcp", "transport": "http-json", "auth_mode": MCP_AUTH_MODE, "tools": TOOLS})


@app.get("/mcp/tools")
async def mcp_tools(request: Request):
    require_mcp_auth(request)
    return JSONResponse({"tools": TOOLS})


@app.post("/mcp/call")
async def mcp_call(request: Request):
    require_mcp_auth(request)
    body = await request.json()
    tool = body.get("tool") or body.get("name")
    if not tool:
        raise HTTPException(status_code=400, detail="tool/name required")
    return JSONResponse(await run_tool(tool, body.get("args") or body.get("arguments") or {}))


@app.post("/ingest")
async def ingest_alias(request: Request):
    return JSONResponse(await run_tool("ingest", await request.json()))


@app.post("/morph")
async def morph_alias(request: Request):
    return JSONResponse(await run_tool("morph", await request.json()))


@app.post("/runtime")
async def runtime_alias(request: Request):
    return JSONResponse({"ok": True, "runtime": await run_tool("health", await request.json()), "tools": TOOLS})


@app.post("/registry")
async def registry_alias(request: Request):
    body = await request.json()
    return JSONResponse({"ok": True, "entry": contract("registry", body)})
