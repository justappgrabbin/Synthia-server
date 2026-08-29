# Synthia Systematic Integration

This directory is the canonical integration lane for Synthia app/module pushes.

Rules:
- Preserve each app/module identity and function.
- Preserve canonical address metadata; do not create a parallel registry.
- Integrate in dependency order, not upload order.
- No destructive replacement of existing working behavior.
- Every push must name its donor/source, dependencies, verification status, and unresolved gaps.
- Supabase is persistence/sync, not the authoritative runtime.
- MCP is a message/coordination bridge, not Synthia itself.

## Current repository frontier
The repository currently contains the Control Center, MCP connector bus, upload routing, address logic, and bridge infrastructure. The later StateSpace/Mesh/ATO/self-build line is not yet represented here as the canonical integrated source.

## Integration order
1. Runtime foundation: canonical StateSpace + canonical event/state envelope + Mesh + ATO bridge.
2. Tool Factory / self-build effectors and approval-gated code changes.
3. Editor Morph / phone visual editor + ZIP ingest/regenerate workbench.
4. AUTOLING + DISEMINER + coding/research tool family.
5. Smart Browser / execution effectors.
6. Foundry / app construction family.
7. Embodiment / Spatial Automata / world projection.
8. Remaining application families, each retained as an independently addressable identity.

The first application-facing push after the runtime foundation is Editor Morph.
