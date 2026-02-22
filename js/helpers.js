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
  if (id === 'sbTopSpeed' || id === 'sbWindSpeed') span.textContent = v + ' kts';
  else if (id === 'sbStallSpeed') span.textContent = v.toFixed(1) + ' kts';
  else if (id === 'sbWindDir') span.textContent = v + '\u00B0';
  else if (id.startsWith('sb')) span.textContent = v.toFixed(2) + '\u00D7';
  else if (id === 'cloudCover') span.textContent = Math.round(v * 100) + '%';
  else if (id.includes('Dir') || id.includes('Angle')) span.textContent = v + '\u00B0';
  else if (id.includes('Period')) span.textContent = v.toFixed(1) + 's';
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
   'swell1Height','swell1Period','swell1Dir',
   'swell2Height','swell2Period','swell2Dir',
   'swell3Height','swell3Period','swell3Dir',
   'sbGlide','sbPumpPower','sbTurnSpeed','sbTopSpeed','sbStallSpeed',
   'sbWindSpeed','sbWindDir',
   'sbBatteryCap','sbBatteryDrain','sbWaveEnergy','sbStability','sbDrag'].forEach(id => {
    state.cachedParams[id] = parseFloat(document.getElementById(id).value);
  });
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
  tutorial: {
    sunAngle:12, sunDir:260, cloudCover:0.25,
    chopHeight:0.15, chopDir:180,
    swell1Height:0.8, swell1Period:14, swell1Dir:270,
    swell2Height:0.3, swell2Period:10, swell2Dir:250,
    swell3Height:0, swell3Period:16, swell3Dir:200,
    sbGlide:1.3, sbPumpPower:1.2, sbTurnSpeed:1.0, sbTopSpeed:22, sbStallSpeed:3,
    sbWindSpeed:8, sbWindDir:270,
    sbBatteryCap:1.5, sbBatteryDrain:0.7, sbWaveEnergy:1.2, sbStability:1.3, sbDrag:0.8
  },
  gorge: {
    sunAngle:11, sunDir:110, cloudCover:0.45,
    chopHeight:0.49, chopDir:0,
    swell1Height:2.3, swell1Period:5, swell1Dir:297,
    swell2Height:0.7, swell2Period:4.5, swell2Dir:347,
    swell3Height:0.5, swell3Period:6, swell3Dir:268,
    sbGlide:0.8, sbPumpPower:1, sbTurnSpeed:1, sbTopSpeed:22, sbStallSpeed:5,
    sbWindSpeed:12, sbWindDir:270,
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
    'swell1Height','swell1Period','swell1Dir',
    'swell2Height','swell2Period','swell2Dir',
    'swell3Height','swell3Period','swell3Dir'];
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
