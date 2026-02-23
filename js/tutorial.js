// ──────────────────────────────────────────────────────────────
//  tutorial.js  –  Guided tutorial with flat start & swell ramp
//
//  Phases:
//    "pump"    — Waves present, zero speed. "Pump to get on foil".
//    "foiling" — "Foiling!" message for 3s, then starts swell ramp.
//    "ramping" — Ease swell1Height from 2.0 → 0 over 30s.
//    "gassed"  — Energy depleted. "Gassed" message.
//
//  No timer — rider exits via "Stoked" button when ready.
//
//  Self-registers tutorial presets into helpers.js / terrain.js.
//  Exports onTutorialStart(), updateTutorial(), endTutorial().
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
let phase = 'idle';    // 'idle' | 'pump' | 'foiling' | 'ramping' | 'gassed'
let phaseTimer = 0;
let swellRampTime = 0;
const SWELL_START   = 2.0;   // starting swell1Height
const SWELL_END     = 0;     // ramp down to flat
const RAMP_DURATION = 30;    // seconds to ease from start → end
let wasGassed = false;        // track if we already showed "Gassed"

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
  // Start at zero speed — rider must pump
  state.foil.speed = 0;
  state.foil.rideH = 0;
  phase = 'pump';
  phaseTimer = 0;
  swellRampTime = 0;
  wasGassed = false;
  showMessage('Pump to get on foil');
  // Hide the done button until foiling phase completes
  const btn = getDoneBtn();
  if (btn) btn.style.display = 'none';
}

/**
 * Called each frame from animate() while gamePhase === 'riding'.
 * Only does work when the tutorial location is active.
 */
export function updateTutorial(dt, foilSpeed, stallMs) {
  // Skip if not in tutorial
  if (state.activeBgPreset !== 'tutorial') return;
  if (phase === 'idle') return;

  // "Gassed" detection — show message when energy depleted (any phase)
  if (phase !== 'gassed' && state.foil.energy <= 0.02 && foilSpeed < stallMs) {
    phase = 'gassed';
    phaseTimer = 0;
    showMessage('Gassed');
    return;
  }

  if (phase === 'gassed') {
    phaseTimer += dt;
    // Clear after 3s, go back to pump phase so they can try again
    if (phaseTimer >= 3) {
      hideMessage();
      phase = 'pump';
      showMessage('Pump to get on foil');
    }
    return;
  }

  if (phase === 'pump') {
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
      // Show the done button
      const btn = getDoneBtn();
      if (btn) btn.style.display = 'block';
    }
    return;
  }

  if (phase === 'ramping') {
    swellRampTime += dt;
    const t = Math.min(1, swellRampTime / RAMP_DURATION);
    // Ease swell1Height from SWELL_START down to SWELL_END
    const h = SWELL_START + (SWELL_END - SWELL_START) * t;
    setSlider('swell1Height', h.toFixed(1));

    // Ease chop down proportionally
    const chop = 0.09 * (1 - t);
    setSlider('chopHeight', chop.toFixed(2));

    if (t >= 1) {
      phase = 'idle'; // ramp complete, ocean is flat
    }
  }
}

/** Called when the rider clicks "Stoked, I'm done learning". */
export function endTutorial() {
  phase = 'idle';
  hideMessage();
  const btn = getDoneBtn();
  if (btn) btn.style.display = 'none';
  // Return to main menu
  document.getElementById('menu-overlay').classList.remove('hidden');
  document.getElementById('hud-timer').style.display = 'none';
  document.getElementById('hud-boost').style.display = 'none';
  state.gamePhase = 'menu';
}
