# Current POC Role + Wiring Orientation

## Purpose
This note gives orientation for the current proof of concept so the pieces land in the correct places.

It is not a permanent law for the full system.
It is not meant to restrict what MCP can become later.
It is meant to prevent this current POC from confusing the address model, Trident, MCP, the server, and the ChatGPT/Kimi handoff path.

## Current POC Goal
The current goal is one working handoff path:

```txt
Kimi / Mobile MCP capture
  -> Synthia Server entry point
  -> MCP messenger / handoff path
  -> ChatGPT inbox / visible implementation handoff
```

For this part of the system, MCP is being used as the messenger / handoff path.

That statement describes this POC usage only. It does not define or limit MCP globally.

## Current POC Orientation

### Synthia Server
For this POC, Synthia Server is the entry point and visible routing surface.

It receives captures, exposes the admin/client interface, and routes the handoff into the visible inbox/status flow.

Current needed routes:

```txt
/admin
/client
/mcp/status
/mcp/bootstrap
/mcp/capture
/mcp/artifact
/mcp/inbox/chatgpt
/substrate/inquire
/router/delegate
```

### MCP
For this POC, MCP carries the message/event through the handoff path.

This is the current use of MCP in this section of the system, not a permanent rule for all MCP behavior.

### Kimi
For this POC, Kimi is the source/capture side of the handoff path.

The server should not treat Kimi as a hidden server-side API client.

### ChatGPT
For this POC, ChatGPT is the visible implementation/inbox side of the handoff path.

The server should not treat ChatGPT as a hidden server-side API client.

### Trident_synthia.onnx
`Trident_synthia.onnx` is the Synthia address model.

It belongs to address-space / ontological addressing infrastructure.

It is not the message itself.
It is not a wake endpoint.
It is not a hidden server-side model API dependency.

Current known location:

```txt
TRIDENT_ADDRESS_MODEL_REPO=stellarproximology/Trident
TRIDENT_ADDRESS_MODEL_FILE=Trident_synthia.onnx
TRIDENT_ADDRESS_MODEL_URL=https://huggingface.co/stellarproximology/Trident/resolve/main/Trident_synthia.onnx
```

### General Trident
General Trident is present as the broader Trident system/repo.

Current known repo:

```txt
https://huggingface.co/stellarproximology/Trident
```

Trident has code, research, math, and RAG capabilities. That describes what is present in Trident. It does not define or limit MCP globally.

## No Hidden Model APIs
This POC should not require hidden server-side model API keys.

Kimi and ChatGPT are current handoff labels / interaction points in this POC, not hidden server-side API clients.

## Boundary
This note exists to orient the current build so the pieces are put where they go.

It should not be used to overwrite future system roles once the wider system is assembled and each participant has its own context.
