// ──────────────────────────────────────────────────────────────
//  systems/scoring.js  –  ride timer + score tracking
//
//  Timer countdown, distance/top-speed/pocket-time accumulation,
//  info-bar fade. endRide lives in main.js (score overlay DOM);
//  it's injected once via initScoring().
// ──────────────────────────────────────────────────────────────

import { state } from '../state.js';

// Injected from main.js
let endRide = null;

function initScoring(deps) {
  endRide = deps.endRide;
}

function updateScoring(dt, fr) {
  const { foil, inPocketNow } = fr;

  // ── RIDE TIMER & SCORING ──
  // Timer countdown — only starts after first pump (skipped in tutorial)
  if (state.activeBgPreset !== 'tutorial') {
    if (state.rideStarted) {
      state.rideTimer -= dt;
      if (state.rideTimer <= 0) { state.rideTimer = 0; endRide(); }
    }
    const mins = Math.floor(state.rideTimer / 60);
    const secs = Math.floor(state.rideTimer % 60);
    const timerEl = document.getElementById('hud-timer');
    timerEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
    if (state.rideTimer <= 10) timerEl.classList.add('warning');
  }

  // Distance tracking
  const dx = foil.x - state.ridePrevX;
  const dz = foil.z - state.ridePrevZ;
  state.score.distance += Math.sqrt(dx * dx + dz * dz);
  state.ridePrevX = foil.x;
  state.ridePrevZ = foil.z;

  // Top speed tracking
  if (foil.speed > state.score.topSpeedMs) state.score.topSpeedMs = foil.speed;

  // Pocket time tracking
  if (inPocketNow) state.score.pocketTime += dt;

  // Info bar fade after 10 seconds of riding
  state.infoBarFadeTimer += dt;
  if (state.infoBarFadeTimer > 10) {
    const fadeProgress = Math.min(1, (state.infoBarFadeTimer - 10) / 2);
    document.getElementById('info-bar').style.opacity = 1 - fadeProgress;
  }
}

export { initScoring, updateScoring };
