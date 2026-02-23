// ──────────────────────────────────────────────────────────────
//  tutorial.js  –  Guided tutorial with flat start & swell ramp
//
//  Phases:
//    "push"    — Flat ocean. Prompt to pump for speed.
//    "foiling" — "Foiling!" message for 3s, then fade.
//    "ramping" — Gradually ramp swell1Height 0 → 3.5m over ~60s.
//
//  Self-registers tutorial presets into helpers.js / terrain.js.
//  Exports onTutorialStart() and updateTutorial() for main.js.
// ──────────────────────────────────────────────────────────────

import { state } from './state.js';
import { presets, applyPreset, updateVal } from './helpers.js';
import { bgPresets } from './terrain.js';

// ── Tutorial preset: starts FLAT — all wave heights zero ──
presets.tutorial = {
  sunAngle:12, sunDir:260, cloudCover:0.25,
  chopHeight:0, chopDir:180,
  swell1Height:0, swell1Period:14, swell1Dir:270,
  swell2Height:0, swell2Period:10, swell2Dir:250,
  swell3Height:0, swell3Period:16, swell3Dir:200,
  sbGlide:1.3, sbPumpPower:1.2, sbTurnSpeed:1.0, sbTopSpeed:22, sbStallSpeed:3,
  sbWindSpeed:8, sbWindDir:270,
  sbBatteryCap:1.5, sbBatteryDrain:0.7, sbWaveEnergy:1.2, sbStability:1.3, sbDrag:0.8
};

// Tutorial terrain — open water, no cliffs
bgPresets['tutorial'] = {
  label: 'Tutorial',
  maxHeight: 120,
  cliffs: []
};

// ── Tutorial state ──
let phase = 'idle';    // 'idle' | 'push' | 'foiling' | 'ramping'
let phaseTimer = 0;
let swellRampTime = 0;
const SWELL_TARGET = 3.5;   // target swell1Height in meters
const RAMP_DURATION = 60;   // seconds to reach full swell

// DOM ref (cached on first use)
let hudEl = null;

function getHud() {
  if (!hudEl) hudEl = document.getElementById('hud-tutorial');
  return hudEl;
}

function showMessage(text) {
  const el = getHud();
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
}

function hideMessage() {
  const el = getHud();
  if (!el) return;
  el.classList.remove('show');
}

/** Set a slider's DOM value + cached param in one call. */
function setSlider(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = val;
  updateVal(el);
}

// ── Public API ──

/** Called from startRide() when locationPreset === 'tutorial'. */
export function onTutorialStart() {
  applyPreset('tutorial');
  phase = 'push';
  phaseTimer = 0;
  swellRampTime = 0;
  showMessage('Push forward to gain speed');
}

/**
 * Called each frame from animate() while gamePhase === 'riding'.
 * Only does work when the tutorial location is active.
 */
export function updateTutorial(dt, foilSpeed, stallMs) {
  // Skip if not in tutorial
  if (state.activeBgPreset !== 'tutorial') return;
  if (phase === 'idle') return;

  if (phase === 'push') {
    // Wait until the rider is foiling
    if (foilSpeed > stallMs) {
      phase = 'foiling';
      phaseTimer = 0;
      showMessage('Foiling!');
    }
    return;
  }

  if (phase === 'foiling') {
    phaseTimer += dt;
    if (phaseTimer >= 3) {
      hideMessage();
      phase = 'ramping';
      swellRampTime = 0;
    }
    return;
  }

  if (phase === 'ramping') {
    swellRampTime += dt;
    const t = Math.min(1, swellRampTime / RAMP_DURATION);
    const h = SWELL_TARGET * t;
    setSlider('swell1Height', h.toFixed(1));

    // Also bring in a little chop once swell is noticeable
    if (t > 0.3) {
      const chopT = (t - 0.3) / 0.7; // 0→1 over last 70% of ramp
      setSlider('chopHeight', (0.15 * chopT).toFixed(2));
    }

    if (t >= 1) {
      phase = 'idle'; // ramp complete
    }
  }
}
