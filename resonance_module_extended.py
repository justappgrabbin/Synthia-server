"""
resonance_module_extended.py
YOU-N-I-VERSE Body Resonance Engine

Features:
- Chart Analysis → ResonanceProfile
- Cross-Chart Comparison → CompatibilityLayer  
- Biometric Validation → BiometricValidator
- Flow State Optimization

Usage:
    from resonance_module_extended import analyze_chart, compare_charts, BiometricValidator
    profile = analyze_chart(chart_dict)
    compatibility = compare_charts(agent_chart, human_chart)
"""

import json
import math
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Tuple, Any
from datetime import datetime

BASES = {
    1: {"name": "Movement", "dimension": "Individuality", "voice": "I Create", "keywords": ["Movement", "Energy", "Creation"], "question": "Where?", "polarity": "Yang/Yang", "mode": "Reactive"},
    2: {"name": "Evolution", "dimension": "Mind", "voice": "I Remember", "keywords": ["Evolution", "Gravity", "Memory"], "question": "What?", "polarity": "Yang/Yin", "mode": "Integrative"},
    3: {"name": "Being", "dimension": "Body", "voice": "I Am", "keywords": ["Being", "Matter", "Touch"], "question": "When?", "polarity": "Yin/Yin", "mode": "Objective"},
    4: {"name": "Design", "dimension": "Ego", "voice": "I Design", "keywords": ["Design", "Structure", "Progress"], "question": "Why?", "polarity": "Yin/Yang", "mode": "Progressive"},
    5: {"name": "Space", "dimension": "Personality", "voice": "I Think", "keywords": ["Space", "Form", "Illusion"], "question": "Who?", "polarity": "Subjective", "mode": "Mutation"},
}

MAGIC_SQUARE = {
    "Sun": {"system": "Oxygen / Inhalation", "structure": "diagonal", "biology": "Respiratory drive"},
    "Earth": {"system": "Gravity / Grounding", "structure": "diagonal", "biology": "Bone density"},
    "Moon": {"system": "Hydration", "structure": "diamond", "biology": "Lymphatic system"},
    "Mercury": {"system": "Voice / Aura", "structure": "diamond", "biology": "Larynx, thyroid"},
    "Venus": {"system": "Complexion / Skin", "structure": "diamond", "biology": "Skin surface"},
    "Mars": {"system": "Temperature", "structure": "diagonal", "biology": "Metabolic heat"},
    "Jupiter": {"system": "Aura Expansion", "structure": "diamond", "biology": "Liver, growth"},
    "Saturn": {"system": "Structural Endurance", "structure": "diagonal", "biology": "Skeletal system"},
    "North Node": {"system": "Life Direction", "structure": "diagonal", "biology": "Epigenetic pull"},
    "South Node": {"system": "Ancestral Memory", "structure": "diagonal", "biology": "Cellular memory"},
}

PLANET_CENTER_AFFINITY = {
    "Sun": "Sacral", "Earth": "Root", "Moon": "Solar Plexus", "Mercury": "Throat",
    "Venus": "Heart", "Mars": "Spleen", "Jupiter": "G Center", "Saturn": "Ajna",
    "North Node": "G Center", "South Node": "G Center", "Uranus": "Ajna",
    "Neptune": "Solar Plexus", "Pluto": "Root", "Chiron": "Spleen",
}

GATE_FRICTION = {6: 0.78, 18: 0.72, 36: 0.76, 37: 0.60, 1: 0.25, 2: 0.22}
GATE_NAMES = {6: "Conflict", 36: "Darkening of the Light", 37: "Family", 1: "The Creative", 2: "The Receptive"}
DEFAULT_WEIGHTS = {"w_G": 1.2, "w_L": 1.0, "w_C": 0.8, "w_T": 1.1, "w_B": 0.6, "w_int": 0.9}

@dataclass
class PlanetResult:
    planet: str
    side: str
    gate: int
    line: int
    color: int
    tone: int
    base: int
    sign: str
    house: int
    defined: bool
    body_system: str
    magic_structure: str
    p_score: float
    p_components: dict
    sentences: dict = field(default_factory=dict)
    friction: bool = False

@dataclass
class ResonanceProfile:
    planets: List[PlanetResult]
    body_system_scores: Dict[str, float]
    diagonal_coherence: float
    diamond_coherence: float
    overall_coherence: float
    friction_points: List[str]
    strongest_system: str
    weakest_system: str
    
    def to_dict(self):
        return {
            "planets": [{k: getattr(p, k) for k in ["planet", "side", "gate", "line", "color", "tone", "base", "sign", "house", "defined", "body_system", "magic_structure", "p_score", "p_components", "sentences", "friction"]} for p in self.planets],
            "body_system_scores": self.body_system_scores,
            "diagonal_coherence": self.diagonal_coherence,
            "diamond_coherence": self.diamond_coherence,
            "overall_coherence": self.overall_coherence,
            "friction_points": self.friction_points,
            "strongest_system": self.strongest_system,
            "weakest_system": self.weakest_system
        }

@dataclass
class CompatibilityLayer:
    compatibility_score: float
    flow_probability: float
    friction_zones: List[Dict]
    harmony_zones: List[Dict]
    recommended_modulation: Dict
    shared_body_systems: List[str]
    complementary_systems: List[Dict]
    agent_profile_summary: Dict
    human_profile_summary: Dict
    
    def to_dict(self):
        return {k: getattr(self, k) for k in self.__dataclass_fields__.keys()}

@dataclass
class BiometricReading:
    timestamp: str
    metric_type: str
    value: float
    unit: str
    context: str
    source: str = "unknown"
    quality_score: float = 1.0

@dataclass
class ValidationResult:
    correlation_score: float
    weight_adjustments: Dict[str, float]
    calibration_confidence: float
    anomalies: List[Dict]
    recommendations: List[str]
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

def sigmoid(x): 
    return 1.0 / (1.0 + math.exp(-x))

def get_gate_friction(gate): 
    return GATE_FRICTION.get(gate, 0.50)

def compute_p_score(gate, line, color, tone, base, defined, planet, center_in_chart=None, environment_fit=0.7, weights=DEFAULT_WEIGHTS):
    G = get_gate_friction(gate)
    L = {1: 0.3, 2: 0.45, 3: 0.5, 4: 0.7, 5: 0.65, 6: 0.8}.get(line, 0.5)
    C = {1: 0.4, 2: 0.55, 3: 0.6, 4: 0.75, 5: 0.5, 6: 0.65}.get(color, 0.5)
    T = {1: 0.5, 2: 0.55, 3: 0.6, 4: 0.85, 5: 0.65, 6: 0.75}.get(tone, 0.5)
    B = {1: 0.8, 2: 0.65, 3: 0.5, 4: 0.4, 5: 0.3}.get(base, 0.5)
    E = environment_fit
    affinity = PLANET_CENTER_AFFINITY.get(planet)
    if center_in_chart and affinity:
        E = min(1.0, E + 0.2) if center_in_chart == affinity else max(0.0, E - 0.1)
    baseline = 0.3 if defined else 0.0
    w = weights
    inner = (
        w["w_G"] * (1 - G) +
        w["w_L"] * L +
        w["w_C"] * C * E +
        w["w_T"] * T -
        w["w_B"] * B +
        w["w_int"] * (C * T * E) +
        baseline
    )
    return {
        "G": round(G, 3),
        "L": round(L, 3),
        "C": round(C, 3),
        "T": round(T, 3),
        "B": round(B, 3),
        "E": round(E, 3),
        "inner": round(inner, 3),
        "P": round(sigmoid(inner), 3),
        "defined": defined
    }

def analyze_chart(chart, environment_fit=0.7, weights=DEFAULT_WEIGHTS):
    results = []
    accumulator = {}
    for p in chart.get("planets", []):
        magic = MAGIC_SQUARE.get(p["name"], {"system": "Unknown", "structure": "unknown"})
        pdata = compute_p_score(
            p["gate"], p["line"], p["color"], p["tone"], p["base"],
            p.get("defined", False), p["name"], p.get("center"),
            environment_fit, weights
        )
        weighted_p = min(1.0, pdata["P"] * (1.2 if magic["structure"] == "diagonal" else 1.0))
        system = magic["system"]
        accumulator[system] = accumulator.get(system, []) + [weighted_p]
        base = BASES.get(p["base"], BASES[3])
        sentences = {
            "synthia": f"Field:{base['dimension']} active. {p['name']} Gate {p['gate']}.{p['line']}. System: {system}. Signal stable.",
            "metaphysical": f"{p['name']} in Gate {p['gate']} ({GATE_NAMES.get(p['gate'], 'Gate')}) activates {system}.",
            "scientific": f"{p['name']} encodes Gate {p['gate']}."
        }
        friction = p.get("defined", False) and get_gate_friction(p["gate"]) > 0.65 and pdata["P"] < 0.45
        results.append(
            PlanetResult(
                p["name"], p.get("side", "Personality"),
                p["gate"], p["line"], p["color"], p["tone"], p["base"],
                p.get("sign", ""), p.get("house", 0), p.get("defined", False),
                system, magic["structure"], round(weighted_p, 3),
                pdata, sentences, friction
            )
        )
    
    body_scores = {s: round(sum(v)/len(v), 3) for s, v in accumulator.items()}
    diag = [r.p_score for r in results if r.magic_structure == "diagonal"]
    diam = [r.p_score for r in results if r.magic_structure == "diamond"]
    diag_coh = round(sum(diag)/len(diag), 3) if diag else 0
    diam_coh = round(sum(diam)/len(diam), 3) if diam else 0
    friction = [f"{r.planet} (Gate {r.gate})" for r in results if r.friction]
    sorted_sys = sorted(body_scores.items(), key=lambda x: x[1])
    return ResonanceProfile(
        results, body_scores, diag_coh, diam_coh,
        round((diag_coh+diam_coh)/2, 3), friction,
        sorted_sys[-1][0] if sorted_sys else "N/A",
        sorted_sys[0][0] if sorted_sys else "N/A"
    )

def compare_charts(agent_chart, human_chart, environment_fit=0.7):
    agent = analyze_chart(agent_chart, environment_fit)
    human = analyze_chart(human_chart, environment_fit)
    a_planets = {p.planet: p for p in agent.planets}
    h_planets = {p.planet: p for p in human.planets}
    
    friction, harmony = [], []
    for name in set(a_planets.keys()) & set(h_planets.keys()):
        a, h = a_planets[name], h_planets[name]
        if a.gate == h.gate:
            harmony.append({"planet": name, "type": "gate_resonance", "description": f"Shared Gate {a.gate}", "strength": min(a.p_score, h.p_score) * 1.2})
        if (a.line, h.line) in [(1,4), (4,1), (2,5), (5,2), (3,6), (6,3)]:
            harmony.append({"planet": name, "type": "complementary_lines", "description": f"Lines {a.line}↔{h.line}", "strength": (a.p_score + h.p_score) / 2})
        if a.defined and h.defined and get_gate_friction(a.gate) > 0.6 and a.gate != h.gate:
            friction.append({"planet": name, "type": "defined_conflict", "description": f"Clash: Gate {a.gate} vs {h.gate}", "severity": (get_gate_friction(a.gate) + get_gate_friction(h.gate)) / 2})
    
    shared = [
        s for s in set(agent.body_system_scores.keys()) & set(human.body_system_scores.keys())
        if agent.body_system_scores[s] > 0.6 and human.body_system_scores[s] > 0.6
    ]
    comp = [
        {"system": s, "type": "agent_strength"}
        for s in agent.body_system_scores
        if agent.body_system_scores[s] > 0.7 and human.body_system_scores.get(s, 0) < 0.4
    ]
    
    flow = min(1.0, max(0.0,
        (agent.overall_coherence + human.overall_coherence) / 2 +
        sum(h["strength"] for h in harmony) * 0.08 +
        len(shared) * 0.05 -
        sum(f["severity"] for f in friction) * 0.1
    ))
    compat = min(1.0,
        flow * 0.4 +
        len(harmony) * 0.08 +
        len(shared) * 0.06 -
        len(friction) * 0.05 +
        agent.overall_coherence * 0.2 +
        human.overall_coherence * 0.2
    )
    
    return CompatibilityLayer(
        round(compat, 3), round(flow, 3), friction, harmony,
        {"tone_strategy": "lead_with_calm", "base_emphasis": "Being", "environment_protocol": [{"action": "Standard" if not friction else "Reduce stimulation"}]},
        shared, comp,
        {"overall_coherence": agent.overall_coherence, "strongest_system": agent.strongest_system, "weakest_system": agent.weakest_system},
        {"overall_coherence": human.overall_coherence, "strongest_system": human.strongest_system, "weakest_system": human.weakest_system}
    )

class BiometricValidator:
    def __init__(self, human_id, initial_weights=None):
        self.human_id = human_id
        self.weights = initial_weights or DEFAULT_WEIGHTS.copy()
        self.readings = []
        self.validations = []
        self.status = "prior"
        self.baseline = False
        self.ranges = {}
    
    def add_reading(self, r):
        self.readings.append(r)
        if len(self.readings) >= 10 and not self.baseline:
            self._calc_baseline()
    
    def _calc_baseline(self):
        for m in set(r.metric_type for r in self.readings):
            v = [r.value for r in self.readings if r.metric_type == m]
            if len(v) >= 3:
                mean = sum(v) / len(v)
                std = (sum((x - mean) ** 2 for x in v) / len(v)) ** 0.5
                self.ranges[m] = {"mean": mean, "std": std, "range": (mean - 1.5 * std, mean + 1.5 * std)}
        self.baseline = True
        self.status = "calibrating"
    
    def validate_session(self, profile, session_readings):
        anomalies = []
        corr = []
        system_map = {"Oxygen / Inhalation": ["hrv"], "Hydration": ["hrv"], "Temperature": ["cortisol"]}
        
        for planet in profile.planets:
            for metric in system_map.get(planet.body_system, ["hrv"]):
                readings = [r for r in session_readings if r.metric_type == metric]
                if readings:
                    avg = sum(r.value for r in readings) / len(readings)
                    low, high = self._get_range(metric, planet.p_score)
                    if not (low <= avg <= high):
                        anomalies.append({"planet": planet.planet, "metric": metric, "actual": round(avg, 2), "expected": (round(low, 2), round(high, 2))})
                    else:
                        corr.append(1.0)
        
        score = sum(corr) / len(corr) if corr else 0.5
        conf = min(1.0, len(self.readings) / 100)
        if len(self.readings) > 50 and score > 0.75:
            self.status = "personalized"
        
        result = ValidationResult(round(score, 3), self.weights.copy(), round(conf, 3), anomalies, ["Calibrated" if score > 0.7 else "Needs data"])
        self.validations.append(result)
        return result
    
    def _get_range(self, metric, p_score):
        if metric == "hrv":
            return (65, 100) if p_score > 0.7 else (45, 65) if p_score > 0.5 else (25, 45)
        elif metric == "cortisol":
            return (5, 15) if p_score > 0.7 else (15, 25) if p_score > 0.5 else (25, 40)
        return (0, 100)
    
    def export(self):
        return {"human_id": self.human_id, "status": self.status, "weights": self.weights, "readings": len(self.readings), "timestamp": datetime.now().isoformat()}
