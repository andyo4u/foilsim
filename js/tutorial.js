// ──────────────────────────────────────────────────────────────
//  tutorial.js  –  Guided tutorial with flat start & swell ramp
//
//  Phases:
//    "push"    — Flat ocean. Prompt to pump for speed.
//    "foiling" — "Foiling!" message for 3s, then fade.
//    "ramping" — Ramp swell1Height 0 → 3.0m, then ease down to 1.0m
//                over 30s so the learner feels big waves then settles.
//
//  No timer — rider exits via "Stoked" button when ready.
//
//  Self-registers tutorial presets into helpers.js / terrain.js.
//  Exports onTutorialStart(), updateTutorial(), endTutorial().
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
const SWELL_START  = 3.0;   // initial big swell after foiling
const SWELL_END    = 1.0;   // settle-down target
const RAMP_DURATION = 30;   // seconds to ease from start → end

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
  phase = 'push';
  phaseTimer = 0;
  swellRampTime = 0;
  showMessage('Push forward to gain speed');
  // Hide the done button until ramping starts
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
      // Jump swell to the starting height immediately
      setSlider('swell1Height', SWELL_START.toFixed(1));
      setSlider('chopHeight', '0.15');
      // Show the done button
      const btn = getDoneBtn();
      if (btn) btn.style.display = 'block';
    }
    return;
  }

  if (phase === 'ramping') {
    swellRampTime += dt;
    const t = Math.min(1, swellRampTime / RAMP_DURATION);
    // Ease from SWELL_START down to SWELL_END
    const h = SWELL_START + (SWELL_END - SWELL_START) * t;
    setSlider('swell1Height', h.toFixed(1));

    // Ease chop down proportionally
    const chop = 0.15 * (1 - t * 0.5); // 0.15 → 0.075
    setSlider('chopHeight', chop.toFixed(2));

    if (t >= 1) {
      phase = 'idle'; // ramp complete, settled at gentle swell
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
