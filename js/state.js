// ──────────────────────────────────────────────────────────────
//  state.js  –  Shared mutable state for the hydrofoil simulator
//
//  Every module imports the single `state` object and reads /
//  writes properties on it.  This replaces the dozens of global
//  variables that lived in the original monolithic index.html.
// ──────────────────────────────────────────────────────────────
//
//  TODO: Game state — add properties for:
//        • achievements: { unlocked: Set, progress: Map }
//        • powerUps: [] (active power-up instances in the scene)
//        • gamePhase: 'menu' | 'riding' | 'score' | 'paused'
//        • score: { distance, airTime, tricks, total }
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

  // ── Particles ─────────────────────────────────────────────
  spParts   : [],   // spray particles
  wkHist    : [],   // wake history
  streamerL : null,
  streamerR : null,

  // ── Pre-allocated vectors (avoid GC) ──────────────────────
  _tipLWorld : null,   // will be THREE.Vector3
  _tipRWorld : null,   // will be THREE.Vector3

  // ── Quality / LOD ────────────────────────────────────────
  oceanSize       : 800,
  oceanSegments   : 512,
  pixelRatioCap   : 2,
  quality         : 'ultra',   // 'low' | 'med' | 'high' | 'ultra'
  autoQuality     : false,     // FPS-based auto-adjust active?
  sprayBudget     : 200,
  wakeBudget      : 80,
  streamerBudget  : 120,
};
