// ──────────────────────────────────────────────────────────────
//  tutorial.js  –  Guided tutorial with message sequence & swell ramp
//
//  Phases:
//    "pump"     — Zero speed, waves present. "Pump to get on foil".
//    "foiling"  — "Foiling!" for 3s.
//    "doing-it" — "You are doing it" for 3s.
//    "catch"    — "Catch the wave to keep speed" for 4s.
//    "pocket"   — "Find the pocket for max lift" for 4s, starts ramp.
//    "ramping"  — Ease swell1Height from 2.0 → 0 over 30s.
//    "gassed"   — Energy depleted. "Gassed" for 3s → back to pump.
//
//  No timer — rider exits via "Stoked" button when ready.
//  No power-ups in tutorial (handled in main.js).
// ──────────────────────────────────────────────────────────────

import { state } from './state.js';
import { presets, applyPreset, updateVal } from './helpers.js';
import { bgPresets } from './terrain.js';

// ── Tutorial preset: waves present but rider starts at zero speed ──
presets.tutorial = {
  sunAngle:12, sunDir:260, cloudCover:0.25,
  chopHeight:0.09, chopDir:180,
  swell1Height:2, swell1Period:5, swell1Dir:270,
  swell2Height:1.9, swell2Period:10, swell2Dir:250,
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
let phase = 'idle';
let phaseTimer = 0;
let swellRampTime = 0;
const SWELL_START   = 2.0;
const SWELL_END     = 0;
const RAMP_DURATION = 30;

// DOM refs (cached on first use)
let hudEl = null;
let doneBtn = null;

function getHud() {
  if (!hudEl) hudEl = document.getElementById('hud-tutorial');
  return hudEl;
}

function getDoneBtn() {
  if (!doneBtn) doneBtn = document.getElementById('tutorial-done-btn');
  return doneBtn;
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
  state.foil.speed = 0;
  state.foil.rideH = 0;
  phase = 'pump';
  phaseTimer = 0;
  swellRampTime = 0;
  showMessage('Pump to get on foil');
  const btn = getDoneBtn();
  if (btn) btn.style.display = 'none';
}

/**
 * Called each frame from animate() while gamePhase === 'riding'.
 * Only does work when the tutorial location is active.
 */
export function updateTutorial(dt, foilSpeed, stallMs) {
  if (state.activeBgPreset !== 'tutorial') return;
  if (phase === 'idle') return;

  // "Gassed" detection — energy depleted and lost foil
  if (phase !== 'gassed' && state.foil.energy <= 0.02 && foilSpeed < stallMs) {
    phase = 'gassed';
    phaseTimer = 0;
    showMessage('Gassed');
    return;
  }

  if (phase === 'gassed') {
    phaseTimer += dt;
    if (phaseTimer >= 3) {
      phase = 'pump';
      showMessage('Pump to get on foil');
    }
    return;
  }

  if (phase === 'pump') {
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
      phase = 'doing-it';
      phaseTimer = 0;
      showMessage('You are doing it');
    }
    return;
  }

  if (phase === 'doing-it') {
    phaseTimer += dt;
    if (phaseTimer >= 3) {
      phase = 'catch';
      phaseTimer = 0;
      showMessage('Catch the wave to keep speed');
    }
    return;
  }

  if (phase === 'catch') {
    phaseTimer += dt;
    if (phaseTimer >= 4) {
      phase = 'pocket';
      phaseTimer = 0;
      showMessage('Find the pocket for max lift');
    }
    return;
  }

  if (phase === 'pocket') {
    phaseTimer += dt;
    if (phaseTimer >= 4) {
      hideMessage();
      phase = 'ramping';
      swellRampTime = 0;
      const btn = getDoneBtn();
      if (btn) btn.style.display = 'block';
    }
    return;
  }

  if (phase === 'ramping') {
    swellRampTime += dt;
    const t = Math.min(1, swellRampTime / RAMP_DURATION);
    const h = SWELL_START + (SWELL_END - SWELL_START) * t;
    setSlider('swell1Height', h.toFixed(1));

    const chop = 0.09 * (1 - t);
    setSlider('chopHeight', chop.toFixed(2));

    if (t >= 1) {
      phase = 'idle';
    }
  }
}

/** Called when the rider clicks "Stoked, I'm done learning". */
export function endTutorial() {
  phase = 'idle';
  hideMessage();
  const btn = getDoneBtn();
  if (btn) btn.style.display = 'none';
  document.getElementById('menu-overlay').classList.remove('hidden');
  document.getElementById('hud-timer').style.display = 'none';
  document.getElementById('hud-boost').style.display = 'none';
  state.gamePhase = 'menu';
}
