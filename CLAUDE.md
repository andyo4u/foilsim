# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FoilSim is an eFoil/hydrofoil simulator built with Three.js r128. Players ride waves, pump for speed, and explore real-world locations (Columbia River Gorge, Maliko Run Maui).

- **Live site**: https://foil-brain.com — a Cloudflare Worker (`foilsim`) serving static assets from `dist/` (see `wrangler.jsonc`). A dev worker (`foilsim-dev`) serves dev.foil-brain.com for pre-release testing. GitHub Pages (andyo4u.github.io/foilsim) is deprecated.
- **Current version**: stored in `index.html` div#version-label

## Development Setup

The app is vanilla ES modules (currently migrating to TypeScript — see the v0.3.x series), bundled with esbuild via `build.js`. Three.js r128 is loaded via CDN as `window.THREE` (npm migration in progress).

- `npm run dev` — unminified watch build + local server on :8080
- `npm run build` — production build to `dist/` (minified, console.log stripped)
- `npm run deploy:dev` — build + deploy to dev.foil-brain.com
- `npm run deploy` — build + deploy to production foil-brain.com
- `node scripts/wave-golden-check.js` — regression check: the CPU wave math (`getWaveHeight`/`getWaveSlope`) must stay bit-identical; run after touching ocean.js or refactoring anything it imports
- There are no other tests, no linter, and no CI/CD pipeline; deploys are manual via wrangler

## Architecture

7 ES modules under `js/`, all sharing a single mutable `state` object:

| Module | Responsibility |
|--------|---------------|
| `state.js` | Shared mutable state object — every module imports this |
| `main.js` | Entry point: renderer, scene, camera, lights, sky, clouds, animate loop, quality/LOD, `window.*` bridge for HTML onclick handlers |
| `ocean.js` | Ocean mesh, wave vertex/fragment shaders (11 render modes), Gerstner wave math, env map, wave chart |
| `foil.js` | Foil model, physics simulation, camera follow, spray/wake/streamer particles, touch pad input |
| `terrain.js` | Silhouettes, 3D cliffs, real terrain (heightmap+satellite), panoramas, 8 terrain presets |
| `helpers.js` | Slider caching, wave presets, UI utilities, math helpers |
| `audio.js` | Web Audio API — wind, water, foil sounds |

### Initialization Order (critical)

```
cacheAllSliders() → initOcean() → initFoil() → initTerrain()
```

`initOcean` creates `state.oceanMat` and `state.oceanMesh`, which `initTerrain` depends on. `terrain.js` uses `Promise.resolve().then()` to defer access to `state.oceanMat` so it runs after all module-level declarations complete.

### State Pattern

All mutable shared data lives on the `state` object from `state.js`. Every module imports it and reads/writes properties directly. **Key gotcha**: `export const` values can't be reassigned from outside the declaring module — use `state.property = value` for anything mutable across modules.

### HTML ↔ Module Bridge

`index.html` uses inline `onclick` handlers that call global functions. `main.js` exports functions to `window.*` (e.g., `window.toggleControls`, `window.applyPreset`, `window.rebuildTerrain`, `window.setRenderMode`, `window.setQuality`) to bridge the HTML controls to the module system.

## Commit Conventions

- **Bump the version** in `index.html` div#version-label with every commit
- Use detailed, multi-line commit messages explaining the "why"
- Include co-author tag for the Claude model that authored the change, e.g. `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Known Bugs

### Half-Screen Rendering Bug (unresolved)
Changing `renderer.setPixelRatio()` at runtime in Three.js r128 causes a canvas/buffer mismatch. The auto-quality system triggers this when stepping between quality levels. **When touching rendering code**: always call `setPixelRatio()` BEFORE `setSize()`, and test on multiple devices. See FOILSIM.md for full history.

### Wave Energy Display
Passive energy regen is tiny (0.06 * dt) and `slopeForce` contribution may not feed through correctly. Check the energy gain formula in `animate()`.

### Board Bounce in High Wind Chop
`rideH` oscillates rapidly with large chop amplitude — needs low-pass filtering or more aggressive lerp damping.

## Key Technical Details

- **11 render modes** controlled by a single `uRenderMode` uniform in the ocean shader
- **Quality/LOD system**: 5 presets (Low/Med/High/Ultra/Max) + Auto mode with asymmetric FPS thresholds (down at <45fps, up after sustained >55fps) to prevent oscillation
- **Mobile detection**: JS-based (`'ontouchstart' in window || navigator.maxTouchPoints > 0`), not CSS media queries
- **Terrain configs**: defined in `terrainConfigs` object in `terrain.js` — real terrain modes use heightmap PNG for vertex displacement + satellite JPEG for texture
- **Wave physics**: Gerstner waves with 3 swell components + wind chop; real-time slope calculations drive physics feedback

## Reference

See `FOILSIM.md` for comprehensive developer notes including version history, detailed architecture, reverted features available for re-implementation, and future roadmap.
