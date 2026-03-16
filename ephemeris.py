"""
ephemeris.py
YOU-N-I-VERSE Planetary Ephemeris Engine

Uses PyEphem for accurate planetary positions.
Produces Tropical, Sidereal (Fagan-Bradley), and Draconic coordinates
for all 13 bodies — same output structure as the original swisseph backend.

Replaces: trinity_backend.py (which required swisseph C extension)
Compatible with: Pyodide (browser WASM Python runtime)
"""

import ephem
import math
from datetime import datetime
from typing import Dict, Tuple

# ─── Constants ───────────────────────────────────────────────────────────────

SIGNS = [
    'Aries','Taurus','Gemini','Cancer',
    'Leo','Virgo','Libra','Scorpio',
    'Sagittarius','Capricorn','Aquarius','Pisces'
]

# HD Wheel: 64 gates mapped to ecliptic longitude
# Each gate = 5.625°, starting from 0° Aries
GATE_SEQUENCE = [
    41,19,13,49,30,55,37,63,22,36,25,17,21,51,42,3,
    27,24,2,23,8,20,16,35,45,12,15,52,39,53,62,56,
    31,33,7,4,29,59,40,64,47,6,46,18,48,57,32,50,
    28,44,1,43,14,34,9,5,26,11,10,58,38,54,61,60
]

GATE_NAMES = {
    1:'The Creative',2:'The Receptive',3:'Ordering',4:'Youthful Folly',
    5:'Waiting',6:'Conflict',7:'The Army',8:'Holding Together',
    9:'Taming Power',10:'Treading',11:'Peace',12:'Standstill',
    13:'Fellowship',14:'Power Skills',15:'Modesty',16:'Enthusiasm',
    17:'Following',18:'Work on What is Spoilt',19:'Approach',20:'Contemplation',
    21:'Biting Through',22:'Grace',23:'Splitting Apart',24:'Return',
    25:'Innocence',26:'The Taming Power',27:'Nourishment',28:'The Game Player',
    29:'The Abysmal',30:'Clinging Fire',31:'Influence',32:'Duration',
    33:'Retreat',34:'Power of the Great',35:'Progress',36:'Darkening of the Light',
    37:'The Family',38:'Opposition',39:'Obstruction',40:'Deliverance',
    41:'Decrease',42:'Increase',43:'Breakthrough',44:'Coming to Meet',
    45:'Gathering Together',46:'Pushing Upward',47:'Oppression',48:'The Well',
    49:'Revolution',50:'The Cauldron',51:'The Arousing',52:'Keeping Still',
    53:'Development',54:'The Marrying Maiden',55:'Abundance',56:'The Wanderer',
    57:'The Gentle',58:'The Joyous',59:'Dispersion',60:'Limitation',
    61:'Inner Truth',62:'Preponderance of Small',63:'After Completion',64:'Before Completion'
}

PLANET_DIMENSIONS = {
    'Sun':       'Movement (I Define)',
    'Moon':      'Evolution (I Remember)',
    'Mercury':   'Space (I Think)',
    'Venus':     'Design (I Design)',
    'Mars':      'Movement (I Define)',
    'Jupiter':   'Evolution (I Remember)',
    'Saturn':    'Design (I Design)',
    'Uranus':    'Space (I Think)',
    'Neptune':   'Space/Heart (I Think/Remember)',
    'Pluto':     'Evolution (I Remember)',
    'NorthNode': 'Evolution (Soul Direction)',
    'SouthNode': 'Evolution (Past Patterns)'
}

PLANET_CENTER = {
    'Sun':'Sacral', 'Moon':'Solar Plexus', 'Mercury':'Throat',
    'Venus':'Heart', 'Mars':'Spleen', 'Jupiter':'G Center',
    'Saturn':'Ajna', 'Uranus':'Ajna', 'Neptune':'Solar Plexus',
    'Pluto':'Root', 'NorthNode':'G Center', 'SouthNode':'G Center'
}

PLANET_BODY_SYSTEM = {
    'Sun':       'Oxygen / Inhalation',
    'Moon':      'Hydration',
    'Mercury':   'Voice / Aura',
    'Venus':     'Complexion / Skin',
    'Mars':      'Temperature',
    'Jupiter':   'Aura Expansion',
    'Saturn':    'Structural Endurance',
    'Uranus':    'Nervous Innovation',
    'Neptune':   'Hydration / Dissolution',
    'Pluto':     'Deep Mutation',
    'NorthNode': 'Life Direction',
    'SouthNode': 'Ancestral Memory'
}

VOICES = ['I Define', 'I Remember', 'I Am', 'I Design', 'I Think']
SENSES = ['Sight', 'Taste', 'Touch', 'Smell', 'Hearing']
BASE_NAMES = ['Movement', 'Evolution', 'Being', 'Design', 'Space']

# ─── Coordinate Helpers ──────────────────────────────────────────────────────

def norm360(d: float) -> float:
    return ((d % 360) + 360) % 360

def rad_to_deg(r: float) -> float:
    return math.degrees(r)

def ephem_to_deg(angle) -> float:
    """Convert ephem angle (radians) to degrees 0-360"""
    return norm360(math.degrees(float(angle)))

def fagan_bradley_ayanamsa(jd: float) -> float:
    """
    Fagan-Bradley ayanamsa.
    At J2000.0 (JD 2451545.0): 24.042°
    Precession rate: ~50.29 arcsec/year = 0.013969 deg/year
    """
    t = (jd - 2451545.0) / 365.25
    return 24.042 + t * 0.013969

def deg_to_gate(d: float) -> int:
    idx = min(int(norm360(d) / 5.625), 63)
    return GATE_SEQUENCE[idx]

def deg_to_line(d: float) -> int:
    return int(norm360(d) % 5.625 / 0.9375) + 1

def deg_to_color(d: float) -> int:
    return int(norm360(d) % 0.9375 / 0.15625) + 1

def deg_to_tone(d: float) -> int:
    return int(norm360(d) % 0.15625 / 0.026042) + 1

def deg_to_base(d: float) -> int:
    return int(norm360(d) / 72) % 5 + 1

def format_position(degrees: float) -> str:
    d = norm360(degrees)
    sign_idx = int(d / 30)
    deg_in_sign = d % 30
    return f"{deg_in_sign:.1f}° {SIGNS[sign_idx]}"

def angular_diff(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return d if d <= 180 else 360 - d

def coherence_score(spread: float) -> float:
    return max(0.0, 1.0 - spread / 180.0)

def planet_coord(deg: float) -> dict:
    d = norm360(deg)
    gate = deg_to_gate(d)
    return {
        'deg':   d,
        'gate':  gate,
        'line':  deg_to_line(d),
        'color': deg_to_color(d),
        'tone':  deg_to_tone(d),
        'base':  deg_to_base(d),
        'name':  GATE_NAMES[gate],
        'formatted': format_position(d),
        'sign':  SIGNS[int(d / 30)]
    }

# ─── Ephemeris Calculator ────────────────────────────────────────────────────

class TrinityCalculator:
    """
    Full planetary calculator using PyEphem.
    Computes all 13 bodies across Tropical, Sidereal (Fagan-Bradley),
    and Draconic coordinate systems.
    """

    def __init__(self, birth_date: str, birth_time: str,
                 latitude: float = 0.0, longitude: float = 0.0,
                 timezone_offset: float = 0.0):
        """
        birth_date: 'YYYY-MM-DD'
        birth_time: 'HH:MM'
        latitude/longitude: decimal degrees
        timezone_offset: hours from UTC (e.g. -8 for PST)
        """
        self.birth_date = birth_date
        self.birth_time = birth_time
        self.latitude = latitude
        self.longitude = longitude
        self.tz_offset = timezone_offset

        # Set up ephem observer
        self.observer = ephem.Observer()
        self.observer.lat  = str(latitude)
        self.observer.lon  = str(longitude)
        self.observer.pressure = 0  # No refraction

        # Parse datetime and convert to UTC
        dt_str = f"{birth_date} {birth_time}"
        dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
        # Adjust for timezone
        from datetime import timedelta
        dt_utc = dt - timedelta(hours=timezone_offset)
        self.observer.date = dt_utc.strftime("%Y/%m/%d %H:%M:%S")
        self.ephem_date = self.observer.date

        # Compute Julian Day
        jd_epoch = ephem.Date('1899/12/31 12:00:00')
        self.jd = float(self.ephem_date) + 2415020.0

        # Ayanamsa
        self.ayanamsa = fagan_bradley_ayanamsa(self.jd)

        # Compute North Node tropical position
        self.north_node_trop = self._get_north_node()

    def _get_north_node(self) -> float:
        """True North Node in tropical longitude"""
        # ephem doesn't have north node directly
        # Use mean node approximation (accurate ~0.5°)
        T = (self.jd - 2451545.0) / 36525.0
        # Mean ascending node
        omega = 125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000.0
        # True node correction (main term)
        M  = math.radians(357.5291 + 35999.0503 * T)
        Mm = math.radians(134.9634 + 477198.8676 * T)
        F  = math.radians(93.2721 + 483202.0175 * T)
        D  = math.radians(297.8502 + 445267.1115 * T)
        omega += -1.4979 * math.sin(2*(F - D)) \
                 -0.1500 * math.sin(M) \
                 -0.1226 * math.sin(2*F) \
                 +0.1176 * math.sin(2*(F - D) - Mm) \
                 -0.0801 * math.sin(Mm - 2*(F - D))
        return norm360(omega)

    def _get_planet_trop(self, planet_obj) -> float:
        """Get tropical ecliptic longitude for an ephem planet object"""
        planet_obj.compute(self.ephem_date, epoch=self.ephem_date)
        # ephem gives ecliptic lon in radians
        ecl = ephem.Ecliptic(planet_obj, epoch=self.ephem_date)
        return ephem_to_deg(ecl.lon)

    def calculate_all_planets(self) -> dict:
        """
        Returns dict of all planets with tropical, sidereal, draconic positions.
        Each planet has full coordinate data + gate/line/base etc.
        """
        # Get tropical positions using ephem
        planets_ephem = {
            'Sun':     ephem.Sun(),
            'Moon':    ephem.Moon(),
            'Mercury': ephem.Mercury(),
            'Venus':   ephem.Venus(),
            'Mars':    ephem.Mars(),
            'Jupiter': ephem.Jupiter(),
            'Saturn':  ephem.Saturn(),
            'Uranus':  ephem.Uranus(),
            'Neptune': ephem.Neptune(),
            'Pluto':   ephem.Pluto(),
        }

        result = {}

        for name, obj in planets_ephem.items():
            trop = self._get_planet_trop(obj)
            sid  = norm360(trop - self.ayanamsa)
            drac = norm360(trop - self.north_node_trop)

            result[name] = {
                'tropical':  planet_coord(trop),
                'sidereal':  planet_coord(sid),
                'draconic':  planet_coord(drac),
                'center':    PLANET_CENTER.get(name, 'G Center'),
                'bodySystem':PLANET_BODY_SYSTEM.get(name, 'Unknown'),
                'dimension': PLANET_DIMENSIONS.get(name, 'Unknown')
            }

        # North Node
        nn_trop = self.north_node_trop
        nn_sid  = norm360(nn_trop - self.ayanamsa)
        nn_drac = 0.0  # North Node in Draconic = 0 by definition
        result['NorthNode'] = {
            'tropical':  planet_coord(nn_trop),
            'sidereal':  planet_coord(nn_sid),
            'draconic':  planet_coord(nn_drac),
            'center':    PLANET_CENTER['NorthNode'],
            'bodySystem':PLANET_BODY_SYSTEM['NorthNode'],
            'dimension': PLANET_DIMENSIONS['NorthNode']
        }

        # South Node = opposite
        sn_trop = norm360(nn_trop + 180)
        sn_sid  = norm360(sn_trop - self.ayanamsa)
        sn_drac = 180.0
        result['SouthNode'] = {
            'tropical':  planet_coord(sn_trop),
            'sidereal':  planet_coord(sn_sid),
            'draconic':  planet_coord(sn_drac),
            'center':    PLANET_CENTER['SouthNode'],
            'bodySystem':PLANET_BODY_SYSTEM['SouthNode'],
            'dimension': PLANET_DIMENSIONS['SouthNode']
        }

        return result

    def generate_trinity_report(self) -> dict:
        """
        Full trinity report — all planets × 3 systems + coherence + HD data.
        This is the main output used by all other modules.
        """
        planets = self.calculate_all_planets()

        # Primary trinity = Sun across 3 systems
        sun = planets['Sun']
        body  = sun['tropical']   # Body = Tropical
        mind  = sun['sidereal']   # Mind = Sidereal
        heart = sun['draconic']   # Heart = Draconic

        # Shadow = inverted Draconic Sun (180° from heart)
        shadow_deg = norm360(heart['deg'] + 180)
        shadow = planet_coord(shadow_deg)

        # Coherence between the 3 fields
        mb = angular_diff(body['deg'],  mind['deg'])
        bh = angular_diff(body['deg'],  heart['deg'])
        hm = angular_diff(heart['deg'], mind['deg'])
        coh_mb = coherence_score(mb)
        coh_bh = coherence_score(bh)
        coh_hm = coherence_score(hm)
        overall_coh = (coh_mb + coh_bh + coh_hm) / 3

        # Analyze spread level per planet (unified/aligned/moderate/divergent/fragmented)
        planet_analyses = {}
        topology = {'unified':[], 'aligned':[], 'moderate':[], 'divergent':[], 'fragmented':[]}

        for name, data in planets.items():
            t = data['tropical']['deg']
            s = data['sidereal']['deg']
            d = data['draconic']['deg']
            max_diff = max(angular_diff(t,s), angular_diff(t,d), angular_diff(s,d))

            if   max_diff < 5:   level = 'UNIFIED'
            elif max_diff < 15:  level = 'ALIGNED'
            elif max_diff < 30:  level = 'MODERATE'
            elif max_diff < 60:  level = 'DIVERGENT'
            else:                level = 'FRAGMENTED'

            planet_analyses[name] = {
                'spread': round(max_diff, 2),
                'level':  level,
                'tropical_deg': round(t, 4),
                'sidereal_deg': round(s, 4),
                'draconic_deg': round(d, 4),
                'tropical_fmt': data['tropical']['formatted'],
                'sidereal_fmt': data['sidereal']['formatted'],
                'draconic_fmt': data['draconic']['formatted'],
                'gate_tropical': data['tropical']['gate'],
                'gate_sidereal': data['sidereal']['gate'],
                'gate_draconic': data['draconic']['gate'],
            }
            topology[level.lower()].append(name)

        # CI Vector — 32-dim normalized from all planets
        ci = build_ci_vector(planets)

        # Gate outputs for trinity_field (64-dim numpy-ready list)
        gate_outputs = build_gate_outputs(planets)

        # Penta position
        penta = calc_penta(body['gate'], mind['gate'], heart['gate'])

        # Sentence
        sentence = build_sentence(body, mind, heart)

        # Node address
        address = node_address(body, mind, heart, overall_coh)

        return {
            'birth_data': {
                'date':      self.birth_date,
                'time':      self.birth_time,
                'latitude':  self.latitude,
                'longitude': self.longitude,
                'julian_day': round(self.jd, 6),
                'ayanamsa':  round(self.ayanamsa, 6),
                'north_node_tropical': round(self.north_node_trop, 6),
            },
            # Primary trinity fields
            'body':   body,
            'mind':   mind,
            'heart':  heart,
            'shadow': shadow,
            # All planets
            'planets': planets,
            # Coordinates dict (for resonance_module_extended compatibility)
            'coordinates': {
                'mind':  {'raw': {n: planets[n]['tropical']['deg'] for n in planets},
                          'system': 'Tropical', 'description': 'Current Expression • mRNA'},
                'body':  {'raw': {n: planets[n]['sidereal']['deg'] for n in planets},
                          'system': 'Sidereal Fagan-Bradley', 'description': 'Fixed Essence • tRNA'},
                'heart': {'raw': {n: planets[n]['draconic']['deg'] for n in planets},
                          'system': 'Draconic True Node', 'description': 'Soul Purpose • rRNA'},
            },
            # Coherence
            'coherence': {
                'mind_body':   round(coh_mb, 4),
                'body_heart':  round(coh_bh, 4),
                'heart_mind':  round(coh_hm, 4),
                'overall':     round(overall_coh, 4),
                'overall_pct': round(overall_coh * 100, 1),
            },
            # HD
            'planet_analyses': planet_analyses,
            'topology': topology,
            # Derived
            'ci':           ci,
            'gate_outputs': gate_outputs,
            'penta':        penta,
            'sentence':     sentence,
            'address':      address,
        }


# ─── CI Vector ───────────────────────────────────────────────────────────────

def build_ci_vector(planets: dict) -> list:
    """
    32-dimensional consciousness index vector.
    Built from gate/line/base activations across all planets × 3 systems.
    Normalized to unit sphere.
    """
    raw = [0.0] * 32
    planet_list = list(planets.values())
    systems = ['tropical', 'sidereal', 'draconic']

    for pi, p in enumerate(planet_list):
        for si, sys in enumerate(systems):
            coord = p.get(sys, p['tropical'])
            slot  = ((pi * 3 + si) * 7) % 32
            raw[slot]           += coord['gate']  / 64.0
            raw[(slot+1) % 32]  += coord['line']  / 6.0
            raw[(slot+2) % 32]  += coord['base']  / 5.0
            raw[(slot+3) % 32]  += coord['color'] / 6.0
            raw[(slot+4) % 32]  += coord['tone']  / 6.0
            raw[(slot+5) % 32]  += math.sin(math.radians(coord['deg']))
            raw[(slot+6) % 32]  += math.cos(math.radians(coord['deg']))

    mag = math.sqrt(sum(v*v for v in raw)) or 1.0
    return [round(v / mag, 6) for v in raw]


# ─── Gate Output Vector (for trinity_field.py) ───────────────────────────────

def build_gate_outputs(planets: dict) -> list:
    """
    64-dimensional gate activation vector for TrinityInterferenceEngine.
    Each index = gate 1-64, value = weighted activation from planetary positions.
    """
    outputs = [0.0] * 64
    weights = {'Sun':2.0,'Moon':1.8,'Mercury':1.2,'Venus':1.2,'Mars':1.3,
               'Jupiter':1.1,'Saturn':1.0,'Uranus':0.8,'Neptune':0.8,
               'Pluto':0.7,'NorthNode':1.5,'SouthNode':1.0}

    for name, data in planets.items():
        w = weights.get(name, 1.0)
        for sys in ['tropical','sidereal','draconic']:
            coord = data.get(sys, data['tropical'])
            gate_idx = coord['gate'] - 1  # 0-indexed
            # Activation based on proximity to gate center
            activation = 1.0 - (coord['deg'] % 5.625) / 5.625
            outputs[gate_idx] += w * activation * (0.5 if sys != 'tropical' else 1.0)

    # Normalize 0-1
    mx = max(outputs) or 1.0
    return [round(v / mx, 6) for v in outputs]


# ─── Penta ───────────────────────────────────────────────────────────────────

PENTA_NAMES = ['','Foundation','Connector','Provider','Director','Transmitter']
PENTA_DESCS = ['',
    'Holds the physical structure. Security, material stability. The Penta cannot stand without this.',
    'Bridges positions — relational flow, translation between field types. Essential membrane.',
    'Generates resources — material, energetic, creative. The output engine.',
    'Holds vision, sets direction. Clarity that others orient around.',
    'Projects the field outward. Where the Penta touches the world.'
]

def calc_penta(body_gate: int, mind_gate: int, heart_gate: int) -> dict:
    pos = ((body_gate + mind_gate + heart_gate) % 5) + 1
    return {'pos': pos, 'name': PENTA_NAMES[pos], 'desc': PENTA_DESCS[pos]}


# ─── Sentence System ─────────────────────────────────────────────────────────

def build_sentence(body: dict, mind: dict, heart: dict) -> str:
    bv = VOICES[body['base'] - 1]
    mv = VOICES[mind['base'] - 1]
    hv = VOICES[heart['base'] - 1]
    bs = SENSES[body['base'] - 1].lower()
    ms = SENSES[mind['base'] - 1].lower()

    templates = [
        f"Through {body['name']} (G{body['gate']}), my body says \"{bv}\" — I know it through {bs}. "
        f"My mind finds {mind['name']} (G{mind['gate']}) — \"{mv}\" — it navigates by {ms}. "
        f"My heart is already in {heart['name']} (G{heart['gate']}): \"{hv}.\"",

        f"\"{bv}\" — that's what my body speaks through Gate {body['gate']}, {body['name']}. "
        f"My mind answers: \"{mv}\" through Gate {mind['gate']}, {mind['name']}. "
        f"Underneath it all, my heart has always known: \"{hv}.\" Gate {heart['gate']}. {heart['name']}.",

        f"I am a body that defines through {body['name']}, "
        f"a mind that {mv.lower()}s through {mind['name']}, "
        f"a heart already pointed at {heart['name']}. Three layers. One node."
    ]
    return templates[body['gate'] % 3]


# ─── Node Address ─────────────────────────────────────────────────────────────

def node_address(body: dict, mind: dict, heart: dict, coherence: float) -> str:
    return (f"D3//{body['gate']}.{body['line']}.{body['base']}"
            f"/{mind['gate']}.{mind['line']}.{mind['base']}"
            f"/{heart['gate']}.{heart['line']}.{heart['base']}"
            f"·coh:{coherence*100:.0f}%")


# ─── Resonance Between Two Charts ────────────────────────────────────────────

def compare_nodes(report_a: dict, report_b: dict) -> dict:
    """
    Full resonance comparison between two trinity reports.
    Wraps resonance_module_extended.compare_charts with proper input format.
    """
    def chart_for_module(report):
        """Format a report for resonance_module_extended.analyze_chart"""
        planets = report['planets']
        chart = {}
        for name, data in planets.items():
            trop = data['tropical']
            sid  = data['sidereal']
            chart[name] = {
                'gate':    trop['gate'],
                'line':    trop['line'],
                'color':   trop['color'],
                'tone':    trop['tone'],
                'base':    trop['base'],
                'defined': True,
                'side':    'personality',
                'sign':    trop['sign'],
                'house':   int(trop['deg'] / 30) + 1,
                # Include all 3 systems
                'tropical_gate':  trop['gate'],
                'sidereal_gate':  sid['gate'],
                'draconic_gate':  data['draconic']['gate'],
            }
        return chart

    ca = chart_for_module(report_a)
    cb = chart_for_module(report_b)

    # CI cosine similarity
    ci_a = report_a.get('ci', [])
    ci_b = report_b.get('ci', [])
    ci_score = 0.0
    if ci_a and ci_b and len(ci_a) == len(ci_b):
        dot = sum(a*b for a,b in zip(ci_a, ci_b))
        ci_score = round(((dot + 1) / 2) * 100, 1)

    # Field coherence
    ba, ma, ha = report_a['body'], report_a['mind'], report_a['heart']
    bb, mb, hb = report_b['body'], report_b['mind'], report_b['heart']
    body_coh  = round(coherence_score(angular_diff(ba['deg'], bb['deg'])) * 100, 1)
    mind_coh  = round(coherence_score(angular_diff(ma['deg'], mb['deg'])) * 100, 1)
    heart_coh = round(coherence_score(angular_diff(ha['deg'], hb['deg'])) * 100, 1)

    # Gate resonance
    gate_bonus = 0
    if ba['gate'] == bb['gate']:  gate_bonus += 8
    if ma['gate'] == mb['gate']:  gate_bonus += 8
    if ha['gate'] == hb['gate']:  gate_bonus += 8
    if abs(ba['gate'] - bb['gate']) == 32: gate_bonus -= 4
    if abs(ma['gate'] - mb['gate']) == 32: gate_bonus -= 4

    # Overall
    overall = min(100, round(
        ci_score * 0.4 +
        ((body_coh + mind_coh + heart_coh) / 3) * 0.4 +
        gate_bonus * 0.2
    ))

    # Interaction mode
    if overall >= 80 and gate_bonus >= 16:
        mode, mode_desc = 'COLLABORATE', 'Co-create. Your fields reinforce each other directly. Build together.'
    elif overall >= 75:
        mode, mode_desc = 'MENTOR', 'One guides, one receives. Direction flows naturally between you.'
    elif overall >= 60:
        mode, mode_desc = 'MIRROR', "You reflect each other's patterns. Growth through recognition."
    elif overall >= 40:
        mode, mode_desc = 'CHALLENGE', "Friction is the point. You activate each other's edges."
    else:
        mode, mode_desc = 'OBSERVE', 'Distance with awareness. Respect the field boundary.'

    # Harmony/friction
    harmony, friction = [], []
    for label, a, b, da, db in [
        ('Body', ba, bb, report_a['body']['deg'], report_b['body']['deg']),
        ('Mind', ma, mb, report_a['mind']['deg'], report_b['mind']['deg']),
        ('Heart',ha, hb, report_a['heart']['deg'],report_b['heart']['deg']),
    ]:
        c = coherence_score(angular_diff(da, db)) * 100
        if c > 75:  harmony.append(f"{label} fields aligned ({c:.0f}% coherent)")
        if c < 30:  friction.append(f"{label} fields in tension ({c:.0f}% coherent)")
        if a['gate'] == b['gate']:
            harmony.append(f"Shared {label} gate G{a['gate']} — {a['name']}")
        if abs(a['gate'] - b['gate']) == 32:
            friction.append(f"{label} gates in opposition: G{a['gate']} ↔ G{b['gate']}")
        if a['base'] == b['base']:
            harmony.append(f"Same base: {BASE_NAMES[a['base']-1]} ({label})")
        if (a['line'], b['line']) in [(1,4),(4,1),(2,5),(5,2),(3,6),(6,3)]:
            harmony.append(f"Complementary {label} lines: L{a['line']} ↔ L{b['line']}")

    # WA (3-person emergent field)
    wa = calc_wa(report_a, report_b)

    return {
        'overall':    overall,
        'ci_score':   ci_score,
        'body_coh':   body_coh,
        'mind_coh':   mind_coh,
        'heart_coh':  heart_coh,
        'gate_bonus': gate_bonus,
        'mode':       mode,
        'mode_desc':  mode_desc,
        'harmony':    harmony,
        'friction':   friction,
        'wa':         wa,
        'penta_a':    report_a.get('penta'),
        'penta_b':    report_b.get('penta'),
    }


# ─── WA (3-person relational field) ──────────────────────────────────────────

def calc_wa(report_a: dict, report_b: dict) -> dict:
    """
    WA = the emergent 3rd field generated between two people.
    The WA is what they create together — neither person alone.
    """
    ba, ma, ha = report_a['body'], report_a['mind'], report_a['heart']
    bb, mb, hb = report_b['body'], report_b['mind'], report_b['heart']

    body_coh  = coherence_score(angular_diff(ba['deg'], bb['deg']))
    mind_coh  = coherence_score(angular_diff(ma['deg'], mb['deg']))
    heart_coh = coherence_score(angular_diff(ha['deg'], hb['deg']))

    dominant = max(body_coh, mind_coh, heart_coh)
    if   dominant == body_coh:  wa_type, wa_desc = 'BODY WA',  'Physical bond — Tropical coherence. Biology, presence, sensation.'
    elif dominant == mind_coh:  wa_type, wa_desc = 'MIND WA',  'Cognitive bond — Sidereal coherence. Pattern sync, shared logic.'
    else:                       wa_type, wa_desc = 'HEART WA', 'Soul bond — Draconic coherence. Shared direction, felt navigation.'

    # Emergent gate = midpoint of all 3 field pairs
    emg_body_deg  = norm360((ba['deg'] + bb['deg']) / 2)
    emg_mind_deg  = norm360((ma['deg'] + mb['deg']) / 2)
    emg_heart_deg = norm360((ha['deg'] + hb['deg']) / 2)

    emg_gate = deg_to_gate(norm360(emg_body_deg + emg_mind_deg + emg_heart_deg) / 3)

    # WA coherence = average of the 3 field pairs
    wa_coh = round((body_coh + mind_coh + heart_coh) / 3 * 100, 1)

    # What they need to complete their Penta
    pa = report_a.get('penta', {}).get('pos', 0)
    pb = report_b.get('penta', {}).get('pos', 0)
    all_pos = {1,2,3,4,5}
    filled  = {pa, pb} - {0}
    needed  = sorted(all_pos - filled)
    needed_names = [PENTA_NAMES[p] for p in needed]

    return {
        'wa_type':       wa_type,
        'wa_desc':       wa_desc,
        'wa_coherence':  wa_coh,
        'body_coh':      round(body_coh * 100, 1),
        'mind_coh':      round(mind_coh * 100, 1),
        'heart_coh':     round(heart_coh * 100, 1),
        'emergent_gate': emg_gate,
        'emergent_name': GATE_NAMES[emg_gate],
        'field_gates': {
            'body':  deg_to_gate(emg_body_deg),
            'mind':  deg_to_gate(emg_mind_deg),
            'heart': deg_to_gate(emg_heart_deg),
        },
        'penta_positions': {'a': pa, 'b': pb},
        'penta_needed':    needed,
        'penta_needed_names': needed_names,
    }


# ─── 9-Body Field (uses gate_outputs + trinity_field.py) ─────────────────────

def calc_nine_fields(report: dict) -> dict:
    """
    Calculate 9-body consciousness field amplitudes using TrinityInterferenceEngine.
    """
    import numpy as np
    from trinity_field import TrinityInterferenceEngine

    gate_outputs = np.array(report['gate_outputs'], dtype=float)
    engine = TrinityInterferenceEngine(field_dim=64)
    result = engine.process_trinity(gate_outputs)

    planets = report['planets']
    sun = planets['Sun']

    NINE_DEF = [
        {'key':'Mind',   'coord':'sidereal',  'field':'mind',        'center':'Ajna'},
        {'key':'Heart',  'coord':'tropical',  'field':'heart',       'center':'Solar Plexus'},
        {'key':'Body',   'coord':'draconic',  'field':'body',        'center':'Spleen'},
        {'key':'Soul',   'coord':'sidereal',  'field':'interference','center':'G Center'},
        {'key':'Spirit', 'coord':'tropical',  'field':'interference','center':'Throat'},
        {'key':'Shadow', 'coord':'draconic',  'field':'body',        'center':'Spleen'},
        {'key':'Higher', 'coord':'sidereal',  'field':'mind',        'center':'Head'},
        {'key':'Lower',  'coord':'tropical',  'field':'body',        'center':'Root'},
        {'key':'Core',   'coord':'draconic',  'field':'interference','center':'G Center'},
    ]

    fields = {}
    for bd in NINE_DEF:
        field_arr = result[bd['field']]
        gate_idx  = sun[bd['coord']]['gate'] - 1
        # Amplitude from field value at this gate + neighborhood
        start = max(0, gate_idx - 2)
        end   = min(64, gate_idx + 3)
        raw_amp = float(np.mean(field_arr[start:end]))

        # Modulation by body type
        key = bd['key']
        if key == 'Shadow':
            raw_amp = 1.0 - raw_amp
        elif key == 'Higher':
            raw_amp = raw_amp ** 0.5
        elif key == 'Lower':
            raw_amp = raw_amp ** 1.5
        elif key == 'Core':
            raw_amp = (raw_amp + (1 - raw_amp)) / 2

        amp = max(5, min(98, round(raw_amp * 100)))

        coord = sun[bd['coord']]
        fields[key] = {
            'amplitude':  amp,
            'coherence':  round(float(result['coherence']) * 100, 1),
            'gate':       coord['gate'],
            'line':       coord['line'],
            'base':       coord['base'],
            'name':       coord['name'],
            'system':     bd['coord'],
            'center':     bd['center'],
        }

    return fields


# ─── Main Entry Point ─────────────────────────────────────────────────────────

def calculate(birth_date: str, birth_time: str,
              latitude: float = 0.0, longitude: float = 0.0,
              timezone_offset: float = 0.0,
              conscious_mode: str = 'wake') -> dict:
    """
    Main function called from JavaScript via Pyodide.
    Returns complete trinity report as a JSON-serializable dict.
    """
    calc = TrinityCalculator(birth_date, birth_time, latitude, longitude, timezone_offset)
    report = calc.generate_trinity_report()

    # 9-body field interference
    report['nine_fields'] = calc_nine_fields(report)

    # State observer — behavioral alignment layer
    try:
        import state_observer as so
        report['observer'] = so.init_observer(report)
    except Exception as e:
        report['observer'] = {'error': str(e)}

    # Quantum bridge — structural phase-lock layer
    try:
        import quantum_bridge as qb
        report['bridge'] = qb.init_bridge(report)
    except Exception as e:
        report['bridge'] = {'error': str(e)}

    # GNN route — orchestration decision
    try:
        import quantum_bridge as qb
        obs = report.get('observer', {})
        brg = report.get('bridge', {})
        if 'error' not in obs and 'error' not in brg:
            report['gnn'] = qb.gnn_route(obs, brg)
        else:
            report['gnn'] = {'stage':1,'stage_name':'Find','agent_mode':'orient','stage_label':'FIND YOURSELF','stage_color':'#6b3fa0','show':['chart','trinity','sentences','ci_vector'],'hide':[],'prompt':'Begin with the chart.','progress_pct':0}
    except Exception as e:
        report['gnn'] = {'stage':1,'error':str(e)}

    # Full sentence engine — all three fields, all planets, all modes
    try:
        import sentence_engine as se
        report['sentences'] = se.generate_trinity_sentences(report, conscious_mode)

        # Also generate sentences for every planet × system combination
        all_sentences = {}
        for planet_name in ['Sun','Moon','Mercury','Venus','Mars','Jupiter',
                            'Saturn','Uranus','Neptune','Pluto','NorthNode','SouthNode']:
            if planet_name in report.get('planets', {}):
                all_sentences[planet_name] = {}
                for sys_name in ['tropical','sidereal','draconic']:
                    try:
                        all_sentences[planet_name][sys_name] = se.generate_from_report(
                            report, planet_name, sys_name, conscious_mode
                        )
                    except Exception:
                        pass
        report['all_sentences'] = all_sentences
    except Exception as e:
        report['sentences'] = {'error': str(e)}
        report['all_sentences'] = {}

    return report
