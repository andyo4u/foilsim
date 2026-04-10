// ──────────────────────────────────────────────────────────────
//  main.js  –  Entry point for the hydrofoil simulator
//
//  Creates renderer, scene, camera, lights, sky, clouds.
//  Calls init functions from each module.
//  Contains the animate() loop and window.* bridge.
// ──────────────────────────────────────────────────────────────
//
// ╔═══════════════════════════════════════════════════════════════╗
// ║                    FUTURE IDEAS / ROADMAP                    ║
// ╠═══════════════════════════════════════════════════════════════╣
// ║                                                              ║
// ║  GAMEPLAY                                                    ║
// ║  • Power-ups: collectible items floating on the water that   ║
// ║    you ride over — turbo boost, energy refill, score mult,  ║
// ║    dolphin mode, ghost foil, giant mode, kraken boost,      ║
// ║    ice mode, ramp spawn, tailwind burst, grapple hook…      ║
// ║    (full list in foil.js TODO)                               ║
// ║  • Green power-up — "Pocket Highlights": riding over it      ║
// ║    turns on the pocket glow overlay for ~20s (uShowPocket)  ║
// ║    to help beginners find the energy sweet spot              ║
// ║  • Pinchy auto-features: AI assistant that detects rider     ║
// ║    skill level in real-time and automatically tweaks foil    ║
// ║    presets, wave difficulty, and tip messages to keep the    ║
// ║    session fun — a dynamic difficulty system with personality║
// ║  • Game loop: location-select menu → ride → score screen     ║
// ║  • Achievements system: unlock new locations, new render     ║
// ║    modes / visualization styles as rewards                   ║
// ║  • Jumping: ramp objects or wave-launch mechanic, air time   ║
// ║    tricks, landing physics                                   ║
// ║  • Spinning globe location picker: 3D Earth that the player  ║
// ║    spins to choose a location — pins light up as you unlock  ║
// ║    new spots. Click a pin → zoom in → start riding.          ║
// ║  • HELL: the final unlockable location. Lava ocean, fire     ║
// ║    sky, demon cliffs. You've earned it. 🔥                   ║
// ║                                                              ║
// ║  PHYSICS / CONTROLS                                          ║
// ║  • Lean-back brake turn: leaning back = tighter turn radius  ║
// ║    but lower speed (risk/reward carving mechanic)            ║
// ║  • Fix foil riding too high above the water – adjust         ║
// ║    rideH clamp / visual offset so board sits closer to       ║
// ║    the surface at normal speeds                              ║
// ║  • Wave energy regen now scales with slopeForce (fixed)      ║
// ║  • BUG: Board is too bouncy in high wind chop — add more     ║
// ║    smoothing / damping to rideH when chop amplitude is high  ║
// ║  • Easy / Pro modes: Easy = forgiving physics, auto-balance, ║
// ║    slower drain, gentle waves. Pro = realistic drag, tighter ║
// ║    energy budget, steeper waves, crash penalties.            ║
// ║                                                              ║
// ║  VISUALS                                                     ║
// ║  • Distant water: blend the flat far-plane water into the    ║
// ║    3-D wave mesh more seamlessly (LOD rings, horizon fade,   ║
// ║    or shader-based distant wave approximation)               ║
// ║  • Brighten satellite terrain texture so mountain features   ║
// ║    are more visible (adjust gamma / levels in the terrain    ║
// ║    fragment shader, or multiply diffuse by a boost factor)   ║
// ║  • Reduce wave tiling — waves look too repetitive / patterny ║
// ║    at distance. Add more octaves of noise, domain warping,   ║
// ║    or randomize gerstner phases/dirs to break up the grid    ║
// ║                                                              ║
// ║  PERFORMANCE                                                 ║
// ║  • Adaptive LOD: auto-detect FPS and dynamically adjust:     ║
// ║    – OCEAN_SIZE (shrink sim area if GPU-bound)               ║
// ║    – SEGMENTS (256→128 on mobile, 512 on desktop)            ║
// ║    – Pixel ratio (cap at 1 on low-end, 2 on high-end)       ║
// ║    – Fragment shader complexity (skip fbm detail at dist)    ║
// ║    – Particle counts (spray, wake, streamers)                ║
// ║    Target: maintain 60fps on desktop, 30fps floor on mobile  ║
// ║    Could expose a Quality slider: Low / Med / High / Ultra   ║
// ║  • Profile GPU vs CPU bottleneck — is it the 512x512 vertex  ║
// ║    shader, the fragment shader (11 render modes), or the     ║
// ║    CPU-side getWaveHeight() calls per frame?                 ║
// ║  • Mobile testing: verify on Android Chrome + iOS Safari,    ║
// ║    fix touch controls, handle orientation changes, test on   ║
// ║    low-end devices. Ensure touch input feels responsive.     ║
// ║                                                              ║
// ║  SOCIAL / INTEGRATIONS                                       ║
// ║  • Strava upload: unlockable feature — after a ride, export  ║
// ║    the GPS-style track + screenshot and upload to Strava     ║
// ║    as a virtual eFoil activity (use Strava API OAuth flow)   ║
// ║    Map the ride to a fun real-world location so it shows up  ║
// ║    on your Strava feed somewhere ridiculous (eFoiling across ║
// ║    Lake Geneva? Down the Amazon? Around Alcatraz?)           ║
// ║  • Backend data storage: server-side persistence for scores, ║
// ║    ride history, settings, and unlocks. Options: Firebase    ║
// ║    Firestore (fast, free tier), Supabase (Postgres + REST),  ║
// ║    or a simple Cloudflare Worker + KV store. Sync on login   ║
// ║    so progress follows the player across devices.            ║
// ║  • Music leaderboard: track which songs riders play most,    ║
// ║    most-played track wins featured placement in the UI.      ║
// ║    Could seed a curated "community playlist" shown in the    ║
// ║    settings panel. Requires opt-in and backend storage.      ║
// ║  • Collect feedback: in-game feedback button (thumb up/down  ║
// ║    + optional text) after each ride or in settings. POST to  ║
// ║    a lightweight backend (Formspree, Netlify Forms, or own   ║
// ║    Worker). Surface top requests in the roadmap.             ║
// ║  • Save progress: persist achievements, unlocked locations,  ║
// ║    unlocked render modes, best scores, lifetime stats,      ║
// ║    power-up inventory, and preferred settings to             ║
// ║    localStorage (or cloud save via backend for cross-device  ║
// ║    sync). Auto-save after each ride. (details in state.js)  ║
// ║                                                              ║
// ║  BUSINESS                                                    ║
// ║  • Polish a killer demo reel for sponsor outreach            ║
// ║  • Target eFoil brands (Lift, Fliteboard, Waydoo, Takuma)   ║
// ║    and surf/water-sports media for sponsorship               ║
// ║  • Consider embed-friendly widget mode for sponsor websites  ║
// ║                                                              ║
// ╚═══════════════════════════════════════════════════════════════╝

import { state } from './state.js';
import { updateVal, toggleControls, getVal, cacheAllSliders, applyPreset, showToast,
         copySettings, copySettingsJSON, lerp, smoothstep, degToDir,
         convertSpeedToMs, convertSpeedFromMs, formatSpeed, formatDistance, setUnits } from './helpers.js';
import { initAudio, updateAudio, toggleAmbient, loadLocalMusic, stopMusic, fadeOutMusic, onFoilStart, loadRandomTrackIfNeeded } from './audio.js';
import { initOcean, updateEnvMap, getWaveHeight, getWaveSlope, getSwellHeight,
         getSwellSlope, setRenderMode, updateWaveChart, rebuildOceanGeometry } from './ocean.js';
import { initFoil, emitSpray, updateSpray, updateWake, updateStreamer, toggleFreeCam, updateCamera, applyFoilPreset } from './foil.js';
import { initTerrain, rebuildTerrain, restartLevel, getRealTerrainHeight,
         RT_WATER_Y, RT_WORLD_W, RT_WORLD_D, terrainConfigs } from './terrain.js';
import { onTutorialStart, updateTutorial, endTutorial } from './tutorial.js';

// ═══════════════════════════
// THREE.JS CORE SETUP
// ═══════════════════════════

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.65;
renderer.setClearColor(new THREE.Color(0.55, 0.70, 0.85)); // match ocean uFogColor so beyond-mesh is horizon, not black
document.body.appendChild(renderer.domElement);
state.renderer = renderer;

function updateRendererSize() {
  const scale = state.renderScale;
  const w = Math.floor(window.innerWidth * scale);
  const h = Math.floor(window.innerHeight * scale);
  renderer.setSize(w, h, false);
  renderer.domElement.style.width  = window.innerWidth + 'px';
  renderer.domElement.style.height = window.innerHeight + 'px';
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

const scene = new THREE.Scene();
state.scene = scene;

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 20000);
state.camera = camera;

const ambLight = new THREE.AmbientLight(0x8899bb, 0.6);
scene.add(ambLight);
state.ambLight = ambLight;

const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
dirLight.position.set(50, 80, -60);
scene.add(dirLight);
state.dirLight = dirLight;

// ═══════════════════════════
// SKY — Preetham atmospheric scattering via THREE.Sky
// ═══════════════════════════

const sky = new THREE.Sky();
sky.scale.setScalar(4500);
scene.add(sky);
state.sky = sky;

const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 4;
skyUniforms['rayleigh'].value = 2;
skyUniforms['mieCoefficient'].value = 0;
skyUniforms['mieDirectionalG'].value = 0;
state.skyUniforms = skyUniforms;

// ═══════════════════════════
// CLOUDS — procedural FBM on a dome
// ═══════════════════════════

const cloudMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  transparent: true,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 0.4, -1).normalize() },
    uCloudCover: { value: 0.45 },
    uCloudBright: { value: 1.0 }
  },
  vertexShader: `
    varying vec3 vWP;
    void main(){
      vWP = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 uSunDir;
    uniform float uTime, uCloudCover, uCloudBright;
    varying vec3 vWP;

    // Hash & noise
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f*f*(3.0-2.0*f);
      float a = hash(i), b = hash(i+vec2(1,0));
      float c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
      return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      mat2 rot = mat2(0.8,-0.6,0.6,0.8);
      for(int i=0; i<5; i++){
        v += a * noise(p);
        p = rot * p * 2.0;
        a *= 0.5;
      }
      return v;
    }

    void main(){
      vec3 d = normalize(vWP);
      // Only render above horizon
      if(d.y < 0.01){ discard; }

      // Project onto a flat plane at height 1.0 for stable cloud UVs
      vec2 uv = d.xz / d.y;

      // Drift clouds slowly
      float t = uTime * 0.008;
      vec2 st = uv * 1.8 + vec2(t, t * 0.4);

      // FBM cloud density
      float n = fbm(st);
      float density = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.3, n);

      // Sunlit cloud coloring
      float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
      vec3 bright = vec3(1.0, 0.97, 0.92) * uCloudBright;
      vec3 dark = vec3(0.55, 0.58, 0.65) * uCloudBright;
      vec3 col = mix(dark, bright, 0.5 + 0.5 * sunDot);

      // Sun-side glow on cloud edges
      col += vec3(1.0, 0.85, 0.5) * pow(sunDot, 8.0) * 0.3 * density;

      // Fade near horizon to prevent hard edge
      float horizFade = smoothstep(0.01, 0.15, d.y);
      // Fade at high elevation (clouds stay near horizon/mid-sky)
      float topFade = 1.0 - smoothstep(0.4, 0.9, d.y);

      float alpha = density * horizFade * topFade * 0.85;
      gl_FragColor = vec4(col, alpha);
    }`
});
const cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(3500, 64, 32), cloudMat);
scene.add(cloudMesh);
state.cloudMat = cloudMat;
state.cloudMesh = cloudMesh;

// ═══════════════════════════
// INIT MODULES
// ═══════════════════════════

// Cache slider values before any module tries to read them
cacheAllSliders();

// Init order matters: ocean before terrain (rebuildTerrain uses oceanMat via Promise)
initOcean();
initFoil();
initTerrain();

// Power-up glow is now shader-driven (no separate mesh needed)

// Audio init on first user interaction
['click', 'keydown', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, initAudio, { once: true });
});

// Mobile detection — enable touch pads, gear button
const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
state.isMobile = isMobile;
if (isMobile) {
  document.body.classList.add('mobile-device');
  document.querySelectorAll('.touch-pad').forEach(p => p.classList.add('mobile-active'));
}

// Populate version displays from the hidden version label
{
  const ver = document.getElementById('version-label').textContent;
  const mv = document.getElementById('menu-version');
  const sv = document.getElementById('score-version');
  if (mv) mv.textContent = ver;
  if (sv) sv.textContent = ver;
}

// ═══════════════════════════
// QUALITY / LOD
// ═══════════════════════════

const QUALITY_PRESETS = {
  low:   { oceanSegments: 128,  oceanSize: 400,  pixelRatioCap: 1,   renderScale: 0.50, shaderMode: 'performance', sprayBudget: 50,  wakeBudget: 30, streamerBudget: 40,  fbmOctaves: 3, detailLevel: 0 },
  med:   { oceanSegments: 192,  oceanSize: 600,  pixelRatioCap: 1,   renderScale: 0.75, shaderMode: 'performance', sprayBudget: 100, wakeBudget: 50, streamerBudget: 80,  fbmOctaves: 4, detailLevel: 1 },
  high:  { oceanSegments: 384,  oceanSize: 800,  pixelRatioCap: 2,   renderScale: 1.0,  shaderMode: 'full',        sprayBudget: 150, wakeBudget: 65, streamerBudget: 100, fbmOctaves: 5, detailLevel: 2 },
  ultra: { oceanSegments: 512,  oceanSize: 800,  pixelRatioCap: 2,   renderScale: 1.0,  shaderMode: 'full',        sprayBudget: 200, wakeBudget: 80, streamerBudget: 120, fbmOctaves: 5, detailLevel: 2 },
  max:   { oceanSegments: 1000, oceanSize: 1200, pixelRatioCap: 2,   renderScale: 1.0,  shaderMode: 'full',        sprayBudget: 200, wakeBudget: 80, streamerBudget: 120, fbmOctaves: 6, detailLevel: 2 },
};

const QUALITY_LEVELS = ['low', 'med', 'high', 'ultra', 'max'];

function setQuality(level) {
  if (level === 'auto') {
    state.autoQuality = true;
    // Start auto from current level
    return;
  }
  state.autoQuality = false;

  const preset = QUALITY_PRESETS[level];
  if (!preset) return;

  const needsRebuild = (
    state.oceanSegments !== preset.oceanSegments ||
    state.oceanSize !== preset.oceanSize
  );

  // Apply all quality properties to state
  state.quality        = level;
  state.oceanSegments  = preset.oceanSegments;
  state.oceanSize      = preset.oceanSize;
  state.pixelRatioCap  = preset.pixelRatioCap;
  state.renderScale    = preset.renderScale;
  state.sprayBudget    = preset.sprayBudget;
  state.wakeBudget     = preset.wakeBudget;
  state.streamerBudget = preset.streamerBudget;
  state.fbmOctaves     = preset.fbmOctaves;
  state.detailLevel    = preset.detailLevel;

  // Apply shader mode (without disabling auto — only manual overrides do that)
  state.shaderMode = preset.shaderMode;
  if (state.oceanMat) {
    state.oceanMat.uniforms.uPerfMode.value = (preset.shaderMode === 'performance') ? 1.0 : 0.0;
  }
  const perfBtn = document.getElementById('sbShaderPerf');
  const fullBtn = document.getElementById('sbShaderFull');
  if (perfBtn) perfBtn.classList.toggle('active-preset', preset.shaderMode === 'performance');
  if (fullBtn) fullBtn.classList.toggle('active-preset', preset.shaderMode === 'full');

  // Apply pixel ratio
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, state.pixelRatioCap));

  // Apply render scale
  updateRendererSize();
  const rsSlider = document.getElementById('sbRenderScale');
  const rsLabel  = document.getElementById('renderScaleLabel');
  if (rsSlider) rsSlider.value = Math.round(state.renderScale * 100);
  if (rsLabel)  rsLabel.textContent = Math.round(state.renderScale * 100) + '%';

  // Rebuild ocean geometry if size or segments changed
  if (needsRebuild) {
    rebuildOceanGeometry();
  }

  // Trim wake history if it exceeds new budget
  while (state.wkHist.length > state.wakeBudget) state.wkHist.pop();

  // Update the dropdown to reflect current level
  const sel = document.getElementById('sbQuality');
  if (sel && sel.value !== level && sel.value !== 'auto') sel.value = level;

  // Sync ocean size slider
  const osSlider = document.getElementById('sbOceanSize');
  const osLabel  = document.getElementById('oceanSizeLabel');
  if (osSlider) osSlider.value = preset.oceanSize;
  if (osLabel)  osLabel.textContent = preset.oceanSize;
}

// ── Fine-tune overrides (disable auto-quality when used manually) ──

function setShaderMode(mode) {
  state.shaderMode = mode;
  if (state.oceanMat) {
    state.oceanMat.uniforms.uPerfMode.value = (mode === 'performance') ? 1.0 : 0.0;
  }
  if (mode === 'performance') {
    renderer.setPixelRatio(1);
  } else {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, state.pixelRatioCap));
  }
  const perfBtn = document.getElementById('sbShaderPerf');
  const fullBtn = document.getElementById('sbShaderFull');
  if (perfBtn) perfBtn.classList.toggle('active-preset', mode === 'performance');
  if (fullBtn) fullBtn.classList.toggle('active-preset', mode === 'full');
  state.autoQuality = false;
}

function setRenderScale(val) {
  state.renderScale = Math.max(0.25, Math.min(1.0, val));
  updateRendererSize();
  const label = document.getElementById('renderScaleLabel');
  if (label) label.textContent = Math.round(state.renderScale * 100) + '%';
  state.autoQuality = false;
}

function setOceanSize(val) {
  val = Math.max(200, Math.min(1200, val));
  const label = document.getElementById('oceanSizeLabel');
  if (label) label.textContent = val;
  if (state.oceanSize === val) return;
  state.oceanSize = val;
  rebuildOceanGeometry();
  state.autoQuality = false;
}

// Start with Auto quality — begin from low on mobile, med on desktop, then scale up
// Start at medium with performance shader tuned for slower PCs
setQuality('med');
state.oceanSize = 500;
state.renderScale = 0.90;
rebuildOceanGeometry();
setShaderMode('performance');
// Sync UI controls
const _osSlider = document.getElementById('sbOceanSize');
const _osLabel = document.getElementById('oceanSizeLabel');
if (_osSlider) _osSlider.value = 500;
if (_osLabel) _osLabel.textContent = '500';
const _rsSlider = document.getElementById('sbRenderScale');
const _rsLabel = document.getElementById('renderScaleLabel');
if (_rsSlider) _rsSlider.value = 90;
if (_rsLabel) _rsLabel.textContent = '90%';
updateRendererSize();

// ═══════════════════════════
// WINDOW.* BRIDGE — expose functions for inline HTML event handlers
// ═══════════════════════════

function openSettings() {
  document.getElementById('settings-overlay').style.display = 'flex';
  document.querySelectorAll('.settings-foil-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.foil === state.foilPreset));
  document.querySelectorAll('.settings-unit-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.unit === state.units));
  const amb = document.getElementById('settings-ambient-toggle');
  if (amb) amb.checked = state.audioSettings.ambientOn;
}
function closeSettings() {
  document.getElementById('settings-overlay').style.display = 'none';
}

function exitToMenu() {
  fadeOutMusic(1500);
  if (state.activeBgPreset === 'tutorial') {
    endTutorial();   // handles its own phase cleanup + shows menu
  } else {
    document.getElementById('exit-btn').style.display = 'none';
    document.getElementById('hud-timer').style.display = 'none';
    document.getElementById('hud-boost').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('menu-overlay').classList.remove('hidden');
    state.gamePhase = 'menu';
  }
}

window.updateVal         = updateVal;
window.toggleControls    = toggleControls;
window.applyPreset       = applyPreset;
window.rebuildTerrain    = rebuildTerrain;
window.restartLevel      = restartLevel;
window.copySettings      = copySettings;
window.copySettingsJSON  = copySettingsJSON;
window.toggleFreeCam     = toggleFreeCam;
window.setRenderMode     = setRenderMode;
window.setQuality        = setQuality;
window.setShaderMode     = setShaderMode;
window.setRenderScale    = setRenderScale;
window.setOceanSize      = setOceanSize;
window.openSettings    = openSettings;
window.closeSettings   = closeSettings;
window.setUnits        = setUnits;
window.applyFoilPreset = applyFoilPreset;
window.toggleAmbient   = toggleAmbient;
window.loadLocalMusic  = loadLocalMusic;
window.stopMusic       = stopMusic;
window.exitToMenu      = exitToMenu;

// ═══════════════════════════
// GAME LOOP — Menu → Ride → Score
// ═══════════════════════════

function startRide(locationPreset) {
  // Reset score & timer
  state.rideTimer = 120;
  state.rideStarted = false; // timer doesn't tick until first pump
  foilMusicTriggered = false;
  state.score.distance = 0;
  state.score.topSpeed = 0;
  state.score.topSpeedMs = 0;
  state.score.pocketTime = 0;
  state.score.total = 0;
  state.infoBarFadeTimer = 0;
  state._swell3ShoreH = undefined;   // reset shore-swell so it re-inits from preset
  state._shoreCheckTick = 0;
  state._shoreDist = 999;

  // Reset power-up
  const pu = state.powerUp;
  pu.active = false;
  pu.boostActive = false;
  pu.boostTimer = 0;
  pu.spawnTimer = 15 + Math.random() * 10; // first spawn 15-25s in
  if (state.oceanMat) state.oceanMat.uniforms.uPowerUpActive.value = 0;
  const eb = state.energyBoost;
  eb.active = false;
  eb.hudTimer = 0;
  eb.spawnTimer = 30 + Math.random() * 10; // first spawn 30-40s in
  if (state.oceanMat) state.oceanMat.uniforms.uEnergyBoostActive.value = 0;

  // Load location and restart
  rebuildTerrain(locationPreset);
  restartLevel();

  // Tutorial: apply gentle wave/physics preset after terrain build
  if (locationPreset === 'tutorial') {
    onTutorialStart();
  }

  // Track starting position
  state.ridePrevX = state.foil.x;
  state.ridePrevZ = state.foil.z;

  // Auto-load a random track from music/ if user hasn't picked one.
  // Music waits for first foil liftoff (onFoilStart) before playing.
  loadRandomTrackIfNeeded();

  // UI transitions
  const isTutorial = locationPreset === 'tutorial';
  document.getElementById('menu-overlay').classList.add('hidden');
  document.getElementById('score-overlay').classList.add('hidden');
  document.getElementById('hud-timer').style.display = isTutorial ? 'none' : 'block';
  document.getElementById('hud-timer').classList.remove('warning');
  document.getElementById('hud-timer').textContent = '2:00';
  document.getElementById('hud-boost').style.display = 'none';
  document.getElementById('info-bar').style.opacity = '';
  document.getElementById('exit-btn').style.display = 'flex';
  document.getElementById('hud').style.display = 'block';

  state.gamePhase = 'riding';
  console.log('[startRide] HUD shown, gamePhase=riding');
}

function endRide() {
  state.gamePhase = 'score';
  document.getElementById('hud').style.display = 'none';

  // Fade out music over 2s
  fadeOutMusic(2000);

  // Compute final score
  const s = state.score;
  s.total = Math.round(s.distance + 2 * s.pocketTime + 10 * (s.topSpeedMs * 2.23694));

  // Populate score overlay
  document.getElementById('score-distance').textContent = formatDistance(s.distance);
  document.getElementById('score-topspeed').textContent = formatSpeed(s.topSpeedMs);
  document.getElementById('score-pocket').textContent = s.pocketTime.toFixed(1) + 's';
  document.getElementById('score-total').textContent = s.total;

  // Show score overlay, hide timer and exit
  document.getElementById('score-overlay').classList.remove('hidden');
  document.getElementById('hud-timer').style.display = 'none';
  document.getElementById('hud-boost').style.display = 'none';
  document.getElementById('exit-btn').style.display = 'none';
}

function rideAgain() {
  document.getElementById('score-overlay').classList.add('hidden');
  document.getElementById('menu-overlay').classList.remove('hidden');
  document.getElementById('exit-btn').style.display = 'none';
  state.gamePhase = 'menu';
}

window.startRide = startRide;
window.rideAgain = rideAgain;
window.endTutorial = endTutorial;

// ═══════════════════════════
// MAIN LOOP
// ═══════════════════════════

const clock = new THREE.Clock();
let pumpPhase = 0, sprayT = 0;
let prevSunAngle = -1, prevSunDir = -1;

// Surfer animation — smoothed procedural values
let surferLeanZ = 0;    // counter-lean for roll (radians)
let surferLeanX = 0;    // forward/back lean for accel/brake (radians)
let surferCrouch = 0;   // knee bend 0-1 (scales Y)
let surferHeadY = 0;    // head turn into turns (radians)
let foilMusicTriggered = false;

// FPS counter
let fpsFrames = 0, fpsLastTime = performance.now();
const fpsLabel = document.getElementById('fps-label');
const hudFps = document.getElementById('hud-fps');
let fpsAvgSum = 0, fpsAvgCount = 0; // running average

// FPS graph history (120 samples × 500ms = 60 seconds)
const fpsHistory = [];
const FPS_HISTORY_MAX = 120;
const fpsGraphCanvas = document.getElementById('fps-graph');
const fpsGraphCtx = fpsGraphCanvas ? fpsGraphCanvas.getContext('2d') : null;
const hudFpsGraphCanvas = document.getElementById('hud-fps-graph');
const hudFpsGraphCtx = hudFpsGraphCanvas ? hudFpsGraphCanvas.getContext('2d') : null;

function drawFpsGraph(ctx, w, h) {
  if (!ctx || fpsHistory.length < 2) return;
  ctx.clearRect(0, 0, w, h);

  const maxFps = Math.max(65, ...fpsHistory);
  const minFps = Math.min(...fpsHistory);
  const count = fpsHistory.length;
  const stepX = w / (FPS_HISTORY_MAX - 1);

  // Fill area under curve
  ctx.beginPath();
  const startX = w - (count - 1) * stepX;
  ctx.moveTo(startX, h);
  for (let i = 0; i < count; i++) {
    const x = startX + i * stepX;
    const y = h - ((fpsHistory[i] - 0) / maxFps) * (h - 2);
    if (i === 0) ctx.lineTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(startX + (count - 1) * stepX, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(74, 232, 138, 0.15)';
  ctx.fill();

  // Draw line
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x = startX + i * stepX;
    const y = h - ((fpsHistory[i] - 0) / maxFps) * (h - 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  const lastFps = fpsHistory[count - 1];
  ctx.strokeStyle = lastFps < 30 ? '#ff4444' : lastFps < 50 ? '#ffaa33' : '#4ae88a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 60 fps reference line
  const y60 = h - (60 / maxFps) * (h - 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(0, y60);
  ctx.lineTo(w, y60);
  ctx.stroke();
  ctx.setLineDash([]);

  // Min/max labels
  ctx.font = '7px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(Math.round(minFps), 2, h - 2);
  ctx.fillText(Math.round(maxFps), 2, 7);
}

// Auto-quality FPS tracking
let autoQFrames = [];
const AUTO_Q_WINDOW    = 8;    // 500ms samples → 4 seconds of data
const AUTO_Q_DOWN_FPS  = 35;   // step down if avg below this (was 45 — less trigger-happy)
const AUTO_Q_UP_FPS    = 52;   // step up if avg comfortably above this
const AUTO_Q_UP_HOLD   = 8;    // consecutive above-thresh samples before stepping up (~4s)
const AUTO_Q_INTERVAL  = 5000; // minimum ms between quality changes (was 8s — faster settling)
let autoQUpCount = 0;
let autoQLastChange = performance.now() - AUTO_Q_INTERVAL; // allow first check immediately

// DOM refs for shallow water
const shallowWarningEl = document.getElementById('shallow-warning');
const restartBtnEl = document.getElementById('restart-btn');

// Pano constants (match terrain.js)
const PANO_ANGLE = Math.PI;
const PANO_DIST = 1600;

// Loading screen → menu transition: triggered after 2 rendered frames so GL
// shaders have time to compile before the scene is revealed.
let _readyFrames = 0;

// Shore-proximity swell: scan outward in 8 directions to find nearest land.
// Returns distance in metres; 999 if no land within 300 m (or no terrain data).
function _getShoreDistM(px, pz) {
  if (!state.realTerrainHeightData) return 999;
  const wY = RT_WATER_Y();
  for (let r = 25; r <= 300; r += 25) {
    for (let a = 0; a < 8; a++) {
      const th = (a / 8) * Math.PI * 2;
      const h = getRealTerrainHeight(px + Math.cos(th) * r, pz + Math.sin(th) * r);
      if (h !== null && h > wY + 2) return r;
    }
  }
  return 999;
}

function animate() {
  requestAnimationFrame(animate);

  // FPS measurement
  fpsFrames++;
  const fpsNow = performance.now();
  if (fpsNow - fpsLastTime >= 500) {
    const fps = Math.round(fpsFrames / ((fpsNow - fpsLastTime) / 1000));
    fpsLabel.textContent = fps + ' fps';
    fpsAvgSum += fps; fpsAvgCount++;
    const avgFps = Math.round(fpsAvgSum / fpsAvgCount);
    hudFps.textContent = fps + ' fps (avg ' + avgFps + ')';
    fpsFrames = 0; fpsLastTime = fpsNow;

    // Record history and draw graphs
    fpsHistory.push(fps);
    if (fpsHistory.length > FPS_HISTORY_MAX) fpsHistory.shift();
    if (fpsGraphCanvas) drawFpsGraph(fpsGraphCtx, fpsGraphCanvas.width, fpsGraphCanvas.height);
    if (hudFpsGraphCanvas) drawFpsGraph(hudFpsGraphCtx, hudFpsGraphCanvas.width, hudFpsGraphCanvas.height);

    // Auto-quality adjustment
    if (state.autoQuality) {
      autoQFrames.push(fps);
      if (autoQFrames.length > AUTO_Q_WINDOW) autoQFrames.shift();

      if (autoQFrames.length >= AUTO_Q_WINDOW) {
        const avgFps = autoQFrames.reduce((a, b) => a + b, 0) / autoQFrames.length;
        const curIdx = QUALITY_LEVELS.indexOf(state.quality);
        const nowQ = performance.now();

        if (nowQ - autoQLastChange >= AUTO_Q_INTERVAL) {
          if (avgFps < AUTO_Q_DOWN_FPS && curIdx > 0) {
            setQuality(QUALITY_LEVELS[curIdx - 1]);
            state.autoQuality = true;  // re-enable (setQuality disables it)
            autoQFrames.length = 0;
            autoQUpCount = 0;
            autoQLastChange = nowQ;
          } else if (avgFps > AUTO_Q_UP_FPS && curIdx < QUALITY_LEVELS.length - 1) {
            autoQUpCount++;
            if (autoQUpCount >= AUTO_Q_UP_HOLD) {
              setQuality(QUALITY_LEVELS[curIdx + 1]);
              state.autoQuality = true;  // re-enable
              autoQFrames.length = 0;
              autoQUpCount = 0;
              autoQLastChange = nowQ;
            }
          } else {
            autoQUpCount = 0;
          }
        }
      }
    }
  }

  const dt = Math.min(clock.getDelta(), .05);
  const t = clock.getElapsedTime();

  // Skip heavy rendering on menu/score screens — show splash faster
  if (state.gamePhase === 'menu' || state.gamePhase === 'score') {
    renderer.render(scene, camera);
    // Dismiss loading screen after first render
    if (_readyFrames < 2) {
      _readyFrames++;
      if (_readyFrames === 2) {
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('menu-overlay').classList.remove('hidden');
      }
    }
    return;
  }

  const u = state.oceanMat.uniforms;
  u.uTime.value = t;
  u.uCamPos.value.copy(camera.position);
  u.uFbmOctaves.value = state.fbmOctaves;
  u.uDetailLevel.value = state.detailLevel != null ? state.detailLevel : 2;
  u.uSurfaceDetail.value = getVal('sbSurfaceDetail') != null ? getVal('sbSurfaceDetail') : 1.0;

  // Sun direction
  const sa = getVal('sunAngle') * Math.PI / 180, sd = getVal('sunDir') * Math.PI / 180;
  const sv = new THREE.Vector3(Math.cos(sa) * Math.sin(sd), Math.sin(sa), Math.cos(sa) * Math.cos(sd)).normalize();
  u.uSunDir.value.copy(sv);

  // Update sky + cloud sun direction
  skyUniforms['sunPosition'].value.copy(sv);

  // Regenerate env map when sun changes
  const curSA = getVal('sunAngle'), curSD = getVal('sunDir');
  if (curSA !== prevSunAngle || curSD !== prevSunDir || state.envDirty) {
    prevSunAngle = curSA; prevSunDir = curSD;
    state.envDirty = false;
    updateEnvMap();
  }

  cloudMat.uniforms.uSunDir.value.copy(sv);
  cloudMat.uniforms.uTime.value = t;
  cloudMat.uniforms.uCloudCover.value = getVal('cloudCover');
  dirLight.position.set(sv.x * 80, sv.y * 80, sv.z * 80);

  // Dynamic lighting
  const sunElev = sv.y;
  const sunBright = smoothstep(0, 0.25, sunElev);
  cloudMat.uniforms.uCloudBright.value = 0.4 + sunBright * 0.6;
  dirLight.intensity = 0.2 + sunBright * 1.6;
  const warmth = 1.0 - smoothstep(0, 0.35, sunElev);
  dirLight.color.setRGB(1.0, lerp(0.95, 0.55, warmth), lerp(0.92, 0.3, warmth));
  ambLight.intensity = 0.15 + sunBright * 0.55;

  // Dynamic fog color — match Preetham sky horizon brightness (linear 1.5-2.0+ at low sun).
  // warmth ≈ 1 at low sun, ≈ 0 at noon. Values must survive ACES at 0.65 exposure.
  u.uFogColor.value.setRGB(
    lerp(0.50, 0.50, sunBright) + warmth * 1.20,   // low sun: ~1.7, noon: ~0.50
    lerp(0.35, 0.65, sunBright) + warmth * 0.60,   // low sun: ~0.95, noon: ~0.65
    lerp(0.30, 0.90, sunBright) - warmth * 0.15    // low sun: ~0.15, noon: ~0.90
  );
  u.uFogSunColor.value.setRGB(
    lerp(1.2, 1.0, sunBright),    // bright warm sun glow at horizon
    lerp(0.7, 0.85, sunBright),
    lerp(0.2, 0.70, sunBright)
  );
  // Keep clear color in sync so beyond-mesh areas match horizon (sky addon covers most of it)
  renderer.setClearColor(u.uFogColor.value);

  // Terrain uniforms — share fog/sun with ocean
  state.silhouetteMat.uniforms.uSunDir.value.copy(sv);
  state.silhouetteMat.uniforms.uFogColor.value.copy(u.uFogColor.value);
  state.silhouetteMat.uniforms.uFogSunColor.value.copy(u.uFogSunColor.value);
  state.cliffMat.uniforms.uSunDir.value.copy(sv);
  state.cliffMat.uniforms.uCamPos.value.copy(camera.position);
  state.cliffMat.uniforms.uFogColor.value.copy(u.uFogColor.value);
  state.cliffMat.uniforms.uFogSunColor.value.copy(u.uFogSunColor.value);

  // Panoramic photo backdrop uniforms + positioning
  if (state.panoCylinder) {
    state.panoMat.uniforms.uSunDir.value.copy(sv);
    state.panoMat.uniforms.uCamPos.value.copy(camera.position);
    state.panoMat.uniforms.uFogColor.value.copy(u.uFogColor.value);
    state.panoMat.uniforms.uFogSunColor.value.copy(u.uFogSunColor.value);
  }

  // Real terrain uniforms
  if (state.realTerrainMesh) {
    state.realTerrainMat.uniforms.uSunDir.value.copy(sv);
    state.realTerrainMat.uniforms.uCamPos.value.copy(camera.position);
    state.realTerrainMat.uniforms.uFogColor.value.copy(u.uFogColor.value);
    state.realTerrainMat.uniforms.uFogSunColor.value.copy(u.uFogSunColor.value);
  }

  // Swell uniforms
  u.uChopHeight.value = getVal('chopHeight');
  const cdir = degToDir(getVal('chopDir')); u.uChopDir.value.set(cdir.x, cdir.y);
  const s1 = degToDir(getVal('swell1Dir')); u.uSwell1.value.set(s1.x, s1.y, getVal('swell1Period'), getVal('swell1Height'));
  const s2 = degToDir(getVal('swell2Dir')); u.uSwell2.value.set(s2.x, s2.y, getVal('swell2Period'), getVal('swell2Height'));
  const s3 = degToDir(getVal('swell3Dir')); u.uSwell3.value.set(s3.x, s3.y, getVal('swell3Period'), getVal('swell3Height'));
  u.uSwellSpeed.value.set(convertSpeedToMs(getVal('swell1Speed')), convertSpeedToMs(getVal('swell2Speed')), convertSpeedToMs(getVal('swell3Speed')));
  const sy = sv.y, db = smoothstep(0, .5, sy);

  // Water colors
  u.uDeepColor.value.set(lerp(.01, 0, db), lerp(.02, .04, db), lerp(.06, .12, db));
  u.uShallowColor.value.set(lerp(.02, 0, db), lerp(.06, .15, db), lerp(.12, .3, db));

  const cam = state.cam;

  // ── FOIL PHYSICS (only during ride) ──
  if (state.gamePhase === 'riding') {
  const foil = state.foil;
  const input = state.input;

  // Banking turn
  const maxRoll = 0.55;
  let targetRoll = 0;
  if (input.left)  targetRoll = -maxRoll;
  if (input.right) targetRoll =  maxRoll;
  const rollRate = 6.0 * getVal('sbStability');
  foil.roll = lerp(foil.roll, targetRoll, 1 - Math.exp(-rollRate * dt));

  const turnBoost = (input.down && Math.abs(foil.roll) > 0.01) ? 1.2 : 1.0;
  const turnFromRoll = foil.roll * 2.2 * getVal('sbTurnSpeed') * Math.min(1, foil.speed / 4) * turnBoost;
  foil.heading -= turnFromRoll * dt;

  let wH = getWaveHeight(foil.x, foil.z, t);
  if (state.realTerrainMesh) wH += RT_WATER_Y();
  const slope = getWaveSlope(foil.x, foil.z, t);
  const mx = Math.sin(foil.heading), mz = Math.cos(foil.heading);
  const slopeDot = mx * slope.dhdx + mz * slope.dhdz;
  const crossSlope = Math.abs(-mz * slope.dhdx + mx * slope.dhdz);

  // Wave energy from swells only
  const swellSlope = getSwellSlope(foil.x, foil.z, t);
  const swellSlopeDot = mx * swellSlope.dhdx + mz * swellSlope.dhdz;
  const swellCrossSlope = Math.abs(-mz * swellSlope.dhdx + mx * swellSlope.dhdz);

  // Pocket strength — compute early so physics can use it for speed cap
  const s1h_phys = getVal('swell1Height');
  const swellH_phys = getSwellHeight(foil.x, foil.z, t);
  const swellSlopeLen = Math.sqrt(swellSlope.dhdx * swellSlope.dhdx + swellSlope.dhdz * swellSlope.dhdz);
  const nxz_phys = swellSlopeLen > 0.001 ? [-swellSlope.dhdx / swellSlopeLen, -swellSlope.dhdz / swellSlopeLen] : [0, 0];
  const s1dir_phys = degToDir(getVal('swell1Dir'));
  const hFactor_phys = smoothstep(-s1h_phys * 0.1, s1h_phys * 0.35, swellH_phys);
  const crestFade_phys = 1 - smoothstep(s1h_phys * 0.4, s1h_phys * 0.85, swellH_phys);
  const faceDot_phys = nxz_phys[0] * s1dir_phys.x + nxz_phys[1] * s1dir_phys.y;
  const faceFactor_phys = smoothstep(0.08, 0.35, faceDot_phys);
  const pocketStrength = hFactor_phys * crestFade_phys * faceFactor_phys;

  const waveE = getVal('sbWaveEnergy');
  let slopeForce = -swellSlopeDot * 3.25 * waveE;
  const rollFactor = Math.abs(foil.roll) / maxRoll;
  if (rollFactor > 0.05) {
    slopeForce += swellCrossSlope * 2.35 * waveE * rollFactor * Math.min(1, foil.speed / 5);
  }

  // Foiling state
  const stallMs = convertSpeedToMs(getVal('sbStallSpeed'));
  const isF = foil.speed > stallMs;
  if (isF && !foilMusicTriggered) { foilMusicTriggered = true; onFoilStart(); }

  // Tutorial phase machine (only active when tutorial location is selected)
  updateTutorial(dt, foil.speed, stallMs);

  // Pitch
  const autoPitch = isF ? -0.05 : 0;
  foil.pitch = lerp(foil.pitch, autoPitch, dt * 3 * getVal('sbStability'));

  // Energy system
  // Energy passively regens at a low baseline rate. When slopeForce > 0
  // (foil is on the downhill face of a swell — especially the pocket) the
  // wave feeds extra energy into the battery, making it actually useful.
  const maxEnergy = getVal('sbBatteryCap');
  const drainMul = getVal('sbBatteryDrain');
  const waveRegen = 0.015 + Math.max(0, slopeForce) * 0.035;
  foil.energy = Math.min(maxEnergy, foil.energy + waveRegen * dt);

  let pf = 0;
  const isPump = input.up && !input.down;
  const isPowerPump = input.up && input.down;
  const isBoost = input.pump;
  const pumpMul = getVal('sbPumpPower');

  // Wave-assisted pump: pump is more effective when riding a wave face.
  // slopeForce > 0 = downhill swell face; highest in the pocket.
  // Pocket (slopeForce ≈ 1.75) gives ~1.7× boost; max capped at 2.5×.
  // REF: https://foilien.com/foilphysics/ — pumpfoil dynamics simulator
  const wavePumpBoost = Math.min(2.5, 1.0 + Math.max(0, slopeForce) * 0.40);

  if (isBoost) {
    pf += 1.8;
  }

  // Start ride timer on first pump input
  if ((isPump || isPowerPump) && !state.rideStarted) {
    state.rideStarted = true;
  }

  if (isPump && foil.energy > 0.02) {
    pumpPhase += dt * 9;
    const pumpCost = 0.36 * drainMul * dt;
    foil.energy = Math.max(0, foil.energy - pumpCost);
    pf += 3.0 * pumpMul * wavePumpBoost * Math.min(1, foil.energy * 5);
    foil.pitch += Math.sin(pumpPhase * 2) * 0.08;
  } else if (isPowerPump && foil.energy > 0.05) {
    pumpPhase += dt * 12;
    const powerCost = 0.70 * drainMul * dt;
    foil.energy = Math.max(0, foil.energy - powerCost);
    pf += 5.5 * pumpMul * wavePumpBoost * Math.min(1, foil.energy * 4);
    foil.pitch += Math.sin(pumpPhase * 2) * 0.15;
  } else {
    pumpPhase *= 0.9;
  }

  // Brake
  const isBrake = input.down && !input.up;
  if (isBrake) {
    foil.pitch = lerp(foil.pitch, 0.25, dt * 5);
    pf -= 2.0;
  }

  // Drag & wind
  const baseDrag = isF ? .35 : .7;
  const drag = baseDrag * getVal('sbDrag') / getVal('sbGlide');

  const windSpeedMs = convertSpeedToMs(getVal('sbWindSpeed'));
  const windDirRad = (getVal('sbWindDir') + 180) * Math.PI / 180;
  const windX = Math.sin(windDirRad) * windSpeedMs;
  const windZ = Math.cos(windDirRad) * windSpeedMs;
  const windDot = mx * windX + mz * windZ;
  const windForce = windDot * (isF ? 0.06 : 0.03);

  foil.speed += (slopeForce + pf + windForce) * dt;
  foil.speed -= drag * dt;
  const speedCapMs = convertSpeedToMs(getVal('sbTopSpeed'));
  // Pocket top speed: pumping or turning in the pocket allows higher speed.
  // When leaving the pocket, speed decays gradually back to normal top speed.
  const pocketCapMs = convertSpeedToMs(getVal('sbPocketSpeed'));
  const inPocket = pocketStrength > 0.4;
  const isPumpingOrTurning = isPump || isPowerPump || isBoost || Math.abs(foil.roll) > 0.05;
  if (inPocket && isPumpingOrTurning && pocketCapMs > speedCapMs) {
    // In the pocket — allow up to pocket speed
    foil.speed = Math.max(0, Math.min(foil.speed, pocketCapMs));
  } else if (foil.speed > speedCapMs) {
    // Above normal cap but out of pocket — decay gently back down
    foil.speed = Math.max(speedCapMs, foil.speed - (foil.speed - speedCapMs) * 1.5 * dt);
  } else {
    foil.speed = Math.max(0, Math.min(foil.speed, speedCapMs));
  }

  // Ride height scales with speed: barely lifts off at stall (~6cm), rises to ~60cm at top speed.
  // Wing tip only breaches the surface at ~77%+ of top speed with full roll — "fast and turning."
  const speedFrac = Math.max(0, Math.min(1, (foil.speed - stallMs) / Math.max(1, speedCapMs - stallMs)));
  const tgtRH = isF ? 0.06 + 0.54 * Math.pow(speedFrac, 1.2) + foil.pitch * 0.4 : -0.04;
  foil.rideH = lerp(foil.rideH, tgtRH, dt * (isF ? 3 : 6));

  foil.x += mx * foil.speed * dt;
  foil.z += mz * foil.speed * dt;

  // Land / shallow water collision
  if (state.realTerrainMesh && state.realTerrainHeightData) {
    const terrH = getRealTerrainHeight(foil.x, foil.z);
    if (terrH !== null && terrH > RT_WATER_Y() + 3) {
      foil.x -= mx * foil.speed * dt;
      foil.z -= mz * foil.speed * dt;
      foil.speed *= 0.1;
      if (!state.shallowStalled) {
        state.shallowStalled = true;
        state.shallowTimer = 0;
        shallowWarningEl.classList.add('show');
      }
    }
  }
  if (state.shallowStalled) {
    state.shallowTimer += dt;
    if (state.shallowTimer >= 5) shallowWarningEl.classList.remove('show');
    if (state.shallowTimer >= 10) restartBtnEl.style.display = 'block';
  }

  // Shore-proximity swell: swell3Height rises to 1.5 m within 100 m of shore,
  // falls to 0.1 m beyond 250 m.  Only active in real-terrain modes.
  if (state.realTerrainHeightData) {
    // Throttle the shore-distance scan to every 30 frames (~0.5 s)
    state._shoreCheckTick = (state._shoreCheckTick || 0) + 1;
    if (state._shoreCheckTick >= 30) {
      state._shoreCheckTick = 0;
      state._shoreDist = _getShoreDistM(foil.x, foil.z);
    }
    const dist = state._shoreDist ?? 999;
    // Map distance → target height (1.5 m close, 0.1 m far)
    const CLOSE = 100, FAR = 250;
    const t = Math.max(0, Math.min(1, (dist - CLOSE) / (FAR - CLOSE)));
    const target = lerp(1.5, 0.1, t);
    // Init from slider on first run
    if (state._swell3ShoreH === undefined) state._swell3ShoreH = getVal('swell3Height');
    // Linear ramp: 20 s to travel the full 0.1→1.5 range
    const MAX_RATE = (1.5 - 0.1) / 20;
    const diff = target - state._swell3ShoreH;
    state._swell3ShoreH += Math.sign(diff) * Math.min(Math.abs(diff), MAX_RATE * dt);
    state.cachedParams['swell3Height'] = state._swell3ShoreH;
  }

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
      fu.uCamPos.value.copy(camera.position);

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
  const bY = wH + foil.rideH;
  state.foilGroup.position.set(foil.x, bY, foil.z);
  state.foilGroup.rotation.set(0, foil.heading, 0);
  const cs = -mz * slope.dhdx + mx * slope.dhdz;
  state.modelGroup.rotation.x = foil.roll + Math.atan(cs) * 0.3;
  state.modelGroup.rotation.z = foil.pitch - Math.atan(slopeDot) * 0.4;

  // ── Surfer procedural animation ─────────────────────────
  if (state.surferContainer) {
    const sc = state.surferContainer;
    const smoothRate = 1 - Math.exp(-4 * dt); // ~4Hz smoothing

    // 1. Counter-lean with roll — surfer leans opposite to board tilt
    const targetLeanZ = -foil.roll * 0.6;
    surferLeanZ = lerp(surferLeanZ, targetLeanZ, smoothRate);

    // 2. Forward lean when accelerating, back lean when braking
    const accel = (foil.speed - (foil.prevSpeed || 0)) / Math.max(dt, 0.001);
    const targetLeanX = -Math.max(-0.15, Math.min(0.15, accel * 0.03));
    surferLeanX = lerp(surferLeanX, targetLeanX, smoothRate);

    // 3. Knee bend — crouch during pumps + absorb chop
    const pumpCrouch = (isPump || isPowerPump) ? 0.06 : 0;
    const chopCrouch = Math.min(0.04, Math.abs(slopeDot) * 0.08);
    const targetCrouch = pumpCrouch + chopCrouch;
    surferCrouch = lerp(surferCrouch, targetCrouch, smoothRate);

    // 4. Head turn — look into turns
    const targetHeadY = -foil.roll * 0.4;
    surferHeadY = lerp(surferHeadY, targetHeadY, smoothRate * 0.7);

    // Apply — rotations are additive on top of rest pose (-19° Y)
    const restY = -19 * Math.PI / 180;
    sc.rotation.set(surferLeanX, restY + surferHeadY, surferLeanZ);
    // Knee bend via slight Y scale reduction (crouch compresses)
    sc.scale.set(1.25, 1.25 * (1 - surferCrouch), 1.25);
  }

  // Spray
  sprayT += dt;
  if (foil.speed > 3 && sprayT > .03) {
    sprayT = 0;
    const si = Math.floor(Math.min(8, (foil.speed - 3) * .8));
    emitSpray(foil.x - mx * .9, bY, foil.z - mz * .9, -mx * foil.speed * .3, 1 + foil.speed * .1, -mz * foil.speed * .3, si);
  }
  updateSpray(dt);

  // Wake
  if (foil.speed > 1.5) state.wkHist.unshift({ x: foil.x - mx, y: bY - foil.rideH + .05, z: foil.z - mz });
  while (state.wkHist.length > state.wakeBudget) state.wkHist.pop();
  updateWake();

  // Wingtip streamers
  state.foilGroup.updateMatrixWorld(true);
  state.tipL.getWorldPosition(state._tipLWorld);
  state.tipR.getWorldPosition(state._tipRWorld);
  updateStreamer(state.streamerL, state._tipLWorld.x, state._tipLWorld.y, state._tipLWorld.z, foil.speed);
  updateStreamer(state.streamerR, state._tipRWorld.x, state._tipRWorld.y, state._tipRWorld.z, foil.speed);

  // HUD
  document.getElementById('hud-speed').textContent = convertSpeedFromMs(foil.speed).toFixed(1);

  // Acceleration indicator
  const accelEl = document.getElementById('hud-accel');
  const speedDelta = foil.speed - foil.prevSpeed;
  const threshold = 0.005;
  if (speedDelta > threshold) {
    accelEl.textContent = '▲';
    accelEl.style.color = '#5ee8a0';
    accelEl.style.opacity = Math.min(1, Math.abs(speedDelta) * 20);
  } else if (speedDelta < -threshold) {
    accelEl.textContent = '▼';
    accelEl.style.color = '#ff6b6b';
    accelEl.style.opacity = Math.min(1, Math.abs(speedDelta) * 20);
  } else {
    accelEl.style.opacity = '0.3';
    accelEl.textContent = '—';
    accelEl.style.color = '#6a94c0';
  }

  // Status
  const st = document.getElementById('hud-status');
  if (foil.energy / getVal('sbBatteryCap') <= 0.10) {
    st.textContent = '⛽ Gassed';
    st.style.color = '#ff6040';
  } else if (foil.speed <= 0.3) {
    st.textContent = '⚠ STALLED';
    st.style.color = '#ff5555';
  } else if (foil.speed < 2.5) {
    st.textContent = 'Hull Speed';
    st.style.color = '#c09060';
  } else if (isF) {
    st.textContent = '🏄 Foiling!';
    st.style.color = '#80e0c0';
  } else {
    st.textContent = 'Accelerating...';
    st.style.color = '#a0b8d0';
  }

  foil.prevSpeed = foil.speed;

  // Energy bar
  const ePct = Math.round((foil.energy / getVal('sbBatteryCap')) * 100);
  const eBar = document.getElementById('hud-energy-bar');
  const eTxt = document.getElementById('hud-energy-text');
  eBar.style.width = Math.min(100, ePct) + '%';
  eTxt.textContent = ePct + '%';
  if (foil.energy / getVal('sbBatteryCap') > 0.5) {
    eBar.style.background = 'linear-gradient(90deg,#4ae88a,#5ef0a0)';
    eTxt.style.color = '#6a94c0';
  } else if (foil.energy / getVal('sbBatteryCap') > 0.2) {
    eBar.style.background = 'linear-gradient(90deg,#e8c44a,#f0d060)';
    eTxt.style.color = '#c0a050';
  } else {
    eBar.style.background = 'linear-gradient(90deg,#e85050,#f06060)';
    eTxt.style.color = '#e06060';
  }

  // Wave energy meter
  const s1h = getVal('swell1Height'), s1p = getVal('swell1Period');
  const s2h = getVal('swell2Height'), s2p = getVal('swell2Period');
  const s3h = getVal('swell3Height'), s3p = getVal('swell3Period');
  function maxSlope(h, p) { return h > 0.01 ? h * 6.2832 / (1.56 * p * p) : 0; }
  const maxSlopeSum = (maxSlope(s1h, s1p) + maxSlope(s1h * 0.22, s1p * 0.7)
    + maxSlope(s2h, s2p) + maxSlope(s2h * 0.2, s2p * 0.65)
    + maxSlope(s3h, s3p)) * 3.25;
  const dynamicMax = Math.max(0.05, maxSlopeSum * 0.85);

  // pocketStrength already computed in physics section above

  const swBar = document.getElementById('hud-swell-bar');
  // Combine slopeForce with pocket strength: in the pocket pushes toward max
  const rawNorm = slopeForce / dynamicMax;
  // When in pocket with positive slope, boost toward 1.0
  // When out of pocket, show raw slope force
  const pocketBoost = pocketStrength * Math.max(0, rawNorm);
  const blended = rawNorm + pocketBoost * (1.0 - Math.abs(rawNorm));
  const normSwell = Math.max(-1, Math.min(1, blended));
  const absSwell = Math.abs(normSwell);
  const pct = absSwell * 50;
  if (normSwell >= 0) {
    swBar.style.left = '50%';
    swBar.style.width = pct + '%';
    swBar.style.background = absSwell > 0.7 ? 'linear-gradient(90deg,#2ee87a,#60ffc0)' : 'linear-gradient(90deg,#3ad080,#5ef0a0)';
  } else {
    swBar.style.left = (50 - pct) + '%';
    swBar.style.width = pct + '%';
    swBar.style.background = absSwell > 0.7 ? 'linear-gradient(90deg,#ff3030,#e85050)' : 'linear-gradient(90deg,#f05555,#e83a3a)';
  }

  // "In the Pocket!" message
  const pocketEl = document.getElementById('hud-pocket');
  if (normSwell > 0.8 && foil.speed > 3) {
    pocketEl.classList.add('show');
  } else {
    pocketEl.classList.remove('show');
  }

  // Audio
  updateAudio(slopeForce, normSwell, foil.speed);

  // Wave chart — pass net energy flow and pocket strength
  updateWaveChart(wH, slopeDot, normSwell, pocketStrength);

  foil.prevWH = wH;

  // ── POWER-UP: Spawn, Collect, Boost — DISABLED (code preserved for future re-enabling) ──
  // TODO: Re-enable power-ups — change `if (false &&` → `if (` and restore speed-cap ternary:
  //       const speedCap = state.powerUp.boostActive ? speedCapMs * 1.5 : speedCapMs;
  //       Polish: spawn sound FX, HUD countdown, balance intervals, animate disc glow.
  //
  // TODO: Green power-up — "Pocket Highlights" activator
  //       Green glowing disc on the water. Riding over it sets uShowPocket=1 on
  //       state.oceanMat for ~20s, helping riders visually locate the pocket.
  //       Fade uShowPocket back to 0 smoothly after timer expires.
  //       Spawn cadence: once per ~60s, never during tutorial.
  if (false && state.activeBgPreset !== 'tutorial') {
    const pu = state.powerUp;

    // Spawn timer — only when no orb visible and not boosting
    if (!pu.active && !pu.boostActive) {
      pu.spawnTimer -= dt;
      if (pu.spawnTimer <= 0) {
        // Spawn 60-100m ahead, 30-60m to one side (requires turning)
        const ahead = 60 + Math.random() * 40;
        const lateral = (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 30);
        const fwd_x = Math.sin(foil.heading);
        const fwd_z = Math.cos(foil.heading);
        pu.x = foil.x + fwd_x * ahead + fwd_z * lateral;
        pu.z = foil.z + fwd_z * ahead - fwd_x * lateral;
        pu.active = true;
        pu.nextSpawnDelay = 20 + Math.random() * 15;
        // Activate shader glow
        const puU = state.oceanMat.uniforms;
        puU.uPowerUpPos.value.set(pu.x, 0, pu.z);
        puU.uPowerUpActive.value = 1;
      }
    }

    // Collection check — distance < 6m
    if (pu.active) {
      const cdx = foil.x - pu.x;
      const cdz = foil.z - pu.z;
      if (Math.sqrt(cdx * cdx + cdz * cdz) < 6) {
        pu.active = false;
        state.oceanMat.uniforms.uPowerUpActive.value = 0;
        pu.boostActive = true;
        pu.boostTimer = pu.boostDuration;
        document.getElementById('hud-boost').style.display = 'block';
      }
    }

    // Active boost
    if (pu.boostActive) {
      foil.speed += pu.boostAmount * dt;
      // Allow exceeding top speed by 1.5x during boost
      const boostCap = convertSpeedToMs(getVal('sbTopSpeed')) * 1.5;
      foil.speed = Math.min(foil.speed, boostCap);

      pu.boostTimer -= dt;
      document.getElementById('hud-boost').textContent = 'VORTEX ' + pu.boostTimer.toFixed(1) + 's';

      // Extra spray during boost
      if (foil.speed > 3 && Math.random() < 0.5) {
        emitSpray(
          foil.x - mx * 1.5, bY + 0.3, foil.z - mz * 1.5,
          -mx * foil.speed * 0.5 + (Math.random() - 0.5) * 2,
          2 + foil.speed * 0.15,
          -mz * foil.speed * 0.5 + (Math.random() - 0.5) * 2,
          Math.floor(Math.min(8, foil.speed * 0.6))
        );
      }

      if (pu.boostTimer <= 0) {
        pu.boostActive = false;
        pu.boostTimer = 0;
        pu.spawnTimer = pu.nextSpawnDelay;
        document.getElementById('hud-boost').style.display = 'none';
      }
    }

    // ── ENERGY BOOST power-up (yellow disc, +75% energy) ──
    const eb = state.energyBoost;

    if (!eb.active) {
      eb.spawnTimer -= dt;
      if (eb.spawnTimer <= 0) {
        const ahead = 50 + Math.random() * 40;
        const lateral = (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 35);
        const fwd_x = Math.sin(foil.heading);
        const fwd_z = Math.cos(foil.heading);
        eb.x = foil.x + fwd_x * ahead + fwd_z * lateral;
        eb.z = foil.z + fwd_z * ahead - fwd_x * lateral;
        eb.active = true;
        eb.nextSpawnDelay = 30 + Math.random() * 15;
        const ebU = state.oceanMat.uniforms;
        ebU.uEnergyBoostPos.value.set(eb.x, 0, eb.z);
        ebU.uEnergyBoostActive.value = 1;
      }
    }

    if (eb.active) {
      const edx = foil.x - eb.x;
      const edz = foil.z - eb.z;
      if (Math.sqrt(edx * edx + edz * edz) < 6) {
        eb.active = false;
        state.oceanMat.uniforms.uEnergyBoostActive.value = 0;
        const cap = getVal('sbBatteryCap');
        foil.energy = Math.min(foil.energy + cap * 0.75, cap);
        eb.hudTimer = eb.hudDuration;
        eb.spawnTimer = eb.nextSpawnDelay;
        document.getElementById('hud-energy-boost').style.display = 'block';
      }
    }

    if (eb.hudTimer > 0) {
      eb.hudTimer -= dt;
      if (eb.hudTimer <= 0) {
        eb.hudTimer = 0;
        document.getElementById('hud-energy-boost').style.display = 'none';
      }
    }
  }

  // ── RIDE TIMER & SCORING ──
  // Timer countdown — only starts after first pump (skipped in tutorial)
  if (state.activeBgPreset !== 'tutorial') {
    if (state.rideStarted) {
      state.rideTimer -= dt;
      if (state.rideTimer <= 0) { state.rideTimer = 0; endRide(); }
    }
    const mins = Math.floor(state.rideTimer / 60);
    const secs = Math.floor(state.rideTimer % 60);
    const timerEl = document.getElementById('hud-timer');
    timerEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
    if (state.rideTimer <= 10) timerEl.classList.add('warning');
  }

  // Distance tracking
  const dx = foil.x - state.ridePrevX;
  const dz = foil.z - state.ridePrevZ;
  state.score.distance += Math.sqrt(dx * dx + dz * dz);
  state.ridePrevX = foil.x;
  state.ridePrevZ = foil.z;

  // Top speed tracking
  if (foil.speed > state.score.topSpeedMs) state.score.topSpeedMs = foil.speed;

  // Pocket time tracking
  if (normSwell > 0.8 && foil.speed > 3) state.score.pocketTime += dt;

  // Info bar fade after 10 seconds of riding
  state.infoBarFadeTimer += dt;
  if (state.infoBarFadeTimer > 10) {
    const fadeProgress = Math.min(1, (state.infoBarFadeTimer - 10) / 2);
    document.getElementById('info-bar').style.opacity = 1 - fadeProgress;
  }

  } // end gamePhase === 'riding'

  // Camera
  if (!cam.drag && !cam.free) cam.offsetTheta *= 0.97;
  cam.followSmooth = Math.abs(state.foil.roll) > 0.1 ? 0.08 : 0.04;
  updateCamera();

  // Center sky, clouds, silhouettes on camera
  sky.position.copy(camera.position);
  cloudMesh.position.copy(camera.position);
  state.silhouetteMesh.position.x = camera.position.x;
  state.silhouetteMesh.position.z = camera.position.z;

  // Photo backdrop follows camera
  if (state.panoCylinder) {
    state.panoCylinder.position.x = camera.position.x + Math.sin(PANO_ANGLE) * PANO_DIST;
    state.panoCylinder.position.z = camera.position.z + Math.cos(PANO_ANGLE) * PANO_DIST;
  }

  renderer.render(scene, camera);
}

animate();

// ═══════════════════════════
// RESIZE
// ═══════════════════════════

window.addEventListener('resize', () => {
  updateRendererSize();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, state.pixelRatioCap));
});
