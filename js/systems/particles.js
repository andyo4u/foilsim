// ──────────────────────────────────────────────────────────────
//  systems/particles.js  –  spray, wake history, wingtip streamers
//
//  Emission/aging driver; the particle pools themselves live in
//  foil.js (emitSpray/updateSpray/updateWake/updateStreamer).
// ──────────────────────────────────────────────────────────────

import { state } from '../state.js';
import { emitSpray, updateSpray, updateWake, updateStreamer } from '../foil.js';

let sprayT = 0;

function updateParticles(dt, fr) {
  const { foil, mx, mz, wH, bY, speedCapMs } = fr;

  // Spray & effects — kick in near top speed, intensify above it (pocket)
  // ef: 0 below 90% top speed, ramps 0→1 from 90%→100%, >1 above top speed
  const efThresh = speedCapMs * 0.9;
  const ef = Math.max(0, (foil.speed - efThresh) / (speedCapMs * 0.1));
  sprayT += dt;
  if (ef > 0 && sprayT > .015) {
    sprayT = 0;
    // Board spray — mist kicked up from board edges
    const si = Math.floor(Math.min(14, ef * 6));
    emitSpray(foil.x - mx * .9, bY, foil.z - mz * .9, -mx * foil.speed * .3, 1.5 + foil.speed * .15, -mz * foil.speed * .3, si);
    // Rooster tail — spray at waterline, only above top speed (pocket riding)
    if (ef > 1) {
      const ri = Math.floor(Math.min(10, (ef - 1) * 8));
      emitSpray(foil.x - mx * 1.2, wH + 0.05, foil.z - mz * 1.2, -mx * foil.speed * .5, 0.5 + foil.speed * .2, -mz * foil.speed * .5, ri);
    }
  }
  updateSpray(dt);

  // Wake
  if (foil.speed > 1.5) state.wkHist.unshift({ x: foil.x - mx, y: bY - foil.rideH + .05, z: foil.z - mz });
  while (state.wkHist.length > state.wakeBudget) state.wkHist.pop();
  updateWake();

  // Wingtip streamers — visible near top speed, intensify above
  state.foilGroup.updateMatrixWorld(true);
  state.tipL.getWorldPosition(state._tipLWorld);
  state.tipR.getWorldPosition(state._tipRWorld);
  updateStreamer(state.streamerL, state._tipLWorld.x, state._tipLWorld.y, state._tipLWorld.z, ef);
  updateStreamer(state.streamerR, state._tipRWorld.x, state._tipRWorld.y, state._tipRWorld.z, ef);
}

export { updateParticles };
