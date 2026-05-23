# Trident Role Map

## Purpose
This document prevents the POC from confusing the Synthia address model with the general Trident system.

It also keeps the current MCP usage clear without turning that usage into a permanent architectural law.

## Current POC Usage
For the current proof of concept, MCP is the messenger / handoff layer.

That means MCP carries the message or event from the current interaction point into the Synthia server path so it can be routed to the right place.

This is a statement about the current POC usage, not a universal restriction on what MCP may do in other Trident contexts.

## Correct Separation

### Trident_synthia.onnx
`Trident_synthia.onnx` is the Synthia address model.

It is used for ontological addressing / address-space resolution.

It is not the wakeable Trident runtime by itself.
It is not an API endpoint.
It should not be treated as `/wake`.

Recommended config names:

```txt
TRIDENT_ADDRESS_MODEL_REPO=stellarproximology/Trident
TRIDENT_ADDRESS_MODEL_FILE=Trident_synthia.onnx
TRIDENT_ADDRESS_MODEL_URL=https://huggingface.co/stellarproximology/Trident/resolve/main/Trident_synthia.onnx
```

### General Trident
General Trident is the broader Trident system.

Trident has capabilities including code, research, math, and RAG.

Those capabilities describe what Trident can do. They do not define a limit for MCP.

### Trident MCP
Trident MCP is the MCP interface attached to Trident.

In this POC, MCP is being used as the messenger/handoff layer for the Kimi / Mobile MCP / Synthia Server / ChatGPT path.

In other contexts, Trident MCP may support whatever coordination the Trident runtime needs.

The wake/delegate path belongs to a running Trident runtime or connector service, not to the ONNX address model file.

Recommended config name:

```txt
TRIDENT_CONNECTOR_URL=<running Trident runtime or connector service URL>
```

## POC Flow
For the current proof of concept:

```txt
Kimi / Mobile MCP capture
  -> Synthia Server root connector
  -> MCP messenger / handoff path
  -> Trident runtime participation if needed
  -> ChatGPT inbox visibility
```

Addressing uses `Trident_synthia.onnx` as address model infrastructure.
General Trident provides the broader runtime/capability layer.
MCP is the messenger/handoff layer for this POC.

## No Hidden API Keys
This POC should not require OpenAI API keys or Kimi API keys.
Kimi and ChatGPT are logical routing labels/inboxes in the bridge, not server-side API clients.
