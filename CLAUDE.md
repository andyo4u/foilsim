# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FoilSim is an eFoil/hydrofoil simulator built with Three.js (r184, npm) in strict TypeScript. Players ride waves, pump for speed, and explore real-world locations (Columbia River Gorge, Maliko Run Maui).

- **Live site**: https://foil-brain.com — Cloudflare Worker `foilsim`, static assets from `dist/` (`wrangler.jsonc`)
- **Dev/test site**: https://dev.foil-brain.com — Cloudflare Worker `foilsim-dev` (wrangler env `dev`). Deploy here and verify before touching production.
- GitHub Pages (andyo4u.github.io/foilsim) is deprecated. Cloudflare is the only deploy path.
- **Current version**: stored in `index.html` div#version-label

## Development Setup

TypeScript ES modules bundled with esbuild via `build.js`. Three.js r184 is a normal npm dependency (no CDN globals).

- `npm run dev` — unminified watch build + local server on :8080 (inline sourcemaps, console.logs kept)
- `npm run build` — production build to `dist/` (minified, console.log stripped, GLSL comments stripped). No production sourcemap on purpose — the post-bundle GLSL strip would invalidate it; debug with `npm run dev`.
- `npm run typecheck` — `tsc --noEmit` (strict, noImplicitAny)
- `npm test` — wave-math golden check (see Verification below)
- `npm run deploy:dev` — build + deploy to dev.foil-brain.com
- `npm run deploy` — build + deploy to production foil-brain.com
- Wrangler auth: `CLOUDFLARE_API_TOKEN` in `.env` (gitignored) or `wrangler login`
- No linter, no CI — deploys are manual via wrangler

### Verification gates (run after any non-trivial change)

1. `npm run typecheck` and `npm run build` pass
2. `node scripts/wave-golden-check.js` — the CPU wave math (`getWaveHeight`/`getWaveSlope`) must stay **bit-identical** to `scripts/wave-golden.json` (360 pinned samples). This is the physics foundation; run it after touching ocean.ts or anything it imports. Re-capture with `--capture` only for an intentional physics change.
3. Browser smoke on `npm run dev`: ride starts, physics/pumping works, terrains + render modes cycle, leaderboard fetches, zero console errors.

## Architecture

TypeScript modules under `js/`, all sharing a single mutable typed `state` object:

| Module | Responsibility |
|--------|---------------|
| `state.ts` | Shared mutable state — the `State` interface types every property; every module imports this |
| `main.ts` | Entry point: renderer, scene, camera, lights, sky, clouds, quality/LOD, game flow (startRide/endRide), UI action registry, slim `animate()` orchestrator |
| `ui.ts` | Delegated DOM event wiring — `data-action`/`data-input`/`data-change` attributes resolve against a handler registry. No inline handlers, no window.* globals |
| `ocean.ts` | Ocean mesh, wave shaders (11 render modes via `uRenderMode`), CPU Gerstner wave math, env map, wave chart |
| `foil.ts` | Foil + surfer GLB models, particle pools (spray/wake/streamers), keyboard + touch-pad input, camera controls |
| `terrain.ts` | Silhouettes, 3D cliffs, real terrain (heightmap+satellite), panoramas; owns the `BgPreset`/`RealTerrainConfig` interfaces |
| `helpers.ts` | Slider caching, wave presets, unit conversion, math helpers |
| `audio.ts` | Web Audio wind/chime + music playback (ID3 parsing, playlist) |
| `leaderboard.ts` | Supabase REST: submit/fetch scores, username, ride counter. The publishable key in this file is intentionally client-side |
| `tutorial.ts` | First-ride tutorial phase machine |

Per-frame systems under `js/systems/`, called by `animate()` in fixed order (order is load-bearing):

| System | Owns |
|--------|------|
| `perf.ts` | FPS tick/graphs + auto-quality stepping (`setQuality` injected via `initPerf`) |
| `physics.ts` | Foil physics, stall-out, shore swell, wave-energy normalization. Builds the `FrameRecord` (fr) every later system consumes. `endRide` injected via `initPhysics` |
| `world.ts` | Ocean mesh snap-follow, distant-water fill colors, terrain ring, foil placement |
| `surfer.ts` | Pose swap + procedural lean/crouch animation |
| `particles.ts` | Spray emission, wake history, wingtip streamers |
| `hud.ts` | Speed/accel/energy/swell-bar/status DOM rendering |
| `scoring.ts` | Ride timer, distance/top-speed/pocket tracking (`endRide` injected via `initScoring`) |

`updateEnvironment`, `updatePowerups` (disabled block), and `updateCameraFollow` remain in main.ts — they're tangled with main-local objects (sky/clouds, camera const).

### Initialization Order (critical)

```
cacheAllSliders() → initOcean() → initFoil() → initTerrain()
```

`initOcean` creates `state.oceanMat`/`state.oceanMesh`, which `initTerrain` depends on. `terrain.ts` uses `Promise.resolve().then()` to defer access to `state.oceanMat` until module-level declarations complete.

### State Pattern

All mutable shared data lives on the typed `state` object from `state.ts`. **Key gotcha**: `export const` values can't be reassigned from outside the declaring module — use `state.property = value` for anything mutable across modules. Type-only imports (`import type`) let state.ts reference terrain/foil-owned interfaces without runtime cycles.

### Color pipeline (r128-compat — read before touching colors/lights)

The 11 hand-written GLSL shaders and every Color uniform were tuned against r128's linear pipeline. main.ts therefore sets `THREE.ColorManagement.enabled = false` and `renderer.outputColorSpace = LinearSRGBColorSpace`, and scales light intensities by `LIGHT_SCALE = π` (r165 removed legacy light scaling). Removing these flags requires retuning all water/fog/cloud colors across 11 render modes — a deliberate art pass, not a cleanup.

## Commit Conventions

- **Bump the version** in `index.html` div#version-label with every commit
- Use detailed, multi-line commit messages explaining the "why"
- Include the co-author tag for the Claude model that authored the change, e.g. `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Known Bugs

### Half-Screen Rendering Bug (RESOLVED in v0.3.19/v0.3.20, three r184)
Runtime `setPixelRatio()` changes in r128 desynced canvas buffer vs CSS size. Modern three re-runs `setSize()` inside `setPixelRatio()`; verified fixed by stepping all quality levels + shader-mode toggles + portrait resize with buffer assertions and screenshots.

### Wave Energy Display (likely stale — verify before "fixing")
This entry predates the regen rework: regen is `0.015 + max(0, slopeForce) * 0.035` in `js/systems/physics.ts`. Audit in-game before changing anything.

### Board Bounce in High Wind Chop (open)
`rideH` chases raw `getWaveHeight()` per frame, so large chop amplitude oscillates the board. Fix would be a low-pass filter / smoothed wave-height average in `systems/physics.ts`.

## Key Technical Details

- **11 render modes** via a single `uRenderMode` uniform in the ocean shader; the distant-water fill plane mirrors each mode's palette in `systems/world.ts`
- **Quality/LOD**: 5 presets (Low/Med/High/Ultra/Max) + Auto with asymmetric FPS thresholds (down <35, up after 8 samples >52) in `systems/perf.ts`
- **Mobile detection**: JS-based (`'ontouchstart' in window || navigator.maxTouchPoints > 0`), not CSS media queries
- **Touch pads** use `data-action="up|down|left|right"` for foil.ts's own touch listeners — these names are intentionally never registered in the ui.ts click registry (unknown actions are silently ignored)
- **Terrain configs**: `terrainConfigs` in `terrain.ts` — real terrain uses heightmap PNG displacement + satellite JPEG texture
- **Wave physics**: Gerstner waves, 3 swells + wind chop; CPU math in ocean.ts mirrors the GPU shader and is golden-tested
- **Legacy pages**: `experiments.html`, `surfer-viewer.html`, and `ocean_sim_experiments/` are frozen pre-modernization references — they still use CDN r128 globals, are excluded from the build, and should not be ported casually

## Reference

See `FOILSIM.md` for comprehensive developer notes including version history, detailed architecture, reverted features available for re-implementation, and future roadmap.
