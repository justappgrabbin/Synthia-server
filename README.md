# TRIDENT — 3-Head Tiny LM + P2P RAG + MCP

~1M parameter transformer with three specialist heads: **Code**, **Math**, **Research**.
Runs on CPU (Termux/iPad/laptop). Knowledge retrieval via P2P WebRTC — no cloud needed.

## Files
- `model.py`        — Trident architecture (backbone + 3 heads + RAG gate)
- `rag.py`          — Python chunk store + P2P RAG node (aiortc)
- `rag_client.js`   — Browser P2P RAG client (WebRTC DataChannel)
- `signal_server.py`— Minimal WebSocket signaling (handshake only, ~50 lines)
- `mcp_server.py`   — FastMCP server exposing all tools to Claude/any LLM
- `train.py`        — Training loop (toy data → real data)

## Quick Start

```bash
# Install
pip install -r requirements.txt

# Test model architecture
python model.py

# Train on toy data (CPU, ~1 min)
python train.py

# Run MCP server (connect to Claude Desktop)
python mcp_server.py

# Run signaling server for P2P
python signal_server.py
```

## P2P RAG Flow

```
Device A (your phone)
  └─ TRIDENT_P2P.query("fibonacci")
       └─ WebRTC DataChannel → Device B (iPad)
            └─ Device B searches local chunks
            └─ Returns top-K matches
       └─ Device A merges local + peer results
       └─ Top-K embeddings → RAGFusionGate → model generates
```

## MCP Tools

| Tool                  | What it does                              |
|-----------------------|-------------------------------------------|
| `trident_generate`    | Generate text, pick head, optionally RAG  |
| `trident_add_chunk`   | Add knowledge to RAG store                |
| `trident_search_rag`  | Search chunks without generating          |
| `trident_router`      | Predict which head fits a query           |
| `trident_list_chunks` | List all stored knowledge chunks          |

## Architecture

```
Input → [Embedding + PositionalEncoding]
      → [Backbone: 4x TransformerBlock]  ← shared 
      → [HeadRouter]  → softmax weights
      → ┌─────────────────────────────┐
        │ RAGFusionGate (cross-attn)  │  ← per head
        │ 1x TransformerBlock         │
        │ LM Head → logits            │
        └─────────────────────────────┘ × 3 heads
      → weighted ensemble OR forced single head
```
