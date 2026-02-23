# FoilSim — Developer Notes

> Last updated: v0.90

## Project Overview

eFoil / hydrofoil simulator built with Three.js r128. Ride waves, pump for speed,
explore real-world terrain locations (Columbia River Gorge, Maliko Run Maui).

- **Live demo**: https://andyo4u.github.io/foilsim/
- **Repo**: https://github.com/andyo4u/foilsim
- **Git user**: Andy O'Brien (obr.andy@yahoo.com)
- **Hosting**: GitHub Pages (master branch)

## Stack & Constraints

- **Three.js r128** via CDN (`window.THREE` global) — NOT an npm module
- **Vanilla ES modules** — `<script type="module" src="js/main.js">`
- **No build tools** — no webpack, no bundler, no transpiler
- **No node_modules** — all dependencies via CDN `<script>` tags
- Three.js Sky addon loaded separately: `three@0.128.0/examples/js/Sky.js`

## Architecture

7 JS modules under `js/`, all sharing a single mutable state object:

| Module       | Responsibility |
|-------------|----------------|
| `state.js`   | Shared mutable state object — every module imports this |
| `main.js`    | Renderer, scene, camera, lights, sky, clouds, animate loop, quality/LOD, window.* bridge |
| `ocean.js`   | Ocean mesh, wave shaders (11 render modes), Gerstner wave math, env map, wave chart |
| `foil.js`    | Foil model, physics, camera follow, spray/wake/streamer particles, touch pad input |
| `terrain.js` | Silhouettes, 3D cliffs, real terrain (heightmap+satellite), panoramas, terrain configs |
| `helpers.js` | Slider caching, presets, value getters, UI utilities, math helpers |
| `audio.js`   | Web Audio API — wind, water, foil sounds |

### Init Order (matters!)

```
cacheAllSliders() → initOcean() → initFoil() → initTerrain()
```

- `initOcean` creates `state.oceanMat` and `state.oceanMesh`
- `initTerrain` → `rebuildTerrain('gorge-real')` needs `state.oceanMat`
- terrain.js uses `Promise.resolve().then()` to defer access to `state.oceanMat`
  so it runs after all module-level declarations complete

### State Pattern

All mutable shared data lives on the `state` object exported from `state.js`.
Every module does `import { state } from './state.js'` and reads/writes properties.

**Key gotcha**: `export const` can't be reassigned from outside the declaring module.
Use `state.property = value` for anything mutable across modules. This is why
`OCEAN_SIZE` and `OCEAN_SEGMENTS` were moved from `export const` to `state.oceanSize`
and `state.oceanSegments` during the quality/LOD implementation.

## Quality / LOD System (v0.84+)

4 presets + auto mode, controlled by dropdown in settings panel:

| Level | Segments | Ocean Size | Pixel Ratio Cap | Spray | Wake | Streamers |
|-------|----------|------------|-----------------|-------|------|-----------|
| Low   | 128      | 400        | 1.0             | 50    | 30   | 40        |
| Med   | 256      | 600        | 1.5             | 100   | 50   | 80        |
| High  | 384      | 800        | 2.0             | 150   | 65   | 100       |
| Ultra | 512      | 800        | 2.0             | 200   | 80   | 120       |

**Auto mode** (default on startup):
- Measures FPS every 500ms, keeps a sliding window of 6 samples (3 seconds)
- Steps DOWN immediately if avg < 45 fps
- Steps UP after 10 consecutive samples > 55 fps (5 second hold)
- Asymmetric thresholds prevent oscillation

**Geometry rebuild**: `rebuildOceanGeometry()` in ocean.js disposes old
`PlaneGeometry`, creates new one with updated segments/size, swaps onto mesh.

## Mobile Support (v0.85-v0.86)

### Detection
JS-based, NOT CSS media queries:
```js
const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
```
CSS `@media (pointer:coarse)` is unreliable — some laptops with touchscreens
report coarse pointer even with a mouse connected.

### Touch Pads
- Left pad: steer left / right (side by side)
- Right pad: pump up / brake down (stacked vertically)
- 220×130px, shown only on mobile via `.mobile-active` class
- **Slide-friendly**: Track touches at the pad level with `elementFromPoint()`
  on `touchmove`, not per-zone `touchstart`/`touchend`. This way users can
  slide their thumb between left↔right (or pump↔brake) without lifting.

### Mobile UI
- Settings gear button (⚙) in upper right, hidden on desktop
- Controls panel starts hidden on mobile
- Touch pads scale down on small screens via `@media (max-width: 480px)`

## Known Bugs & Gotchas

### Half-Screen Rendering Bug (UNRESOLVED)
**Symptom**: After v0.86, the simulation renders only on the bottom half of
the screen. Starts full-screen then jumps to half after auto-quality kicks in.

**Root cause (suspected)**: Changing `renderer.setPixelRatio()` at runtime
in Three.js r128 causes a canvas size / buffer size mismatch. The auto-quality
system changes pixel ratio when stepping between quality levels, which triggers it.

**What was tried**:
1. Added `renderer.setSize()` after `setPixelRatio()` in `setQuality()` — didn't fix
2. Reordered init to `setPixelRatio` before `setSize` everywhere — didn't fix
3. Added camera aspect ratio update in `setQuality()` — didn't fix

**Resolution**: Reverted to v0.86 (before the HUD version/FPS display changes).
The bug may be triggered by some interaction between the HUD DOM changes and the
quality system, or purely by runtime pixel ratio changes in r128.

**IMPORTANT**: When re-implementing features that touch rendering:
- Be very careful with `renderer.setPixelRatio()` at runtime
- Always call `setPixelRatio()` BEFORE `setSize()` in Three.js r128
- Test on multiple devices after any renderer changes
- The resize handler already does this correctly (line 822-827 of main.js)

### Wave Energy Never Goes Very High
The passive energy regen (`0.06 * dt`) is tiny, and the `slopeForce` contribution
to wave energy display may not be feeding through correctly. Check the energy gain
formula in `animate()` and the `sbWaveEnergy` slider range/default.

### Board Bouncy in High Wind Chop
`rideH` oscillates rapidly when chop amplitude is large. Needs low-pass filtering
or more aggressive lerp damping toward a smoothed wave height average.

## Terrain System

### Background Presets (procedural)
8 presets using procedural cliff geometry + silhouette ring:
ocean-islands, big-sur, sheltered-bay, columbia-gorge, kauai (panoramic photo),
open-ocean, gorge-real (HD heightmap), maliko-real (HD heightmap)

### Real Terrain (HD modes)
- Heightmap (1024px grayscale PNG) → vertex displacement on PlaneGeometry
- Satellite imagery (2048px JPEG) → diffuse texture on custom shader
- River mask generated from heightmap (water threshold + blur feathering)
- Water fill plane renders flat water outside the ocean mesh bounds
- Asset caching by terrain config name (gorge, maliko)

### Terrain Configs
Defined in `terrainConfigs` object in terrain.js:
- `gorge`: Columbia River Gorge — 14.4km × 11km, river mask, Mapbox map image
- `maliko`: Maliko Run, Maui — 76km × 51km, full island, offshore start position

## Version History

| Version | Changes |
|---------|---------|
| v0.83   | Split monolithic index.html into ES modules |
| v0.84   | Adaptive quality/LOD system with Quality dropdown |
| v0.85   | Mobile touch controls (left/right + pump/brake pads) |
| v0.86   | Slide-friendly touch pads, bigger controls, JS mobile detection, gear button |
| v0.87   | HUD version/FPS below wave energy (REVERTED — caused half-screen bug) |
| v0.88   | Version bump after revert to v0.86 baseline |
| v0.89   | Remove mini-map tracker completely from codebase |
| v0.90   | Version bump for repo access verification |

## Reverted Features (Available for Re-Implementation)

### HUD Version/FPS Display (was v0.87)
Moved the version label and FPS counter from the top-left corner to below the
wave energy bar in the HUD, styled to match the speed readout numbers. This was
reverted along with v0.87 when the half-screen bug appeared. The feature itself
is fine — just needs to be re-applied carefully and tested to ensure it doesn't
interact with the rendering bug.

### Mini-Map / GPS Trail (removed v0.89)
A Strava-style mini-map showing a red GPS trail overlaid on a satellite/heightmap
background. Featured heading arrow, distance tracking, and Strava-like red glow
path rendering. Removed to clean up the codebase — the Strava integration is
preserved as a future TODO for a more comprehensive implementation (ride summary
panel with distance, time, avg speed, elevation profile, etc.).

## Future Features

- **Multiplayer** — Shared sessions where multiple riders are visible on the same ocean. Could use WebRTC or WebSocket relay for real-time position/state sync.
- **Fix sun visualization & water reflection** — Sun disc hidden (mieCoefficient=0) because the sky sun and ocean specular reflection moved in opposite directions. Need to diagnose the coordinate mismatch between Three.js Sky sunPosition and the ocean shader's uSunDir/specular calculations, then re-enable the sun disc.

## Commit Conventions

- **Version bump**: Increment version in `index.html` div#version-label with every commit
- **Commit and push**: After each feature/fix
- **Commit messages**: Detailed, multi-line, explain the "why" not just the "what"
- **Co-author tag**: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

## File Inventory

```
C:\foilsim\
├── index.html              Main page — HTML, CSS, controls panel, HUD
├── FOILSIM.md              This file — developer notes
├── FUTURE.md               Performance roadmap (WebGPU, Three.js upgrade)
├── readme.txt              Links to live demo and repo
├── favicon.ico             Browser tab icon
├── kauai.jpg               Panoramic photo for Kauai preset
├── js/
│   ├── main.js             Entry point, renderer, animate loop, quality/LOD
│   ├── state.js            Shared mutable state object
│   ├── ocean.js            Ocean mesh, wave shaders, 11 render modes
│   ├── foil.js             Foil model, physics, particles, touch input
│   ├── terrain.js          Terrain systems (cliffs, real terrain, panoramas)
│   ├── helpers.js          UI utilities, presets, math helpers
│   └── audio.js            Web Audio API sounds
├── terrain-data/
│   ├── gorge_heightmap_1024.png
│   ├── gorge_satellite_2048.jpg
│   ├── gorge_map_box.png
│   ├── maliko_heightmap_1024.png
│   └── maliko_satellite_2048.jpg
└── mask.html               Standalone heightmap mask tool
```

## possible names

foilbrain.io
foil-brain.com
foil-brained.com
foilrunner.com

foilbrain.com - forsale..
