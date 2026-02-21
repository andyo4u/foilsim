// ──────────────────────────────────────────────────────────────
//  foil.js  –  Hydrofoil model, effects, input & camera
//
//  Creates the foil 3D model (board, mast, fuselage, wings),
//  spray particle system, wake trail, wingtip streamers,
//  input handlers, and camera controls.
// ──────────────────────────────────────────────────────────────
//
//  TODO: Fix foil visual height — board appears too far above the
//        water at normal ride speeds. Clamp rideH or add a visual
//        offset so the board skims just above the surface.
//
//  TODO: Lean-back brake turn — when braking + turning, apply a
//        tighter turn radius at the cost of more drag. Gives a
//        risk/reward carving mechanic.
//
//  TODO: Jumping — detect launch conditions (steep wave face +
//        speed), apply ballistic arc, air-time scoring, and
//        landing impact physics (splash, speed penalty if bad).
//
//  TODO: Power-up collisions — check foil position against
//        floating power-up objects each frame; trigger effects
//        (speed boost, energy refill, score multiplier, etc.).
//
//  BUG:  Board too bouncy in high wind chop — rideH oscillates
//        rapidly when chop amplitude is large. Add low-pass
//        filtering or damping to smooth out the ride height.
//        Maybe lerp rideH more aggressively toward a smoothed
//        wave height average instead of raw getWaveHeight().
//
//  TODO: Easy / Pro difficulty modes — adjust physics params:
//        Easy: higher energy gain, slower drain, gentler chop
//              response, auto-balance (reduce roll/pitch wobble),
//              wider turn radius forgiveness
//        Pro:  realistic drag model, tight energy budget, full
//              chop response, crash on hard landings, narrower
//              stability envelope
//
//  TODO: Mobile touch controls — verify touch input works well
//        on Android Chrome + iOS Safari. May need larger touch
//        zones, on-screen joystick, or tilt-to-steer option.

import { state } from './state.js';
import { lerp, toggleControls } from './helpers.js';

/* ── Constants ────────────────────────────────────────────── */

const SPRAY_N = 200;
const WK_N    = 80;
const STR_N   = 120;

/* ── Materials (module-level, created once in initFoil) ──── */

let boardMat, carbonMat;

/* ── Spray geometry / arrays (module-level refs) ─────────── */

let spGeo, spPos, spSz, spAl;

/* ── Wake geometry / arrays ──────────────────────────────── */

let wkGeo, wkPos, wkAl;

// ═══════════════════════════
// HYDROFOIL MODEL
// ═══════════════════════════

function createFoilAsset() {
  const foilAsset = new THREE.Group();

  // 1. THE BOARD (surfboard shape)
  const boardLength = 1.1;
  const bL = boardLength / 2;
  const bW = 0.3; // half-width
  const boardShape = new THREE.Shape();
  boardShape.moveTo(-bL, 0);
  boardShape.bezierCurveTo(-bL + 0.05, bW * 0.6, -bL + 0.2, bW * 0.95, -bL * 0.3, bW);
  boardShape.bezierCurveTo(bL * 0.3, bW * 0.95, bL - 0.12, bW * 0.5, bL, 0);
  boardShape.bezierCurveTo(bL - 0.12, -bW * 0.5, bL * 0.3, -bW * 0.95, -bL * 0.3, -bW);
  boardShape.bezierCurveTo(-bL + 0.2, -bW * 0.95, -bL + 0.05, -bW * 0.6, -bL, 0);
  const boardGeom = new THREE.ExtrudeGeometry(boardShape, {
    steps: 1, depth: 0.08,
    bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3,
  });
  boardGeom.rotateX(-Math.PI / 2);
  const boardOffset = boardLength / 6;
  const board = new THREE.Mesh(boardGeom, boardMat);
  board.position.set(boardOffset, 0.81, 0);
  board.castShadow = true;
  board.receiveShadow = true;
  foilAsset.add(board);

  // 2. THE MAST
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.85, 0.18), carbonMat);
  mast.position.set(0, 0.4, 0);
  mast.rotation.y = Math.PI / 2;
  mast.castShadow = true;
  foilAsset.add(mast);

  // 3. THE FUSELAGE
  const fuse = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.05, 0.05), carbonMat);
  fuse.position.set(-0.125, 0, 0);
  fuse.castShadow = true;
  foilAsset.add(fuse);

  // 4. FRONT WING
  const fWing = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 1.1), carbonMat);
  fWing.position.set(0.25, 0, 0);
  fWing.scale.set(1, 1, 0.8);
  fWing.castShadow = true;
  foilAsset.add(fWing);

  // 5. STABILIZER
  const bWing = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.4), carbonMat);
  bWing.position.set(-0.5, 0, 0);
  bWing.castShadow = true;
  foilAsset.add(bWing);

  return foilAsset;
}

// ═══════════════════════════
// SPRAY PARTICLES
// ═══════════════════════════

function createSpraySystem() {
  spGeo = new THREE.BufferGeometry();
  spPos = new Float32Array(SPRAY_N * 3);
  spSz  = new Float32Array(SPRAY_N);
  spAl  = new Float32Array(SPRAY_N);
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute('size',     new THREE.BufferAttribute(spSz, 1));
  spGeo.setAttribute('alpha',    new THREE.BufferAttribute(spAl, 1));

  const spMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0.9, 0.95, 1) } },
    vertexShader: `attribute float size;attribute float alpha;varying float vA;void main(){vA=alpha;vec4 mv=modelViewMatrix*vec4(position,1);gl_PointSize=size*(200./-mv.z);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform vec3 uColor;varying float vA;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(uColor,vA*(1.-d*2.)*.6);}`
  });

  state.scene.add(new THREE.Points(spGeo, spMat));

  // Initialise particle pool
  const parts = [];
  for (let i = 0; i < SPRAY_N; i++) {
    parts.push({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0, ml: 1 });
  }
  state.spParts = parts;
}

export function emitSpray(px, py, pz, vx, vy, vz, n) {
  const spParts = state.spParts;
  let e = 0;
  for (let i = 0; i < state.sprayBudget && e < n; i++) {
    if (spParts[i].life <= 0) {
      const p = spParts[i];
      p.x = px + (Math.random() - 0.5) * 0.3;
      p.y = py + Math.random() * 0.1;
      p.z = pz + (Math.random() - 0.5) * 0.3;
      p.vx = vx + (Math.random() - 0.5) * 1.5;
      p.vy = vy + Math.random() * 2.5;
      p.vz = vz + (Math.random() - 0.5) * 1.5;
      p.life = 0.6 + Math.random() * 0.8;
      p.ml = p.life;
      e++;
    }
  }
}

export function updateSpray(dt) {
  const spParts = state.spParts;
  const budget = state.sprayBudget;
  for (let i = 0; i < budget; i++) {
    const p = spParts[i];
    if (p.life > 0) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 6 * dt;
      const f = Math.max(0, p.life / p.ml);
      spPos[i * 3]     = p.x;
      spPos[i * 3 + 1] = p.y;
      spPos[i * 3 + 2] = p.z;
      spSz[i] = lerp(0.05, 0.4, 1 - f);
      spAl[i] = f * f;
    } else {
      spPos[i * 3 + 1] = -100;
      spAl[i] = 0;
    }
  }
  // Hide particles beyond current quality budget
  for (let i = budget; i < SPRAY_N; i++) {
    spPos[i * 3 + 1] = -100;
    spAl[i] = 0;
  }
  spGeo.attributes.position.needsUpdate = true;
  spGeo.attributes.size.needsUpdate     = true;
  spGeo.attributes.alpha.needsUpdate    = true;
}

// ═══════════════════════════
// WAKE TRAIL
// ═══════════════════════════

function createWakeTrail() {
  wkGeo = new THREE.BufferGeometry();
  wkPos = new Float32Array(WK_N * 3);
  wkAl  = new Float32Array(WK_N);
  wkGeo.setAttribute('position', new THREE.BufferAttribute(wkPos, 3));
  wkGeo.setAttribute('alpha',    new THREE.BufferAttribute(wkAl, 1));

  const wkMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader:   `attribute float alpha;varying float vA;void main(){vA=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1);}`,
    fragmentShader: `varying float vA;void main(){gl_FragColor=vec4(.8,.9,1,vA*.3);}`
  });

  state.scene.add(new THREE.Line(wkGeo, wkMat));
  state.wkHist = [];
}

export function updateWake() {
  const wkHist = state.wkHist;
  for (let i = 0; i < WK_N; i++) {
    if (i < wkHist.length) {
      wkPos[i * 3]     = wkHist[i].x;
      wkPos[i * 3 + 1] = wkHist[i].y;
      wkPos[i * 3 + 2] = wkHist[i].z;
      wkAl[i] = 1 - i / wkHist.length;
    } else {
      wkPos[i * 3 + 1] = -100;
      wkAl[i] = 0;
    }
  }
  wkGeo.attributes.position.needsUpdate = true;
  wkGeo.attributes.alpha.needsUpdate = true;
  wkGeo.setDrawRange(0, wkHist.length);
}

// ═══════════════════════════
// WINGTIP STREAMERS (underwater)
// ═══════════════════════════

function makeStreamer(color) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(STR_N * 3);
  const alp = new Float32Array(STR_N);
  const szs = new Float32Array(STR_N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('alpha',    new THREE.BufferAttribute(alp, 1));
  geo.setAttribute('size',     new THREE.BufferAttribute(szs, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: color } },
    vertexShader: `
      attribute float alpha; attribute float size;
      varying float vA;
      void main(){ vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=size*(150.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vA;
      void main(){ float d=length(gl_PointCoord-0.5);
        if(d>0.5) discard;
        float a=vA*(1.0-d*2.0)*0.7;
        gl_FragColor=vec4(uColor, a); }`
  });

  const points = new THREE.Points(geo, mat);
  state.scene.add(points);
  return { geo, pos, alp, szs, hist: [], points };
}

export function updateStreamer(str, wx, wy, wz, speed) {
  if (speed > 1.0) {
    str.hist.unshift({ x: wx, y: wy, z: wz });
  }
  while (str.hist.length > state.streamerBudget) str.hist.pop();

  for (let i = 0; i < STR_N; i++) {
    if (i < str.hist.length) {
      str.pos[i * 3]     = str.hist[i].x;
      str.pos[i * 3 + 1] = str.hist[i].y;
      str.pos[i * 3 + 2] = str.hist[i].z;
      const t = 1.0 - i / str.hist.length;
      str.alp[i] = t * t * Math.min(1, speed / 4);
      str.szs[i] = lerp(0.05, 0.6, t);
    } else {
      str.pos[i * 3 + 1] = -100;
      str.alp[i] = 0;
      str.szs[i] = 0;
    }
  }
  str.geo.attributes.position.needsUpdate = true;
  str.geo.attributes.alpha.needsUpdate    = true;
  str.geo.attributes.size.needsUpdate     = true;
  str.geo.setDrawRange(0, str.hist.length);
}

// ═══════════════════════════
// INPUT
// ═══════════════════════════

function setupInput() {
  const input = state.input;

  window.addEventListener('keydown', e => {
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft')  input.left  = true;
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') input.right = true;
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp')    input.up    = true;
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown')  input.down  = true;
    if (e.key === ' ') { input.pump = true; e.preventDefault(); }
    if (e.key === 'Tab') { e.preventDefault(); toggleControls(); }
  });

  window.addEventListener('keyup', e => {
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft')  input.left  = false;
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') input.right = false;
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp')    input.up    = false;
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown')  input.down  = false;
    if (e.key === ' ') input.pump = false;
  });

  // Touch buttons
  document.querySelectorAll('.ride-btn').forEach(btn => {
    const a = btn.dataset.action;
    const on  = () => { input[a] = true;  btn.classList.add('active'); };
    const off = () => { input[a] = false; btn.classList.remove('active'); };
    btn.addEventListener('mousedown',   e => { e.preventDefault(); e.stopPropagation(); on(); });
    btn.addEventListener('mouseup',     off);
    btn.addEventListener('mouseleave',  off);
    btn.addEventListener('touchstart',  e => { e.preventDefault(); e.stopPropagation(); on(); }, { passive: false });
    btn.addEventListener('touchend',    e => { e.preventDefault(); off(); }, { passive: false });
    btn.addEventListener('touchcancel', off);
  });
}

// ═══════════════════════════
// CAMERA
// ═══════════════════════════

export function toggleFreeCam(on) {
  const cam = state.cam;
  cam.free = on;
  if (!on) { cam.panX = 0; cam.panY = 0; cam.panZ = 0; }
}

export function updateCamera() {
  const cam       = state.cam;
  const camera    = state.camera;
  const foilGroup = state.foilGroup;
  const foil      = state.foil;

  if (cam.free) {
    // Free camera: orbit around pan target, no auto-follow
    const cx = cam.dist * Math.cos(cam.phi) * Math.sin(cam.theta);
    const cy = cam.dist * Math.sin(cam.phi);
    const cz = cam.dist * Math.cos(cam.phi) * Math.cos(cam.theta);
    const tgt = new THREE.Vector3(
      foilGroup.position.x + cam.panX,
      foilGroup.position.y + 1 + cam.panY,
      foilGroup.position.z + cam.panZ
    );
    camera.position.set(tgt.x + cx, Math.max(tgt.y + cy, 0.5), tgt.z + cz);
    camera.lookAt(tgt);
    return;
  }

  // Normal follow camera
  let target = foil.heading + Math.PI + cam.offsetTheta;
  let diff = target - cam.theta;
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  cam.theta += diff * cam.followSmooth;

  const cx = cam.dist * Math.cos(cam.phi) * Math.sin(cam.theta);
  const cy = cam.dist * Math.sin(cam.phi);
  const cz = cam.dist * Math.cos(cam.phi) * Math.cos(cam.theta);
  const tgt = foilGroup.position.clone();
  tgt.y += 1;
  camera.position.set(tgt.x + cx, Math.max(tgt.y + cy, 1.5), tgt.z + cz);
  camera.lookAt(tgt);
}

function setupCameraControls() {
  const cam      = state.cam;
  const renderer = state.renderer;

  renderer.domElement.addEventListener('mousedown', e => {
    if (cam.free && e.button === 2) {
      cam.panning = true; cam.lx = e.clientX; cam.ly = e.clientY; return;
    }
    cam.drag = true; cam.lx = e.clientX; cam.ly = e.clientY;
  });

  window.addEventListener('mouseup', () => { cam.drag = false; cam.panning = false; });

  window.addEventListener('mousemove', e => {
    if (cam.panning && cam.free) {
      const dx = e.clientX - cam.lx, dy = e.clientY - cam.ly;
      const panScale = cam.dist * 0.002;
      const st = Math.sin(cam.theta), ct = Math.cos(cam.theta);
      cam.panX += (-dx * ct) * panScale;
      cam.panZ += ( dx * st) * panScale;
      cam.panY += dy * panScale;
      cam.lx = e.clientX; cam.ly = e.clientY;
      return;
    }
    if (!cam.drag) return;
    if (cam.free) {
      cam.theta -= (e.clientX - cam.lx) * 0.005;
      cam.phi = Math.max(0.01, Math.min(1.56, cam.phi + (e.clientY - cam.ly) * 0.005));
    } else {
      cam.offsetTheta -= (e.clientX - cam.lx) * 0.005;
      cam.phi = Math.max(0.05, Math.min(1.4, cam.phi + (e.clientY - cam.ly) * 0.005));
    }
    cam.lx = e.clientX; cam.ly = e.clientY;
  });

  renderer.domElement.addEventListener('wheel', e => {
    e.preventDefault();
    const maxDist = cam.free ? 5000 : 120, minDist = cam.free ? 1 : 5;
    cam.dist = Math.max(minDist, Math.min(maxDist, cam.dist * (1 + e.deltaY * 0.001)));
  }, { passive: false });

  renderer.domElement.addEventListener('contextmenu', e => { if (cam.free) e.preventDefault(); });

  renderer.domElement.addEventListener('touchstart', e => {
    if (e.target.closest('#ride-controls') || e.target.closest('#controls-panel')) return;
    if (e.touches.length === 1) {
      cam.drag = true; cam.lx = e.touches[0].clientX; cam.ly = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      cam.pd = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    } else if (e.touches.length === 3 && cam.free) {
      cam.panning = true; cam.lx = e.touches[0].clientX; cam.ly = e.touches[0].clientY;
    }
  }, { passive: true });

  renderer.domElement.addEventListener('touchmove', e => {
    if (e.target.closest('#ride-controls') || e.target.closest('#controls-panel')) return;
    e.preventDefault();
    if (cam.panning && cam.free && e.touches.length >= 3) {
      const dx = e.touches[0].clientX - cam.lx, dy = e.touches[0].clientY - cam.ly;
      const panScale = cam.dist * 0.002;
      const st = Math.sin(cam.theta), ct = Math.cos(cam.theta);
      cam.panX += (-dx * ct) * panScale;
      cam.panZ += ( dx * st) * panScale;
      cam.panY += dy * panScale;
      cam.lx = e.touches[0].clientX; cam.ly = e.touches[0].clientY;
    } else if (e.touches.length === 1 && cam.drag) {
      if (cam.free) {
        cam.theta -= (e.touches[0].clientX - cam.lx) * 0.005;
        cam.phi = Math.max(0.01, Math.min(1.56, cam.phi + (e.touches[0].clientY - cam.ly) * 0.005));
      } else {
        cam.offsetTheta -= (e.touches[0].clientX - cam.lx) * 0.005;
        cam.phi = Math.max(0.05, Math.min(1.4, cam.phi + (e.touches[0].clientY - cam.ly) * 0.005));
      }
      cam.lx = e.touches[0].clientX; cam.ly = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      const nd = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const maxDist = cam.free ? 5000 : 120, minDist = cam.free ? 1 : 5;
      cam.dist = Math.max(minDist, Math.min(maxDist, cam.dist * (cam.pd / nd)));
      cam.pd = nd;
    }
  }, { passive: false });

  renderer.domElement.addEventListener('touchend', () => { cam.drag = false; cam.panning = false; });
}

// ═══════════════════════════
// INIT (public entry-point)
// ═══════════════════════════

export function initFoil() {
  // ── Materials ───────────────────────────────────────────
  boardMat  = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.25 });
  carbonMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.4 });

  // ── Foil group hierarchy ────────────────────────────────
  const foilGroup = new THREE.Group();
  state.scene.add(foilGroup);
  state.foilGroup = foilGroup;

  // Inner group rotated so the board's long axis (built along X) aligns with +Z travel
  // PI/2 Y-rotation sends +X -> -Z, so use -PI/2 to send +X -> +Z (nose forward)
  // Using YXZ Euler order so: Y (align board) -> X (pitch) -> Z (roll along board axis)
  const modelGroup = new THREE.Group();
  modelGroup.rotation.order = 'YXZ';
  modelGroup.rotation.y = -Math.PI / 2;
  foilGroup.add(modelGroup);
  state.modelGroup = modelGroup;

  // ── Foil asset ──────────────────────────────────────────
  const foilAsset = createFoilAsset();
  // Offset so the board deck (at Y=0.81 in asset) sits at Y=0 in modelGroup
  foilAsset.position.y = -0.81;
  modelGroup.add(foilAsset);
  state.foilAsset = foilAsset;

  // Wing tip markers (invisible) – used to track world positions for streamers
  // Front wing is at X=0.25, Z span = 1.1*0.8/2 = 0.44, Y=0 in foilAsset
  const tipL = new THREE.Object3D(); tipL.position.set(0.25, 0, 0.44);  foilAsset.add(tipL);
  const tipR = new THREE.Object3D(); tipR.position.set(0.25, 0, -0.44); foilAsset.add(tipR);
  state.tipL = tipL;
  state.tipR = tipR;

  // ── Pre-allocated vectors (avoid GC in render loop) ─────
  state._tipLWorld = new THREE.Vector3();
  state._tipRWorld = new THREE.Vector3();

  // ── Spray particle system ───────────────────────────────
  createSpraySystem();

  // ── Wake trail ──────────────────────────────────────────
  createWakeTrail();

  // ── Wingtip streamers ───────────────────────────────────
  state.streamerL = makeStreamer(new THREE.Color(0.5, 0.8, 1.0));
  state.streamerR = makeStreamer(new THREE.Color(0.5, 0.8, 1.0));

  // ── Input handlers ──────────────────────────────────────
  setupInput();

  // ── Camera controls ─────────────────────────────────────
  setupCameraControls();
}
