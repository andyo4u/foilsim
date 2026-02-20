// ──────────────────────────────────────────────────────────────
//  state.js  –  Shared mutable state for the hydrofoil simulator
//
//  Every module imports the single `state` object and reads /
//  writes properties on it.  This replaces the dozens of global
//  variables that lived in the original monolithic index.html.
// ──────────────────────────────────────────────────────────────

/* ── Constants ─────────────────────────────────────────────── */

export const OCEAN_SIZE = 800;
export const SEGMENTS   = 512;

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

  // ── Mini-Map ──────────────────────────────────────────────
  miniMapCanvas       : null,   // set from DOM
  miniMapCtx          : null,
  miniMapPath         : [],
  miniMapBgImage      : null,
  miniMapDirty        : true,
  miniMapFrameCounter : 0,
  mmapBounds          : null,

  // ── Particles ─────────────────────────────────────────────
  spParts   : [],   // spray particles
  wkHist    : [],   // wake history
  streamerL : null,
  streamerR : null,

  // ── Pre-allocated vectors (avoid GC) ──────────────────────
  _tipLWorld : null,   // will be THREE.Vector3
  _tipRWorld : null,   // will be THREE.Vector3
};
