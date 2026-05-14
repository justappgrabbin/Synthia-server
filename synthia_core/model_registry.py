"""Synthia seven-model registry.

This module assigns each Hugging Face design model a clear system job.
The models are not treated as random helpers; they are design bodies that the
orchestrator can route through by role.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict, List, Optional


@dataclass(frozen=True)
class ModelDesign:
    id: str
    repo: str
    role: str
    job: str
    supports_agents: List[str]
    input_contract: str
    output_contract: str
    execution_scope: str
    fallback: Optional[str] = None


SEVEN_MODEL_REGISTRY: Dict[str, ModelDesign] = {
    "trident": ModelDesign(
        id="trident",
        repo="stellarproximology/Trident",
        role="field_signature_interpreter",
        job="Translate field-language signals into addressable Synthia routing features.",
        supports_agents=["address_interpreter", "field_gateway", "resonance_locator"],
        input_contract="field vector, symbolic signal, or structured context payload",
        output_contract="address candidates, routing features, confidence signals",
        execution_scope="inner_addressing",
        fallback="2dilbert",
    ),
    "synthia": ModelDesign(
        id="synthia",
        repo="stellarproximology/Synthia",
        role="core_resonance_synthesis",
        job="Synthesize identity-field, state, and resonance context into coherent system posture.",
        supports_agents=["identity_surface", "state_reader", "resonance_synthesizer"],
        input_contract="entity profile, state context, address fields, memory hints",
        output_contract="field synthesis, resonance summary, state alignment hints",
        execution_scope="inner_state",
        fallback="synthai",
    ),
    "synthai": ModelDesign(
        id="synthai",
        repo="stellarproximology/SynthAI",
        role="coordination_support",
        job="Support orchestrator decisions, task decomposition, and route explanation.",
        supports_agents=["orchestrator", "structure_agent", "route_explainer"],
        input_contract="task, entity state, available agents, policy result, memory summary",
        output_contract="route plan, cluster suggestion, explanation candidates",
        execution_scope="inner_orchestration",
        fallback="distilbert",
    ),
    "synthiabot": ModelDesign(
        id="synthiabot",
        repo="stellarproximology/synthiabot",
        role="companion_interface_body",
        job="Provide user-facing companion expression while respecting orchestrator state.",
        supports_agents=["companion_agent", "dashboard_guide", "conversation_surface"],
        input_contract="user message, visible state, route result, allowed context",
        output_contract="user-facing response, guidance, clarifying question when needed",
        execution_scope="interface_expression",
        fallback="synthai",
    ),
    "gnn": ModelDesign(
        id="gnn",
        repo="stellarproximology/Gnn",
        role="network_topology_model",
        job="Score relationships, bridges, clusters, and resonance network structure.",
        supports_agents=["social_router", "cluster_builder", "network_mapper"],
        input_contract="graph nodes, edges, entity addresses, interaction signals",
        output_contract="cluster scores, bridge nodes, topology recommendations",
        execution_scope="network_resonance",
        fallback=None,
    ),
    "distilbert": ModelDesign(
        id="distilbert",
        repo="stellarproximology/Distilbert",
        role="semantic_router",
        job="Classify text and intent for fast semantic routing into Synthia lanes.",
        supports_agents=["intent_classifier", "semantic_router", "memory_indexer"],
        input_contract="text, task description, memory snippet, document fragment",
        output_contract="intent class, semantic tags, routing lane, confidence",
        execution_scope="semantic_routing",
        fallback="2dilbert",
    ),
    "2dilbert": ModelDesign(
        id="2dilbert",
        repo="stellarproximology/2dilbert",
        role="lightweight_fallback_router",
        job="Run lightweight fallback classification when larger models are unavailable or too slow.",
        supports_agents=["fallback_router", "local_classifier", "availability_guard"],
        input_contract="short text or compact feature payload",
        output_contract="basic class, confidence, fallback route",
        execution_scope="fast_local_routing",
        fallback=None,
    ),
}


def list_model_designs() -> List[dict]:
    return [asdict(model) for model in SEVEN_MODEL_REGISTRY.values()]


def get_model_design(model_id: str) -> ModelDesign:
    key = model_id.strip().lower()
    if key not in SEVEN_MODEL_REGISTRY:
        raise KeyError(f"Unknown Synthia model design: {model_id}")
    return SEVEN_MODEL_REGISTRY[key]


def models_for_scope(scope: str) -> List[ModelDesign]:
    return [model for model in SEVEN_MODEL_REGISTRY.values() if model.execution_scope == scope]
