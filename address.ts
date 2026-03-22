/**
 * ONTOLOGICAL ADDRESS ENGINE
 * Every artifact entering the system gets a permanent address.
 * Gate(64) × Line(6) × Color(6) × Tone(6) × Base(5) = 69,120 base positions
 * × 4 dimensions = 276,480 dimensional positions
 * Full address includes zodiac, house, planet, timestamp, place → 22T+ space
 */

export type Dimension = 'being' | 'designed' | 'composite_space' | 'movement_evolutionary';

export interface OntologicalAddress {
  dimension:     Dimension;
  gate:          number;   // 1-64
  line:          number;   // 1-6
  color:         number;   // 1-6
  tone:          number;   // 1-6
  base:          number;   // 1-5
  degree:        number;
  minute:        number;
  second:        number;
  arc:           number;
  zodiac:        string;
  house:         number;   // 1-12
  planet:        string;
  place_label:   string;
  inserted_at:   string;
  signature:     string;   // unique hash
  address_22t:   number;
}

const DIM_MULT: Record<Dimension, number> = {
  being:               0,
  designed:            1 * 64 * 6 * 6 * 6 * 5,
  composite_space:     2 * 64 * 6 * 6 * 6 * 5,
  movement_evolutionary: 3 * 64 * 6 * 6 * 6 * 5,
};

const ZODIACS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
                 'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const PLANETS = ['Sun','Moon','Mercury','Venus','Mars','Jupiter',
                 'Saturn','Uranus','Neptune','Pluto','North Node','South Node'];

// Gate → zodiac mapping (simplified Vedic correspondence)
const GATE_ZODIAC: Record<number, string> = {};
const GATE_HOUSE:  Record<number, number> = {};
for (let g = 1; g <= 64; g++) {
  GATE_ZODIAC[g] = ZODIACS[Math.floor((g - 1) / 5.34) % 12];
  GATE_HOUSE[g]  = ((g - 1) % 12) + 1;
}

function compute22T(d: Dimension, gate: number, line: number,
                    color: number, tone: number, base: number): number {
  return DIM_MULT[d] +
    (gate  - 1) * 6 * 6 * 6 * 5 +
    (line  - 1) * 6 * 6 * 5 +
    (color - 1) * 6 * 5 +
    (tone  - 1) * 5 +
    (base  - 1);
}

function hashString(str: string): string {
  let h = 0xdeadbeef;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 2654435761);
  }
  return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

// Infer dimension from artifact content/type
export function inferDimension(type: string, content: string): Dimension {
  const t = type.toLowerCase();
  if (t.includes('html') || t.includes('app') || t.includes('world'))
    return 'composite_space';
  if (t.includes('upload') || t.includes('file'))
    return 'being';
  if (t.includes('code') || t.includes('script'))
    return 'designed';
  // Check content patterns
  if (content.includes('animate') || content.includes('stream') || content.includes('tick'))
    return 'movement_evolutionary';
  return 'designed';
}

// Derive gate from content fingerprint — deterministic
export function deriveGate(name: string, content: string): number {
  let h = 0;
  const str = name + content.slice(0, 500);
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return (Math.abs(h) % 64) + 1;
}

export function deriveCoords(name: string, content: string, dimension: Dimension) {
  let h = 0;
  const str = name + content.slice(0, 1000);
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + i * 13) + str.charCodeAt(i);
    h |= 0;
  }
  const abs = Math.abs(h);
  return {
    gate:  (abs % 64) + 1,
    line:  (abs % 6)  + 1,
    color: ((abs >> 3) % 6) + 1,
    tone:  ((abs >> 6) % 6) + 1,
    base:  ((abs >> 9) % 5) + 1,
    degree: abs % 360,
    minute: abs % 60,
    second: (abs >> 2) % 60,
    arc:    (abs % 360) / 360,
    planet: PLANETS[abs % PLANETS.length],
  };
}

export function createAddress(
  name: string,
  content: string,
  type: string,
  placeLabel = 'Paper Worlds',
  dimension?: Dimension
): OntologicalAddress {
  const dim = dimension ?? inferDimension(type, content);
  const coords = deriveCoords(name, content, dim);
  const zodiac = GATE_ZODIAC[coords.gate];
  const house  = GATE_HOUSE[coords.gate];
  const insertedAt = new Date().toISOString();

  const sigSrc = [dim, coords.gate, coords.line, coords.color, coords.tone, coords.base,
                  zodiac, house, coords.planet, placeLabel, insertedAt].join('·');
  const signature = `${dim}·${coords.gate}·${coords.line}·${coords.color}·${coords.tone}·${coords.base}·${zodiac}·H${house}·${coords.planet}#${hashString(sigSrc)}`;

  return {
    dimension: dim,
    gate:      coords.gate,
    line:      coords.line,
    color:     coords.color,
    tone:      coords.tone,
    base:      coords.base,
    degree:    coords.degree,
    minute:    coords.minute,
    second:    coords.second,
    arc:       coords.arc,
    zodiac,
    house,
    planet:    coords.planet,
    place_label: placeLabel,
    inserted_at: insertedAt,
    signature,
    address_22t: compute22T(dim, coords.gate, coords.line, coords.color, coords.tone, coords.base),
  };
}

// Resonance between two addresses — used by auto-mixer
export function resonance(a: OntologicalAddress, b: OntologicalAddress): number {
  const gateMatch  = a.gate === b.gate ? 1 : Math.abs(a.gate - b.gate) < 5 ? 0.6 : 0.2;
  const lineMatch  = a.line === b.line ? 1 : 0.4;
  const dimMatch   = a.dimension === b.dimension ? 1 : 0.5;
  const zodMatch   = a.zodiac === b.zodiac ? 0.8 : 0.3;
  return (gateMatch * 0.4 + lineMatch * 0.2 + dimMatch * 0.25 + zodMatch * 0.15);
}
