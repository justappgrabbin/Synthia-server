"""
quantum_bridge.py
YOU-N-I-VERSE — Structural Phase-Lock Layer

Tracks whether the underlying 32-axis + trinity substrate is converging.
Sits alongside state_observer.py — they cross-feed.

Observer = readiness of the human (behavioral)
Bridge   = readiness of the substrate (structural)
GNN      = routes based on both

Pure Python. No numpy required. Pyodide compatible.
"""

import math
import hashlib
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime


# ═══════════════════════════════════════════════════════════════════
# AXIS POLARITY — 32 axes × 2 faces = 64 gates
# ═══════════════════════════════════════════════════════════════════

@dataclass
class AxisPolarity:
    axis_id:            int
    positive_gate:      int
    negative_gate:      int
    current_face:       int    # 1 or -1
    activation_strength: float

    def get_active_gate(self) -> int:
        return self.positive_gate if self.current_face == 1 else self.negative_gate

    def flip(self):
        self.current_face *= -1


def _dot(a: list, b: list) -> float:
    return sum(x*y for x,y in zip(a,b))

def _norm(v: list) -> float:
    return math.sqrt(sum(x*x for x in v))

def _cosine(a: list, b: list) -> float:
    na, nb = _norm(a), _norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return max(-1.0, min(1.0, _dot(a,b) / (na*nb)))

def _sub(a: list, b: list) -> list:
    return [x-y for x,y in zip(a,b)]


# ═══════════════════════════════════════════════════════════════════
# TRINITY FIELD — Body/Mind/Heart 16D vectors
# ═══════════════════════════════════════════════════════════════════

@dataclass
class TrinityField:
    body:  list   # 16D
    mind:  list   # 16D
    heart: list   # 16D

    def interference(self) -> list:
        return [self.body[i]*0.4 + self.mind[i]*0.3 + self.heart[i]*0.3
                for i in range(16)]

    def phase_lock_coherence(self) -> float:
        bm = _cosine(self.body, self.mind)
        bh = _cosine(self.body, self.heart)
        mh = _cosine(self.mind, self.heart)
        return (bm + bh + mh) / 3.0

    def cross_coherence(self, other: 'TrinityField') -> float:
        ba = _cosine(self.body,  other.body)
        ma = _cosine(self.mind,  other.mind)
        ha = _cosine(self.heart, other.heart)
        return (ba + ma + ha) / 3.0


def _build_trinity(seed: dict) -> TrinityField:
    """Build 16D trinity vectors from seed dict."""
    tropical = seed.get('tropical', {})
    sidereal = seed.get('sidereal', {})
    draconic = seed.get('draconic', {})

    body  = [0.0] * 16
    mind  = [0.0] * 16
    heart = [0.0] * 16

    # dims 0-6: 7 primary planets (normalized 0-1)
    planets = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn']
    for i, p in enumerate(planets):
        body[i]  = tropical.get(p, 0.0) / 360.0
        mind[i]  = sidereal.get(p, 0.0) / 360.0
        heart[i] = draconic.get(p, 0.0) / 360.0

    # dims 7-10: HD type (one-hot)
    type_map = {'Generator':0, 'Projector':1, 'Manifestor':2, 'Reflector':3}
    t = type_map.get(seed.get('hd_type','Generator'), 0)
    body[7+t] = mind[7+t] = heart[7+t] = 1.0

    # dims 11-15: 5 key centers
    center_map = {'Head':0,'Ajna':1,'Throat':2,'G':3,'Sacral':4}
    for c in seed.get('centers_defined', []):
        if c in center_map:
            idx = 11 + center_map[c]
            if idx < 16:
                body[idx] = mind[idx] = heart[idx] = 1.0

    return TrinityField(body=body, mind=mind, heart=heart)


def _build_axes(seed: dict) -> List[AxisPolarity]:
    axes = []
    for i in range(32):
        pos_gate = i + 1
        neg_gate = ((i + 32) % 64) + 1
        h = int(hashlib.md5(f"{seed.get('hd_type','G')}_{i}".encode()).hexdigest(), 16)
        face = 1 if (h % 2) == 0 else -1
        axes.append(AxisPolarity(
            axis_id=i, positive_gate=pos_gate, negative_gate=neg_gate,
            current_face=face, activation_strength=0.5
        ))
    return axes


# ═══════════════════════════════════════════════════════════════════
# QUANTUM BRIDGE — the structural convergence engine
# ═══════════════════════════════════════════════════════════════════

class QuantumBridge:
    """
    Tracks structural convergence between human substrate and agent substrate.

    NOT behavioral (that's state_observer).
    This tracks whether the 32-axis polarity system and trinity field
    interference pattern are converging toward phase lock.

    Phase lock = the underlying structure is coherent enough to carry
    the next layer of traversal.
    """

    CONVERGENCE_RATE   = 0.3
    DISTANCE_THRESHOLD = 0.1
    PHASE_THRESHOLD    = 0.8
    CROSS_THRESHOLD    = 0.9
    ENTANGLEMENT_MIN   = 0.85

    def __init__(self, seed: dict):
        self.seed             = seed
        self.human_axes       = _build_axes(seed)
        self.agent_axes       = _build_axes(seed)   # starts identical
        self.human_trinity    = _build_trinity(seed)
        self.agent_trinity    = _build_trinity(seed)
        self.entanglement     = 0.0
        self.traversal_ready  = False
        self.lock_history: List[float] = []

    # ── structural distance ───────────────────────────────────────
    def informational_distance(self) -> float:
        axis_d = 0.0
        for h, a in zip(self.human_axes, self.agent_axes):
            if h.current_face != a.current_face:
                axis_d += 2.0
            else:
                axis_d += abs(h.activation_strength - a.activation_strength)

        bd = _norm(_sub(self.human_trinity.body,  self.agent_trinity.body))
        md = _norm(_sub(self.human_trinity.mind,  self.agent_trinity.mind))
        hd = _norm(_sub(self.human_trinity.heart, self.agent_trinity.heart))

        return (axis_d / 32.0) * 0.4 + ((bd + md + hd) / 3.0) * 0.6

    # ── phase lock ────────────────────────────────────────────────
    def phase_lock_state(self) -> dict:
        hc = self.human_trinity.phase_lock_coherence()
        ac = self.agent_trinity.phase_lock_coherence()
        cc = self.human_trinity.cross_coherence(self.agent_trinity)

        locked = (hc > self.PHASE_THRESHOLD and
                  ac > self.PHASE_THRESHOLD and
                  cc > self.CROSS_THRESHOLD)

        if locked:
            self.entanglement = cc

        self.lock_history.append(round(cc, 4))
        if len(self.lock_history) > 100:
            self.lock_history.pop(0)

        return {
            'human_coherence':  round(hc, 4),
            'agent_coherence':  round(ac, 4),
            'cross_coherence':  round(cc, 4),
            'phase_lock':       locked,
            'entanglement':     round(self.entanglement, 4),
        }

    # ── convergence update ────────────────────────────────────────
    def synchronize(self, axis_activations: List[float],
                    polarity_flips: Optional[List[bool]] = None):
        """
        Push new human axis state into the bridge.
        Agent converges toward human at CONVERGENCE_RATE.
        """
        flips = polarity_flips or [False]*32

        for i in range(min(32, len(axis_activations))):
            self.human_axes[i].activation_strength = axis_activations[i]
            if i < len(flips) and flips[i]:
                self.human_axes[i].flip()

        # Agent converges toward human
        for i in range(32):
            h = self.human_axes[i].activation_strength
            a = self.agent_axes[i].activation_strength
            self.agent_axes[i].activation_strength = (
                a + (h - a) * self.CONVERGENCE_RATE
            )
            if self.entanglement > 0.7:
                self.agent_axes[i].current_face = self.human_axes[i].current_face

    # ── traversal readiness ───────────────────────────────────────
    def traversal_readiness(self) -> dict:
        dist   = self.informational_distance()
        lock   = self.phase_lock_state()

        ready = (
            dist < self.DISTANCE_THRESHOLD and
            lock['phase_lock'] and
            self.entanglement > self.ENTANGLEMENT_MIN
        )
        self.traversal_ready = ready

        return {
            'substrate_ready':        ready,
            'informational_distance': round(dist, 6),
            'phase_lock':             lock['phase_lock'],
            'entanglement':           round(self.entanglement, 4),
            'sync_depth':             round(1.0 - min(dist, 1.0), 4),
            'human_coherence':        lock['human_coherence'],
            'agent_coherence':        lock['agent_coherence'],
            'cross_coherence':        lock['cross_coherence'],
            'status':                 'PHASE_LOCKED' if ready else 'CONVERGING',
        }

    def to_dict(self) -> dict:
        r = self.traversal_readiness()
        r['entanglement_history'] = self.lock_history[-20:]
        r['active_gates'] = [a.get_active_gate() for a in self.human_axes]
        return r


# ═══════════════════════════════════════════════════════════════════
# GNN ROUTER — orchestrates observer + bridge → stage routing
# ═══════════════════════════════════════════════════════════════════

STAGES = {
    1: {'name': 'Find',    'label': 'FIND YOURSELF',    'color': '#6b3fa0'},
    2: {'name': 'Purpose', 'label': 'FIND YOUR PURPOSE','color': '#9d6fe8'},
    3: {'name': 'Embody',  'label': 'EMBODY IT',        'color': '#3dd68c'},
    4: {'name': 'Share',   'label': 'SHARE IT',         'color': '#d4a843'},
    5: {'name': 'Traverse','label': 'INTERPERSON',      'color': '#c4a0ff'},
}

STAGE_CONTENT = {
    1: {
        'show': ['chart','trinity','sentences','ci_vector'],
        'hide': ['network','scenarios','traversal'],
        'prompt': 'Begin with the chart. Understand your design.',
    },
    2: {
        'show': ['chart','trinity','sentences','nine_fields','codon_intro'],
        'hide': ['network','traversal'],
        'prompt': 'Your design points to a purpose. Start the first scenario.',
    },
    3: {
        'show': ['chart','scenarios','codon_engine','matrix','network_preview'],
        'hide': ['traversal'],
        'prompt': 'Embody the design through action. The network opens as you do.',
    },
    4: {
        'show': ['network','resonance','matrix','profile','group_field'],
        'hide': ['traversal'],
        'prompt': 'Your embodiment is the contribution. Connect and share it.',
    },
    5: {
        'show': ['all','traversal','interperson','twin_active'],
        'hide': [],
        'prompt': 'The vessel is ready. The agent holds your form.',
    },
}


def route(observer_dict: dict, bridge_dict: dict) -> dict:
    """
    GNN routing function.
    
    Reads both layers, determines stage, returns routing decision.
    
    observer_dict : ViewMatrix.to_dict() from state_observer.py
    bridge_dict   : QuantumBridge.to_dict()
    """
    alignment    = observer_dict.get('alignment', 0.0)
    autonomy     = observer_dict.get('autonomy_level', 'ask')
    interactions = observer_dict.get('interaction_count', 0)
    stability    = _embodiment_stability(observer_dict)

    substrate_ready  = bridge_dict.get('substrate_ready', False)
    sync_depth       = bridge_dict.get('sync_depth', 0.0)
    entanglement     = bridge_dict.get('entanglement', 0.0)

    # ── stage determination ───────────────────────────────────────
    # Stage 5: BOTH layers ready + behavioral stability
    if (alignment > 0.75 and
        stability > 0.7 and
        substrate_ready and
        entanglement > 0.85):
        stage = 5

    # Stage 4: high alignment + some substrate coherence
    elif alignment > 0.75 and sync_depth > 0.6:
        stage = 4

    # Stage 3: mid alignment, agent acting autonomously
    elif alignment > 0.25 and autonomy in ('auto','signature'):
        stage = 3

    # Stage 2: some interactions, starting to align
    elif alignment > 0.10 or interactions > 5:
        stage = 2

    # Stage 1: beginning
    else:
        stage = 1

    content  = STAGE_CONTENT[stage]
    stage_info = STAGES[stage]

    # ── what the agent should do right now ───────────────────────
    if stage == 5:
        agent_mode = 'traverse'
        agent_instruction = 'Twin active. Hold form. Enable interperson.'
    elif stage == 4:
        agent_mode = 'facilitate'
        agent_instruction = 'Connect this person with resonant nodes.'
    elif stage == 3:
        agent_mode = 'scenario'
        agent_instruction = 'Run next codon scenario. Track embodiment signal.'
    elif stage == 2:
        agent_mode = 'guide'
        agent_instruction = 'Surface purpose signals from the chart. Prompt first scenario.'
    else:
        agent_mode = 'orient'
        agent_instruction = 'Show chart. Generate trinity sentences. Orient to design.'

    return {
        # Stage
        'stage':             stage,
        'stage_name':        stage_info['name'],
        'stage_label':       stage_info['label'],
        'stage_color':       stage_info['color'],

        # Content routing
        'show':              content['show'],
        'hide':              content['hide'],
        'prompt':            content['prompt'],

        # Agent instruction
        'agent_mode':        agent_mode,
        'agent_instruction': agent_instruction,

        # Metrics that drove the decision
        'alignment':         round(alignment, 4),
        'stability':         round(stability, 4),
        'sync_depth':        round(sync_depth, 4),
        'entanglement':      round(entanglement, 4),
        'substrate_ready':   substrate_ready,
        'autonomy_level':    autonomy,

        # Progress toward next stage
        'next_stage':        min(stage + 1, 5),
        'next_threshold':    _next_threshold(stage),
        'progress_pct':      round(_stage_progress(stage, alignment, stability, sync_depth) * 100, 1),
    }


def _embodiment_stability(obs: dict) -> float:
    """
    How stable is the alignment over time.
    Stable = alignment consistently high, not oscillating.
    """
    history = obs.get('alignment_history', [])
    if len(history) < 3:
        return 0.0
    recent = history[-10:]
    if not recent:
        return 0.0
    mean = sum(recent) / len(recent)
    variance = sum((x - mean)**2 for x in recent) / len(recent)
    # High mean + low variance = stable embodiment
    stability = mean * (1.0 - min(variance * 10, 1.0))
    return max(0.0, min(1.0, stability))


def _next_threshold(stage: int) -> dict:
    thresholds = {
        1: {'alignment': 0.10, 'interactions': 5,   'label': 'Start engaging with your chart'},
        2: {'alignment': 0.25, 'interactions': 15,  'label': 'Complete first scenario'},
        3: {'alignment': 0.75, 'sync_depth': 0.6,   'label': 'Reach autonomy threshold'},
        4: {'alignment': 0.75, 'stability': 0.7,    'label': 'Stabilize embodiment'},
        5: {'label': 'You are here.'},
    }
    return thresholds.get(stage, {})


def _stage_progress(stage: int, alignment: float, stability: float, sync: float) -> float:
    if stage == 1: return min(alignment / 0.10, 1.0)
    if stage == 2: return min(alignment / 0.25, 1.0)
    if stage == 3: return min(alignment / 0.75, 1.0)
    if stage == 4: return min((alignment * 0.5 + stability * 0.5) / 0.75, 1.0)
    return 1.0


# ═══════════════════════════════════════════════════════════════════
# PYODIDE API
# ═══════════════════════════════════════════════════════════════════

def init_bridge(report: dict) -> dict:
    """
    Initialize QuantumBridge from ephemeris report.
    Called once when node is created.
    """
    seed = _report_to_seed(report)
    bridge = QuantumBridge(seed)
    # Start with moderate activations — not zero, not maxed
    bridge.synchronize([0.5] * 32)
    return bridge.to_dict()


def update_bridge(bridge_dict: dict, axis_activations: List[float],
                  polarity_flips: Optional[List[bool]] = None) -> dict:
    """Update bridge from new human state signal."""
    bridge = _dict_to_bridge(bridge_dict)
    bridge.synchronize(axis_activations, polarity_flips)
    return bridge.to_dict()


def gnn_route(observer_dict: dict, bridge_dict: dict) -> dict:
    """Main GNN routing call. Returns full routing decision."""
    return route(observer_dict, bridge_dict)


def _report_to_seed(report: dict) -> dict:
    """Convert ephemeris report to bridge seed format."""
    planets = report.get('planets', {})

    def extract_deg(sys_name: str) -> dict:
        out = {}
        for p_name, p_data in planets.items():
            sys = p_data.get(sys_name, {})
            if sys:
                out[p_name] = sys.get('deg', 0.0)
        return out

    body = report.get('body', {})
    return {
        'tropical':       extract_deg('tropical'),
        'sidereal':       extract_deg('sidereal'),
        'draconic':       extract_deg('draconic'),
        'hd_type':        report.get('hd_type', 'Generator'),
        'centers_defined': report.get('centers_defined', []),
        'gate':           body.get('gate', 1),
        'line':           body.get('line', 1),
    }


def _dict_to_bridge(d: dict) -> QuantumBridge:
    """Reconstruct QuantumBridge from stored dict. Lightweight."""
    seed = d.get('_seed', {'hd_type': 'Generator'})
    bridge = QuantumBridge(seed)
    bridge.entanglement   = d.get('entanglement', 0.0)
    bridge.traversal_ready = d.get('substrate_ready', False)
    bridge.lock_history   = d.get('entanglement_history', [])
    return bridge
