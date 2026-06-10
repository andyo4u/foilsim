// ──────────────────────────────────────────────────────────────
//  systems/physics.js  –  foil physics + ride-state flags
//
//  Input → forces → speed → position, stall-out, shallow-water
//  collision, shore-proximity swell, wave-energy normalization.
//  endRide lives in main.js (score overlay + leaderboard DOM); it's
//  injected once via initPhysics() to keep the module graph acyclic.
// ──────────────────────────────────────────────────────────────

import { state } from '../state.js';
import type { FoilState } from '../state.js';
import { getVal, lerp, smoothstep, degToDir, convertSpeedToMs } from '../helpers.js';
import { getWaveHeight, getWaveSlope, getSwellHeight, getSwellSlope } from '../ocean.js';
import { getRealTerrainHeight, RT_WATER_Y } from '../terrain.js';
import { onFoilStart } from '../audio.js';
import { updateTutorial } from '../tutorial.js';

// Per-frame record shared by every system downstream of physics
export interface FrameRecord {
  foil: FoilState;
  mx: number;
  mz: number;
  wH: number;
  bY: number;
  slope: { dhdx: number; dhdz: number };
  slopeDot: number;
  isF: boolean;
  isPump: boolean;
  isPowerPump: boolean;
  speedCapMs: number;
  slopeForce: number;
  pocketStrength: number;
  normSwell: number;
  inPocketNow: boolean;
}

let pumpPhase = 0;
let foilMusicTriggered = false;
let hasEverFoiled = false;    // true once rider exceeds stall speed
let stallTimer = 0;           // seconds below stall speed after having foiled

// DOM refs for shallow water
const shallowWarningEl = document.getElementById('shallow-warning')!;
const restartBtnEl = document.getElementById('restart-btn')!;

// Injected from main.js
let endRide: () => void;

function initPhysics(deps: { endRide: () => void }) {
  endRide = deps.endRide;
}

// Reset the per-ride flags — called from startRide()
function resetRideFlags() {
  foilMusicTriggered = false;
  hasEverFoiled = false;
  stallTimer = 0;
}

// Shore-proximity swell: scan outward in 8 directions to find nearest land.
// Returns distance in metres; 999 if no land within 300 m (or no terrain data).
function _getShoreDistM(px: number, pz: number) {
  if (!state.realTerrainHeightData) return 999;
  const wY = RT_WATER_Y();
  for (let r = 25; r <= 300; r += 25) {
    for (let a = 0; a < 8; a++) {
      const th = (a / 8) * Math.PI * 2;
      const h = getRealTerrainHeight(px + Math.cos(th) * r, pz + Math.sin(th) * r);
      if (h !== null && h > wY + 2) return r;
    }
  }
  return 999;
}

// ── FOIL PHYSICS ──
// Returns the per-frame record (`fr`) the later systems read, or null if the
// ride ended mid-frame (caller must skip the rest of the frame).
function updatePhysics(dt: number, t: number): FrameRecord | null {
  const foil = state.foil;
  const input = state.input;

  // Banking turn
  const maxRoll = 0.55;
  let targetRoll = 0;
  if (input.left)  targetRoll = -maxRoll;
  if (input.right) targetRoll =  maxRoll;
  const rollRate = 6.0 * getVal('sbStability');
  foil.roll = lerp(foil.roll, targetRoll, 1 - Math.exp(-rollRate * dt));

  const turnBoost = (input.down && Math.abs(foil.roll) > 0.01) ? 1.2 : 1.0;
  const turnFromRoll = foil.roll * 2.2 * getVal('sbTurnSpeed') * Math.min(1, foil.speed / 4) * turnBoost;
  foil.heading -= turnFromRoll * dt;

  let wH = getWaveHeight(foil.x, foil.z, t);
  if (state.realTerrainMesh) wH += RT_WATER_Y();
  const slope = getWaveSlope(foil.x, foil.z, t);
  const mx = Math.sin(foil.heading), mz = Math.cos(foil.heading);
  const slopeDot = mx * slope.dhdx + mz * slope.dhdz;
  const crossSlope = Math.abs(-mz * slope.dhdx + mx * slope.dhdz);

  // Wave energy from swells only
  const swellSlope = getSwellSlope(foil.x, foil.z, t);
  const swellSlopeDot = mx * swellSlope.dhdx + mz * swellSlope.dhdz;
  const swellCrossSlope = Math.abs(-mz * swellSlope.dhdx + mx * swellSlope.dhdz);

  // Pocket strength — compute early so physics can use it for speed cap
  const s1h_phys = getVal('swell1Height');
  const swellH_phys = getSwellHeight(foil.x, foil.z, t);
  const swellSlopeLen = Math.sqrt(swellSlope.dhdx * swellSlope.dhdx + swellSlope.dhdz * swellSlope.dhdz);
  const nxz_phys = swellSlopeLen > 0.001 ? [-swellSlope.dhdx / swellSlopeLen, -swellSlope.dhdz / swellSlopeLen] : [0, 0];
  const s1dir_phys = degToDir(getVal('swell1Dir'));
  const hFactor_phys = smoothstep(-s1h_phys * 0.1, s1h_phys * 0.35, swellH_phys);
  const crestFade_phys = 1 - smoothstep(s1h_phys * 0.4, s1h_phys * 0.85, swellH_phys);
  const faceDot_phys = nxz_phys[0] * s1dir_phys.x + nxz_phys[1] * s1dir_phys.y;
  const faceFactor_phys = smoothstep(0.08, 0.35, faceDot_phys);
  const pocketStrength = hFactor_phys * crestFade_phys * faceFactor_phys;

  const waveE = getVal('sbWaveEnergy');
  let slopeForce = -swellSlopeDot * 3.25 * waveE;
  const rollFactor = Math.abs(foil.roll) / maxRoll;
  if (rollFactor > 0.05) {
    slopeForce += swellCrossSlope * 2.35 * waveE * rollFactor * Math.min(1, foil.speed / 5);
  }

  // Foiling state
  const stallMs = convertSpeedToMs(getVal('sbStallSpeed'));
  const isF = foil.speed > stallMs;
  if (isF) hasEverFoiled = true;
  // Start music at 5 mph (gives time for async playlist to load)
  const musicSpeedMs = 5 / 2.23694; // 5 mph in m/s
  if (foil.speed > musicSpeedMs && !foilMusicTriggered) { foilMusicTriggered = true; onFoilStart(); }

  // Stall out: if rider foiled then stalls for 5 seconds
  const isTutorial = state.activeBgPreset === 'tutorial';
  if (hasEverFoiled && !isF) {
    stallTimer += dt;
    if (stallTimer >= 5) {
      if (isTutorial) {
        // Tutorial: refill energy and reset stall, no score
        foil.energy = getVal('sbBatteryCap');
        stallTimer = 0;
        hasEverFoiled = false;
      } else {
        endRide(); return null;
      }
    }
  } else {
    stallTimer = 0;
  }

  // Tutorial phase machine (only active when tutorial location is selected)
  updateTutorial(dt, foil.speed, stallMs);

  // Pitch
  const autoPitch = isF ? -0.05 : 0;
  foil.pitch = lerp(foil.pitch, autoPitch, dt * 3 * getVal('sbStability'));

  // Energy system
  // Energy passively regens at a low baseline rate. When slopeForce > 0
  // (foil is on the downhill face of a swell — especially the pocket) the
  // wave feeds extra energy into the battery, making it actually useful.
  const maxEnergy = getVal('sbBatteryCap');
  const drainMul = getVal('sbBatteryDrain') * (isTutorial ? 0.15 : 1);
  const waveRegen = 0.015 + Math.max(0, slopeForce) * 0.035;
  foil.energy = Math.min(maxEnergy, foil.energy + waveRegen * dt);

  let pf = 0;
  const isPump = input.up && !input.down;
  const isPowerPump = input.up && input.down;
  const isBoost = input.pump;
  const pumpMul = getVal('sbPumpPower');

  // Wave-assisted pump: pump is more effective when riding a wave face.
  // slopeForce > 0 = downhill swell face; highest in the pocket.
  // Pocket (slopeForce ≈ 1.75) gives ~1.7× boost; max capped at 2.5×.
  // REF: https://foilien.com/foilphysics/ — pumpfoil dynamics simulator
  const wavePumpBoost = Math.min(2.5, 1.0 + Math.max(0, slopeForce) * 0.40);

  if (isBoost) {
    pf += 1.8;
  }

  // Start ride timer on first pump input
  if ((isPump || isPowerPump) && !state.rideStarted) {
    state.rideStarted = true;
  }

  if (isPump && foil.energy > 0.02) {
    pumpPhase += dt * 9;
    const pumpCost = 0.36 * drainMul * dt;
    foil.energy = Math.max(0, foil.energy - pumpCost);
    pf += 3.0 * pumpMul * wavePumpBoost * Math.min(1, foil.energy * 5);
    foil.pitch += Math.sin(pumpPhase * 2) * 0.08;
  } else if (isPowerPump && foil.energy > 0.05) {
    pumpPhase += dt * 12;
    const powerCost = 0.70 * drainMul * dt;
    foil.energy = Math.max(0, foil.energy - powerCost);
    pf += 5.5 * pumpMul * wavePumpBoost * Math.min(1, foil.energy * 4);
    foil.pitch += Math.sin(pumpPhase * 2) * 0.15;
  } else {
    pumpPhase *= 0.9;
  }

  // Brake
  const isBrake = input.down && !input.up;
  if (isBrake) {
    foil.pitch = lerp(foil.pitch, 0.25, dt * 5);
    pf -= 2.0;
  }

  // Drag & wind
  const baseDrag = isF ? .35 : .7;
  const drag = baseDrag * getVal('sbDrag') / getVal('sbGlide');

  const windSpeedMs = convertSpeedToMs(getVal('sbWindSpeed'));
  const windDirRad = (getVal('sbWindDir') + 180) * Math.PI / 180;
  const windX = Math.sin(windDirRad) * windSpeedMs;
  const windZ = Math.cos(windDirRad) * windSpeedMs;
  const windDot = mx * windX + mz * windZ;
  const windForce = windDot * (isF ? 0.06 : 0.03);

  foil.speed += (slopeForce + pf + windForce) * dt;
  foil.speed -= drag * dt;
  const speedCapMs = convertSpeedToMs(getVal('sbTopSpeed'));
  // Pocket top speed: pumping or turning in the pocket allows higher speed.
  // When leaving the pocket, speed decays gradually back to normal top speed.
  const pocketCapMs = convertSpeedToMs(getVal('sbPocketSpeed'));
  const inPocket = pocketStrength > 0.4;
  const isPumpingOrTurning = isPump || isPowerPump || isBoost || Math.abs(foil.roll) > 0.05;
  if (inPocket && isPumpingOrTurning && pocketCapMs > speedCapMs) {
    // In the pocket — allow up to pocket speed
    foil.speed = Math.max(0, Math.min(foil.speed, pocketCapMs));
  } else if (foil.speed > speedCapMs) {
    // Above normal cap but out of pocket — decay gently back down
    foil.speed = Math.max(speedCapMs, foil.speed - (foil.speed - speedCapMs) * 1.5 * dt);
  } else {
    foil.speed = Math.max(0, Math.min(foil.speed, speedCapMs));
  }

  // Ride height scales with speed: barely lifts off at stall (~6cm), rises to ~44cm at top speed.
  // Board sits ~halfway up 0.85m mast — realistic eFoil height.
  const speedFrac = Math.max(0, Math.min(1, (foil.speed - stallMs) / Math.max(1, speedCapMs - stallMs)));
  const tgtRH = isF ? 0.06 + 0.38 * Math.pow(speedFrac, 1.2) + foil.pitch * 0.4 : -0.04;
  foil.rideH = lerp(foil.rideH, tgtRH, dt * (isF ? 3 : 6));

  foil.x += mx * foil.speed * dt;
  foil.z += mz * foil.speed * dt;

  // Land / shallow water collision
  if (state.realTerrainMesh && state.realTerrainHeightData) {
    const terrH = getRealTerrainHeight(foil.x, foil.z);
    if (terrH !== null && terrH > RT_WATER_Y() + 3) {
      foil.x -= mx * foil.speed * dt;
      foil.z -= mz * foil.speed * dt;
      foil.speed *= 0.1;
      if (!state.shallowStalled) {
        state.shallowStalled = true;
        state.shallowTimer = 0;
        shallowWarningEl.classList.add('show');
      }
    }
  }
  if (state.shallowStalled) {
    state.shallowTimer += dt;
    if (state.shallowTimer >= 5) shallowWarningEl.classList.remove('show');
    if (state.shallowTimer >= 10) restartBtnEl.style.display = 'block';
  }

  // Shore-proximity swell: swell3Height rises to 1.5 m within 100 m of shore,
  // falls to 0.1 m beyond 250 m.  Only active in real-terrain modes.
  if (state.realTerrainHeightData) {
    // Throttle the shore-distance scan to every 30 frames (~0.5 s)
    state._shoreCheckTick = (state._shoreCheckTick || 0) + 1;
    if (state._shoreCheckTick >= 30) {
      state._shoreCheckTick = 0;
      state._shoreDist = _getShoreDistM(foil.x, foil.z);
    }
    const dist = state._shoreDist ?? 999;
    // Map distance → target height (1.5 m close, 0.1 m far)
    const CLOSE = 100, FAR = 250;
    const t = Math.max(0, Math.min(1, (dist - CLOSE) / (FAR - CLOSE)));
    const target = lerp(1.5, 0.1, t);
    // Init from slider on first run
    if (state._swell3ShoreH === undefined) state._swell3ShoreH = getVal('swell3Height');
    // Linear ramp: 20 s to travel the full 0.1→1.5 range
    const MAX_RATE = (1.5 - 0.1) / 20;
    const diff = target - state._swell3ShoreH;
    state._swell3ShoreH += Math.sign(diff) * Math.min(Math.abs(diff), MAX_RATE * dt);
    state.cachedParams['swell3Height'] = state._swell3ShoreH;
  }

  // Wave-energy normalization (moved here from the HUD body — pure math with
  // no DOM access; provably independent of the world/HUD updates that
  // originally ran between the physics block and this calculation)
  const s1h = getVal('swell1Height'), s1p = getVal('swell1Period');
  const s2h = getVal('swell2Height'), s2p = getVal('swell2Period');
  const s3h = getVal('swell3Height'), s3p = getVal('swell3Period');
  function maxSlope(h: number, p: number) { return h > 0.01 ? h * 6.2832 / (1.56 * p * p) : 0; }
  const maxSlopeSum = (maxSlope(s1h, s1p) + maxSlope(s1h * 0.22, s1p * 0.7)
    + maxSlope(s2h, s2p) + maxSlope(s2h * 0.2, s2p * 0.65)
    + maxSlope(s3h, s3p)) * 3.25;
  const dynamicMax = Math.max(0.05, maxSlopeSum * 0.85);

  // Combine slopeForce with pocket strength: in the pocket pushes toward max
  const rawNorm = slopeForce / dynamicMax;
  // When in pocket with positive slope, boost toward 1.0
  // When out of pocket, show raw slope force
  const pocketBoost = pocketStrength * Math.max(0, rawNorm);
  const blended = rawNorm + pocketBoost * (1.0 - Math.abs(rawNorm));
  const normSwell = Math.max(-1, Math.min(1, blended));

  // Pocket detection — wave energy at 75% or higher
  const inPocketNow = normSwell >= 0.5 && foil.speed > 3;

  // Debug: log wave energy every 10s
  state._waveLogTimer = (state._waveLogTimer || 0) + dt;
  if (state._waveLogTimer >= 10) {
    state._waveLogTimer = 0;
    console.log(`Wave energy: ${(normSwell * 100).toFixed(1)}% | pocket: ${inPocketNow} | speed: ${foil.speed.toFixed(1)} m/s`);
  }

  return {
    foil, mx, mz, wH, bY: wH + foil.rideH, slope, slopeDot,
    isF, isPump, isPowerPump, speedCapMs, slopeForce, pocketStrength,
    normSwell, inPocketNow,
  };
}

export { initPhysics, resetRideFlags, updatePhysics };
