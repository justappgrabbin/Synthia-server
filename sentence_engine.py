"""
sentence_engine.py
YOU-N-I-VERSE — Generative Consciousness Sentence Engine

NO sentences are stored. Every output is computed on demand from
locked vocabulary tables + lattice position arithmetic.

Total address space:
  69,120 base positions (5×6×6×6×64)
  × 3 planetary systems (Tropical/Sidereal/Draconic)
  × 12 bodies
  × 5 conscious modes
  = 12,441,600,000+ unique consciousness coordinates

Surface sentences: combinatorial product of phrase fragments.
This engine generates the GRAMMAR, not the sentences.

"The lattice position IS the sentence."
"""

from dataclasses import dataclass
from typing import Optional

# ═══════════════════════════════════════════════════════════════════
# LOCKED VOCABULARY — DO NOT MODIFY
# Base 5 = Space. This is non-negotiable.
# ═══════════════════════════════════════════════════════════════════

# ── Five Dimensions ──────────────────────────────────────────────
DIMENSIONS = {
    1: {
        'name':      'Movement',
        'keynote':   'I Define',
        'nature':    'Individuality',
        'chain':     ['Movement','Energy','Creation','Seeing','Landscape','Environment'],
        'human':     ['Activity','Reaction','Limitation','Perspective','Relation'],
        'system':    'Tropical',        # Body field
        'archetype': 'Individuality expressed through action in a changing environment',
    },
    2: {
        'name':      'Evolution',
        'keynote':   'I Remember',
        'nature':    'The Mind',
        'chain':     ['Evolution','Gravity','Memory','Taste','Love','Light'],
        'human':     ['Character','Separation','Nature','Integration','Spirit'],
        'system':    'Sidereal',        # Mind field
        'archetype': 'Memory seeking integration through love and light',
    },
    3: {
        'name':      'Being',
        'keynote':   'I Am',
        'nature':    'The Body',
        'chain':     ['Being','Matter','Touch','Sex','Survival'],
        'human':     ['Biology','Chemistry','Objectivity','Geometry','Trajectory'],
        'system':    'Draconic',        # Heart field
        'archetype': 'Survival and sensation in biological form',
    },
    4: {
        'name':      'Design',
        'keynote':   'I Design',
        'nature':    'The Ego',
        'chain':     ['Design','Structure','Progress','Smell','Life','Art'],
        'human':     ['Growth','Decay','Continuity','Manifestation'],
        'system':    'Tropical',
        'archetype': 'Selfhood built through structure, continuity, and growth',
    },
    5: {
        'name':      'Space',           # ← LOCKED. Never changes.
        'keynote':   'I Think',
        'nature':    'Personality',
        'chain':     ['Space','Form','Illusion','Hearing','Music','Freedom'],
        'human':     ['Type','Fantasy','Subjectivity','Rhythm','Timing'],
        'system':    'Sidereal',
        'archetype': 'Personality as interference pattern — an illusion with rhythm',
    },
}

# ── Six Lines ─────────────────────────────────────────────────────
LINES = {
    1: {'style': 'Investigator', 'mode': 'Foundation',   'shadow': 'insecurity',    'gift': 'empathy',      'siddhi': 'radiance'},
    2: {'style': 'Hermit',       'mode': 'Projection',   'shadow': 'aloofness',     'gift': 'genius',       'siddhi': 'enlightenment'},
    3: {'style': 'Martyr',       'mode': 'Adaptation',   'shadow': 'pessimism',     'gift': 'innovation',   'siddhi': 'innocence'},
    4: {'style': 'Opportunist',  'mode': 'Externalization','shadow':'corruption',   'gift': 'forgiveness',  'siddhi': 'exaltation'},
    5: {'style': 'Heretic',      'mode': 'Universalization','shadow':'inconsistency','gift': 'pragmatism',  'siddhi': 'justice'},
    6: {'style': 'Role Model',   'mode': 'Transition',   'shadow': 'opportunism',   'gift': 'leadership',   'siddhi': 'mastery'},
}

# ── Six Colors (Motivations) ──────────────────────────────────────
COLORS = {
    1: {'name': 'Fear',       'polarity': ('Communalist',   'Separatist'),  'drive': 'safety through belonging or isolation'},
    2: {'name': 'Hope',       'polarity': ('Theist',        'Anti-theist'), 'drive': 'meaning through faith or rejection of it'},
    3: {'name': 'Desire',     'polarity': ('Leader',        'Follower'),    'drive': 'power through direction or submission'},
    4: {'name': 'Need',       'polarity': ('Master',        'Novice'),      'drive': 'competence through mastery or apprenticeship'},
    5: {'name': 'Guilt',      'polarity': ('Conditioner',   'Conditioned'), 'drive': 'influence through shaping or being shaped'},
    6: {'name': 'Innocence',  'polarity': ('Observer',      'Observed'),    'drive': 'clarity through watching or being witnessed'},
}

# ── Six Tones (Senses / Centers) ─────────────────────────────────
TONES = {
    1: {'name': 'Security',    'sense': 'Smell',        'center': 'Splenic',     'quality': 'instinctive knowing'},
    2: {'name': 'Uncertainty', 'sense': 'Taste',        'center': 'Splenic',     'quality': 'evaluative sampling'},
    3: {'name': 'Action',      'sense': 'Outer Vision', 'center': 'Ajna',        'quality': 'conceptual projection'},
    4: {'name': 'Meditation',  'sense': 'Inner Vision', 'center': 'Ajna',        'quality': 'internal processing'},
    5: {'name': 'Judgement',   'sense': 'Feeling',      'center': 'Solar Plexus','quality': 'emotional discernment'},
    6: {'name': 'Acceptance',  'sense': 'Touch',        'center': 'Solar Plexus','quality': 'receptive contact'},
}

# ── Five Bases ────────────────────────────────────────────────────
BASES = {
    1: {'name': 'Life',      'keyword': 'survival',      'voice': 'primal'},
    2: {'name': 'The Other', 'keyword': 'relationship',  'voice': 'relational'},
    3: {'name': 'Mutation',  'keyword': 'transformation','voice': 'transmutive'},
    4: {'name': 'Form',      'keyword': 'structure',     'voice': 'architectural'},
    5: {'name': 'Space',     'keyword': 'freedom',       'voice': 'liberating'},  # ← LOCKED
}

# ── Gate Names + Shadow/Gift/Siddhi (Gene Keys frequency spectrum) ──
# Format: gate_num → (name, shadow, gift, siddhi)
GATES = {
    1:  ('The Creative',                'entropy',        'freshness',      'beauty'),
    2:  ('The Receptive',               'dislocation',    'orientation',    'unity'),
    3:  ('Ordering',                    'chaos',          'innovation',     'innocence'),
    4:  ('Youthful Folly',              'intolerance',    'understanding',  'forgiveness'),
    5:  ('Waiting',                     'impatience',     'patience',       'timelessness'),
    6:  ('Conflict',                    'conflict',       'diplomacy',      'peace'),
    7:  ('The Army',                    'division',       'guidance',       'virtue'),
    8:  ('Holding Together',            'mediocrity',     'style',          'exquisiteness'),
    9:  ('Taming Power of the Small',   'inertia',        'determination',  'invincibility'),
    10: ('Treading',                    'self-obsession', 'naturalness',    'being'),
    11: ('Peace',                       'obscurity',      'idealism',       'light'),
    12: ('Standstill',                  'vanity',         'discrimination', 'purity'),
    13: ('Fellowship',                  'discord',        'empathy',        'empathy'),
    14: ('Power of the Great',          'compromise',     'competence',     'bounteousness'),
    15: ('Modesty',                     'dullness',       'magnetism',      'florescence'),
    16: ('Enthusiasm',                  'indifference',   'versatility',    'mastery'),
    17: ('Following',                   'opinion',        'open-mindedness','omniscience'),
    18: ('Work on What Is Spoilt',      'judgment',       'integrity',      'perfection'),
    19: ('Approach',                    'co-dependence',  'sensitivity',    'sacrifice'),
    20: ('Contemplation',               'superficiality', 'self-assurance', 'presence'),
    21: ('Biting Through',              'control',        'authority',      'valour'),
    22: ('Grace',                       'dishonour',      'graciousness',   'grace'),
    23: ('Splitting Apart',             'complexity',     'simplicity',     'quintessence'),
    24: ('Return',                      'addiction',      'invention',      'silence'),
    25: ('Innocence',                   'constriction',   'acceptance',     'universal love'),
    26: ('The Taming Power of the Great','pride',         'artfulness',     'invisibility'),
    27: ('Nourishment',                 'selfishness',    'altruism',       'selflessness'),
    28: ('The Game Player',             'purposelessness','totality',       'immortality'),
    29: ('The Abysmal',                 'half-heartedness','commitment',    'devotion'),
    30: ('Clinging Fire',               'desire',         'lightness',      'rapture'),
    31: ('Influence',                   'arrogance',      'leadership',     'humility'),
    32: ('Duration',                    'failure',        'preservation',   'veneration'),
    33: ('Retreat',                     'forgetting',     'mindfulness',    'revelation'),
    34: ('Power of the Great',          'force',          'strength',       'majesty'),
    35: ('Progress',                    'hunger',         'adventure',      'boundlessness'),
    36: ('Darkening of the Light',      'turbulence',     'humanity',       'compassion'),
    37: ('The Family',                  'weakness',       'equality',       'tenderness'),
    38: ('Opposition',                  'struggle',       'perseverance',   'honour'),
    39: ('Obstruction',                 'provocation',    'dynamism',       'liberation'),
    40: ('Deliverance',                 'exhaustion',     'resolve',        'divine will'),
    41: ('Decrease',                    'fantasy',        'anticipation',   'emanation'),
    42: ('Increase',                    'expectation',    'detachment',     'celebration'),
    43: ('Breakthrough',                'deafness',       'insight',        'epiphany'),
    44: ('Coming to Meet',              'interference',   'alertness',      'synarchy'),
    45: ('Gathering Together',          'dominance',      'communion',      'synarchy'),
    46: ('Pushing Upward',              'seriousness',    'delight',        'ecstasy'),
    47: ('Oppression',                  'oppression',     'transmutation',  'transfiguration'),
    48: ('The Well',                    'inadequacy',     'resourcefulness','wisdom'),
    49: ('Revolution',                  'reaction',       'revolution',     'rebirth'),
    50: ('The Cauldron',                'corruption',     'equilibrium',    'harmony'),
    51: ('The Arousing',                'agitation',      'initiative',     'awakening'),
    52: ('Keeping Still',               'stress',         'restraint',      'stillness'),
    53: ('Development',                 'immaturity',     'expansion',      'superabundance'),
    54: ('The Marrying Maiden',         'greed',          'aspiration',     'ascension'),
    55: ('Abundance',                   'victimisation',  'freedom',        'freedom'),
    56: ('The Wanderer',                'distraction',    'enrichment',     'intoxication'),
    57: ('The Gentle',                  'unease',         'intuition',      'clarity'),
    58: ('The Joyous',                  'dissatisfaction','vitality',       'bliss'),
    59: ('Dispersion',                  'dishonesty',     'intimacy',       'transparency'),
    60: ('Limitation',                  'rigidity',       'realism',        'justice'),
    61: ('Inner Truth',                 'psychosis',      'inspiration',    'sanctity'),
    62: ('Preponderance of the Small',  'intellectualism','impeccability',  'impeccability'),
    63: ('After Completion',            'doubt',          'inquiry',        'truth'),
    64: ('Before Completion',           'confusion',      'imagination',    'illumination'),
}

# ── Signs ─────────────────────────────────────────────────────────
SIGNS = {
    'Aries':       {'flavor': 'initiation and courage',     'element': 'fire',  'mode': 'cardinal'},
    'Taurus':      {'flavor': 'steadiness and craft',       'element': 'earth', 'mode': 'fixed'},
    'Gemini':      {'flavor': 'curiosity and dialogue',     'element': 'air',   'mode': 'mutable'},
    'Cancer':      {'flavor': 'care and protection',        'element': 'water', 'mode': 'cardinal'},
    'Leo':         {'flavor': 'radiance and play',          'element': 'fire',  'mode': 'fixed'},
    'Virgo':       {'flavor': 'refinement and service',     'element': 'earth', 'mode': 'mutable'},
    'Libra':       {'flavor': 'harmony and relating',       'element': 'air',   'mode': 'cardinal'},
    'Scorpio':     {'flavor': 'depth and transformation',   'element': 'water', 'mode': 'fixed'},
    'Sagittarius': {'flavor': 'exploration and meaning',    'element': 'fire',  'mode': 'mutable'},
    'Capricorn':   {'flavor': 'structure and duty',         'element': 'earth', 'mode': 'cardinal'},
    'Aquarius':    {'flavor': 'future and systems',         'element': 'air',   'mode': 'fixed'},
    'Pisces':      {'flavor': 'imagination and compassion', 'element': 'water', 'mode': 'mutable'},
}

# ── Houses ────────────────────────────────────────────────────────
HOUSES = {
    1:  'identity and approach',      2:  'resources and worth',
    3:  'learning and voice',         4:  'home and roots',
    5:  'creativity and play',        6:  'service and skill',
    7:  'bond and mirror',            8:  'merging and power',
    9:  'belief and travel',          10: 'role and reputation',
    11: 'community and networks',     12: 'rest and the unseen',
}

# ── Conscious Modes ───────────────────────────────────────────────
CONSCIOUS_MODES = {
    'wake':       {'name': 'Wake',       'qualifier': 'alert',      'field': 'high gain, focused coherence'},
    'drowsy':     {'name': 'Drowsy',     'qualifier': 'liminal',    'field': 'low coherence, high metastability'},
    'meditation': {'name': 'Meditation', 'qualifier': 'deep',       'field': 'high complexity, strong PAC'},
    'flow':       {'name': 'Flow',       'qualifier': 'optimal',    'field': 'strong phase-amplitude coupling'},
    'rem':        {'name': 'REM',        'qualifier': 'dreaming',   'field': 'max complexity and metastability'},
}

# ── Symbolic Operators ────────────────────────────────────────────
OPERATORS = {
    '•': 'Singularity',   '.': 'Transitioner', '°': 'Collapse',
    ':': 'Portal',        ';': 'Fork',          ',': 'Breath',
    '–': 'Current',       '′': 'Pulse',         '″': 'Flicker',
    '/': 'Blade',         '\\': 'Escape',       '*': 'Starburst',
    '=': 'Mirror',        '→': 'Vector',
}


# ═══════════════════════════════════════════════════════════════════
# DATACLASSES
# ═══════════════════════════════════════════════════════════════════

@dataclass
class Scaffolding:
    """
    The minimal coordinate set that uniquely addresses one consciousness position.
    All sentence generation flows from this.
    """
    planet:       str          # 'Sun', 'Moon', etc.
    system:       str          # 'Tropical', 'Sidereal', 'Draconic'
    gate:         int          # 1-64
    line:         int          # 1-6
    color:        int          # 1-6
    tone:         int          # 1-6
    base:         int          # 1-5
    degree:       float        # ecliptic degree
    sign:         str          # zodiac sign name
    house:        int          # 1-12
    conscious_mode: str = 'wake'   # wake/drowsy/meditation/flow/rem
    axis:         Optional[str] = None

    def __post_init__(self):
        assert 1 <= self.gate  <= 64, f"Gate {self.gate} out of range"
        assert 1 <= self.line  <= 6,  f"Line {self.line} out of range"
        assert 1 <= self.color <= 6,  f"Color {self.color} out of range"
        assert 1 <= self.tone  <= 6,  f"Tone {self.tone} out of range"
        assert 1 <= self.base  <= 5,  f"Base {self.base} out of range"
        # Enforce locked vocabulary
        if self.base == 5:
            assert BASES[5]['name'] == 'Space', "Base 5 must be Space. This is non-negotiable."


@dataclass
class SentenceOutput:
    """Complete sentence output — no text stored, all computed."""
    lattice_pos:  int          # 0 – 69,119
    coordinate:   str          # canonical address string
    degree_coord: str          # degree°minute′second.axis″ sign house
    surface:      str          # human-readable, no mechanics named
    commentary:   str          # full mechanics commentary
    soul_slap:    str          # Ra-style prophecy cadence
    shadow:       str          # what pulls them down
    gift:         str          # what opens when they're present
    siddhi:       str          # the full frequency realization
    dimension:    dict         # full dimension record
    line_rec:     dict         # full line record
    color_rec:    dict         # full color record
    tone_rec:     dict         # full tone record
    base_rec:     dict         # full base record
    gate_rec:     tuple        # (name, shadow, gift, siddhi)
    mode_rec:     dict         # conscious mode record


# ═══════════════════════════════════════════════════════════════════
# CORE MATH
# ═══════════════════════════════════════════════════════════════════

def lattice_position(base: int, tone: int, color: int, line: int, gate: int) -> int:
    """
    Maps (base, tone, color, line, gate) → unique index in [0, 69119].
    Formula from ResonanceSentenceEngine.cs.
    """
    return (base-1)*13824 + (tone-1)*2304 + (color-1)*384 + (line-1)*64 + (gate-1)


def lattice_from_pos(pos: int) -> tuple:
    """Inverse: lattice position → (base, tone, color, line, gate)"""
    assert 0 <= pos <= 69119
    base  =  pos // 13824 + 1;  pos %= 13824
    tone  =  pos //  2304 + 1;  pos %=  2304
    color =  pos //   384 + 1;  pos %=   384
    line  =  pos //    64 + 1;  pos %=    64
    gate  =  pos          + 1
    return (base, tone, color, line, gate)


def calc_degree_coord(gate: int, line: int, color: int, tone: int, base: int,
                      ecliptic_deg: float = 0.0, axis: Optional[str] = None) -> str:
    """
    Produces: degree°minute′second.axis″  sign  house
    degree  = (gate + line + color + tone + base) % 360
    minute  = integer part of ecliptic fractional degree × 60
    second  = fractional remainder × 60 × 60
    """
    deg_val = (gate + line + color + tone + base) % 360
    frac    = ecliptic_deg % 1.0
    minute  = int(frac * 60)
    second  = round((frac * 60 - minute) * 60, 1)
    ax      = f".{axis}" if axis else ""
    return f"{deg_val}°{minute}′{second}{ax}″"


def dimension_from_base(base: int) -> dict:
    return DIMENSIONS[base]


def polarity_for(scaf: 'Scaffolding') -> tuple[str, str]:
    """Returns (pole_a, pole_b) for the color motivation."""
    return COLORS[scaf.color]['polarity']


def conscious_weight(mode: str, base: int) -> float:
    """
    Conscious mode modifies the base weight for sentence generation.
    Used by the AI brain to weight phrase selection — doesn't change vocabulary,
    changes which fragment pool is sampled from.
    """
    weights = {
        ('wake',       1): 1.2, ('wake',       2): 1.0,
        ('flow',       1): 0.8, ('flow',       3): 1.4,
        ('meditation', 3): 1.5, ('meditation', 5): 1.3,
        ('rem',        2): 1.4, ('rem',        4): 1.2,
        ('drowsy',     4): 0.7, ('drowsy',     1): 1.1,
    }
    return weights.get((mode, base), 1.0)


# ═══════════════════════════════════════════════════════════════════
# SENTENCE CONSTRUCTION
# ═══════════════════════════════════════════════════════════════════

def build_coordinate(scaf: Scaffolding) -> str:
    """
    Canonical address: system/planet gate.line.color.tone.base
    e.g. 'Tropical/Sun 13.4.2.5.1'
    """
    return f"{scaf.system}/{scaf.planet} {scaf.gate}.{scaf.line}.{scaf.color}.{scaf.tone}.{scaf.base}"


def build_surface(scaf: Scaffolding) -> str:
    """
    Human surface sentence. Never names mechanics.
    Derived entirely from keyword chains — combinatorial, not stored.

    Grammar:
      [keynote fragment] + [gate/line relationship] + [sign/house placement]
      + [color drive] + [tone/sense access]
    """
    dim   = DIMENSIONS[scaf.base]
    ln    = LINES[scaf.line]
    col   = COLORS[scaf.color]
    tn    = TONES[scaf.tone]
    gate_name, shadow, gift, siddhi = GATES[scaf.gate]
    sign_f = SIGNS.get(scaf.sign, {}).get('flavor', scaf.sign.lower())
    house_f = HOUSES.get(scaf.house, f'the {scaf.house}th domain')
    mode  = CONSCIOUS_MODES.get(scaf.conscious_mode, CONSCIOUS_MODES['wake'])

    keynote = dim['keynote'].lower()
    chain   = dim['chain']

    # Fragment pool — each selected by position arithmetic, not random
    # seed = lattice_pos, deterministic
    seed = lattice_position(scaf.base, scaf.tone, scaf.color, scaf.line, scaf.gate)

    # Opening: keynote + chain entry
    chain_word = chain[seed % len(chain)]
    openings = [
        f"{dim['keynote']} — {chain_word.lower()} moving through me as {gate_name.lower()}.",
        f"Through {gate_name.lower()}, {keynote} what carries the frequency of {chain_word.lower()}.",
        f"{dim['keynote']}. The {chain_word.lower()} in this moment takes the shape of {gate_name.lower()}.",
    ]
    opening = openings[seed % 3]

    # Middle: line style + color drive
    middles = [
        f"As a {ln['style'].lower()}, the pull toward {col['drive']} is what this keeps coming back to.",
        f"The {ln['style'].lower()} path meets {col['name'].lower()} — {col['drive']}.",
        f"Walking as a {ln['style'].lower()}: {col['drive']}.",
    ]
    middle = middles[(seed // 3) % 3]

    # Placement: sign + house
    placements = [
        f"In {scaf.sign}, this opens into {sign_f}. In the {scaf.house}th house, it moves through {house_f}.",
        f"{scaf.sign} grounds it in {sign_f}. The {scaf.house}th — {house_f} — is where it lands.",
        f"The field: {scaf.sign} ({sign_f}) and the {scaf.house}th house of {house_f}.",
    ]
    placement = placements[(seed // 9) % 3]

    # Sense access: tone
    sense_line = f"Access: {tn['sense'].lower()}. {tn['quality'].capitalize()}."

    return f"{opening} {middle} {placement} {sense_line}"


def build_soul_slap(scaf: Scaffolding) -> str:
    """
    Ra-style prophecy cadence. Locked format from sentence-engine.ts.
    Seed-deterministic fragment selection — not random, not stored.
    """
    dim    = DIMENSIONS[scaf.base]
    ln     = LINES[scaf.line]
    col    = COLORS[scaf.color]
    gate_name, shadow, gift, siddhi = GATES[scaf.gate]
    sign_f = SIGNS.get(scaf.sign, {}).get('flavor', scaf.sign.lower())
    house_f = HOUSES.get(scaf.house, f'the {scaf.house}th')
    mode   = CONSCIOUS_MODES.get(scaf.conscious_mode, CONSCIOUS_MODES['wake'])

    seed = lattice_position(scaf.base, scaf.tone, scaf.color, scaf.line, scaf.gate)
    keynote = dim['keynote']

    openers = [
        f"{keynote} what you already know but keep forgetting.",
        f"{keynote} myself when I stop negotiating with truth.",
        f"{keynote} the real pattern when it actually costs something.",
    ]
    opener = openers[seed % 3]

    mids = [
        f"You keep finding yourself in {gate_name.lower()} as a {ln['style'].lower()}.",
        f"{gate_name} keeps circling back. You're a {ln['style'].lower()} — this is the pattern.",
        f"The {ln['style'].lower()} knows {gate_name.lower()} by heart now.",
    ]
    mid = mids[(seed // 3) % 3]

    place = f"In {scaf.sign}, it turns into {sign_f}. In the {scaf.house}th, it moves through {house_f}."

    polarity_a, polarity_b = col['polarity']
    polarities = [
        f"When you lean into {shadow}, it hollows you out. When you choose {gift}, life makes room.",
        f"The {shadow} is the cheap exit. {gift.capitalize()} is the real move.",
        f"Between {polarity_a.lower()} and {polarity_b.lower()} — that's where {shadow} hides and {gift} waits.",
    ]
    polarity = polarities[(seed // 9) % 3]

    closers = [
        f"Keep choosing {gift} until it dissolves into {siddhi}.",
        f"{gift.capitalize()} is the practice. {siddhi.capitalize()} is what's already there.",
        f"The {siddhi} is not a destination. It's what {gift} reveals.",
    ]
    closer = closers[(seed // 27) % 3]

    return f"{opener} {mid} {place} {polarity} {closer}"


def build_commentary(scaf: Scaffolding) -> str:
    """
    Full mechanics commentary — provenance, not poetry.
    Format: Planet@deg°min′sec″ sign house • Gate•Line•Color•Tone•Base • Path
    """
    deg_coord = calc_degree_coord(scaf.gate, scaf.line, scaf.color, scaf.tone, scaf.base,
                                  scaf.degree, scaf.axis)
    gate_name, shadow, gift, siddhi = GATES[scaf.gate]
    ln  = LINES[scaf.line]
    col = COLORS[scaf.color]
    tn  = TONES[scaf.tone]
    bs  = BASES[scaf.base]
    dim = DIMENSIONS[scaf.base]

    parts = [
        f"{scaf.planet} ({scaf.system}) {deg_coord} {scaf.sign} H{scaf.house}",
        f"G{scaf.gate}–{gate_name}",
        f"L{scaf.line}–{ln['style']}",
        f"C{scaf.color}–{col['name']}",
        f"T{scaf.tone}–{tn['name']}",
        f"B{scaf.base}–{bs['name']}",
        f"[{dim['keynote']}]",
        f"Mode:{scaf.conscious_mode}",
        f"Lattice:{lattice_position(scaf.base,scaf.tone,scaf.color,scaf.line,scaf.gate)}",
    ]
    if scaf.axis:
        parts.append(f"Axis:{scaf.axis}")
    polarity_a, polarity_b = col['polarity']
    parts.append(f"Path:{shadow}→{gift}→{siddhi}")
    parts.append(f"Polarity:{polarity_a}↔{polarity_b}")
    return " • ".join(parts)


# ═══════════════════════════════════════════════════════════════════
# MAIN API
# ═══════════════════════════════════════════════════════════════════

def generate(scaf: Scaffolding) -> SentenceOutput:
    """
    Generate complete sentence output from a Scaffolding coordinate.
    All computation is deterministic from the coordinate — no randomness.
    """
    gate_rec = GATES[scaf.gate]
    shadow, gift, siddhi = gate_rec[1], gate_rec[2], gate_rec[3]

    # Line shadow/gift/siddhi supplements the gate's
    ln_rec = LINES[scaf.line]

    return SentenceOutput(
        lattice_pos  = lattice_position(scaf.base, scaf.tone, scaf.color, scaf.line, scaf.gate),
        coordinate   = build_coordinate(scaf),
        degree_coord = calc_degree_coord(scaf.gate, scaf.line, scaf.color, scaf.tone,
                                         scaf.base, scaf.degree, scaf.axis),
        surface      = build_surface(scaf),
        commentary   = build_commentary(scaf),
        soul_slap    = build_soul_slap(scaf),
        shadow       = shadow,
        gift         = gift,
        siddhi       = siddhi,
        dimension    = DIMENSIONS[scaf.base],
        line_rec     = LINES[scaf.line],
        color_rec    = COLORS[scaf.color],
        tone_rec     = TONES[scaf.tone],
        base_rec     = BASES[scaf.base],
        gate_rec     = gate_rec,
        mode_rec     = CONSCIOUS_MODES.get(scaf.conscious_mode, CONSCIOUS_MODES['wake']),
    )


def scaffolding_from_report(report: dict, planet: str = 'Sun',
                             system: str = 'tropical',
                             conscious_mode: str = 'wake') -> Scaffolding:
    """
    Build a Scaffolding directly from an ephemeris.py report.
    system: 'tropical' | 'sidereal' | 'draconic'
    """
    planets = report.get('planets', {})
    p = planets.get(planet)
    if not p:
        raise ValueError(f"Planet {planet} not in report")

    coord = p[system]

    # Base comes from the coordinate's base value
    # The system maps to a dimension: tropical=Movement(1)/Design(4), sidereal=Evolution(2)/Space(5), draconic=Being(3)
    # We use the coord's own base for the lattice
    base = coord['base']

    # House from ecliptic degree (simple 30° division)
    house = int(coord['deg'] / 30) + 1

    # Axis: whether the gate is in the upper or lower half of the wheel
    gate_idx = coord['gate'] - 1
    axis = 'upper' if gate_idx < 32 else 'lower'

    return Scaffolding(
        planet       = planet,
        system       = system.capitalize(),
        gate         = coord['gate'],
        line         = coord['line'],
        color        = coord['color'],
        tone         = coord['tone'],
        base         = base,
        degree       = coord['deg'],
        sign         = coord['sign'],
        house        = house,
        conscious_mode = conscious_mode,
        axis         = axis,
    )


def generate_from_report(report: dict,
                          planet: str = 'Sun',
                          system: str = 'tropical',
                          conscious_mode: str = 'wake') -> dict:
    """
    Full pipeline: report → Scaffolding → SentenceOutput → JSON-serializable dict.
    Call this from JavaScript via Pyodide.
    """
    scaf = scaffolding_from_report(report, planet, system, conscious_mode)
    out  = generate(scaf)
    return {
        'lattice_pos':  out.lattice_pos,
        'coordinate':   out.coordinate,
        'degree_coord': out.degree_coord,
        'surface':      out.surface,
        'soul_slap':    out.soul_slap,
        'commentary':   out.commentary,
        'shadow':       out.shadow,
        'gift':         out.gift,
        'siddhi':       out.siddhi,
        'dimension':    {k: v for k, v in out.dimension.items() if k != 'chain' or True},
        'gate_name':    out.gate_rec[0],
        'line_style':   out.line_rec['style'],
        'color_name':   out.color_rec['name'],
        'tone_name':    out.tone_rec['name'],
        'base_name':    out.base_rec['name'],
        'conscious_mode': out.mode_rec['name'],
        'keynote':      out.dimension['keynote'],
        'base_chain':   out.dimension['chain'],
    }


def generate_trinity_sentences(report: dict, conscious_mode: str = 'wake') -> dict:
    """
    Generate all three sentences (Body/Mind/Heart) for the primary trinity.
    Returns all three sentence outputs ready for display.
    """
    # System map: Body=Tropical, Mind=Sidereal, Heart=Draconic
    systems = {
        'body':  ('Sun', 'tropical'),
        'mind':  ('Sun', 'sidereal'),
        'heart': ('Sun', 'draconic'),
    }
    result = {}
    for field, (planet, system) in systems.items():
        try:
            result[field] = generate_from_report(report, planet, system, conscious_mode)
        except Exception as e:
            result[field] = {'error': str(e)}

    # Address-space stats
    result['_meta'] = {
        'lattice_positions':     69120,
        'planets':               12,
        'systems':               3,
        'conscious_modes':       5,
        'total_addresses':       69120 * 12 * 3 * 5,
        'body_lattice':          result.get('body', {}).get('lattice_pos'),
        'mind_lattice':          result.get('mind', {}).get('lattice_pos'),
        'heart_lattice':         result.get('heart', {}).get('lattice_pos'),
        'conscious_mode':        conscious_mode,
    }
    return result


# ═══════════════════════════════════════════════════════════════════
# VALIDATION
# ═══════════════════════════════════════════════════════════════════

def validate_tables():
    """Run on import to verify all tables are internally consistent."""
    # Base 5 = Space (locked)
    assert BASES[5]['name'] == 'Space', "CRITICAL: Base 5 must be Space"
    assert DIMENSIONS[5]['name'] == 'Space', "CRITICAL: Dimension 5 must be Space"

    # All 64 gates present
    assert len(GATES) == 64, f"Expected 64 gates, got {len(GATES)}"
    for g in range(1, 65):
        assert g in GATES, f"Gate {g} missing"

    # Lattice math
    assert lattice_position(1,1,1,1,1) == 0
    assert lattice_position(5,6,6,6,64) == 69119
    # Inverse
    assert lattice_from_pos(0)     == (1,1,1,1,1)
    assert lattice_from_pos(69119) == (5,6,6,6,64)

    return True

validate_tables()
