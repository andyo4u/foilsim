// ──────────────────────────────────────────────────────────────
//  systems/world.js  –  world-follow
//
//  Ocean mesh follow, distant-water fill plane, horizon fill,
//  terrain ring follow, and foil group placement.
// ──────────────────────────────────────────────────────────────

import { state } from '../state.js';
import { RT_WATER_Y } from '../terrain.js';

function updateWorldFollow(fr) {
  const { foil, mx, mz, wH, bY, slope, slopeDot } = fr;
  const u = state.oceanMat.uniforms;

  // Move ocean mesh to follow foil
  {
    // Snap to cell size to prevent vertex swimming at mesh edges
    const SNAP = state.oceanSize / state.oceanSegments;
    state.oceanMesh.position.x = Math.round(foil.x / SNAP) * SNAP;
    state.oceanMesh.position.z = Math.round(foil.z / SNAP) * SNAP;
    state.oceanMesh.position.y = state.realTerrainMesh ? RT_WATER_Y() : 0;

    // Update water fill plane
    if (state.waterFillPlane) {
      const half = state.oceanSize / 2;
      const fu = state.waterFillPlane.material.uniforms;
      fu.uOceanMin.value.set(state.oceanMesh.position.x - half, state.oceanMesh.position.z - half);
      fu.uOceanMax.value.set(state.oceanMesh.position.x + half, state.oceanMesh.position.z + half);
      fu.uCamPos.value.copy(state.camera.position);

      // Match distant water color to ocean render mode
      const rm = state.oceanMat.uniforms.uRenderMode.value;
      if (rm > 9.5) {
        fu.uWaterColor.value.set(0.30, 0.20, 0.10);
        fu.uFogColor.value.set(0.55, 0.45, 0.35);
      } else if (rm > 8.5) {
        fu.uWaterColor.value.set(0.10, 0.04, 0.02);
        fu.uFogColor.value.set(0.12, 0.06, 0.04);
      } else if (rm > 7.5) {
        fu.uWaterColor.value.set(0.06, 0.30, 0.55);
        fu.uFogColor.value.set(0.55, 0.65, 0.78);
      } else if (rm > 6.5) {
        fu.uWaterColor.value.set(0.02, 0.03, 0.06);
        fu.uFogColor.value.set(0.02, 0.03, 0.06);
      } else if (rm > 5.5) {
        fu.uWaterColor.value.set(0.05, 0.10, 0.30);
        fu.uFogColor.value.set(0.30, 0.35, 0.55);
      } else if (rm > 4.5) {
        fu.uWaterColor.value.set(0.92, 0.90, 0.85);
        fu.uFogColor.value.set(0.92, 0.90, 0.85);
      } else if (rm > 3.5) {
        fu.uWaterColor.value.set(0.01, 0.015, 0.04);
        fu.uFogColor.value.set(0.02, 0.03, 0.08);
      } else if (rm > 2.5) {
        fu.uWaterColor.value.set(0.25, 0.15, 0.45);
        fu.uFogColor.value.set(0.50, 0.35, 0.60);
      } else if (rm > 1.5) {
        fu.uWaterColor.value.set(0.0, 0.05, 0.35);
        fu.uFogColor.value.set(0.45, 0.55, 0.70);
      } else if (rm > 0.5) {
        fu.uWaterColor.value.set(0.85, 0.78, 0.68);
        fu.uFogColor.value.set(0.85, 0.78, 0.68);
      } else {
        fu.uWaterColor.value.copy(u.uShallowColor.value);
        fu.uFogColor.value.set(0.55, 0.7, 0.85);
      }
    }

    // Horizon fill — disabled in real-terrain mode (waterFillPlane handles that)
    if (state.horizonFill) {
      const half = state.oceanSize / 2;
      const hfu = state.horizonFill.material.uniforms;
      hfu.uOceanMin.value.set(state.oceanMesh.position.x - half, state.oceanMesh.position.z - half);
      hfu.uOceanMax.value.set(state.oceanMesh.position.x + half, state.oceanMesh.position.z + half);
      hfu.uFogColor.value.copy(u.uFogColor.value);
      state.horizonFill.visible = !state.waterFillPlane;
    }
  }

  // Terrain ring follows player
  if (!state.realTerrainMesh) {
    const TSNAP = 400;
    state.terrainGroup.position.x = Math.round(foil.x / TSNAP) * TSNAP;
    state.terrainGroup.position.z = Math.round(foil.z / TSNAP) * TSNAP;
  }

  // Position foil
  state.foilGroup.position.set(foil.x, bY, foil.z);
  state.foilGroup.rotation.set(0, foil.heading, 0);
  const cs = -mz * slope.dhdx + mx * slope.dhdz;
  state.modelGroup.rotation.x = foil.roll + Math.atan(cs) * 0.3;
  state.modelGroup.rotation.z = foil.pitch - Math.atan(slopeDot) * 0.4;
}

export { updateWorldFollow };
