// ──────────────────────────────────────────────────────────────
//  state.js  –  Shared mutable state for the hydrofoil simulator
//
//  Every module imports the single `state` object and reads /
//  writes properties on it.  This replaces the dozens of global
//  variables that lived in the original monolithic index.html.
// ──────────────────────────────────────────────────────────────
//
//  TODO: Game state — remaining future properties:
//        • achievements: { unlocked: Set, progress: Map }
//        • unlockedLocations: Set
//        • unlockedRenderModes: Set
//
//  TODO: Save / load progress — persist to localStorage:
//        • saveState(): serialize achievements, unlocks, best
//          scores, settings prefs → localStorage.setItem()
//        • loadState(): hydrate state on startup from storage
//        • Auto-save after each ride or achievement unlock
//        • Optional: cloud save via Firebase / simple REST API
//          for cross-device progress sync
//        • What to save:
//          – Unlocked locations + render modes
//          – Best speed / longest ride / most distance per location
//          – Total lifetime stats (distance, rides, time on foil)
//          – Achievement progress (partially completed challenges)
//          – Preferred settings (quality, controls, slider positions)
//          – Power-ups collected / inventory
//        • On first load, detect no save → show welcome / tutorial
//        • "Reset progress" button in settings (with confirmation!)
//
/* ── State ─────────────────────────────────────────────────── */

export const state = {

  // ── Three.js Core (set during init in main.js) ────────────
  renderer : null,
  scene    : null,
  camera   : null,
  ambLight : null,
  dirLight : null,

  // ── Sky / Clouds ──────────────────────────────────────────
  sky         : null,
  skyUniforms : null,
  cloudMat    : null,
  cloudMesh   : null,

  // ── Ocean ─────────────────────────────────────────────────
  oceanMat  : null,
  oceanMesh : null,
  oceanGeo  : null,

  // ── Foil ──────────────────────────────────────────────────
  foilGroup  : null,
  foilAsset  : null,
  modelGroup : null,
  tipL       : null,
  tipR       : null,

  foil: {
    x         : 0,
    z         : 0,
    heading   : 0,
    speed     : 0,
    pitch     : 0,
    roll      : 0,
    rideH     : 0,
    energy    : 1,
    prevWH    : 0,
    prevSpeed : 0,
  },

  // ── Input ─────────────────────────────────────────────────
  input: {
    left  : false,
    right : false,
    up    : false,
    down  : false,
    pump  : false,
  },

  // ── Camera ────────────────────────────────────────────────
  cam: {
    theta        : 0,
    phi          : 0.35,
    dist         : 32,
    drag         : false,
    lx           : 0,
    ly           : 0,
    pd           : 0,
    offsetTheta  : 0,
    followSmooth : 0.04,
    free         : false,
    panX         : 0,
    panY         : 10,
    panZ         : 0,
    panning      : false,
  },

  // ── Terrain ───────────────────────────────────────────────
  terrainGroup          : null,
  silhouetteMat         : null,
  silhouetteMesh        : null,
  cliffMat              : null,
  activeTerrainCfg      : null,   // will be set to terrainConfigs.gorge
  activeBgPreset        : 'ocean-islands',
  bgPresets             : null,            // set by terrain.js
  activeWaterStyle      : 'normal',
  realTerrainReady      : false,
  realTerrainMesh       : null,
  realTerrainMat        : null,
  realTerrainHeightData : null,
  realTerrainHmImg      : null,
  realTerrainSatTex     : null,
  realTerrainRiverMask  : null,
  waterFillPlane        : null,
  horizonFill           : null,
  panoCylinder          : null,
  panoMat               : null,
  panoTexture           : null,

  // ── Environment ───────────────────────────────────────────
  pmremGenerator : null,
  envMap         : null,
  envDirty       : true,

  // ── UI State ──────────────────────────────────────────────
  cachedParams   : {},
  shallowStalled : false,
  shallowTimer   : 0,

  // ── Game Loop ───────────────────────────────────────────
  gamePhase      : 'menu',       // 'menu' | 'riding' | 'score'
  rideTimer      : 120,          // seconds remaining
  score          : { distance: 0, topSpeed: 0, topSpeedMs: 0, pocketTime: 0, total: 0 },
  ridePrevX      : 0,
  ridePrevZ      : 0,

  // ── Power-up ────────────────────────────────────────────
  powerUp: {
    active: false, x: 0, z: 0,
    spawnTimer: 0, nextSpawnDelay: 25,
    boostActive: false, boostTimer: 0, boostDuration: 1, boostAmount: 4.12,
  },
  energyBoost: {
    active: false, x: 0, z: 0,
    spawnTimer: 0, nextSpawnDelay: 35,
    hudTimer: 0, hudDuration: 1.5,
  },

  // ── Info Bar ────────────────────────────────────────────
  infoBarFadeTimer: 0,

  // ── Particles ─────────────────────────────────────────────
  spParts   : [],   // spray particles
  wkHist    : [],   // wake history
  streamerL : null,
  streamerR : null,

  // ── Pre-allocated vectors (avoid GC) ──────────────────────
  _tipLWorld : null,   // will be THREE.Vector3
  _tipRWorld : null,   // will be THREE.Vector3

  // ── Quality / LOD ────────────────────────────────────────
  oceanSize       : 600,
  oceanSegments   : 256,
  pixelRatioCap   : 1.5,
  quality         : 'med',     // 'low' | 'med' | 'high' | 'ultra' | 'max'
  autoQuality     : true,      // FPS-based auto-adjust active?
  sprayBudget     : 100,
  wakeBudget      : 50,
  streamerBudget  : 80,
  fbmOctaves      : 4,         // FBM noise octave count (3–6), set by quality preset
  detailLevel     : 1,         // vertex FBM detail (0=off, 1=partial, 2=full)
  renderScale     : 1.0,       // 0.25–1.0, controls internal render resolution
  shaderMode      : 'full',    // 'full' | 'performance'

  // ── Units ─────────────────────────────────────────
  units: 'mph',       // 'mph' | 'kph' | 'kts'

  // ── Foil preset ───────────────────────────────────
  foilPreset: 'lift',
  foilPresets: {
    grom:      { name:'Grom',        desc:'Beginner · stable, wide margin',      topSpeedMs:9.26,  stallSpeedMs:1.54, glide:1.1, pump:0.8,  drag:0.9,  stability:1.5, color:0x4488ff },
    lift:      { name:'Lift HA',     desc:'All-round · balanced',                topSpeedMs:11.32, stallSpeedMs:2.57, glide:0.8, pump:1.0,  drag:1.0,  stability:1.0, color:0xf0f0f0 },
    armstrong: { name:'Armstrong',   desc:'Performance · efficient, responsive', topSpeedMs:14.40, stallSpeedMs:3.09, glide:1.2, pump:1.2,  drag:0.85, stability:0.8, color:0x222222 },
    race:      { name:'Race HA',     desc:'Expert · fast, narrow margin',        topSpeedMs:18.00, stallSpeedMs:4.63, glide:1.4, pump:1.4,  drag:0.7,  stability:0.6, color:0xff4400 },
  },

  // ── Audio settings ────────────────────────────────
  audioSettings: { ambientOn:true, musicPlaying:false, musicFileName:'' },
};
