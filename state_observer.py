"""
state_observer.py
YOU-N-I-VERSE — Human-Agent State Observer

Implements the synchronization loop between:
  H(t) = human cognitive state (observed from behavior/language)
  A(t) = agent model state (derived from CI vector / birth data)

Alignment score = cosine_similarity(H(t), A(t))
Shadow distance = 1 - alignment (what's pulling them away from design)

When alignment → 1.0: person is living their design
When alignment → 0.0: person is in shadow / someone else's pattern
When alignment → -1.0: full inversion (maximum shadow)

The convergence condition:
  lim(t→∞) |H(t) - A(t)| = 0

Autonomy thresholds (from CodonSpectrumEngine):
  < 0.10 : agent asks human (too divergent to predict)
  > 0.25 : agent acts autonomously (model reliable)
  > 0.75 : signature locked (synchronization achieved)

Pure Python. No external dependencies. Pyodide compatible.
"""

import math
import json
from dataclasses import dataclass, field
from typing import Optional

# ═══════════════════════════════════════════════════════════════════
# FIVE ELEMENT SIGNATURE — Earth/Water/Air/Fire/Aether
# Every behavior, sentence, or choice maps to a 5D vector
# ═══════════════════════════════════════════════════════════════════

ELEMENTS = ['Earth', 'Water', 'Air', 'Fire', 'Aether']

# Element ↔ Dimension correspondence (from your framework)
ELEMENT_DIMENSION = {
    'Earth':  'Being',     # Matter, body, survival, biology
    'Water':  'Evolution', # Memory, feeling, gravity, integration
    'Air':    'Space',     # Form, thought, illusion, freedom
    'Fire':   'Movement',  # Energy, action, creation, individuality
    'Aether': 'Design',    # Structure, art, progress, ego
}

# Element ↔ Center correspondence
ELEMENT_CENTER = {
    'Earth':  'Spleen',        # instinct, survival, body wisdom
    'Water':  'Solar Plexus',  # emotion, feeling, clarity over time
    'Air':    'Ajna',          # mind, concepts, certainty/uncertainty
    'Fire':   'Sacral',        # life force, response, creation
    'Aether': 'G Center',      # identity, direction, love
}

# Element weights by base (1-5 → Earth/Water/Air/Fire/Aether)
BASE_ELEMENT_MAP = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4}  # base → element index

# Element weights by tone
TONE_ELEMENT_WEIGHTS = {
    1: [0.4, 0.1, 0.1, 0.1, 0.3],  # Security → Earth/Aether
    2: [0.1, 0.4, 0.1, 0.2, 0.2],  # Uncertainty → Water/Fire
    3: [0.1, 0.1, 0.3, 0.4, 0.1],  # Action → Air/Fire
    4: [0.2, 0.2, 0.3, 0.1, 0.2],  # Meditation → Air
    5: [0.1, 0.3, 0.1, 0.2, 0.3],  # Judgement → Water/Aether
    6: [0.3, 0.2, 0.1, 0.1, 0.3],  # Acceptance → Earth/Aether
}

# Element weights by color (motivation)
COLOR_ELEMENT_WEIGHTS = {
    1: [0.4, 0.2, 0.1, 0.2, 0.1],  # Fear → Earth
    2: [0.1, 0.2, 0.3, 0.1, 0.3],  # Hope → Air/Aether
    3: [0.1, 0.1, 0.1, 0.5, 0.2],  # Desire → Fire
    4: [0.3, 0.1, 0.2, 0.1, 0.3],  # Need → Earth/Aether
    5: [0.2, 0.3, 0.1, 0.1, 0.3],  # Guilt → Water/Aether
    6: [0.2, 0.1, 0.3, 0.1, 0.3],  # Innocence → Air/Aether
}


# ═══════════════════════════════════════════════════════════════════
# SENTENCE SIGNATURE VECTOR (SSV)
# Maps any text/choice to a 5D element signature
# ═══════════════════════════════════════════════════════════════════

# Keyword → element scoring (lightweight NLP, no external deps)
ELEMENT_KEYWORDS = {
    'Earth': [
        'body','physical','ground','stable','solid','earth','material','survival',
        'security','safe','protect','shelter','food','health','concrete','practical',
        'build','structure','endure','persist','foundation','root','anchor','hold',
        'touch','sense','feel','here','present','now','real','tangible','weight'
    ],
    'Water': [
        'feel','emotion','memory','love','care','empathy','flow','wave','deep',
        'dream','past','remember','heart','soul','connect','relate','sense','taste',
        'grief','joy','longing','desire','want','need','miss','yearn','belong',
        'intimate','vulnerable','open','receive','accept','allow','surrender'
    ],
    'Air': [
        'think','mind','concept','idea','theory','logic','reason','understand',
        'know','believe','imagine','vision','future','possibility','potential',
        'freedom','space','breath','clarity','confusion','question','wonder',
        'music','pattern','form','illusion','abstract','system','network'
    ],
    'Fire': [
        'act','do','create','energy','move','drive','force','power','initiate',
        'start','launch','push','generate','respond','react','spark','ignite',
        'lead','bold','risk','adventure','challenge','fight','compete','win',
        'passion','excitement','alive','vital','urgent','now','fast','direct'
    ],
    'Aether': [
        'design','purpose','identity','role','meaning','direction','guide',
        'serve','contribute','art','beauty','craft','refine','evolve','grow',
        'legacy','reputation','worthy','value','principle','ethic','integrity',
        'love','truth','light','awareness','consciousness','presence','being'
    ]
}


def text_to_ssv(text: str) -> list:
    """
    Convert any text to a 5D Sentence Signature Vector.
    Returns normalized [Earth, Water, Air, Fire, Aether] weights.
    Pure keyword matching — no external NLP deps needed.
    """
    if not text:
        return [0.2, 0.2, 0.2, 0.2, 0.2]  # neutral baseline

    words = text.lower().split()
    scores = [0.0] * 5

    for word in words:
        # Strip punctuation
        clean = ''.join(c for c in word if c.isalpha())
        for i, element in enumerate(ELEMENTS):
            if clean in ELEMENT_KEYWORDS[element]:
                scores[i] += 1.0
            # Partial match bonus (prefix)
            elif any(kw.startswith(clean[:4]) for kw in ELEMENT_KEYWORDS[element] if len(clean) >= 4):
                scores[i] += 0.3

    # If no matches, distribute by word length heuristic
    if sum(scores) == 0:
        scores = [0.2, 0.2, 0.2, 0.2, 0.2]

    return normalize5(scores)


def choice_to_ssv(choice: dict) -> list:
    """
    Convert a CodonSpectrum scenario choice to SSV.
    choice: {text, motive, weight, step}
    """
    base_ssv = text_to_ssv(choice.get('text', ''))
    motive   = choice.get('motive', '')
    motive_ssv = text_to_ssv(motive)

    w = choice.get('weight', 1.0)
    combined = [
        (base_ssv[i] * 0.6 + motive_ssv[i] * 0.4) * w
        for i in range(5)
    ]
    return normalize5(combined)


def gate_to_element_weights(gate: int, line: int, tone: int, color: int, base: int) -> list:
    """
    Convert HD coordinates to element weights.
    This is the birth-space → 5D projection.
    """
    # Primary element from base
    primary = BASE_ELEMENT_MAP.get(base, 0)
    weights = [0.1, 0.1, 0.1, 0.1, 0.1]
    weights[primary] += 0.4

    # Tone modulation
    tw = TONE_ELEMENT_WEIGHTS.get(tone, [0.2]*5)
    for i in range(5):
        weights[i] += tw[i] * 0.3

    # Color modulation
    cw = COLOR_ELEMENT_WEIGHTS.get(color, [0.2]*5)
    for i in range(5):
        weights[i] += cw[i] * 0.2

    # Line modulation (lines 1/4 → Earth, 2/5 → Air, 3/6 → Fire/Aether)
    line_boost = {1:0, 4:0, 2:2, 5:2, 3:3, 6:4}
    lb = line_boost.get(line, 0)
    weights[lb] += 0.1

    return normalize5(weights)


# ═══════════════════════════════════════════════════════════════════
# CI VECTOR — extended to 32D with 5D element projection
# ═══════════════════════════════════════════════════════════════════

def build_ci_from_report(report: dict) -> dict:
    """
    Build the full CI structure from an ephemeris report.
    Returns both the 32D raw vector AND the 5D element projection.
    """
    # 32D CI vector already computed by ephemeris.py
    ci_32 = report.get('ci', [0.0] * 32)

    # 5D element projection from primary trinity
    body  = report.get('body',  {})
    mind  = report.get('mind',  {})
    heart = report.get('heart', {})

    body_5d  = gate_to_element_weights(body.get('gate',1), body.get('line',1), body.get('tone',1), body.get('color',1), body.get('base',1))
    mind_5d  = gate_to_element_weights(mind.get('gate',1), mind.get('line',1), mind.get('tone',1), mind.get('color',1), mind.get('base',1))
    heart_5d = gate_to_element_weights(heart.get('gate',1), heart.get('line',1), heart.get('tone',1), heart.get('color',1), heart.get('base',1))

    # Weighted composite: Body=0.4, Mind=0.3, Heart=0.3
    element_5d = normalize5([
        body_5d[i]*0.4 + mind_5d[i]*0.3 + heart_5d[i]*0.3
        for i in range(5)
    ])

    # Shadow 5D = inverted heart (180° inversion)
    shadow_5d = normalize5([1.0 - element_5d[i] for i in range(5)])

    return {
        'ci_32':      ci_32,
        'element_5d': element_5d,
        'shadow_5d':  shadow_5d,
        'body_5d':    body_5d,
        'mind_5d':    mind_5d,
        'heart_5d':   heart_5d,
        'dominant_element': ELEMENTS[element_5d.index(max(element_5d))],
        'shadow_element':   ELEMENTS[shadow_5d.index(max(shadow_5d))],
    }


# ═══════════════════════════════════════════════════════════════════
# ALIGNMENT MATH
# ═══════════════════════════════════════════════════════════════════

def cosine_sim(a: list, b: list) -> float:
    """Cosine similarity between two vectors. Returns [-1, 1]."""
    dot  = sum(x*y for x,y in zip(a,b))
    mag_a = math.sqrt(sum(x*x for x in a))
    mag_b = math.sqrt(sum(x*x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return max(-1.0, min(1.0, dot / (mag_a * mag_b)))


def alignment_score(design_5d: list, behavior_5d: list) -> float:
    """
    Core alignment metric. Range: [-1, 1]
    1.0  = living design perfectly
    0.0  = neutral / undefined
    -1.0 = full shadow inversion
    """
    return cosine_sim(design_5d, behavior_5d)


def normalize5(v: list) -> list:
    total = sum(v)
    if total == 0:
        return [0.2] * 5
    return [x / total for x in v]


def blend_vectors(current: list, new_obs: list, rate: float = 0.05) -> list:
    """
    Exponential moving average update.
    rate = learning rate (how fast behavior vector updates)
    Low rate = slow, stable convergence
    High rate = reactive, volatile
    """
    return [current[i] * (1 - rate) + new_obs[i] * rate for i in range(len(current))]


# ═══════════════════════════════════════════════════════════════════
# BRADLEY-TERRY AWARENESS SCORES
# Learns which centers resonate with this specific person
# ═══════════════════════════════════════════════════════════════════

CENTERS = ['Head','Ajna','Throat','G Center','Heart/Ego',
           'Sacral','Spleen','Solar Plexus','Root']

def update_bradley_terry(scores: dict, winner: str, loser: str, k: float = 0.1) -> dict:
    """
    Bradley-Terry model update.
    When human aligns with a center's signal (winner) over another (loser),
    update the relative scores.
    scores: {center_name: float}  — all positive, sum not constrained
    """
    scores = dict(scores)
    sw = scores.get(winner, 1.0)
    sl = scores.get(loser, 1.0)
    total = sw + sl
    # Winner gains, loser loses
    scores[winner] = sw + k * (sl / total)
    scores[loser]  = sl - k * (sl / total)
    # Floor at 0.1
    scores[loser] = max(0.1, scores[loser])
    return scores


def initial_bt_scores(report: dict) -> dict:
    """
    Initialize Bradley-Terry scores from the person's design.
    Planets that are defined (activated) get higher initial scores.
    """
    scores = {c: 1.0 for c in CENTERS}

    planet_centers = {
        'Sun':'G Center', 'Moon':'Solar Plexus', 'Mercury':'Throat',
        'Venus':'Heart/Ego', 'Mars':'Sacral', 'Jupiter':'G Center',
        'Saturn':'Ajna', 'Uranus':'Ajna', 'Neptune':'Solar Plexus',
        'Pluto':'Root', 'NorthNode':'G Center', 'SouthNode':'G Center'
    }

    # Gates that appear in the chart boost their center's awareness score
    planets = report.get('planets', {})
    for planet_name, center_name in planet_centers.items():
        if planet_name in planets:
            scores[center_name] = scores.get(center_name, 1.0) + 0.3

    return scores


# ═══════════════════════════════════════════════════════════════════
# VIEW MATRIX — the adaptive physics of consciousness
# Records what resonates vs what doesn't, per interaction
# ═══════════════════════════════════════════════════════════════════

@dataclass
class ViewMatrix:
    """
    Tracks the person's resonance history.
    Each interaction updates alignment toward or away from design.
    This IS the "adaptive physics of consciousness" — a live causal graph.
    """
    node_address:     str
    design_5d:        list        # static birth-space element vector
    behavior_5d:      list        # dynamic observed behavior vector
    ci_32:            list        # 32D CI vector (static)
    bt_scores:        dict        # Bradley-Terry center awareness scores
    alignment_history: list       # list of (timestamp, alignment_score)
    interaction_count: int = 0
    shadow_crossings:  int = 0    # times alignment went negative
    convergence_events: int = 0   # times alignment crossed 0.75

    def current_alignment(self) -> float:
        return alignment_score(self.design_5d, self.behavior_5d)

    def autonomy_level(self) -> str:
        a = self.current_alignment()
        if a < 0.10:   return 'ask'       # agent asks human
        if a < 0.25:   return 'guided'    # agent suggests, human decides
        if a < 0.75:   return 'auto'      # agent acts autonomously
        return 'signature'                # full synchronization

    def is_in_shadow(self) -> bool:
        return self.current_alignment() < 0.0

    def shadow_depth(self) -> float:
        """How far into shadow. 0 = edge, 1.0 = full inversion."""
        return max(0.0, -self.current_alignment())

    def divergence(self) -> list:
        """Element-wise divergence: behavior minus design."""
        return [self.behavior_5d[i] - self.design_5d[i] for i in range(5)]

    def dominant_divergence_element(self) -> str:
        """Which element is most diverged from design."""
        div = self.divergence()
        abs_div = [abs(x) for x in div]
        return ELEMENTS[abs_div.index(max(abs_div))]

    def to_dict(self) -> dict:
        return {
            'node_address':      self.node_address,
            'design_5d':         self.design_5d,
            'behavior_5d':       self.behavior_5d,
            'ci_32':             self.ci_32,
            'bt_scores':         self.bt_scores,
            'alignment':         round(self.current_alignment(), 4),
            'alignment_pct':     round(self.current_alignment() * 100, 1),
            'autonomy_level':    self.autonomy_level(),
            'is_in_shadow':      self.is_in_shadow(),
            'shadow_depth':      round(self.shadow_depth(), 4),
            'dominant_element':  ELEMENTS[self.design_5d.index(max(self.design_5d))],
            'divergence':        [round(x, 4) for x in self.divergence()],
            'divergent_element': self.dominant_divergence_element(),
            'interaction_count': self.interaction_count,
            'shadow_crossings':  self.shadow_crossings,
            'convergence_events':self.convergence_events,
            'alignment_history': self.alignment_history[-20:],  # last 20
        }


# ═══════════════════════════════════════════════════════════════════
# STATE OBSERVER — the main update loop
# ═══════════════════════════════════════════════════════════════════

class StateObserver:
    """
    The human-agent synchronization engine.

    Takes a ViewMatrix and updates it with new behavioral signals.
    Every call to observe() is one step in the convergence loop.

    Usage:
        observer = StateObserver(view_matrix)
        observer.observe_text("I want to build something real")
        observer.observe_choice({'text':'..', 'motive':'..', 'weight':1.2})
        observer.observe_guidance_response('accepted', 'Throat')
        vm = observer.view_matrix
        print(vm.current_alignment())
    """

    LEARNING_RATE = 0.05     # How fast behavior vector updates (0.01=slow, 0.2=fast)
    BT_K          = 0.08     # Bradley-Terry learning rate

    def __init__(self, vm: ViewMatrix):
        self.vm = vm

    def observe_text(self, text: str, weight: float = 1.0) -> dict:
        """
        Observe a text input from the human.
        Updates behavior vector toward the SSV of this text.
        """
        ssv = text_to_ssv(text)
        return self._update(ssv, weight, source='text')

    def observe_choice(self, choice: dict) -> dict:
        """
        Observe a scenario choice from the CodonSpectrum engine.
        choice: {text, motive, weight, step}
        """
        ssv = choice_to_ssv(choice)
        weight = choice.get('weight', 1.0)
        return self._update(ssv, weight, source='choice')

    def observe_guidance_response(self, response: str, winning_center: str,
                                  losing_center: Optional[str] = None) -> dict:
        """
        Observe response to agent guidance.
        response: 'accepted' | 'ignored' | 'rejected'
        winning_center: center whose signal the human followed
        losing_center: center they moved away from
        """
        response_ssv_map = {
            'accepted':  text_to_ssv('align accept follow yes agree resonance'),
            'ignored':   text_to_ssv('uncertain unclear ambiguous wait'),
            'rejected':  text_to_ssv('resist oppose no push back diverge'),
        }
        ssv = response_ssv_map.get(response, [0.2]*5)

        # Update Bradley-Terry scores
        if losing_center and losing_center in CENTERS:
            self.vm.bt_scores = update_bradley_terry(
                self.vm.bt_scores, winning_center, losing_center, self.BT_K
            )

        # Acceptance moves toward design, rejection moves toward shadow
        weight = {'accepted': 1.2, 'ignored': 0.8, 'rejected': 0.5}.get(response, 1.0)
        return self._update(ssv, weight, source='guidance_response')

    def observe_scenario_outcome(self, outcome: str, codon: int,
                                  skill_gained: Optional[str] = None) -> dict:
        """
        Observe the outcome of a life scenario.
        outcome: 'success' | 'failure' | 'partial'
        codon: 1-64 (determines which life domain)
        """
        outcome_ssv = {
            'success': text_to_ssv('build create achieve complete grow stronger'),
            'failure': text_to_ssv('struggle resist block exhaust lose struggle'),
            'partial': text_to_ssv('progress learn adapt develop uncertain'),
        }.get(outcome, [0.2]*5)

        # Codon → element weighting
        codon_element = codon % 5  # 0-4 → element index
        codon_boost = [0.1]*5
        codon_boost[codon_element] += 0.3
        boosted = normalize5([outcome_ssv[i] + codon_boost[i] for i in range(5)])

        weight = {'success': 1.3, 'failure': 0.7, 'partial': 1.0}.get(outcome, 1.0)
        return self._update(boosted, weight, source=f'scenario_{codon}_{outcome}')

    def _update(self, ssv: list, weight: float, source: str) -> dict:
        """Core update: blend new SSV into behavior vector, compute alignment."""
        prev_alignment = self.vm.current_alignment()

        # Effective learning rate weighted by signal strength
        effective_rate = self.LEARNING_RATE * weight
        self.vm.behavior_5d = blend_vectors(
            self.vm.behavior_5d, ssv, effective_rate
        )

        new_alignment = self.vm.current_alignment()
        self.vm.interaction_count += 1

        # Track threshold crossings
        if prev_alignment >= 0.0 and new_alignment < 0.0:
            self.vm.shadow_crossings += 1
        if prev_alignment < 0.75 and new_alignment >= 0.75:
            self.vm.convergence_events += 1

        # History
        self.vm.alignment_history.append(round(new_alignment, 4))

        return {
            'source':        source,
            'ssv':           ssv,
            'prev_alignment': round(prev_alignment, 4),
            'new_alignment':  round(new_alignment, 4),
            'delta':          round(new_alignment - prev_alignment, 4),
            'autonomy_level': self.vm.autonomy_level(),
            'in_shadow':      self.vm.is_in_shadow(),
        }

    def predict_next_alignment(self, candidate_text: str) -> float:
        """
        Simulate what alignment would be if human said/did this.
        Does NOT update state — pure prediction.
        """
        candidate_ssv = text_to_ssv(candidate_text)
        simulated_behavior = blend_vectors(
            self.vm.behavior_5d, candidate_ssv, self.LEARNING_RATE
        )
        return alignment_score(self.vm.design_5d, simulated_behavior)

    def suggest_toward_design(self) -> dict:
        """
        Generate guidance that would move behavior toward design.
        Returns the element that needs boosting and suggested focus.
        """
        div = self.vm.divergence()
        # Find which element is most BELOW design
        deficits = [(self.vm.design_5d[i] - self.vm.behavior_5d[i], i) for i in range(5)]
        deficits.sort(reverse=True)
        target_element = ELEMENTS[deficits[0][1]]
        target_center  = ELEMENT_CENTER[target_element]
        deficit_amount = deficits[0][0]

        suggestions = {
            'Earth': 'Ground in the body. Physical action, not planning. What can you touch right now?',
            'Water': 'Return to feeling. What does this actually feel like, not what you think about it?',
            'Air':   'Create space. Step back from doing. What pattern are you actually in?',
            'Fire':  'Move. Respond. Stop analyzing and let your body generate an answer.',
            'Aether':'Find the purpose underneath. What is this actually for? Who does it serve?',
        }

        return {
            'target_element':  target_element,
            'target_center':   target_center,
            'deficit':         round(deficit_amount, 4),
            'suggestion':      suggestions[target_element],
            'current_alignment': round(self.vm.current_alignment(), 4),
            'autonomy_level':  self.vm.autonomy_level(),
        }


# ═══════════════════════════════════════════════════════════════════
# NETWORK FIELD COHERENCE
# When multiple nodes exist, measure collective alignment
# ═══════════════════════════════════════════════════════════════════

def network_coherence(view_matrices: list) -> dict:
    """
    Compute collective field coherence across the network.
    High coherence = everyone living their design = network thrives.

    view_matrices: list of ViewMatrix.to_dict() outputs
    """
    if not view_matrices:
        return {'coherence': 0.0, 'nodes': 0}

    alignments = [vm.get('alignment', 0.0) for vm in view_matrices]
    avg_alignment = sum(alignments) / len(alignments)

    # Network coherence = mean alignment weighted by interaction count
    weights = [max(1, vm.get('interaction_count', 1)) for vm in view_matrices]
    total_w = sum(weights)
    weighted_alignment = sum(a*w for a,w in zip(alignments, weights)) / total_w

    # Shadow count
    in_shadow = sum(1 for a in alignments if a < 0)
    at_signature = sum(1 for a in alignments if a >= 0.75)

    # Pairwise CI similarity (resonance network health)
    ci_vectors = [vm.get('ci_32', []) for vm in view_matrices if vm.get('ci_32')]
    pairwise_sims = []
    for i in range(len(ci_vectors)):
        for j in range(i+1, len(ci_vectors)):
            if len(ci_vectors[i]) == len(ci_vectors[j]):
                pairwise_sims.append(cosine_sim(ci_vectors[i], ci_vectors[j]))

    avg_resonance = sum(pairwise_sims) / len(pairwise_sims) if pairwise_sims else 0.0

    return {
        'nodes':              len(view_matrices),
        'mean_alignment':     round(avg_alignment, 4),
        'weighted_alignment': round(weighted_alignment, 4),
        'in_shadow':          in_shadow,
        'at_signature':       at_signature,
        'avg_ci_resonance':   round(avg_resonance, 4),
        'network_health':     round((weighted_alignment + 1) / 2 * 100, 1),  # 0-100
        'field_coherence':    round(avg_resonance * ((weighted_alignment + 1) / 2) * 100, 1),
    }


# ═══════════════════════════════════════════════════════════════════
# MAIN API — called from JS via Pyodide
# ═══════════════════════════════════════════════════════════════════

def init_observer(report: dict) -> dict:
    """
    Initialize a ViewMatrix from an ephemeris report.
    Call this once when a node first enters the field.
    Returns JSON-serializable dict — store in localStorage.
    """
    ci_data = build_ci_from_report(report)
    bt      = initial_bt_scores(report)

    vm = ViewMatrix(
        node_address      = report.get('address', ''),
        design_5d         = ci_data['element_5d'],
        behavior_5d       = ci_data['element_5d'][:],  # start at design
        ci_32             = ci_data['ci_32'],
        bt_scores         = bt,
        alignment_history = [1.0],  # starts at perfect alignment
        interaction_count = 0,
    )
    d = vm.to_dict()
    d['ci_data'] = ci_data
    return d


def observe_text(vm_dict: dict, text: str, weight: float = 1.0) -> dict:
    """Update observer from text input. Returns updated ViewMatrix dict."""
    vm = _dict_to_vm(vm_dict)
    obs = StateObserver(vm)
    result = obs.observe_text(text, weight)
    updated = vm.to_dict()
    updated['last_observation'] = result
    return updated


def observe_choice(vm_dict: dict, choice_text: str, motive: str = '',
                   weight: float = 1.0) -> dict:
    """Update observer from scenario choice."""
    vm = _dict_to_vm(vm_dict)
    obs = StateObserver(vm)
    result = obs.observe_choice({'text': choice_text, 'motive': motive, 'weight': weight})
    updated = vm.to_dict()
    updated['last_observation'] = result
    return updated


def get_suggestion(vm_dict: dict) -> dict:
    """Get alignment guidance for the current state."""
    vm = _dict_to_vm(vm_dict)
    obs = StateObserver(vm)
    return obs.suggest_toward_design()


def predict_alignment(vm_dict: dict, candidate_text: str) -> float:
    """Predict what alignment would be if human said/did this."""
    vm = _dict_to_vm(vm_dict)
    obs = StateObserver(vm)
    return obs.predict_next_alignment(candidate_text)


def _dict_to_vm(d: dict) -> ViewMatrix:
    """Reconstruct ViewMatrix from stored dict."""
    return ViewMatrix(
        node_address      = d.get('node_address', ''),
        design_5d         = d.get('design_5d', [0.2]*5),
        behavior_5d       = d.get('behavior_5d', [0.2]*5),
        ci_32             = d.get('ci_32', [0.0]*32),
        bt_scores         = d.get('bt_scores', {c:1.0 for c in CENTERS}),
        alignment_history = d.get('alignment_history', []),
        interaction_count = d.get('interaction_count', 0),
        shadow_crossings  = d.get('shadow_crossings', 0),
        convergence_events= d.get('convergence_events', 0),
    )
