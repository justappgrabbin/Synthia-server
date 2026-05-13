'use strict';

function clamp(n, min, max) {
  n = Number(n);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86400000);
}

function parseDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('Invalid utc_time');
  return date;
}

function normalizeDirection(value) {
  return ['left', 'right', 'neutral'].includes(value) ? value : 'neutral';
}

class GeoContext {
  constructor(input = {}) {
    this.latitude = clamp(input.latitude ?? 0, -90, 90);
    this.longitude = clamp(input.longitude ?? 0, -180, 180);
    this.utcTime = parseDate(input.utc_time || input.utcTime || input.timestamp);
    this.localSolarTime = input.local_solar_time ?? input.localSolarTime ?? this.computeLocalSolarTime();
    this.seasonalAmplitude = input.seasonal_amplitude ?? input.seasonalAmplitude ?? ContextualArrowEngine.seasonalAmplitude(this.latitude);
  }

  computeLocalSolarTime() {
    const hour = this.utcTime.getUTCHours() + this.utcTime.getUTCMinutes() / 60 + this.utcTime.getUTCSeconds() / 3600;
    return (hour + this.longitude / 15 + 24) % 24;
  }

  toJSON() {
    return { latitude: this.latitude, longitude: this.longitude, utc_time: this.utcTime.toISOString(), local_solar_time: this.localSolarTime, seasonal_amplitude: this.seasonalAmplitude };
  }
}

class ArrowState {
  constructor(input = {}) {
    this.digestion = normalizeDirection(input.digestion);
    this.environment = normalizeDirection(input.environment);
    this.perspective = normalizeDirection(input.perspective);
    this.awareness = normalizeDirection(input.awareness);
    this.signal_source = input.signal_source || 'unknown';
    this.confidence = clamp(input.confidence ?? 0, 0, 1);
    this.signal = input.signal || null;
    this.modifiers = ArrowState.modifiersFor(this);
  }

  static modifier(direction) {
    if (direction === 'left') return { initiation: 1.5, reception: 0.7, latency: 'low' };
    if (direction === 'right') return { initiation: 0.7, reception: 1.5, latency: 'high' };
    return { initiation: 1.0, reception: 1.0, latency: 'medium' };
  }

  static modifiersFor(arrows) {
    return { digestion: ArrowState.modifier(arrows.digestion), environment: ArrowState.modifier(arrows.environment), perspective: ArrowState.modifier(arrows.perspective), awareness: ArrowState.modifier(arrows.awareness) };
  }

  toJSON() {
    return { digestion: this.digestion, environment: this.environment, perspective: this.perspective, awareness: this.awareness, signal_source: this.signal_source, confidence: this.confidence, signal: this.signal, modifiers: this.modifiers };
  }
}

class ContextualArrowEngine {
  constructor() {
    this.pivots = {
      spring_equinox: { day: 80, direction: 'left' },
      summer_solstice: { day: 172, direction: 'left' },
      autumn_equinox: { day: 266, direction: 'right' },
      winter_solstice: { day: 355, direction: 'right' },
    };
  }

  static seasonalAmplitude(latitude) {
    return Math.sin(Math.abs(Number(latitude) || 0) * Math.PI / 180);
  }

  computeArrows(birthInput = {}, currentInput = null) {
    const birth = birthInput instanceof GeoContext ? birthInput : new GeoContext(birthInput);
    const ctx = currentInput ? new GeoContext(currentInput) : birth;
    const amplitude = ContextualArrowEngine.seasonalAmplitude(ctx.latitude);
    const doy = dayOfYear(ctx.utcTime);
    let signal;
    if (amplitude < 0.2) signal = this.unchangingSignal(ctx);
    else if (amplitude > 0.8) signal = this.extremeSignal(ctx, doy);
    else signal = this.changingSignal(ctx, doy);
    signal.amplitude = amplitude;
    return this.arrowsFromSignal(signal);
  }

  changingSignal(ctx, doy) {
    let nearestName = 'spring_equinox';
    let nearest = this.pivots.spring_equinox;
    for (const [name, pivot] of Object.entries(this.pivots)) {
      if (Math.abs(pivot.day - doy) < Math.abs(nearest.day - doy)) {
        nearestName = name;
        nearest = pivot;
      }
    }
    const distance = doy - nearest.day;
    let direction = 'neutral';
    let confidence = Math.max(0, 1 - Math.abs(distance) / 45);
    if (distance < -45) { direction = 'left'; confidence = 0.7; }
    if (distance > 45) { direction = 'right'; confidence = 0.7; }
    return { source: 'seasonal_pivot', pivot: nearestName, direction, confidence, local_season: this.localSeason(ctx.latitude, doy) };
  }

  unchangingSignal(ctx) {
    const direction = ctx.localSolarTime >= 6 && ctx.localSolarTime <= 18 ? 'left' : 'right';
    return { source: 'diurnal_cycle', sub_source: direction === 'left' ? 'daylight' : 'night', direction, confidence: 0.5, local_season: 'tropical_stable' };
  }

  extremeSignal(ctx, doy) {
    const dayLength = this.calculateDayLength(ctx.latitude, doy);
    if (dayLength > 20) return { source: 'polar_extreme', sub_source: 'continuous_day', direction: 'left', confidence: 0.9, local_season: 'polar_continuous_day', day_length: dayLength };
    if (dayLength < 4) return { source: 'polar_extreme', sub_source: 'continuous_night', direction: 'right', confidence: 0.9, local_season: 'polar_continuous_night', day_length: dayLength };
    return this.changingSignal(ctx, doy);
  }

  calculateDayLength(latitude, doy) {
    const declination = 23.45 * Math.sin(((360 / 365) * (doy - 81)) * Math.PI / 180);
    const x = -Math.tan(latitude * Math.PI / 180) * Math.tan(declination * Math.PI / 180);
    if (x <= -1) return 24;
    if (x >= 1) return 0;
    const hourAngle = Math.acos(x) * 180 / Math.PI;
    return 2 * hourAngle / 15;
  }

  localSeason(latitude, doy) {
    let d = doy;
    if (latitude < 0) d = ((d + 182 - 1) % 365) + 1;
    if (d >= 80 && d < 172) return 'spring';
    if (d >= 172 && d < 266) return 'summer';
    if (d >= 266 && d < 355) return 'autumn';
    return 'winter';
  }

  arrowsFromSignal(signal) {
    const direction = signal.direction;
    if (signal.source === 'seasonal_pivot' || signal.source === 'polar_extreme') {
      return new ArrowState({ digestion: direction, environment: direction, perspective: direction, awareness: direction, signal_source: signal.source, confidence: signal.confidence, signal });
    }
    if (signal.source === 'diurnal_cycle') {
      return new ArrowState({ digestion: direction, environment: direction, perspective: 'neutral', awareness: 'neutral', signal_source: signal.source, confidence: signal.confidence, signal });
    }
    return new ArrowState({ digestion: 'neutral', environment: 'neutral', perspective: 'neutral', awareness: 'neutral', signal_source: 'unknown', confidence: 0, signal });
  }
}

function applyArrowsToCommunication(base, arrows) {
  const next = { ...(base || {}) };
  const state = arrows instanceof ArrowState ? arrows : new ArrowState(arrows || {});
  if (state.digestion === 'left' && state.environment === 'left' && next.edge_type === 'EMERGENT') {
    next.edge_type = 'AUTONOMOUS_EMERGENT';
    next.autonomy_bonus = 0.3;
  } else if (state.digestion === 'right' && state.environment === 'right' && next.edge_type === 'EMERGENT') {
    next.edge_type = 'CONDITIONAL_EMERGENT';
    next.requires_invitation = true;
  }
  if (state.perspective === 'left') next.tetragram_depth = 'focused';
  if (state.perspective === 'right') {
    next.tetragram_depth = 'peripheral';
    if (Number.isFinite(Number(next.tetragram))) next.tetragram = ((Number(next.tetragram) - 1 + 40) % 81) + 1;
  }
  next.arrow_confidence = state.confidence;
  next.arrow_modifiers = state.modifiers;
  return next;
}

module.exports = { GeoContext, ArrowState, ContextualArrowEngine, applyArrowsToCommunication };
