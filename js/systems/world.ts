// ──────────────────────────────────────────────────────────────
//  systems/world.js  –  world-follow
//
//  Ocean mesh follow, distant-water fill plane, horizon fill,
//  terrain ring follow, and foil group placement.
// ──────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { state } from '../state.js';
import { RT_WATER_Y } from '../terrain.js';
import type { FrameRecord } from './physics.js';

function updateWorldFollow(fr: FrameRecord) {
  const { foil, mx, mz, wH, bY, slope, slopeDot } = fr;
  const u = state.oceanMat!.uniforms;
  const oceanMesh = state.oceanMesh!;
  const camera = state.camera!;

  // Move ocean mesh to follow foil
  {
    // Snap to cell size to prevent vertex swimming at mesh edges
    const SNAP = state.oceanSize / state.oceanSegments;
    oceanMesh.position.x = Math.round(foil.x / SNAP) * SNAP;
    oceanMesh.position.z = Math.round(foil.z / SNAP) * SNAP;
    oceanMesh.position.y = state.realTerrainMesh ? RT_WATER_Y() : 0;

    // Update water fill plane
    if (state.waterFillPlane) {
      const half = state.oceanSize / 2;
      const fu = (state.waterFillPlane.material as THREE.ShaderMaterial).uniforms;
      // Inset the discard rect so the fill extends UNDER the ocean rim.
      // The fill draws first (renderOrder -1) and the opaque ocean covers the
      // overlap, but at grazing angles the old exact butt-joint exposed a
      // sub-pixel gap (fill sits 5cm lower) where the bright clear color
      // leaked through as a hairline seam.
      const inset = half * 0.94;
      fu.uOceanMin.value.set(oceanMesh.position.x - inset, oceanMesh.position.z - inset);
      fu.uOceanMax.value.set(oceanMesh.position.x + inset, oceanMesh.position.z + inset);
      fu.uCamPos.value.copy(camera.position);
      fu.uSunDir.value.copy(u.uSunDir.value);

      // Match distant water color to the ocean render mode's edge fog.
      // Default mode (rm 0) uses the shader's atmospheric-scattering formula;
      // stylized modes paint their per-mode fog color (their ocean paths are
      // fully fogged at the mesh edge).
      const rm = u.uRenderMode.value;
      fu.uUseAtmo.value = rm < 0.5 ? 1.0 : 0.0;
      if (rm > 11.5) {
        // Pocket Highlights renders like the default but fogs to the dynamic
        // sun-driven fog color
        fu.uFogColor.value.copy(u.uFogColor.value);
      } else if (rm > 9.5) {
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
        // rm 0 — atmospheric path; uFogColor unused but kept sane
        fu.uWaterColor.value.copy(u.uShallowColor.value);
        fu.uFogColor.value.set(0.55, 0.7, 0.85);
      }
    }

    // Horizon fill — disabled in real-terrain mode (waterFillPlane handles that)
    if (state.horizonFill) {
      const half = state.oceanSize / 2;
      const hfu = (state.horizonFill.material as THREE.ShaderMaterial).uniforms;
      const hInset = half * 0.94; // same rim overlap as the water fill plane
      hfu.uOceanMin.value.set(oceanMesh.position.x - hInset, oceanMesh.position.z - hInset);
      hfu.uOceanMax.value.set(oceanMesh.position.x + hInset, oceanMesh.position.z + hInset);
      hfu.uFogColor.value.copy(u.uFogColor.value);
      hfu.uSunDir.value.copy(u.uSunDir.value);
      hfu.uCamPos.value.copy(camera.position);
      hfu.uUseAtmo.value = u.uRenderMode.value < 0.5 ? 1.0 : 0.0;
      state.horizonFill.visible = !state.waterFillPlane;
    }
  }

  // Terrain ring follows player
  if (!state.realTerrainMesh) {
    const TSNAP = 400;
    state.terrainGroup!.position.x = Math.round(foil.x / TSNAP) * TSNAP;
    state.terrainGroup!.position.z = Math.round(foil.z / TSNAP) * TSNAP;
  }

  // Position foil
  state.foilGroup!.position.set(foil.x, bY, foil.z);
  state.foilGroup!.rotation.set(0, foil.heading, 0);
  const cs = -mz * slope.dhdx + mx * slope.dhdz;
  state.modelGroup!.rotation.x = foil.roll + Math.atan(cs) * 0.3;
  state.modelGroup!.rotation.z = foil.pitch - Math.atan(slopeDot) * 0.4;
}

export { updateWorldFollow };
