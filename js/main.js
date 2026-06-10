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
import { initAudio, updateAudio, toggleAmbient, loadLocalMusic, stopMusic, fadeOutMusic, fadeOutMusicPreview, loadRandomTrackIfNeeded, playTrack } from './audio.js';
import { initOcean, updateEnvMap, setRenderMode, updateWaveChart, rebuildOceanGeometry } from './ocean.js';
import { initFoil, emitSpray, toggleFreeCam, updateCamera, applyFoilPreset } from './foil.js';
import { initTerrain, rebuildTerrain, restartLevel,
         RT_WATER_Y, RT_WORLD_W, RT_WORLD_D, terrainConfigs } from './terrain.js';
import { submitScore, fetchTopScores, renderLeaderboard, getUsername, setUsername, incrementRideCount } from './leaderboard.js';
import { onTutorialStart, endTutorial } from './tutorial.js';
import { registerActions, initUI } from './ui.js';
import { initPerf, updateFpsStats } from './systems/perf.js';
import { initPhysics, resetRideFlags, updatePhysics } from './systems/physics.js';
import { updateWorldFollow } from './systems/world.js';
import { updateSurfer } from './systems/surfer.js';
import { updateParticles } from './systems/particles.js';
import { updateHUD } from './systems/hud.js';
import { initScoring, updateScoring } from './systems/scoring.js';

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

// Sandbox button — only for dev IP
fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => {
  state.isSandbox = d.ip === '47.7.16.31';
}).catch(() => { state.isSandbox = false; });

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
  low:   { oceanSegments: 128,  oceanSize: 400,  pixelRatioCap: 1,   renderScale: 0.50, shaderMode: 'performance', sprayBudget: 50,  wakeBudget: 60,  streamerBudget: 40,  fbmOctaves: 3, detailLevel: 0 },
  med:   { oceanSegments: 192,  oceanSize: 600,  pixelRatioCap: 1,   renderScale: 0.75, shaderMode: 'performance', sprayBudget: 100, wakeBudget: 100, streamerBudget: 80,  fbmOctaves: 4, detailLevel: 1 },
  high:  { oceanSegments: 384,  oceanSize: 800,  pixelRatioCap: 2,   renderScale: 1.0,  shaderMode: 'full',        sprayBudget: 150, wakeBudget: 150, streamerBudget: 100, fbmOctaves: 5, detailLevel: 2 },
  ultra: { oceanSegments: 512,  oceanSize: 800,  pixelRatioCap: 2,   renderScale: 1.0,  shaderMode: 'full',        sprayBudget: 200, wakeBudget: 200, streamerBudget: 120, fbmOctaves: 5, detailLevel: 2 },
  max:   { oceanSegments: 1000, oceanSize: 1200, pixelRatioCap: 2,   renderScale: 1.0,  shaderMode: 'full',        sprayBudget: 200, wakeBudget: 200, streamerBudget: 120, fbmOctaves: 6, detailLevel: 2 },
};

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
  fadeOutMusicPreview();
}

function exitToMenu() {
  fadeOutMusic(1500);
  if (state.activeBgPreset === 'tutorial') {
    endTutorial();   // handles its own phase cleanup + shows menu
  } else {
    document.getElementById('exit-btn').style.display = 'none';
    document.getElementById('sandbox-btn').style.display = 'none';
    document.getElementById('hud-timer').style.display = 'none';
    document.getElementById('hud-boost').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    state.cam.intro = null;
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
window.playTrack       = playTrack;
function showLeaderboard() {
  document.getElementById('leaderboard-overlay').classList.remove('hidden');
  const el = document.getElementById('lb-content');
  if (el) el.innerHTML = '<div style="color:#5ea8d8;text-align:center;padding:20px;">Loading...</div>';
  fetchTopScores(10).then(scores => { if (el) renderLeaderboard(scores, el); });
}
function closeLeaderboard() {
  document.getElementById('leaderboard-overlay').classList.add('hidden');
  // If coming from a ride (score phase), go back to menu
  if (state.gamePhase === 'score') {
    document.getElementById('menu-overlay').classList.remove('hidden');
    state.gamePhase = 'menu';
  }
}
function submitRideScore() {
  const btn = document.getElementById('score-submit-btn');
  const statusEl = document.getElementById('score-submit-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
  if (statusEl) statusEl.textContent = '';
  // Save username from input before submitting
  const nameInput = document.getElementById('score-username');
  if (nameInput) setUsername(nameInput.value);
  const submittedScore = state.score.total;
  const submittedName = getUsername();
  submitScore(state.score).then(ok => {
    if (!ok) {
      if (statusEl) statusEl.textContent = 'Could not submit score';
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Score'; }
      return;
    }
    // Switch to leaderboard overlay
    document.getElementById('score-overlay').classList.add('hidden');
    document.getElementById('leaderboard-overlay').classList.remove('hidden');
    const el = document.getElementById('lb-content');
    if (el) el.innerHTML = '<div style="color:#5ea8d8;text-align:center;padding:20px;">Loading...</div>';
    fetchTopScores(10).then(scores => {
      if (el) renderLeaderboard(scores, el, submittedName, submittedScore);
    });
  });
}
window.showLeaderboard = showLeaderboard;
window.updateUsername  = function(val) { setUsername(val); };
window.closeLeaderboard = closeLeaderboard;
window.submitRideScore = submitRideScore;
window.exitToMenu      = exitToMenu;

// ═══════════════════════════
// GAME LOOP — Menu → Ride → Score
// ═══════════════════════════

function startRide(locationPreset) {
  // Bump per-device ride counter (reported with score submission)
  incrementRideCount();

  // Reset score & timer
  state.rideTimer = 120;
  state.rideStarted = false; // timer doesn't tick until first pump
  resetRideFlags(); // physics-owned: music trigger, has-foiled flag, stall timer
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
  const isRufus = locationPreset === 'rufus-real';
  document.getElementById('menu-overlay').classList.add('hidden');
  document.getElementById('score-overlay').classList.add('hidden');
  document.getElementById('hud-timer').style.display = isTutorial ? 'none' : 'block';
  document.getElementById('hud-timer').classList.remove('warning');
  document.getElementById('hud-timer').textContent = '2:00';
  document.getElementById('hud-boost').style.display = 'none';
  document.getElementById('info-bar').style.opacity = '';

  if (isRufus) {
    // Show leaderboard during Rufus load — after scores render, display for 5s
    const lb = document.getElementById('leaderboard-overlay');
    const lbContent = document.getElementById('lb-content');
    const lbBack = document.getElementById('lb-back-btn');
    const lbMsg = document.getElementById('lb-loading-msg');
    if (lbContent) lbContent.innerHTML = '<div style="color:#5ea8d8;text-align:center;padding:20px;">Loading...</div>';
    if (lbBack) lbBack.style.display = 'none';
    if (lbMsg) lbMsg.style.display = 'block';
    lb.classList.remove('hidden');
    // Hide HUD/exit until leaderboard dismisses
    document.getElementById('exit-btn').style.display = 'none';
    document.getElementById('sandbox-btn').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    // Freeze camera during leaderboard
    state.cam.intro = 'leaderboard';
    state.cam.introT = 0;
    const dismiss = () => {
      lb.classList.add('hidden');
      if (lbBack) lbBack.style.display = '';
      if (lbMsg) lbMsg.style.display = 'none';
      document.getElementById('exit-btn').style.display = 'flex';
      document.getElementById('sandbox-btn').style.display = state.isSandbox ? 'flex' : 'none';
      document.getElementById('hud').style.display = 'block';
      // Kick off intro cam sequence: face → spin back
      state.cam.intro = 'face';
      state.cam.introT = 0;
    };
    // Wait for scores to render, then show for 5s. Fallback: dismiss after 10s max.
    let dismissed = false;
    const safety = setTimeout(() => { if (!dismissed) { dismissed = true; dismiss(); } }, 10000);
    fetchTopScores(10).then(scores => {
      if (lbContent) renderLeaderboard(scores, lbContent);
      setTimeout(() => {
        if (!dismissed) { dismissed = true; clearTimeout(safety); dismiss(); }
      }, 5000);
    }).catch(() => {
      setTimeout(() => {
        if (!dismissed) { dismissed = true; clearTimeout(safety); dismiss(); }
      }, 5000);
    });
  } else {
    document.getElementById('exit-btn').style.display = 'flex';
    document.getElementById('sandbox-btn').style.display = state.isSandbox ? 'flex' : 'none';
    document.getElementById('hud').style.display = 'block';
    state.cam.intro = null;
  }

  state.gamePhase = 'riding';
}

function endRide() {
  state.gamePhase = 'score';
  document.getElementById('hud').style.display = 'none';

  // Fade out music over 2s
  fadeOutMusic(2000);

  // Compute final score
  const s = state.score;
  s.rideTimer = 120 - state.rideTimer; // elapsed time in seconds
  s.total = Math.round(s.distance + 2 * s.pocketTime + 10 * (s.topSpeedMs * 2.23694));

  // Populate score overlay
  document.getElementById('score-distance').textContent = formatDistance(s.distance);
  document.getElementById('score-topspeed').textContent = formatSpeed(s.topSpeedMs);
  document.getElementById('score-pocket').textContent = s.pocketTime.toFixed(1) + 's';
  document.getElementById('score-total').textContent = s.total;

  // Pre-fill username from localStorage
  const usernameInput = document.getElementById('score-username');
  if (usernameInput) usernameInput.value = getUsername();

  // Show score overlay, hide timer and exit
  document.getElementById('score-overlay').classList.remove('hidden');
  document.getElementById('hud-timer').style.display = 'none';
  document.getElementById('hud-boost').style.display = 'none';
  document.getElementById('exit-btn').style.display = 'none';
  document.getElementById('sandbox-btn').style.display = 'none';

  // Reset submit button and hide leaderboard until submitted
  const submitBtn = document.getElementById('score-submit-btn');
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Score'; submitBtn.style.display = ''; }
  const statusEl = document.getElementById('score-submit-status');
  if (statusEl) statusEl.textContent = '';
  const lbEl = document.getElementById('score-leaderboard');
  if (lbEl) lbEl.innerHTML = '';
}

function rideAgain() {
  document.getElementById('score-overlay').classList.add('hidden');
  document.getElementById('menu-overlay').classList.remove('hidden');
  document.getElementById('exit-btn').style.display = 'none';
  document.getElementById('sandbox-btn').style.display = 'none';
  state.gamePhase = 'menu';
}

window.startRide = startRide;
window.rideAgain = rideAgain;
window.endTutorial = endTutorial;

// ═══════════════════════════
// UI ACTION REGISTRY — delegated data-attribute wiring (js/ui.js).
// Replaces the inline onclick/oninput/onchange attributes; the window.*
// bridge above remains only until the migration completes.
// ═══════════════════════════

registerActions({
  // Controls panel
  'toggle-controls':    () => toggleControls(),
  'apply-preset':       (arg, el) => applyPreset(arg, el),
  'rebuild-terrain':    (arg) => rebuildTerrain(arg),
  'restart-level':      () => restartLevel(),
  'copy-settings':      () => copySettings(),
  'copy-settings-json': () => copySettingsJSON(),
  'set-shader-mode':    (arg) => setShaderMode(arg),

  // Settings overlay
  'open-settings':      () => openSettings(),
  'close-settings':     () => closeSettings(),
  'set-units':          (arg) => setUnits(arg),
  'apply-foil-preset':  (arg) => applyFoilPreset(arg),
  'play-track':         (arg, el) => playTrack(arg, el),
  'stop-music':         () => stopMusic(),

  // Game flow
  'start-ride':         (arg) => startRide(arg),
  'ride-again':         () => rideAgain(),
  'exit-to-menu':       () => exitToMenu(),
  'end-tutorial':       () => endTutorial(),
  'restart-ride':       () => restartLevel(),

  // Leaderboard + score
  'show-leaderboard':   () => showLeaderboard(),
  'close-leaderboard':  () => closeLeaderboard(),
  'submit-ride-score':  () => submitRideScore(),

  // About overlay
  'show-about':         () => document.getElementById('about-overlay').classList.remove('hidden'),
  'close-about':        () => document.getElementById('about-overlay').classList.add('hidden'),

  // Sliders + selects (data-input / data-change)
  'update-val':         (arg, el) => updateVal(el),
  'set-render-scale':   (arg, el) => setRenderScale(+el.value / 100),
  'set-ocean-size':     (arg, el) => setOceanSize(+el.value),
  'set-quality':        (arg, el) => setQuality(el.value),
  'set-render-mode':    (arg, el) => setRenderMode(el.value),
  'toggle-free-cam':    (arg, el) => toggleFreeCam(el.checked),
  'load-local-music':   (arg, el) => loadLocalMusic(el.files[0]),
  'update-username':    (arg, el) => setUsername(el.value),
  'toggle-fps-graph':   (arg, el) => { document.getElementById('hud-fps-graph').style.display = el.checked ? 'block' : 'none'; },
  'toggle-wave-chart':  (arg, el) => { document.getElementById('wave-chart').style.display = el.checked ? 'block' : 'none'; },
});
initUI();

// ═══════════════════════════
// MAIN LOOP
// ═══════════════════════════

const clock = new THREE.Clock();
let prevSunAngle = -1, prevSunDir = -1;

// Per-frame systems live in js/systems/. setQuality and endRide are injected
// because they touch main-owned resources (renderer, score overlay) — keeps
// the module graph acyclic.
initPerf({ setQuality });
initPhysics({ endRide });
initScoring({ endRide });

// Pano constants (match terrain.js)
const PANO_ANGLE = Math.PI;
const PANO_DIST = 1600;

// Loading screen → menu transition: triggered after 2 rendered frames so GL
// shaders have time to compile before the scene is revealed.
let _readyFrames = 0;

// ═══════════════════════════
// PER-FRAME SYSTEMS — called from animate() in fixed order.
// Order is load-bearing: physics → world follow → surfer → particles → HUD →
// audio/chart → power-ups → scoring → camera. Systems share one per-frame
// record (`fr`) built by updatePhysics().
// ═══════════════════════════

// Sun, sky, clouds, fog, dynamic lighting, and the shared ocean/terrain uniforms
function updateEnvironment(t) {
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
  u.uDeepColor.value.set(lerp(.02, .01, db), lerp(.05, .08, db), lerp(.10, .18, db));
  u.uShallowColor.value.set(lerp(.04, .02, db), lerp(.12, .22, db), lerp(.20, .38, db));
}

// Power-up spawn/collect/boost (currently disabled via `if (false &&`)
function updatePowerups(dt, fr) {
  const { foil, mx, mz, bY } = fr;

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
}


// Follow cam, free cam, and the Rufus intro cam sequence
function updateCameraFollow(dt) {
  const cam = state.cam;

  // Camera
  if (!cam.drag && !cam.free) cam.offsetTheta *= 0.97;
  cam.followSmooth = Math.abs(state.foil.roll) > 0.1 ? 0.08 : 0.04;

  // Rufus intro cam sequence (leaderboard → face-on → spin back)
  if (cam.intro) {
    cam.introT = (cam.introT || 0) + dt;
    const foil = state.foil;
    const fg = state.foilGroup;
    if (cam.intro === 'leaderboard') {
      // Hold a pleasant overhead-ish view on the rider, no spin
      const h = foil.heading;
      cam.theta = h + Math.PI;
      cam.phi = 0.35;
      cam.dist = 25.6;
      cam.offsetTheta = 0;
      updateCamera();
    } else if (cam.intro === 'face') {
      // Camera in front of rider, close to water level — looking at surfer face
      const h = foil.heading;
      const dist = 4.5;
      const camX = fg.position.x + Math.sin(h) * dist;
      const camZ = fg.position.z + Math.cos(h) * dist;
      const camY = Math.max(RT_WATER_Y() + 0.6, fg.position.y + 0.4);
      camera.position.set(camX, camY, camZ);
      camera.lookAt(fg.position.x, fg.position.y + 0.8, fg.position.z);
      // Sync cam.theta so the subsequent spin starts from the right place
      cam.theta = h;
      cam.phi = 0.05;
      cam.dist = dist;
      cam.offsetTheta = 0;
      if (cam.introT >= 2.5) {
        cam.intro = 'spin';
        cam.introT = 0;
        cam._spinFromTheta = h;           // in-front angle
        cam._spinToTheta   = h + Math.PI; // behind angle
        cam._spinFromPhi = 0.05;
        cam._spinFromDist = dist;
      }
    } else if (cam.intro === 'spin') {
      const DUR = 2.5;
      const t = Math.min(1, cam.introT / DUR);
      // easeInOutCubic
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      cam.theta = cam._spinFromTheta + (cam._spinToTheta - cam._spinFromTheta) * e;
      cam.phi = cam._spinFromPhi + (0.35 - cam._spinFromPhi) * e;
      cam.dist = cam._spinFromDist + (25.6 - cam._spinFromDist) * e;
      cam.offsetTheta = 0;
      // Directly place the camera (bypassing follow-smooth during spin)
      const cx = cam.dist * Math.cos(cam.phi) * Math.sin(cam.theta);
      const cy = cam.dist * Math.sin(cam.phi);
      const cz = cam.dist * Math.cos(cam.phi) * Math.cos(cam.theta);
      const tgt = fg.position.clone();
      tgt.y += 1;
      camera.position.set(tgt.x + cx, Math.max(tgt.y + cy, 1.5), tgt.z + cz);
      camera.lookAt(tgt);
      if (t >= 1) {
        cam.intro = null;
        cam.introT = 0;
      }
    }
  } else {
    updateCamera();
  }
}

// ═══════════════════════════
// ANIMATE — slim orchestrator; see system functions above
// ═══════════════════════════

function animate() {
  requestAnimationFrame(animate);

  updateFpsStats();

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

  updateEnvironment(t);

  // ── FOIL PHYSICS + ride systems (only during ride) ──
  if (state.gamePhase === 'riding') {
    const fr = updatePhysics(dt, t);
    if (!fr) return; // ride ended mid-frame (stall-out) — skip rest of frame

    updateWorldFollow(fr);
    updateSurfer(dt, fr);
    updateParticles(dt, fr);
    updateHUD(fr);

    // Audio + wave chart + prev-wave-height bookkeeping
    updateAudio(fr.slopeForce, fr.normSwell, fr.foil.speed);
    updateWaveChart(fr.wH, fr.slopeDot, fr.normSwell, fr.pocketStrength);
    fr.foil.prevWH = fr.wH;

    updatePowerups(dt, fr);
    updateScoring(dt, fr);
  }

  updateCameraFollow(dt);

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
