# FoilSim — Developer Notes

> Last updated: v0.3.21 (modernization series)

## Project Overview

eFoil / hydrofoil simulator built with Three.js r184 in strict TypeScript. Ride waves,
pump for speed, explore real-world terrain locations (Columbia River Gorge, Maliko Run Maui).

- **Live site**: https://foil-brain.com (Cloudflare Worker, assets from dist/)
- **Dev site**: https://dev.foil-brain.com (deploy + verify here first)
- **Repo**: https://github.com/andyo4u/foilsim
- **Git user**: Andy O'Brien (obr.andy@yahoo.com)
- **Hosting**: Cloudflare Workers via wrangler (GitHub Pages is retired)

## Stack & Constraints

- **Three.js r184** from npm, bundled — no CDN globals
- **TypeScript** (strict, noImplicitAny) — esbuild bundles `js/main.ts` → `dist/js/app.min.js` via `build.js`
- **npm scripts**: `dev` (watch + :8080 server), `build`, `typecheck`, `test` (wave goldens), `deploy:dev`, `deploy`
- r128-compat color pipeline: `ColorManagement.enabled = false`, linear output, light intensities scaled by pi — see CLAUDE.md before touching colors/lights
- Sky + GLTFLoader imported from `three/addons/`

## Architecture

TypeScript modules under `js/` plus per-frame systems under `js/systems/`, all sharing a
single mutable typed state object (see CLAUDE.md for the full module/system tables):

| Module       | Responsibility |
|-------------|----------------|
| `state.ts`   | Shared mutable state — fully typed `State` interface; every module imports this |
| `main.ts`    | Renderer, scene, sky, clouds, quality/LOD, game flow, UI action registry, slim animate() |
| `ui.ts`      | Delegated data-attribute event wiring (replaced inline onclick + window.* bridge) |
| `ocean.ts`   | Ocean mesh, wave shaders (11 render modes), Gerstner wave math, env map, wave chart |
| `foil.ts`    | Foil + surfer models, particle pools, keyboard/touch input, camera controls |
| `terrain.ts` | Silhouettes, 3D cliffs, real terrain (heightmap+satellite), panoramas, terrain configs |
| `helpers.ts` | Slider caching, presets, value getters, UI utilities, math helpers |
| `audio.ts`   | Web Audio API — wind, water, music |
| `leaderboard.ts` | Supabase score submission/retrieval |
| `tutorial.ts` | First-ride tutorial flow |
| `systems/*.ts` | Per-frame: perf, physics (owns FrameRecord), world, surfer, particles, hud, scoring |

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

### Half-Screen Rendering Bug (RESOLVED — v0.3.19/v0.3.20, three r184)
**Was**: runtime `renderer.setPixelRatio()` changes in r128 desynced the canvas
buffer vs CSS size; only half the screen rendered after auto-quality stepped.
**Fix**: the r184 upgrade — modern `setPixelRatio()` re-runs `setSize()` internally,
so buffer and CSS size can no longer desync. Verified 2026-06-10 by stepping all
five quality levels + shader-mode pixel-ratio toggles + a portrait resize, with
canvas buffer assertions and screenshots. The HUD version/FPS display feature
reverted in v0.88 is safe to re-implement now.

### Wave Energy Never Goes Very High (likely stale — verify first)
This entry predates the regen rework. Current formula in `systems/physics.ts`:
`waveRegen = 0.015 + max(0, slopeForce) * 0.035` — slopeForce does feed through.
Audit in-game before changing anything; this may just need deleting.

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
| v0.1.x–v0.2.25 | Build system (esbuild → dist/), surfer GLB + animation, leaderboard (Supabase), stall-out, ride counter, music, Cloudflare hosting |
| v0.3.0–v0.3.2  | Modernization Phase 0: Cloudflare dev env (dev.foil-brain.com), build --dev/--watch, wave-math golden harness |
| v0.3.3–v0.3.6  | Phase 1: animate() split into js/systems/ (perf, physics, world, surfer, particles, hud, scoring) |
| v0.3.7–v0.3.9  | Phase 2: ui.ts action registry; all inline handlers + window.* bridge removed |
| v0.3.10        | Phase 3: three.js from npm, pinned 0.128.0 |
| v0.3.11–v0.3.18 | Phase 4: full strict-TypeScript conversion (state.ts State interface keystone) |
| v0.3.19–v0.3.20 | Phase 5: three 0.128 → 0.184 with r128-compat color flags; half-screen bug verified fixed |
| v0.3.21        | Phase 6: docs rewrite, legacy deploy script removed |

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
- **Pocket glow driven by normSwell uniform** — Currently the wave energy bar blends JS-side pocket strength with slopeForce (option 2). A future alternative (option 1): pass `normSwell` to the shader as a uniform and multiply the pocket glow by it, so the glow brightens only when the rider is actually harvesting energy. This would let the shader glow respond to rider heading/speed, not just wave geometry. Investigate whether this feels better for gameplay feedback.

## Commit Conventions

- **Version bump**: Increment version in `index.html` div#version-label with every commit
- **Commit and push**: After each feature/fix
- **Commit messages**: Detailed, multi-line, explain the "why" not just the "what"
- **Co-author tag** for the Claude model that authored the change, e.g. `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Inventory

```
C:\foilsim\
├── index.html              Main page — HTML, CSS, controls panel, HUD
├── FOILSIM.md              This file — developer notes
├── FUTURE.md               Performance roadmap (WebGPU, Three.js upgrade)
├── readme.txt              Links to live demo and repo
├── favicon.ico             Browser tab icon
├── kauai.jpg               Panoramic photo for Kauai preset
├── build.js                esbuild bundler (prod / --dev / --watch)
├── tsconfig.json           strict TypeScript config (tsc --noEmit gate)
├── wrangler.jsonc          Cloudflare Workers config (prod + dev env)
├── scripts/
│   ├── wave-golden-check.js  CPU wave-math regression gate
│   └── wave-golden.json      360 pinned golden samples
├── js/
│   ├── main.ts             Entry point, renderer, game flow, action registry, animate()
│   ├── state.ts            Shared mutable state (typed State interface)
│   ├── ui.ts               Delegated data-attribute event wiring
│   ├── ocean.ts            Ocean mesh, wave shaders, 11 render modes
│   ├── foil.ts             Foil + surfer models, particles, input, camera
│   ├── terrain.ts          Terrain systems (cliffs, real terrain, panoramas)
│   ├── helpers.ts          UI utilities, presets, math helpers
│   ├── audio.ts            Web Audio API sounds + music
│   ├── leaderboard.ts      Supabase leaderboard
│   ├── tutorial.ts         Tutorial phase machine
│   └── systems/            Per-frame systems (perf, physics, world, surfer, particles, hud, scoring)
├── terrain-data/
│   ├── gorge_heightmap_1024.png
│   ├── gorge_satellite_2048.jpg
│   ├── gorge_map_box.png
│   ├── maliko_heightmap_1024.png
│   └── maliko_satellite_2048.jpg
└── mask.html               Standalone heightmap mask tool
```

## Domain

foil-brain.com (registered; live on Cloudflare). Runner-up names considered:
foilbrain.io, foil-brained.com, foilrunner.com.
