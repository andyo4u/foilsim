// ──────────────────────────────────────────────────────────────
//  helpers.js  –  UI helpers & math utilities
//
//  Slider read/write helpers, wave presets, settings export,
//  and small math utilities used across the simulator.
// ──────────────────────────────────────────────────────────────

import { state } from './state.js';

// ═══════════════════════════
// SLIDER / CONTROL HELPERS
// ═══════════════════════════

export function updateVal(el) {
  const id = el.id, v = parseFloat(el.value);
  state.cachedParams[id] = v; // update cache on slider change
  const span = document.getElementById(id + '-val');
  if (id === 'sbTopSpeed' || id === 'sbWindSpeed') span.textContent = v + ' ' + state.units;
  else if (id === 'sbStallSpeed') span.textContent = v.toFixed(1) + ' ' + state.units;
  else if (id === 'sbWindDir') span.textContent = v + '\u00B0';
  else if (id.startsWith('sb')) span.textContent = v.toFixed(2) + '\u00D7';
  else if (id === 'cloudCover') span.textContent = Math.round(v * 100) + '%';
  else if (id.includes('Dir') || id.includes('Angle')) span.textContent = v + '\u00B0';
  else if (id.includes('Period')) span.textContent = v.toFixed(1) + 's';
  else if (id.includes('Speed')) span.textContent = v + ' ' + state.units;
  else span.textContent = v.toFixed(2) + 'm';
}

export function toggleControls() {
  const p = document.getElementById('controls-panel');
  p.classList.toggle('hidden');
  // Gear button stays hidden -- Tab key is the only toggle
}

export function getVal(id) { return state.cachedParams[id]; }

export function cacheAllSliders() {
  ['sunAngle','sunDir','cloudCover','chopHeight','chopDir',
   'swell1Height','swell1Period','swell1Dir','swell1Speed',
   'swell2Height','swell2Period','swell2Dir','swell2Speed',
   'swell3Height','swell3Period','swell3Dir','swell3Speed',
   'sbGlide','sbPumpPower','sbTurnSpeed','sbTopSpeed','sbStallSpeed',
   'sbWindSpeed','sbWindDir',
   'sbBatteryCap','sbBatteryDrain','sbWaveEnergy','sbStability','sbDrag'].forEach(id => {
    state.cachedParams[id] = parseFloat(document.getElementById(id).value);
  });
}

// ── Unit conversion constants ─────────────────────
const MPH_PER_MS = 2.23694;
const KPH_PER_MS = 3.6;
const KTS_PER_MS = 1.94384;

export function convertSpeedToMs(val, unit) {
  const u = unit || state.units;
  if (u === 'kph') return val / KPH_PER_MS;
  if (u === 'kts') return val / KTS_PER_MS;
  return val / MPH_PER_MS;
}

export function convertSpeedFromMs(ms, unit) {
  const u = unit || state.units;
  if (u === 'kph') return ms * KPH_PER_MS;
  if (u === 'kts') return ms * KTS_PER_MS;
  return ms * MPH_PER_MS;
}

export function formatSpeed(ms) {
  return convertSpeedFromMs(ms).toFixed(1) + ' ' + state.units;
}

export function formatDistance(m) {
  if (state.units === 'kph') return (m / 1000).toFixed(2) + ' km';
  if (state.units === 'kts') return (m / 1852).toFixed(2) + ' nm';
  return (m / 1609.34).toFixed(2) + ' mi';
}

export function setUnits(newUnit) {
  const oldUnit = state.units;
  if (oldUnit === newUnit) return;
  state.units = newUnit;

  // Speed slider ranges per unit
  const ranges = {
    mph: { topSpeed:{min:9,max:46,step:1}, stallSpeed:{min:0,max:12,step:0.5}, windSpeed:{min:0,max:46,step:1}, swellSpeed:{min:5,max:60,step:1} },
    kph: { topSpeed:{min:10,max:74,step:1}, stallSpeed:{min:0,max:19,step:0.5}, windSpeed:{min:0,max:74,step:1}, swellSpeed:{min:8,max:97,step:1} },
    kts: { topSpeed:{min:8,max:40,step:1}, stallSpeed:{min:0,max:10,step:0.5}, windSpeed:{min:0,max:40,step:1}, swellSpeed:{min:4,max:52,step:1} },
  };
  const R = ranges[newUnit];

  const sliderMap = {
    sbTopSpeed: R.topSpeed, sbStallSpeed: R.stallSpeed,
    sbWindSpeed: R.windSpeed,
    swell1Speed: R.swellSpeed, swell2Speed: R.swellSpeed, swell3Speed: R.swellSpeed,
  };

  Object.entries(sliderMap).forEach(([id, r]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const ms = convertSpeedToMs(parseFloat(el.value), oldUnit);
    const newVal = convertSpeedFromMs(ms, newUnit);
    el.min = r.min; el.max = r.max; el.step = r.step;
    el.value = Math.max(r.min, Math.min(r.max, +newVal.toFixed(1)));
    updateVal(el);
  });

  // Update HUD unit label
  const unitEl = document.getElementById('speed-unit');
  if (unitEl) unitEl.textContent = newUnit;

  // Highlight active unit button
  document.querySelectorAll('.settings-unit-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.unit === newUnit));
}

// ═══════════════════════════
// WAVE PRESETS
// ═══════════════════════════

export const presets = {
  clean: {
    chopHeight:0, chopDir:0,
    swell1Height:1.5, swell1Period:14, swell1Dir:270,
    swell2Height:0.5, swell2Period:10, swell2Dir:290,
    swell3Height:0.3, swell3Period:18, swell3Dir:250
  },
  river: {
    chopHeight:1.0, chopDir:0,
    swell1Height:2.9, swell1Period:4.5, swell1Dir:0,
    swell2Height:0.5, swell2Period:4, swell2Dir:20,
    swell3Height:0, swell3Period:8, swell3Dir:0
  },
  messy: {
    chopHeight:1.4, chopDir:60,
    swell1Height:2.5, swell1Period:9, swell1Dir:290,
    swell2Height:1.8, swell2Period:7, swell2Dir:190,
    swell3Height:1.2, swell3Period:5.5, swell3Dir:45
  },
  gorge: {
    sunAngle:11, sunDir:110, cloudCover:0.45,
    chopHeight:0.49, chopDir:0,
    swell1Height:2.3, swell1Period:5, swell1Dir:297,
    swell2Height:0.7, swell2Period:4.5, swell2Dir:347,
    swell3Height:0.5, swell3Period:6, swell3Dir:268,
    sbGlide:0.8, sbPumpPower:1, sbTurnSpeed:1, sbTopSpeed:25, sbStallSpeed:6,
    sbWindSpeed:14, sbWindDir:270,
    sbBatteryCap:1, sbBatteryDrain:1, sbWaveEnergy:1, sbStability:1, sbDrag:1
  }
};

export function applyPreset(name, btn) {
  const p = presets[name]; if(!p) return;
  Object.keys(p).forEach(id => {
    const el = document.getElementById(id);
    if(el){ el.value = p[id]; updateVal(el); }
  });
  cacheAllSliders(); // ensure full cache sync after preset
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active-preset'));
  if(btn) btn.classList.add('active-preset');
}

// ═══════════════════════════
// SETTINGS EXPORT
// ═══════════════════════════

export function showToast(msg) {
  const el = document.getElementById('copy-toast');
  el.textContent = msg;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

export function getAllSettings() {
  // Ocean preset values
  const oceanIds = ['sunAngle','sunDir','cloudCover','chopHeight','chopDir',
    'swell1Height','swell1Period','swell1Dir','swell1Speed',
    'swell2Height','swell2Period','swell2Dir','swell2Speed',
    'swell3Height','swell3Period','swell3Dir','swell3Speed'];
  const sandboxIds = ['sbGlide','sbPumpPower','sbTurnSpeed','sbTopSpeed','sbStallSpeed',
    'sbWindSpeed','sbWindDir',
    'sbBatteryCap','sbBatteryDrain','sbWaveEnergy','sbStability','sbDrag'];

  const ocean = {};
  oceanIds.forEach(id => { ocean[id] = getVal(id); });
  const sandbox = {};
  sandboxIds.forEach(id => { sandbox[id] = getVal(id); });

  const bgPresets = state.bgPresets || {};

  return {
    ocean,
    sandbox,
    background: state.activeBgPreset,
    bgCliffs: bgPresets[state.activeBgPreset] ? bgPresets[state.activeBgPreset].cliffs : []
  };
}

export function copySettings() {
  const s = getAllSettings();
  // Format as readable JS code ready to paste into presets
  let lines = [];
  lines.push('// -- Ocean Preset --');
  lines.push('const oceanPreset = {');
  Object.entries(s.ocean).forEach(([k, v]) => {
    lines.push('  ' + k + ': ' + (Number.isInteger(v) ? v : Number(v.toFixed(2))) + ',');
  });
  lines.push('};');
  lines.push('');
  lines.push('// -- Sandbox Settings --');
  lines.push('const sandboxPreset = {');
  Object.entries(s.sandbox).forEach(([k, v]) => {
    lines.push('  ' + k + ': ' + (Number.isInteger(v) ? v : Number(v.toFixed(2))) + ',');
  });
  lines.push('};');
  lines.push('');
  lines.push('// -- Background: ' + s.background + ' --');
  lines.push('const bgCliffs = [');
  s.bgCliffs.forEach(c => {
    lines.push('  { angle: ' + c.angle + ', dist: ' + c.dist + ', height: ' + c.height
      + ', width: ' + c.width + ', depth: ' + c.depth + ', seed: ' + c.seed + ' },');
  });
  lines.push('];');

  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    showToast('Settings copied to clipboard!');
  }).catch(() => {
    // Fallback: log to console
    console.log(lines.join('\n'));
    showToast('Logged to console (clipboard blocked)');
  });
}

export function copySettingsJSON() {
  const s = getAllSettings();
  const json = JSON.stringify(s, null, 2);
  navigator.clipboard.writeText(json).then(() => {
    showToast('JSON copied to clipboard!');
  }).catch(() => {
    console.log(json);
    showToast('JSON logged to console (clipboard blocked)');
  });
}

// ═══════════════════════════
// MATH UTILITIES
// ═══════════════════════════

export function lerp(a, b, t) { return a + (b - a) * t; }

export function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function degToDir(deg) {
  const r = deg * Math.PI / 180;
  return { x: -Math.sin(r), y: -Math.cos(r) };
}
