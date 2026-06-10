// ──────────────────────────────────────────────────────────────
//  systems/surfer.js  –  surfer pose swap + procedural animation
// ──────────────────────────────────────────────────────────────

import { state } from '../state.js';
import { lerp } from '../helpers.js';

// Smoothed procedural values
let surferLeanZ = 0;    // counter-lean for roll (radians)
let surferLeanX = 0;    // forward/back lean for accel/brake (radians)
let surferCrouch = 0;   // knee bend 0-1 (scales Y)
let surferHeadY = 0;    // head turn into turns (radians)

function updateSurfer(dt, fr) {
  const { foil, slopeDot, isPump, isPowerPump } = fr;

  // ── Surfer pose swap (stalled vs foiling) ───────────────
  if (state.surferCrouch && state.surferStalled) {
    const isStalled = foil.speed <= 0.3;
    state.surferStalled.visible = isStalled;
    state.surferCrouch.visible = !isStalled;
  }

  // ── Surfer procedural animation ─────────────────────────
  if (state.surferContainer) {
    const sc = state.surferContainer;
    const smoothRate = 1 - Math.exp(-4 * dt); // ~4Hz smoothing

    // 1. Counter-lean with roll — surfer leans opposite to board tilt
    const targetLeanZ = -foil.roll * 0.6;
    surferLeanZ = lerp(surferLeanZ, targetLeanZ, smoothRate);

    // 2. Forward lean when accelerating, back lean when braking
    const accel = (foil.speed - (foil.prevSpeed || 0)) / Math.max(dt, 0.001);
    const targetLeanX = -Math.max(-0.15, Math.min(0.15, accel * 0.03));
    surferLeanX = lerp(surferLeanX, targetLeanX, smoothRate);

    // 3. Knee bend — crouch during pumps + absorb chop
    const pumpCrouch = (isPump || isPowerPump) ? 0.06 : 0;
    const chopCrouch = Math.min(0.04, Math.abs(slopeDot) * 0.08);
    const targetCrouch = pumpCrouch + chopCrouch;
    surferCrouch = lerp(surferCrouch, targetCrouch, smoothRate);

    // 4. Head turn — look into turns
    const targetHeadY = -foil.roll * 0.4;
    surferHeadY = lerp(surferHeadY, targetHeadY, smoothRate * 0.7);

    // Apply — rotations are additive on top of rest pose (-19° Y)
    const restY = -19 * Math.PI / 180;
    sc.rotation.set(surferLeanX, restY + surferHeadY, surferLeanZ);
    // Knee bend via slight Y scale reduction (crouch compresses)
    sc.scale.set(1.25, 1.25 * (1 - surferCrouch), 1.25);
  }
}

export { updateSurfer };
