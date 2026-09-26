'use strict';

const crypto = require('crypto');

function hashFloat(seed, offset = 0) {
  const h = crypto.createHash('sha256').update(`${seed}:${offset}`).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function probeImageDimensions(buffer, mimeType = '') {
  try {
    if (mimeType === 'image/png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (mimeType === 'image/jpeg' || (buffer[0] === 0xff && buffer[1] === 0xd8)) {
      let i = 2;
      while (i + 9 < buffer.length) {
        if (buffer[i] !== 0xff) { i += 1; continue; }
        const marker = buffer[i + 1];
        const len = buffer.readUInt16BE(i + 2);
        if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
          return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
        }
        i += 2 + Math.max(2, len);
      }
    }
  } catch (_error) {}
  return { width: null, height: null };
}

function extractVisualIdentity(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const dimensions = probeImageDimensions(buffer, mimeType);
  const sampleCount = Math.min(buffer.length, 4096);
  let mean = 0;
  let variance = 0;
  if (sampleCount > 0) {
    const step = Math.max(1, Math.floor(buffer.length / sampleCount));
    const samples = [];
    for (let i = 0; i < buffer.length && samples.length < sampleCount; i += step) samples.push(buffer[i]);
    mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    variance = samples.reduce((a, b) => a + ((b - mean) ** 2), 0) / samples.length;
  }
  return {
    representationVersion: 'photo-source-v1',
    identityAnchor: `sha256:${sha256}`,
    sourceSha256: sha256,
    mimeType,
    byteSize: buffer.length,
    width: dimensions.width,
    height: dimensions.height,
    byteMean: Number(mean.toFixed(4)),
    byteVariance: Number(variance.toFixed(4)),
  };
}

function deriveVisualState(spec) {
  const seed = crypto.createHash('sha256').update(JSON.stringify({
    base: spec.baseIdentity?.identityAnchor,
    gameId: spec.gameId,
    sceneId: spec.sceneId,
    activeGateStates: spec.activeGateStates,
    activeLines: spec.activeLines,
    role: spec.narrativeRole,
    equipment: spec.equipment,
    environment: spec.environmentalInfluence,
    rules: spec.transformationRules,
  })).digest('hex');

  const requested = spec.transformationRules || {};
  const agePhase = requested.agePhase || ['adult','elder','mythic','future'][Math.floor(hashFloat(seed, 2) * 4)];
  const element = requested.element || ['aether','water','earth','fire','air'][Math.floor(hashFloat(seed, 3) * 5)];
  const archetype = requested.archetype || spec.narrativeRole || 'traveler';
  const scale = Number((requested.bodyScale || (0.88 + hashFloat(seed, 4) * 0.34)).toFixed(3));
  const auraRadius = Number((70 + hashFloat(seed, 5) * 48).toFixed(2));
  const distortion = Number((hashFloat(seed, 6) * 16 - 8).toFixed(2));
  const luminosity = Number((0.45 + hashFloat(seed, 7) * 0.5).toFixed(3));
  const centerAmplifications = Array.isArray(spec.chartAmplifications) ? spec.chartAmplifications : [];
  const visibleChannels = Array.isArray(spec.visibleChannels) ? spec.visibleChannels : [];

  return {
    renderer: 'synthia-svg-embodiment-v1',
    seed,
    agePhase,
    element,
    archetype,
    bodyScale: scale,
    auraRadius,
    distortion,
    luminosity,
    centerAmplifications,
    visibleChannels,
    paletteKey: `${element}:${archetype}`,
  };
}

function paletteFor(element) {
  return {
    water: ['#53d4ff', '#2667ff', '#071b33'],
    fire: ['#ffb347', '#ff4d6d', '#35110f'],
    earth: ['#b7d76d', '#7a9b46', '#182110'],
    air: ['#d8f3ff', '#92bfff', '#16233c'],
    aether: ['#d28cff', '#7b61ff', '#170d33'],
  }[element] || ['#d28cff', '#7b61ff', '#170d33'];
}

function centerPoint(name) {
  return {
    Head:[200,90], Ajna:[200,135], Throat:[200,190], G:[200,250], Heart:[250,250],
    Spleen:[145,300], Sacral:[200,340], 'Solar Plexus':[255,305], Root:[200,400],
  }[name] || [200,250];
}

function renderEmbodimentSvg({ player, morph, sourceImageUrl }) {
  const v = morph.visualState;
  const [c1, c2, bg] = paletteFor(v.element);
  const centers = (v.centerAmplifications || []).map((c, i) => {
    const name = typeof c === 'string' ? c : c.center;
    const strength = typeof c === 'object' ? Number(c.strength ?? 1) : 1;
    const [x,y] = centerPoint(name);
    const r = 7 + Math.max(0, Math.min(1.8, strength)) * 7;
    return `<g data-center="${escapeXml(name)}"><circle cx="${x}" cy="${y}" r="${r}" fill="${c1}" opacity="${Math.min(0.95, 0.4 + strength * 0.25)}"/><circle cx="${x}" cy="${y}" r="${r+5}" fill="none" stroke="${c2}" stroke-width="2" opacity="0.65"/></g>`;
  }).join('');

  const channels = (v.visibleChannels || []).map(ch => {
    const a = Array.isArray(ch) ? ch[0] : ch.fromCenter;
    const b = Array.isArray(ch) ? ch[1] : ch.toCenter;
    const [x1,y1] = centerPoint(a); const [x2,y2] = centerPoint(b);
    return `<path d="M ${x1} ${y1} Q ${(x1+x2)/2 + v.distortion} ${(y1+y2)/2 - v.distortion} ${x2} ${y2}" fill="none" stroke="${c1}" stroke-width="5" opacity="0.55"/>`;
  }).join('');

  const ageAdjust = v.agePhase === 'child' ? 0.78 : v.agePhase === 'elder' ? 0.93 : v.agePhase === 'mythic' ? 1.12 : v.agePhase === 'future' ? 1.06 : 1;
  const scale = Number((v.bodyScale * ageAdjust).toFixed(3));
  const bodyY = v.agePhase === 'child' ? 185 : 170;
  const shoulder = v.archetype === 'warrior' ? 88 : v.archetype === 'mage' ? 72 : 78;
  const silhouette = `M ${200-shoulder} ${bodyY+35} Q 200 ${bodyY-10} ${200+shoulder} ${bodyY+35} L ${250+v.distortion} 420 Q 200 452 ${150-v.distortion} 420 Z`;
  const gateDoors = (morph.activeGateStates || []).slice(0,4).map((g,i) => {
    const n = typeof g === 'number' ? g : g.gate;
    const x = 30 + i*52;
    return `<g opacity="0.8"><rect x="${x}" y="448" width="38" height="24" rx="5" fill="none" stroke="${c2}"/><text x="${x+19}" y="465" text-anchor="middle" font-size="11" fill="#fff">${escapeXml(n)}</text></g>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500" role="img" aria-label="YOU-N-I-VERSE embodiment">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%"><stop offset="0" stop-color="${c2}" stop-opacity="0.42"/><stop offset="1" stop-color="${bg}" stop-opacity="1"/></radialGradient>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}" stop-opacity="0.82"/><stop offset="1" stop-color="${c2}" stop-opacity="0.62"/></linearGradient>
    <clipPath id="faceClip"><ellipse cx="200" cy="116" rx="54" ry="63"/></clipPath>
    <filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="400" height="500" fill="url(#bg)"/>
  <circle cx="200" cy="250" r="${v.auraRadius}" fill="none" stroke="${c1}" stroke-width="3" opacity="${v.luminosity}" filter="url(#glow)"/>
  <g transform="translate(${200*(1-scale)} ${250*(1-scale)}) scale(${scale})">
    <path d="${silhouette}" fill="url(#body)" stroke="${c1}" stroke-width="3" opacity="0.9"/>
    ${channels}
    ${centers}
    <ellipse cx="200" cy="116" rx="59" ry="68" fill="#0b0d16" stroke="${c1}" stroke-width="4"/>
    <image href="${escapeXml(sourceImageUrl)}" x="140" y="48" width="120" height="136" preserveAspectRatio="xMidYMid slice" clip-path="url(#faceClip)"/>
    <ellipse cx="200" cy="116" rx="54" ry="63" fill="none" stroke="${c2}" stroke-width="2" opacity="0.9"/>
  </g>
  ${gateDoors}
  <text x="20" y="28" fill="#fff" font-size="13" font-family="system-ui">${escapeXml(v.archetype)} - ${escapeXml(v.agePhase)} - ${escapeXml(v.element)}</text>
  <text x="20" y="48" fill="#cfd7ff" font-size="10" font-family="monospace">player ${escapeXml(player.playerId)} - morph ${escapeXml(morph.morphId)}</text>
</svg>`;
}

module.exports = { extractVisualIdentity, deriveVisualState, renderEmbodimentSvg, probeImageDimensions };
