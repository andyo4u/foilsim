// ──────────────────────────────────────────────────────────────
//  systems/hud.js  –  in-ride HUD readouts
//
//  Speed, accel arrow, energy bar, swell (wave-energy) bar, status
//  line. Pure DOM rendering of values computed in physics.
// ──────────────────────────────────────────────────────────────

import { getVal, convertSpeedFromMs } from '../helpers.js';
import type { FrameRecord } from './physics.js';

function updateHUD(fr: FrameRecord) {
  const { foil, isF, normSwell, inPocketNow } = fr;

  // HUD
  document.getElementById('hud-speed')!.textContent = convertSpeedFromMs(foil.speed).toFixed(1);

  // Acceleration indicator
  const accelEl = document.getElementById('hud-accel')!;
  const speedDelta = foil.speed - foil.prevSpeed;
  const threshold = 0.005;
  if (speedDelta > threshold) {
    accelEl.textContent = '▲';
    accelEl.style.color = '#5ee8a0';
    accelEl.style.opacity = String(Math.min(1, Math.abs(speedDelta) * 20));
  } else if (speedDelta < -threshold) {
    accelEl.textContent = '▼';
    accelEl.style.color = '#ff6b6b';
    accelEl.style.opacity = String(Math.min(1, Math.abs(speedDelta) * 20));
  } else {
    accelEl.style.opacity = '0.3';
    accelEl.textContent = '—';
    accelEl.style.color = '#6a94c0';
  }

  foil.prevSpeed = foil.speed;

  // Energy bar
  const ePct = Math.round((foil.energy / getVal('sbBatteryCap')) * 100);
  const eBar = document.getElementById('hud-energy-bar')!;
  const eTxt = document.getElementById('hud-energy-text')!;
  eBar.style.width = Math.min(100, ePct) + '%';
  eTxt.textContent = ePct + '%';
  if (foil.energy / getVal('sbBatteryCap') > 0.5) {
    eBar.style.background = 'linear-gradient(90deg,#4ae88a,#5ef0a0)';
    eTxt.style.color = '#6a94c0';
  } else if (foil.energy / getVal('sbBatteryCap') > 0.2) {
    eBar.style.background = 'linear-gradient(90deg,#e8c44a,#f0d060)';
    eTxt.style.color = '#c0a050';
  } else {
    eBar.style.background = 'linear-gradient(90deg,#e85050,#f06060)';
    eTxt.style.color = '#e06060';
  }

  // Wave energy meter — normSwell computed in updatePhysics()
  const swBar = document.getElementById('hud-swell-bar')!;
  const absSwell = Math.abs(normSwell);
  const pct = absSwell * 50;
  if (normSwell >= 0) {
    swBar.style.left = '50%';
    swBar.style.width = pct + '%';
    swBar.style.background = absSwell > 0.7 ? 'linear-gradient(90deg,#2ee87a,#60ffc0)' : 'linear-gradient(90deg,#3ad080,#5ef0a0)';
  } else {
    swBar.style.left = (50 - pct) + '%';
    swBar.style.width = pct + '%';
    swBar.style.background = absSwell > 0.7 ? 'linear-gradient(90deg,#ff3030,#e85050)' : 'linear-gradient(90deg,#f05555,#e83a3a)';
  }

  // HUD status
  const st = document.getElementById('hud-status')!;
  if (foil.energy / getVal('sbBatteryCap') <= 0.10) {
    st.textContent = '⛽ Gassed';
    st.style.color = '#ff6040';
  } else if (foil.speed <= 0.3) {
    st.textContent = '⚠ STALLED';
    st.style.color = '#ff5555';
  } else if (foil.speed < 2.5) {
    st.textContent = 'Hull Speed';
    st.style.color = '#c09060';
  } else if (isF && inPocketNow) {
    st.textContent = '🏄 In the Pocket!';
    st.style.color = '#5ef0a0';
  } else if (isF) {
    st.textContent = '🏄 Foiling!';
    st.style.color = '#80e0c0';
  } else {
    st.textContent = 'Accelerating...';
    st.style.color = '#a0b8d0';
  }
}

export { updateHUD };
