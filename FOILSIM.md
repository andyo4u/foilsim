# FoilSim — Developer Notes & Key Learnings

## Project Overview
Hydrofoil/eFoil simulator built with Three.js r128, vanilla ES modules (no build tools), hosted on GitHub Pages at `andyo4u/foilsim`.

## Architecture

### Module Structure (v0.83+)
```
js/
  state.js      — Shared mutable state object (single source of truth)
  helpers.js    — UI helpers (slider read/write), math utils, presets
  audio.js      — Web Audio API (self-contained, no app imports)
  ocean.js      — Ocean shader (11 render modes), CPU wave functions, wave chart, env map
  foil.js       — Hydrofoil model, spray/wake/streamers, input handlers, camera
  terrain.js    — Terrain configs, cliffs, real terrain (heightmap+satellite), pano, mini-map
  main.js       — Entry point: renderer, scene, camera, lights, sky, clouds, animate loop, window bridge
```

### Key Patterns
- **Shared state**: Single `state` object in state.js replaces ~20 globals. Every module imports and mutates it.
- **Three.js r128 via CDN**: Loaded as classic `<script>` tags → `window.THREE` available to ES modules.
- **ES modules are deferred**: DOM is guaranteed ready when module code runs. No need for DOMContentLoaded.
- **Window bridge**: 10 functions exposed via `window.*` for inline HTML `onclick`/`oninput` handlers.
- **Init order matters**: `cacheAllSliders()` → `initOcean()` → `initFoil()` → `initTerrain()`. Terrain's `rebuildTerrain()` accesses `state.oceanMat` via `Promise.resolve().then()` (deferred microtask).

### Shader Architecture
- Ocean vertex shader: 11 Gerstner wave components (5 swells + 4 chop + 2 FBM detail)
- Ocean fragment shader: 11 complete render mode implementations (Normal/PBR, Woodcut, DEM, Painterly, Tron, Sumi-e, Pixel Art, X-Ray, Plastic, Hot Lava, Fur)
- Each render mode is a full shader path with per-pixel noise/fbm calls — this is the main GPU cost

## Bugs Encountered & Fixed

### Module Split Issues (v0.83)
1. **Wake buffer inaccessible from main.js**: The animate loop updated `wkPos`, `wkAl`, `wkGeo` directly, but these are module-local in foil.js. **Fix**: Added `export function updateWake()` to foil.js.
2. **Orphaned JS removal**: After replacing the `<script>` tag, ~3585 lines of JS remained as bare text. Edit tool couldn't handle such a large removal. **Fix**: Used `head -310` + append via bash.
3. **ocean.js null pointer on init**: `RT_WORLD_W()` accessed `state.activeTerrainCfg.worldW` but `activeTerrainCfg` is null until `initTerrain()` runs later. **Fix**: Null guard with gorge defaults: `state.activeTerrainCfg ? state.activeTerrainCfg.worldW : 14382`.

### Quality/LOD System (v0.84)
4. **OCEAN_SIZE/SEGMENTS were `export const`**: Can't reassign const exports. **Fix**: Moved to mutable properties on `state` object (`state.oceanSize`, `state.oceanSegments`). All importers updated.

### Mobile Controls (v0.85-v0.86)
5. **Touch pads required lifting finger**: Each zone had its own touchstart/touchend. **Fix**: Track touches at the pad level using `elementFromPoint()` on `touchmove` — sliding between zones works seamlessly.
6. **CSS `@media (pointer: coarse)` unreliable**: Some laptops with touchscreens triggered it. **Fix**: JS-based detection (`'ontouchstart' in window || navigator.maxTouchPoints > 0`) adding `.mobile-device` class to body.

## Performance Notes

### Current Costs (per frame)
- Ocean: 512×512 = 262K vertices through vertex shader (11 gerstner + 2 fbm)
- Fragment shader: Heavy per-pixel noise in most render modes (Painterly = 3 fbm + 4 noise calls)
- CPU wave: `getWaveHeight()` called 1x/frame (9 gerstner + 6-octave fbm)
- Particles: 200 spray + 80 wake + 240 streamers = 520 updates/frame
- Wave chart: CPU canvas drawing every frame

### Quality/LOD System (v0.84)
Adaptive quality with 4 presets + auto mode:
| Quality | Segments | Ocean Size | Pixel Ratio | Particles |
|---------|----------|------------|-------------|-----------|
| Low     | 128      | 400        | 1.0         | ~170      |
| Med     | 256      | 600        | 1.5         | ~230      |
| High    | 384      | 800        | 2.0         | ~315      |
| Ultra   | 512      | 800        | 2.0         | ~520      |

Auto mode: measures FPS every 500ms over 3s window. Steps down at <45fps (immediate), steps up at >55fps (5s hold to prevent oscillation).

**Geometry rebuild**: `rebuildOceanGeometry()` disposes old `PlaneGeometry`, creates new one, swaps onto `state.oceanMesh.geometry`. Material/shaders unchanged. Takes <1ms.

**Particle budgets**: Buffers allocated at max size (200/80/120). Lower quality just caps the active count and hides extras at y=-100. No reallocation needed.

## Mobile Touch Controls (v0.85+)
- Two thumb pads: left (steer) and right (pump/brake)
- Each pad split into 2 zones with slide-friendly tracking via `elementFromPoint()` on `touchmove`
- Shown via JS mobile detection (`.mobile-device` class on body)
- Multi-touch: both pads work independently (steer while pumping)
- Gear button (top-right) shown on mobile for settings access
- Mini-map hidden on mobile (and disabled globally pending Strava-style redesign)

## Git & Deployment
- Repo: `andyo4u/foilsim` (public) on GitHub Pages
- Git config: user.email = `obr.andy@yahoo.com`, user.name = `Andy O'Brien`
- Working directory: `C:\foilsim\`
- Current version: v0.87
- GitHub Pages serves `.js` files with correct MIME type — no issues with ES modules

## Roadmap
See TODO comments in each module header + master roadmap box in `js/main.js` (lines 9-85). Key items:
- Power-ups, jumping, lean-back brake turns
- Spinning globe location picker
- Hell as final unlockable location
- Strava upload with fun location mapping
- Save/load progress (localStorage)
- Easy/Pro difficulty modes
- Fix wave energy (never goes high), board bounce in chop
- Reduce wave tiling, brighten satellite texture
- Strava-style activity display (replace mini-map)
- Sponsor outreach (Lift, Fliteboard, Waydoo, Takuma)
