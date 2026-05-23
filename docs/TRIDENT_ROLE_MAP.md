# Trident Role Map

## Purpose
This document prevents the POC from confusing the address model with the worker/connector Trident.

## Correct Separation

### Trident_synthia.onnx
`Trident_synthia.onnx` is the Synthia address model.

It is used for ontological addressing / address-space resolution.

It is not the wakeable Trident worker.
It is not an API endpoint.
It should not be treated as `/wake`.

Recommended config names:

```txt
TRIDENT_ADDRESS_MODEL_REPO=stellarproximology/Trident
TRIDENT_ADDRESS_MODEL_FILE=Trident_synthia.onnx
TRIDENT_ADDRESS_MODEL_URL=https://huggingface.co/stellarproximology/Trident/resolve/main/Trident_synthia.onnx
```

### General Trident
General Trident is the connector/worker layer for coding, research, math, MCP, and RAG.

It is represented by the `stellarproximology/Trident` repo and its runtime pieces:

```txt
model.py
rag.py
rag_client.js
signal_server.py
mcp_server.py
train.py
```

The wake/delegate path belongs to a running Trident connector service, not to the ONNX address model file.

Recommended config name:

```txt
TRIDENT_CONNECTOR_URL=<running Trident service URL>
```

## POC Rule
For the current proof of concept:

```txt
Kimi / Mobile MCP capture
  -> Synthia Server root connector
  -> MCP inbox / route
  -> Trident connector wake if configured
  -> ChatGPT inbox visibility
```

Addressing uses `Trident_synthia.onnx` as address model infrastructure.
Delegation uses General Trident as the MCP/RAG connector.

## No Hidden API Keys
This POC should not require OpenAI API keys or Kimi API keys.
Kimi and ChatGPT are logical routing labels/inboxes in the bridge, not server-side API clients.
