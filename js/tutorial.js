// ──────────────────────────────────────────────────────────────
//  tutorial.js  –  Guided tutorial with message sequence & swell ramp
//
//  Phases:
//    "pump"        — Zero speed, waves present. "Pump to get on foil".
//                    Waits for foilSpeed > stallMs, then holds 2s.
//    "foiling"     — "Foiling!" for 5s.
//    "catch"       — "Catch the wave to maintain speed" for 5s.
//    "pocket"      — "Ride in the pocket for max lift" for 5s. Pocket glow on.
//    "drop-back"   — "Drop back a bump if you are moving too slow" for 5s.
//    "leapfrog"    — "Gain enough speed to leap-frog forward" for 5s.
//    "turning"     — "Pumping and turning generates speed" for 5s. Pocket glow off.
//    "lean-back"   — "Lean back to increase drag" for 5s.
//    "hunt-sets"   — "Hunt for sets" for 10s. Camera zooms out.
//    "drone"       — "Control your follow cam" for 5s. Camera zooms back in.
//    "ready"       — "You are ready to ride". Stoked button appears.
//
//  No timer — rider exits via "Stoked" button when ready.
//  No power-ups in tutorial (handled in main.js).
// ──────────────────────────────────────────────────────────────

import { state } from './state.js';
import { presets, applyPreset, updateVal, getVal } from './helpers.js';
import { bgPresets } from './terrain.js';
import { fadeOutMusic } from './audio.js';

// ── Tutorial preset: waves present but rider starts at zero speed ──
presets.tutorial = {
  sunAngle:68, sunDir:180, cloudCover:0.15,
  chopHeight:0.09, chopDir:180,
  swell1Height:2, swell1Period:5, swell1Dir:270,
  swell2Height:1.9, swell2Period:10, swell2Dir:250,
  swell3Height:0, swell3Period:16, swell3Dir:200,
  sbGlide:1.3, sbPumpPower:1.2, sbTurnSpeed:1.0, sbTopSpeed:25, sbStallSpeed:3.5,
  sbWindSpeed:9, sbWindDir:270,
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
let pumpHoldTimer = 0;            // 2s hold after reaching foiling speed
let savedRenderMode = 0;          // stash render mode before DEM switch
let savedCamDist = 32;            // stash camera distance before zoom-out
let targetCamDist = 32;           // smooth zoom target
let savedOffsetTheta = 0;         // stash camera orbit angle before drone spin
let targetPocketGlow = 0;         // smooth pocket glow target (0→1)
const CAM_LERP = 0.03;           // zoom smoothing factor per frame
const GLOW_LERP = 0.05;          // pocket glow fade speed per frame

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

  // Tropical skybox: override Preetham uniforms for vivid Caribbean blue
  const su = state.skyUniforms;
  if (su) {
    su['turbidity'].value    = 1.5;   // crystal-clear tropical air
    su['rayleigh'].value     = 3.5;   // deep rich blue
    su['mieCoefficient'].value    = 0.003;
    su['mieDirectionalG'].value   = 0.85;
  }
  phaseTimer = 0;
  pumpHoldTimer = 0;
  savedCamDist = state.cam.dist;
  targetCamDist = state.cam.dist;
  savedOffsetTheta = 0;
  targetPocketGlow = 0;
  if (state.oceanMat) state.oceanMat.uniforms.uShowPocket.value = 0;
  showMessage('Pump to get on foil (arrow keys/buttons)');
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

  // Smooth camera zoom each frame
  state.cam.dist += (targetCamDist - state.cam.dist) * CAM_LERP;

  // Smooth pocket glow fade each frame
  if (state.oceanMat) {
    const u = state.oceanMat.uniforms.uShowPocket;
    u.value += (targetPocketGlow - u.value) * GLOW_LERP;
    if (u.value < 0.01) u.value = 0;
  }


  if (phase === 'pump') {
    if (foilSpeed > stallMs) {
      pumpHoldTimer += dt;
      if (pumpHoldTimer >= 2) {
        phase = 'foiling';
        phaseTimer = 0;
        showMessage('Foiling!');
      }
    } else {
      pumpHoldTimer = 0;
    }
    return;
  }

  if (phase === 'foiling') {
    phaseTimer += dt;
    if (phaseTimer >= 5) {
      phase = 'catch';
      phaseTimer = 0;
      showMessage('Catch the wave to maintain speed');
    }
    return;
  }

  if (phase === 'catch') {
    phaseTimer += dt;
    if (phaseTimer >= 5) {
      phase = 'pocket';
      phaseTimer = 0;
      targetPocketGlow = 1;
      showMessage('Ride in the pocket for max lift (watch wave energy meter)');
    }
    return;
  }

  if (phase === 'pocket') {
    phaseTimer += dt;
    if (phaseTimer >= 5) {
      phase = 'drop-back';
      phaseTimer = 0;
      showMessage('Drop back a bump if you are moving too slow');
    }
    return;
  }

  if (phase === 'drop-back') {
    phaseTimer += dt;
    if (phaseTimer >= 5) {
      phase = 'leapfrog';
      phaseTimer = 0;
      showMessage('Gain enough speed to leap-frog forward');
    }
    return;
  }

  if (phase === 'leapfrog') {
    phaseTimer += dt;
    if (phaseTimer >= 5) {
      phase = 'turning';
      phaseTimer = 0;
      showMessage('Pumping and turning generates speed');
    }
    return;
  }

  if (phase === 'turning') {
    phaseTimer += dt;
    if (phaseTimer >= 5) {
      targetPocketGlow = 0;
      phase = 'lean-back';
      phaseTimer = 0;
      showMessage('Lean back to increase drag for quicker turns');
    }
    return;
  }

  if (phase === 'lean-back') {
    phaseTimer += dt;
    if (phaseTimer >= 5) {
      phase = 'hunt-sets';
      phaseTimer = 0;
      savedCamDist = state.cam.dist;
      targetCamDist = 80;
      showMessage('Hunt for sets');
    }
    return;
  }

  if (phase === 'hunt-sets') {
    phaseTimer += dt;
    if (phaseTimer >= 10) {
      phase = 'drone';
      phaseTimer = 0;
      targetCamDist = savedCamDist;
      // Start 360 camera orbit — save current offset, reset to 0
      savedOffsetTheta = state.cam.offsetTheta;
      state.cam.offsetTheta = 0;
      showMessage('Control your follow cam');
    }
    return;
  }

  if (phase === 'drone') {
    phaseTimer += dt;
    // Smooth 360° orbit: ramp offsetTheta from 0 → 2π over 5s
    const t = Math.min(phaseTimer / 5, 1);
    state.cam.offsetTheta = t * Math.PI * 2;
    if (phaseTimer >= 5) {
      phase = 'ready';
      phaseTimer = 0;
      state.cam.offsetTheta = savedOffsetTheta;
      showMessage('You are ready to ride');
    }
    return;
  }

  // "ready" phase — show back button after 20 seconds
  if (phase === 'ready') {
    phaseTimer += dt;
    if (phaseTimer >= 20) {
      const btn = getDoneBtn();
      if (btn) btn.style.display = '';
    }
  }
}

/** Called when the rider exits the tutorial (via exit button). */
export function endTutorial() {
  phase = 'idle';
  targetPocketGlow = 0;

  // Restore default Preetham sky uniforms for other locations
  const su = state.skyUniforms;
  if (su) {
    su['turbidity'].value         = 4;
    su['rayleigh'].value          = 2;
    su['mieCoefficient'].value    = 0;
    su['mieDirectionalG'].value   = 0;
  }
  if (state.oceanMat) state.oceanMat.uniforms.uShowPocket.value = 0;
  targetCamDist = savedCamDist;
  state.cam.dist = savedCamDist;
  state.cam.offsetTheta = savedOffsetTheta;
  hideMessage();
  const btn = getDoneBtn();
  if (btn) btn.style.display = 'none';
  fadeOutMusic(1500);
  document.getElementById('exit-btn').style.display = 'none';
  document.getElementById('sandbox-btn').style.display = 'none';
  document.getElementById('menu-overlay').classList.remove('hidden');
  document.getElementById('hud-timer').style.display = 'none';
  document.getElementById('hud-boost').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  state.gamePhase = 'menu';
}
