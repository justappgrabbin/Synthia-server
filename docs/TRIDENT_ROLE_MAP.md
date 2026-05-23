# Current POC Wiring Note

## Purpose
This note records only the wiring needed for the current proof of concept.

It does not assign permanent jobs.
It does not define what MCP is allowed to do in the full system.
It does not tell future participants what their roles are.

The current task is to put the pieces where they go for this part of the system.

## Current POC Context
This part of the system uses MCP as the messenger and handoff path.

Current flow:

```txt
Kimi / Mobile MCP capture
  -> Synthia Server entry point
  -> MCP handoff path
  -> ChatGPT inbox / visible implementation handoff
```

That is the current usage for this POC only.

## Trident_synthia.onnx
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

## General Trident
General Trident is present as the broader Trident system/repo.

Current known repo:

```txt
https://huggingface.co/stellarproximology/Trident
```

Trident has code, research, math, and RAG capabilities. That is a description of what is present, not a rule defining or limiting MCP.

## Current Server Need
For this pass, Synthia Server only needs to expose the interface and handoff routes needed for the POC:

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

## No Hidden Model APIs
This POC should not require hidden server-side model API keys.

Kimi and ChatGPT are used as current handoff labels / interaction points in this POC, not as hidden server-side API clients.
