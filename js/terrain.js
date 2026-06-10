// ──────────────────────────────────────────────────────────────
//  terrain.js  –  Terrain systems module
//
//  Distant silhouettes, 3D cliff segments, real terrain loading
//  (heightmap + satellite), panoramic photo backdrops,
//  terrain presets / configs, shallow-water restart logic.
// ──────────────────────────────────────────────────────────────
//
//  TODO: Brighten satellite texture — mountain features are too
//        dark in the current terrain fragment shader. Options:
//        • Add a brightness/gamma uniform and boost diffuse color
//        • Apply levels adjustment (lift shadows, boost mids)
//        • Increase ambient term so shaded slopes are more visible
//
//  TODO: Game loop & location select — turn this into a proper
//        game flow: splash screen → choose location → ride →
//        score / achievements. Unlock new locations and new
//        render mode styles as achievement rewards.
//
//  TODO: Spinning globe picker — Three.js Earth sphere with
//        location pins that light up as you unlock them. Spin
//        to browse, click a pin → zoom-in transition → ride.
//        Could use a low-res earth texture + country outlines.
//
//  TODO: More locations — add new terrainConfigs entries for
//        real-world spots (Jaws/Peahi, Nazaré, Tahiti, etc.)
//        each with their own heightmap + satellite assets.
//
//  TODO: HELL — the ultimate final location. Unlocked after
//        completing all achievements. Lava ocean (Hot Lava
//        render mode forced), fire/ember sky, demon-horn cliff
//        silhouettes, red fog, screaming wind audio. The
//        terrainConfig would use a volcanic crater heightmap
//        with a molten-rock satellite texture. Because why not.
//
//  TODO: Strava integration — record a GPS-style trail and:
//        • Export trail as GPX/FIT with world-mapped coordinates
//        • Capture a screenshot at ride end for the activity photo
//        • Upload via Strava API (OAuth2 flow, virtual activity)
//        • Make this an unlockable achievement reward
//        • Map the ride onto a fun real-world waterway so it
//          shows up on your Strava feed somewhere epic — eFoil
//          across Lake Geneva, down the Amazon, around Alcatraz…

import * as THREE from 'three';
import { state } from './state.js';
import { lerp, smoothstep, getVal, applyPreset, cacheAllSliders, degToDir } from './helpers.js';

/* ================================================================
   TERRAIN — Distant Silhouettes + 3D Cliff Segments
   ================================================================ */

// ── Layer 1: Horizon silhouette ring (shader-based, follows camera) ──

let silhouetteMat = null;   // created in initTerrain
let silhouetteMesh = null;

function createSilhouetteMat() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, 0.4, -1).normalize() },
      uFogColor: { value: new THREE.Color(0.55, 0.7, 0.85) },
      uFogSunColor: { value: new THREE.Color(0.8, 0.75, 0.6) }
    },
    vertexShader: `
      varying vec3 vWP;
      varying vec2 vUV;
      void main(){
        vWP = (modelMatrix * vec4(position, 1.0)).xyz;
        vUV = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uSunDir, uFogColor, uFogSunColor;
      varying vec3 vWP;
      varying vec2 vUV;

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
        // Angle around cylinder = vUV.x, height = vUV.y (0=bottom, 1=top)
        float angle = vUV.x * 6.2832 * 3.0; // scale for variation

        // Generate cliff/mountain profile at this angle
        float profile = fbm(vec2(angle, 0.0)) * 0.6
                      + fbm(vec2(angle * 2.3, 1.5)) * 0.25
                      + fbm(vec2(angle * 5.0, 3.0)) * 0.15;

        // Map profile to height: mountains are 15-65% of cylinder height
        float mountainTop = 0.12 + profile * 0.4;
        float heightInCyl = vUV.y;

        // Below mountain top = rock, above = transparent
        if(heightInCyl > mountainTop) discard;

        // Rock color: darker at base, lighter toward peaks
        float heightRatio = heightInCyl / max(mountainTop, 0.01);
        vec3 rockDark = vec3(0.08, 0.07, 0.06);
        vec3 rockLight = vec3(0.22, 0.20, 0.18);
        vec3 col = mix(rockDark, rockLight, heightRatio * heightRatio);

        // Sun-facing rim highlight
        vec3 d = normalize(vWP);
        float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
        col += vec3(0.15, 0.10, 0.05) * pow(sunDot, 3.0) * heightRatio;

        // Heavy atmospheric fog — these are far away
        float fogStr = 0.65 + 0.25 * (1.0 - heightRatio); // foggier at base
        vec3 fogCol = mix(uFogColor, uFogSunColor, pow(sunDot, 4.0));
        col = mix(col, fogCol, fogStr);

        // Fade at very top of mountains for soft edge
        float topFade = smoothstep(mountainTop, mountainTop - 0.03, heightInCyl);

        gl_FragColor = vec4(col, topFade * 0.85);
      }`
  });
}

// ── JS-side FBM for CPU terrain generation ──

function hashJS(x, y) {
  return ((Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1 + 1) % 1;
}

function noiseJS(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hashJS(ix, iy), b = hashJS(ix + 1, iy);
  const c = hashJS(ix, iy + 1), d = hashJS(ix + 1, iy + 1);
  return (a + (b - a) * ux) + (c - a + (a - b - c + d) * ux) * uy;
}

function fbmJS(x, y, octaves) {
  let v = 0, a = 0.5;
  for (let i = 0; i < (octaves || 5); i++) {
    v += a * noiseJS(x, y);
    const nx = 0.8 * x - 0.6 * y, ny = 0.6 * x + 0.8 * y;
    x = nx * 2; y = ny * 2;
    a *= 0.5;
  }
  return v;
}

// ── Layer 2: 3D cliff segments (procedural geometry, follows player via SNAP) ──

// Cliff ShaderMaterial — fog-aware, sun-lit, matches ocean fog exactly
let cliffMat = null;  // created in initTerrain

function createCliffMat() {
  return new THREE.ShaderMaterial({
    side: THREE.FrontSide,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, 0.4, -1).normalize() },
      uCamPos: { value: new THREE.Vector3() },
      uFogColor: { value: new THREE.Color(0.55, 0.7, 0.85) },
      uFogSunColor: { value: new THREE.Color(0.8, 0.75, 0.6) },
      uMaxHeight: { value: 120.0 }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vHeight;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vHeight = position.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uSunDir, uCamPos, uFogColor, uFogSunColor;
      uniform float uMaxHeight;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vHeight;

      // Simple hash for vegetation noise
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main(){
        vec3 N = normalize(vNormal);
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(uCamPos - vWorldPos);

        // Rock color with height variation
        vec3 rockBase = vec3(0.12, 0.10, 0.08);
        vec3 rockMid  = vec3(0.25, 0.22, 0.18);
        vec3 rockTop  = vec3(0.35, 0.32, 0.28);
        float hNorm = clamp(vHeight / uMaxHeight, 0.0, 1.0);
        vec3 rockCol = mix(rockBase, rockMid, smoothstep(0.0, 0.3, hNorm));
        rockCol = mix(rockCol, rockTop, smoothstep(0.5, 1.0, hNorm));

        // Vegetation — green on gentle slopes, rock on steep cliffs
        float slope = abs(N.y); // 1.0 = flat, 0.0 = vertical
        float vegMask = smoothstep(0.3, 0.7, slope); // green appears on gentler slopes
        float treeline = smoothstep(1.0, 0.6, hNorm); // fade out above 60% height
        float vegNoise = vnoise(vWorldPos.xz * 0.08) * 0.4 + vnoise(vWorldPos.xz * 0.03) * 0.6;
        vegMask *= treeline * smoothstep(0.25, 0.55, vegNoise); // noisy edge
        vec3 vegDark = vec3(0.12, 0.22, 0.08);
        vec3 vegLight = vec3(0.18, 0.30, 0.12);
        vec3 vegCol = mix(vegDark, vegLight, vegNoise);
        vec3 surfCol = mix(rockCol, vegCol, vegMask);

        // Half-Lambert lighting
        float NdL = dot(N, L) * 0.5 + 0.5;
        vec3 col = surfCol * (0.3 + 0.7 * NdL);

        // Subtle specular
        vec3 H = normalize(L + V);
        col += vec3(0.15, 0.12, 0.08) * pow(max(dot(N, H), 0.0), 32.0) * 0.3;

        // Fog — same formula as ocean
        float cd = length(uCamPos - vWorldPos);
        float fog = 1.0 - exp(-cd * 0.0012);
        vec3 fogCol = mix(uFogColor, uFogSunColor, pow(max(dot(normalize(vWorldPos - uCamPos), L), 0.0), 4.0));
        col = mix(col, fogCol, fog);

        gl_FragColor = vec4(col, 1.0);
      }`
  });
}

// Generate a single cliff segment
export function createCliffSegment(angle, dist, height, width, depth, seed) {
  const steps = 24; // horizontal resolution
  const vSteps = 8;  // vertical resolution
  const positions = [];
  const normals = [];
  const indices = [];

  // Generate jagged top profile
  const profile = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = (t - 0.5) * width;
    const n = fbmJS(seed + t * 4.0, seed * 0.7, 4);
    // Height varies: taller in center, tapers at edges
    const edgeFade = 1.0 - Math.pow(Math.abs(t - 0.5) * 2.0, 2.0);
    const h = height * (0.4 + 0.6 * n) * edgeFade;
    profile.push({ x: px, h: Math.max(h, 2) });
  }

  // Build front face vertices (grid: steps+1 x vSteps+1)
  for (let j = 0; j <= vSteps; j++) {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const vt = j / vSteps;
      const px = profile[i].x;
      const py = -5 + vt * (profile[i].h + 5); // start below water
      const pz = 0;
      // Slight irregularity in the face
      const jitter = fbmJS(seed + i * 0.5, seed + j * 0.5, 3) * 3.0;
      positions.push(px, py, pz + jitter);
      normals.push(0, 0, 1); // front-facing
    }
  }

  // Front face indices
  const w = steps + 1;
  for (let j = 0; j < vSteps; j++) {
    for (let i = 0; i < steps; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Back face (offset by depth)
  const frontCount = positions.length / 3;
  for (let j = 0; j <= vSteps; j++) {
    for (let i = 0; i <= steps; i++) {
      const idx = (j * w + i) * 3;
      positions.push(positions[idx], positions[idx + 1], positions[idx + 2] - depth);
      normals.push(0, 0, -1);
    }
  }
  for (let j = 0; j < vSteps; j++) {
    for (let i = 0; i < steps; i++) {
      const a = frontCount + j * w + i, b = a + 1, c = a + w, d = c + 1;
      indices.push(a, b, c, b, d, c); // reversed winding
    }
  }

  // Top edge — connect front to back
  const topStart = positions.length / 3;
  for (let i = 0; i <= steps; i++) {
    const fi = vSteps * w + i;
    const idx = fi * 3;
    // Front top vertex
    positions.push(positions[idx], positions[idx + 1], positions[idx + 2]);
    normals.push(0, 1, 0);
    // Back top vertex
    positions.push(positions[idx], positions[idx + 1], positions[idx + 2] - depth);
    normals.push(0, 1, 0);
  }
  for (let i = 0; i < steps; i++) {
    const a = topStart + i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, c, b, b, c, d);
  }

  // Side caps (left and right)
  const sideStart = positions.length / 3;
  // Left side
  for (let j = 0; j <= vSteps; j++) {
    const fi = j * w;
    const idx = fi * 3;
    positions.push(positions[idx], positions[idx + 1], positions[idx + 2]);
    normals.push(-1, 0, 0);
    positions.push(positions[idx], positions[idx + 1], positions[idx + 2] - depth);
    normals.push(-1, 0, 0);
  }
  for (let j = 0; j < vSteps; j++) {
    const a = sideStart + j * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  // Right side
  const rightStart = positions.length / 3;
  for (let j = 0; j <= vSteps; j++) {
    const fi = j * w + steps;
    const idx = fi * 3;
    positions.push(positions[idx], positions[idx + 1], positions[idx + 2]);
    normals.push(1, 0, 0);
    positions.push(positions[idx], positions[idx + 1], positions[idx + 2] - depth);
    normals.push(1, 0, 0);
  }
  for (let j = 0; j < vSteps; j++) {
    const a = rightStart + j * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, c, b, b, d, c);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals(); // smooth out the auto-normals

  const mesh = new THREE.Mesh(geom, cliffMat);

  // Position: convert polar (angle, dist) to cartesian
  mesh.position.set(Math.sin(angle) * dist, 0, Math.cos(angle) * dist);
  // Face toward center
  mesh.lookAt(0, mesh.position.y, 0);

  return mesh;
}

/* ================================================================
   REAL TERRAIN — per-location configurations
   ================================================================ */

export const terrainConfigs = {
  gorge: {
    label: 'Columbia River Gorge',
    heightmap: 'terrain-data/gorge_heightmap_1024.png',
    satellite: 'terrain-data/gorge_satellite_2048.jpg',
    mapImage: 'terrain-data/gorge_map_box.png',
    // Map image covers the river corridor (full E-W, center N-S band)
    // World-coord bounding box: [minX(west), minZ(south), maxX(east), maxZ(north)]
    mapBounds: [-7191, -2374, 7191, 2374],
    elevMin: 24.0,
    elevMax: 1090.1,
    worldW: 14382,   // meters east-west
    worldD: 11054,   // meters north-south
    waterY: 3.0,     // ~30m real elevation -> 3m in scene (lowered for shallow visibility)
    waterThresh: 12,  // heightmap pixel <= this = water
    useRiverMask: true,
    preset: 'gorge',
    startPos: null     // auto-detect from heightmap
  },
  rufus: {
    label: 'Rufus Glass Factory',
    heightmap: 'terrain-data/rufus_heightmap_1024.png',
    satellite: 'terrain-data/rufus_satellite_2048.jpg',
    elevMin: 49.2,
    elevMax: 955.0,
    worldW: 14400,   // meters east-west
    worldD: 11000,   // meters north-south
    geoCenter: { lat: 45.685, lon: -120.758 },
    geoBbox: { west: -120.850849, east: -120.665151, south: 45.635450, north: 45.734550 },
    waterY: 3.0,     // river level in scene coords
    waterThresh: 12,  // heightmap pixel <= this = water
    useRiverMask: true,
    preset: 'rufus',
    geoStart: { lat: 45.696657, lon: -120.755017 },  // target lat/lon
    startPos: null  // auto-detect water near center
  },
  maliko: {
    label: 'Maliko Run, Maui',
    heightmap: 'terrain-data/maliko_heightmap_1024.png',
    satellite: 'terrain-data/maliko_satellite_2048.jpg',
    elevMin: 0.0,
    elevMax: 3055.5,
    worldW: 75967,   // meters east-west (full Maui island)
    worldD: 51207,   // meters north-south
    waterY: 0.0,     // sea level
    waterThresh: 2,   // heightmap pixel <= this = water (ocean)
    useRiverMask: true,
    preset: 'clean',
    // Start offshore Maliko Gulch, heading west toward Kahului
    startPos: { x: -5310, z: 22201, heading: Math.PI }
  }
};

// Convenience accessors (used throughout the code)
export function RT_ELEV_MIN()   { return state.activeTerrainCfg.elevMin; }
export function RT_ELEV_MAX()   { return state.activeTerrainCfg.elevMax; }
export function RT_ELEV_RANGE() { return state.activeTerrainCfg.elevMax - state.activeTerrainCfg.elevMin; }
export function RT_WORLD_W()    { return state.activeTerrainCfg.worldW; }
export function RT_WORLD_D()    { return state.activeTerrainCfg.worldD; }
export function RT_WATER_Y()    { return state.activeTerrainCfg.waterY; }

/* ================================================================
   Background Presets — different terrain configurations
   ================================================================ */

export const bgPresets = {
  'ocean-islands': {
    label: 'Ocean Islands',
    maxHeight: 150,
    cliffs: [
      { angle: 0.0,    dist: 800,  height: 120, width: 250, depth: 60, seed: 1.0  },
      { angle: 0.85,   dist: 900,  height: 90,  width: 200, depth: 50, seed: 2.3  },
      { angle: 1.5,    dist: 750,  height: 140, width: 300, depth: 70, seed: 3.7  },
      { angle: 2.3,    dist: 850,  height: 70,  width: 180, depth: 45, seed: 4.1  },
      { angle: 3.14,   dist: 950,  height: 110, width: 280, depth: 65, seed: 5.9  },
      { angle: 4.0,    dist: 780,  height: 150, width: 320, depth: 75, seed: 6.2  },
      { angle: 4.9,    dist: 880,  height: 85,  width: 220, depth: 55, seed: 7.5  },
      { angle: 5.7,    dist: 820,  height: 100, width: 260, depth: 60, seed: 8.8  },
    ]
  },
  'big-sur': {
    label: 'Big Sur',
    maxHeight: 350,
    cliffs: [
      // -- Main coastline wall (angles ~5.0 through 0 to ~1.4) --
      // Front row -- dramatic sea cliffs right at the water
      { angle: 5.0,    dist: 550,  height: 140, width: 380, depth: 90, seed: 10.1 },
      { angle: 5.35,   dist: 520,  height: 180, width: 350, depth: 85, seed: 11.4 },
      { angle: 5.7,    dist: 540,  height: 200, width: 400, depth: 95, seed: 12.7 },
      { angle: 6.05,   dist: 510,  height: 160, width: 370, depth: 80, seed: 13.2 },
      { angle: 0.1,    dist: 530,  height: 220, width: 420, depth: 100,seed: 14.5 },
      { angle: 0.45,   dist: 550,  height: 190, width: 390, depth: 90, seed: 15.8 },
      { angle: 0.8,    dist: 520,  height: 170, width: 360, depth: 85, seed: 16.1 },
      { angle: 1.15,   dist: 540,  height: 150, width: 340, depth: 80, seed: 17.3 },
      // Back row -- taller mountains rising behind the cliffs
      { angle: 5.15,   dist: 750,  height: 280, width: 500, depth: 120,seed: 18.6 },
      { angle: 5.6,    dist: 720,  height: 320, width: 480, depth: 130,seed: 19.2 },
      { angle: 5.95,   dist: 740,  height: 350, width: 520, depth: 140,seed: 20.8 },
      { angle: 0.25,   dist: 760,  height: 300, width: 500, depth: 125,seed: 21.4 },
      { angle: 0.65,   dist: 730,  height: 260, width: 460, depth: 110,seed: 22.1 },
      { angle: 1.0,    dist: 750,  height: 240, width: 440, depth: 105,seed: 23.5 },
      // Headland extensions at each end of the coastline
      { angle: 4.65,   dist: 600,  height: 110, width: 300, depth: 70, seed: 24.9 },
      { angle: 1.45,   dist: 620,  height: 100, width: 280, depth: 65, seed: 25.3 },
    ]
  },
  'sheltered-bay': {
    label: 'Sheltered Bay',
    maxHeight: 120,
    cliffs: [
      { angle: 0.0,    dist: 600,  height: 100, width: 350, depth: 70, seed: 20.5 },
      { angle: 0.6,    dist: 550,  height: 80,  width: 280, depth: 55, seed: 21.2 },
      { angle: 1.2,    dist: 580,  height: 110, width: 320, depth: 65, seed: 22.8 },
      { angle: 1.9,    dist: 620,  height: 90,  width: 300, depth: 60, seed: 23.1 },
      { angle: 2.6,    dist: 560,  height: 120, width: 340, depth: 70, seed: 24.4 },
      { angle: 3.3,    dist: 600,  height: 95,  width: 310, depth: 65, seed: 25.7 },
      { angle: 4.0,    dist: 570,  height: 105, width: 330, depth: 68, seed: 26.0 },
      { angle: 4.7,    dist: 590,  height: 85,  width: 290, depth: 58, seed: 27.3 },
      { angle: 5.3,    dist: 610,  height: 115, width: 360, depth: 72, seed: 28.6 },
      { angle: 5.9,    dist: 580,  height: 75,  width: 260, depth: 50, seed: 29.9 },
    ]
  },
  'columbia-gorge': {
    label: 'Columbia Gorge',
    maxHeight: 380,
    cliffs: [
      // -- East wall (right side) -- angles ~0.85 to ~2.50, centered on pi/2
      // Front row -- immediate gorge wall, close and dramatic
      { angle: 0.85,   dist: 370,  height: 160, width: 340, depth: 80, seed: 30.1 },
      { angle: 1.08,   dist: 390,  height: 190, width: 360, depth: 85, seed: 31.4 },
      { angle: 1.31,   dist: 350,  height: 220, width: 380, depth: 90, seed: 32.7 },
      { angle: 1.54,   dist: 380,  height: 200, width: 400, depth: 95, seed: 33.2 },
      { angle: 1.77,   dist: 360,  height: 180, width: 370, depth: 85, seed: 34.5 },
      { angle: 2.00,   dist: 400,  height: 210, width: 350, depth: 90, seed: 35.8 },
      { angle: 2.23,   dist: 370,  height: 170, width: 330, depth: 80, seed: 36.1 },
      { angle: 2.46,   dist: 420,  height: 120, width: 300, depth: 75, seed: 37.3 },
      // Back row -- tall Cascade mountains behind east wall
      { angle: 0.95,   dist: 620,  height: 320, width: 500, depth: 120, seed: 38.6 },
      { angle: 1.25,   dist: 640,  height: 370, width: 530, depth: 130, seed: 39.2 },
      { angle: 1.57,   dist: 600,  height: 380, width: 550, depth: 140, seed: 40.8 },
      { angle: 1.90,   dist: 650,  height: 340, width: 510, depth: 125, seed: 41.4 },
      { angle: 2.20,   dist: 660,  height: 260, width: 480, depth: 110, seed: 42.1 },

      // -- West wall (left side) -- angles ~4.00 to ~5.70, centered on 3pi/2
      // Front row -- matching gorge wall on the opposite side
      { angle: 4.00,   dist: 390,  height: 150, width: 330, depth: 80, seed: 43.5 },
      { angle: 4.24,   dist: 370,  height: 185, width: 360, depth: 85, seed: 44.9 },
      { angle: 4.48,   dist: 360,  height: 215, width: 390, depth: 90, seed: 45.3 },
      { angle: 4.71,   dist: 380,  height: 200, width: 400, depth: 95, seed: 46.7 },
      { angle: 4.95,   dist: 400,  height: 190, width: 370, depth: 85, seed: 47.1 },
      { angle: 5.18,   dist: 350,  height: 210, width: 350, depth: 90, seed: 48.4 },
      { angle: 5.42,   dist: 380,  height: 165, width: 340, depth: 80, seed: 49.8 },
      { angle: 5.65,   dist: 410,  height: 130, width: 310, depth: 75, seed: 50.2 },
      // Back row -- tall Cascade mountains behind west wall
      { angle: 4.12,   dist: 630,  height: 300, width: 490, depth: 120, seed: 51.6 },
      { angle: 4.45,   dist: 650,  height: 360, width: 520, depth: 130, seed: 52.0 },
      { angle: 4.71,   dist: 610,  height: 370, width: 540, depth: 140, seed: 53.3 },
      { angle: 5.05,   dist: 640,  height: 330, width: 500, depth: 125, seed: 54.7 },
      { angle: 5.40,   dist: 660,  height: 280, width: 480, depth: 115, seed: 55.1 },

      // -- End caps -- scattered low cliffs at channel openings
      // North end (around angle 0)
      { angle: 0.15,   dist: 580,  height: 100, width: 280, depth: 65, seed: 56.5 },
      { angle: 0.45,   dist: 650,  height: 140, width: 320, depth: 70, seed: 57.9 },
      { angle: 6.00,   dist: 620,  height: 120, width: 300, depth: 68, seed: 58.3 },
      // South end (around angle pi)
      { angle: 2.85,   dist: 600,  height: 110, width: 290, depth: 65, seed: 59.7 },
      { angle: 3.14,   dist: 680,  height: 160, width: 340, depth: 75, seed: 60.1 },
      { angle: 3.45,   dist: 720,  height: 75,  width: 260, depth: 55, seed: 61.4 },
    ]
  },
  'open-ocean': {
    label: 'Open Ocean',
    maxHeight: 120,
    cliffs: [] // no terrain -- pure open water
  },
  'gorge-real': {
    label: 'Gorge HD',
    maxHeight: 120,
    useRealTerrain: 'gorge',
    waterStyle: 'normal',
    cliffs: []
  },
  'rufus-real': {
    label: 'Rufus HD',
    maxHeight: 120,
    useRealTerrain: 'rufus',
    waterStyle: 'normal',
    cliffs: []
  },
  'maliko-real': {
    label: 'Maliko HD',
    maxHeight: 120,
    useRealTerrain: 'maliko',
    waterStyle: 'normal',
    cliffs: []
  }
};

/* ================================================================
   rebuildTerrain — switches between terrain presets
   ================================================================ */

export function rebuildTerrain(presetName) {
  const terrainGroup = state.terrainGroup;

  // Clear existing cliff meshes
  while (terrainGroup.children.length > 0) {
    const child = terrainGroup.children[0];
    if (child.geometry) child.geometry.dispose();
    terrainGroup.remove(child);
  }
  // Build new ones from preset
  const preset = bgPresets[presetName];
  if (!preset) return;
  state.activeBgPreset = presetName;
  cliffMat.uniforms.uMaxHeight.value = preset.maxHeight || 120.0;

  // Panoramic photo background toggle
  if (preset.usePanorama) {
    buildPanoCylinder();
    state.silhouetteMesh.visible = false;
  } else {
    removePanoCylinder();
    state.silhouetteMesh.visible = true;
  }

  // Real terrain toggle
  // Note: foil, oceanMat, oceanMesh are set by other modules via state.
  // At initial page load, rebuildTerrain('gorge-real') runs before those exist.
  // We defer ocean/foil setup to a microtask so it runs after all declarations.
  if (preset.useRealTerrain) {
    state.activeTerrainCfg = terrainConfigs[preset.useRealTerrain] || terrainConfigs.gorge;
    state.silhouetteMesh.visible = false;
    terrainGroup.visible = false;
    buildRealTerrain(function onTerrainReady() {
      Promise.resolve().then(() => {
        const startPos = findRiverStartPosition();
        state.foil.x = startPos.x; state.foil.z = startPos.z; state.foil.heading = startPos.heading;
        state.foil.speed = 0;
        applyPreset(state.activeTerrainCfg.preset || 'clean');
        if (state.activeTerrainCfg.useRiverMask && state.realTerrainRiverMask) {
          state.oceanMat.uniforms.uRiverMask.value = state.realTerrainRiverMask;
          state.oceanMat.uniforms.uUseRiverMask.value = 1;
        } else {
          state.oceanMat.uniforms.uUseRiverMask.value = 0;
        }
        state.oceanMat.uniforms.uRiverBounds.value.set(-RT_WORLD_W()/2, -RT_WORLD_D()/2, RT_WORLD_W()/2, RT_WORLD_D()/2);
        state.oceanMat.transparent = true;
        state.oceanMat.depthWrite = true;
        state.oceanMat.needsUpdate = true;
        state.realTerrainMat.uniforms.uWaterLevel.value = RT_WATER_Y();
        state.oceanMesh.scale.set(1, 1, 1);
        // Mini-map removed (v0.89)
      });
    });
  } else {
    removeRealTerrain();
    terrainGroup.visible = true;
    Promise.resolve().then(() => {
      state.oceanMat.uniforms.uUseRiverMask.value = 0;
      state.oceanMat.transparent = false;
      state.oceanMat.needsUpdate = true;
      state.oceanMesh.scale.set(1, 1, 1);
      state.oceanMesh.position.y = 0;
      // Mini-map removed (v0.89)
    });
  }

  // Water style -- tropical vs normal
  state.activeWaterStyle = preset.waterStyle || 'normal';

  preset.cliffs.forEach(c => {
    const cliff = createCliffSegment(c.angle, c.dist, c.height, c.width, c.depth, c.seed);
    terrainGroup.add(cliff);
  });
  // Update button states
  document.querySelectorAll('.bg-preset-btn').forEach(b => b.classList.remove('active-preset'));
  const activeBtn = document.querySelector(`.bg-preset-btn[data-bg="${presetName}"]`);
  if (activeBtn) activeBtn.classList.add('active-preset');
}

/* ================================================================
   PANORAMIC PHOTO BACKGROUND — flat billboard, loaded from file
   ================================================================ */

let panoTexture = null;
let panoReady = false;
const PANO_DIST = 1600;
const PANO_WIDTH = 2800;
const PANO_HEIGHT = 900;
const PANO_ANGLE = Math.PI; // coastline faces south

// Photo billboard material
let panoMat = null;

function createPanoMat() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uPanoTex:      { value: null },
      uSunDir:       { value: new THREE.Vector3(0, 0.4, -1).normalize() },
      uCamPos:       { value: new THREE.Vector3() },
      uFogColor:     { value: new THREE.Color(0.55, 0.7, 0.85) },
      uFogSunColor:  { value: new THREE.Color(0.8, 0.75, 0.6) }
    },
    vertexShader: `
      varying vec2 vUV;
      varying vec3 vWorldPos;
      void main() {
        vUV = uv;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uPanoTex;
      uniform vec3 uSunDir, uCamPos, uFogColor, uFogSunColor;
      varying vec2 vUV;
      varying vec3 vWorldPos;

      void main() {
        vec2 uv = vUV;

        vec4 texCol = texture2D(uPanoTex, uv);
        vec3 col = texCol.rgb;

        // Bottom edge: fade where image meets our 3D ocean
        float bottomFade = smoothstep(0.0, 0.12, vUV.y);

        // Top edge: fade sky into Three.js sky
        float topFade = smoothstep(1.0, 0.85, vUV.y);

        // Side fades -- soft edges
        float leftFade = smoothstep(0.0, 0.05, vUV.x);
        float rightFade = smoothstep(1.0, 0.95, vUV.x);

        float alpha = bottomFade * topFade * leftFade * rightFade;

        // Light atmospheric fog
        float cd = length(uCamPos - vWorldPos);
        float fog = 1.0 - exp(-cd * 0.00025);
        vec3 viewDir = normalize(vWorldPos - uCamPos);
        float sunDot = max(dot(viewDir, normalize(uSunDir)), 0.0);
        vec3 fogCol = mix(uFogColor, uFogSunColor, pow(sunDot, 4.0));
        col = mix(col, fogCol, fog * 0.5);

        gl_FragColor = vec4(col, alpha);
      }`
  });
}

function loadPanoTexture() {
  // Panorama system available for future use — no default panorama loaded
}

function buildPanoBackdrop() {
  removePanoBackdrop();
  if (!panoReady) return;
  panoMat.uniforms.uPanoTex.value = panoTexture;
  const geo = new THREE.PlaneGeometry(PANO_WIDTH, PANO_HEIGHT);
  state.panoCylinder = new THREE.Mesh(geo, panoMat);
  state.panoCylinder.position.set(
    Math.sin(PANO_ANGLE) * PANO_DIST,
    PANO_HEIGHT * 0.35,
    Math.cos(PANO_ANGLE) * PANO_DIST
  );
  state.panoCylinder.rotation.y = PANO_ANGLE;
  state.scene.add(state.panoCylinder);
  console.log('Pano backdrop built at', state.panoCylinder.position.toArray());
}

function removePanoBackdrop() {
  if (state.panoCylinder) {
    state.scene.remove(state.panoCylinder);
    state.panoCylinder.geometry.dispose();
    state.panoCylinder = null;
  }
}

function buildPanoCylinder() { buildPanoBackdrop(); }
function removePanoCylinder() { removePanoBackdrop(); }

/* ================================================================
   REAL TERRAIN — heightmap + satellite imagery
   ================================================================ */

// Terrain shader — satellite texture + fog + lighting
let realTerrainMat = null;

function createRealTerrainMat() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSatTex:      { value: null },
      uSunDir:      { value: new THREE.Vector3(0, 0.4, -1).normalize() },
      uCamPos:      { value: new THREE.Vector3() },
      uFogColor:    { value: new THREE.Color(0.55, 0.7, 0.85) },
      uFogSunColor: { value: new THREE.Color(0.8, 0.75, 0.6) },
      uWaterLevel:  { value: RT_WATER_Y() }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying vec2 vUV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormal = normalize(normalMatrix * normal);
        vUV = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uSatTex;
      uniform vec3 uSunDir, uCamPos, uFogColor, uFogSunColor;
      uniform float uWaterLevel;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying vec2 vUV;

      void main() {
        vec3 texCol = texture2D(uSatTex, vUV).rgb;
        texCol = pow(texCol, vec3(2.2)); // sRGB -> linear

        // Diffuse lighting
        float NdotL = max(dot(vNormal, normalize(uSunDir)), 0.0);
        float diffuse = 0.35 + 0.65 * NdotL;

        // Height-based ambient occlusion (darker in valleys)
        float aoFactor = smoothstep(0.0, 150.0, vWorldPos.y) * 0.25 + 0.75;

        vec3 col = texCol * diffuse * aoFactor;

        // Atmospheric fog (matches ocean fog)
        float dist = length(vWorldPos - uCamPos);
        float fogF = 1.0 - exp(-dist * 0.00018);
        vec3 viewDir = normalize(vWorldPos - uCamPos);
        float sunDot = max(dot(viewDir, normalize(uSunDir)), 0.0);
        vec3 fogCol = mix(uFogColor, uFogSunColor, pow(sunDot, 4.0));
        col = mix(col, fogCol, fogF);

        col = pow(col, vec3(1.0/2.2)); // linear -> sRGB

        // Fade out underwater terrain
        float underwaterFade = smoothstep(uWaterLevel - 5.0, uWaterLevel + 2.0, vWorldPos.y);
        if (underwaterFade < 0.01) discard;

        gl_FragColor = vec4(col, underwaterFade);
      }`
  });
  mat.transparent = true;
  mat.depthWrite = true;
  return mat;
}

// Asset cache — keyed by terrain config name (gorge, maliko, etc.)
const terrainAssetCache = {};

// Callback for async terrain loading
let _terrainReadyCallback = null;

// Load terrain assets on demand for a given config
function loadTerrainAssets(cfgName, callback) {
  if (terrainAssetCache[cfgName]) {
    // Already loaded
    callback(terrainAssetCache[cfgName]);
    return;
  }

  const cfg = terrainConfigs[cfgName];
  if (!cfg) { console.warn('Unknown terrain config:', cfgName); return; }

  const entry = { satTex: null, hmImg: null };
  let loaded = 0;
  function check() {
    loaded++;
    if (loaded === 2) {
      terrainAssetCache[cfgName] = entry;
      console.log(`Terrain assets loaded: ${cfg.label}`);
      callback(entry);
    }
  }

  const tLoader = new THREE.TextureLoader();
  tLoader.load(cfg.satellite, function(tex) {
    tex.encoding = THREE.sRGBEncoding;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = state.renderer.capabilities.getMaxAnisotropy();
    entry.satTex = tex;
    console.log(`Satellite loaded: ${cfg.label}`);
    check();
  });

  const hmImg = new Image();
  hmImg.onload = function() {
    entry.hmImg = hmImg;
    console.log(`Heightmap loaded: ${cfg.label} (${hmImg.width}x${hmImg.height})`);
    check();
  };
  hmImg.onerror = function() { console.warn(`Heightmap load failed: ${cfg.label}`); };
  hmImg.src = cfg.heightmap;
}

function buildRealTerrain(onReady) {
  if (onReady) _terrainReadyCallback = onReady;
  removeRealTerrain();
  // Find the config name by matching the active config object
  let cfgName = null;
  for (const [key, cfg] of Object.entries(terrainConfigs)) {
    if (state.activeTerrainCfg === cfg) { cfgName = key; break; }
  }
  if (!cfgName) return;

  const assets = terrainAssetCache[cfgName];
  if (!assets) {
    // Assets still loading — will be called again when ready
    loadTerrainAssets(cfgName, function() { buildRealTerrain(); });
    return;
  }

  state.realTerrainSatTex = assets.satTex;
  state.realTerrainHmImg = assets.hmImg;

  // Extract elevation data from heightmap
  const canvas = document.createElement('canvas');
  canvas.width = state.realTerrainHmImg.width;
  canvas.height = state.realTerrainHmImg.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(state.realTerrainHmImg, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  // -- Generate river mask: white = water, black = land --
  const WATER_THRESH = state.activeTerrainCfg.waterThresh || 12;
  const FEATHER = 4;       // pixels of edge softening
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const mCtx = maskCanvas.getContext('2d');
  const maskImg = mCtx.createImageData(canvas.width, canvas.height);
  const mData = maskImg.data;

  // First pass: binary mask
  for (let i = 0; i < canvas.width * canvas.height; i++) {
    const elev = pixels[i * 4]; // R channel = grayscale height
    const isWater = elev <= WATER_THRESH ? 255 : 0;
    mData[i * 4] = isWater;
    mData[i * 4 + 1] = isWater;
    mData[i * 4 + 2] = isWater;
    mData[i * 4 + 3] = 255;
  }
  mCtx.putImageData(maskImg, 0, 0);

  // Feather the edges with a blur for smooth shoreline
  if (FEATHER > 0) {
    mCtx.filter = `blur(${FEATHER}px)`;
    mCtx.drawImage(maskCanvas, 0, 0);
    mCtx.filter = 'none';
  }

  // Create Three.js texture from mask
  if (state.realTerrainRiverMask) state.realTerrainRiverMask.dispose();
  state.realTerrainRiverMask = new THREE.CanvasTexture(maskCanvas);
  state.realTerrainRiverMask.minFilter = THREE.LinearFilter;
  state.realTerrainRiverMask.magFilter = THREE.LinearFilter;
  state.realTerrainRiverMask.wrapS = THREE.ClampToEdgeWrapping;
  state.realTerrainRiverMask.wrapT = THREE.ClampToEdgeWrapping;
  console.log('River mask generated, threshold:', WATER_THRESH);

  // Build geometry — sample every 2 pixels for performance
  const step = 2;
  const geoSegX = Math.floor((canvas.width - 1) / step);
  const geoSegZ = Math.floor((canvas.height - 1) / step);

  const geometry = new THREE.PlaneGeometry(RT_WORLD_W(), RT_WORLD_D(), geoSegX, geoSegZ);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position.array;

  for (let i = 0; i <= geoSegZ; i++) {
    for (let j = 0; j <= geoSegX; j++) {
      const vertexIndex = i * (geoSegX + 1) + j;
      const px = Math.min(Math.floor((j / geoSegX) * (canvas.width - 1)), canvas.width - 1);
      const py = Math.min(Math.floor((i / geoSegZ) * (canvas.height - 1)), canvas.height - 1);
      const pixelIndex = (py * canvas.width + px) * 4;
      const heightValue = pixels[pixelIndex] / 255;
      positions[vertexIndex * 3 + 1] = heightValue * RT_ELEV_RANGE();
    }
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();

  // Set material textures
  realTerrainMat.uniforms.uSatTex.value = state.realTerrainSatTex;

  state.realTerrainMesh = new THREE.Mesh(geometry, realTerrainMat);

  // Position terrain so the river is roughly centered on the player start
  // Player starts at (0,0) — put terrain centered there
  // River runs east-west; north is -Z in our Three.js coordinate system
  state.realTerrainMesh.position.set(0, 0, 0);

  state.scene.add(state.realTerrainMesh);

  // Store height data for potential physics interaction
  state.realTerrainHeightData = { pixels, width: canvas.width, height: canvas.height };

  console.log('Real terrain built:', (geoSegX+1)*(geoSegZ+1), 'vertices');

  // Create a large flat water fill plane visible only OUTSIDE the ocean mesh.
  // Uses a shader to discard fragments inside the ocean bounds and over land.
  if (state.waterFillPlane) {
    state.scene.remove(state.waterFillPlane);
    state.waterFillPlane.geometry.dispose();
    state.waterFillPlane.material.dispose();
  }
  const fillSize = Math.max(RT_WORLD_W(), RT_WORLD_D()) * 3;
  const fillGeo = new THREE.PlaneGeometry(fillSize, fillSize);
  fillGeo.rotateX(-Math.PI / 2);
  const fillMat = new THREE.ShaderMaterial({
    uniforms: {
      uOceanMin: { value: new THREE.Vector2(0, 0) },  // updated each frame
      uOceanMax: { value: new THREE.Vector2(0, 0) },  // updated each frame
      uRiverMask: { value: state.realTerrainRiverMask },
      uUseRiverMask: { value: state.activeTerrainCfg.useRiverMask ? 1.0 : 0.0 },
      uTerrainBounds: { value: new THREE.Vector4(
        -RT_WORLD_W()/2, -RT_WORLD_D()/2, RT_WORLD_W()/2, RT_WORLD_D()/2
      )},
      uFogColor: { value: new THREE.Color(0.55, 0.7, 0.85) },
      uWaterColor: { value: new THREE.Color(0.30, 0.48, 0.58) },
      uCamPos: { value: new THREE.Vector3() }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec2 uOceanMin, uOceanMax;
      uniform sampler2D uRiverMask;
      uniform float uUseRiverMask;
      uniform vec4 uTerrainBounds; // minX, minZ, maxX, maxZ
      uniform vec3 uFogColor, uWaterColor, uCamPos;
      varying vec3 vWorldPos;
      void main() {
        // Discard if inside the ocean mesh bounds (ocean handles that area)
        if (vWorldPos.x > uOceanMin.x && vWorldPos.x < uOceanMax.x &&
            vWorldPos.z > uOceanMin.y && vWorldPos.z < uOceanMax.y) discard;

        // Discard if over land (using river mask)
        if (uUseRiverMask > 0.5) {
          vec2 tuv = vec2(
            (vWorldPos.x - uTerrainBounds.x) / (uTerrainBounds.z - uTerrainBounds.x),
            1.0 - (vWorldPos.z - uTerrainBounds.y) / (uTerrainBounds.w - uTerrainBounds.y)
          );
          if (tuv.x >= 0.0 && tuv.x <= 1.0 && tuv.y >= 0.0 && tuv.y <= 1.0) {
            float mask = texture2D(uRiverMask, tuv).r;
            if (mask < 0.3) discard; // land
          }
        }

        // Water color matches ocean wave tops, with distance fog
        float dist = length(vWorldPos - uCamPos);
        float fogF = 1.0 - exp(-dist * 0.00015);
        vec3 col = mix(uWaterColor, uFogColor, fogF);

        gl_FragColor = vec4(col, 0.92);
      }`,
    transparent: true,
    depthWrite: false
  });
  state.waterFillPlane = new THREE.Mesh(fillGeo, fillMat);
  state.waterFillPlane.position.y = RT_WATER_Y() - 0.05;
  state.waterFillPlane.renderOrder = -1;
  state.scene.add(state.waterFillPlane);

  // Notify caller that terrain is ready (handles async asset loading)
  if (_terrainReadyCallback) {
    const cb = _terrainReadyCallback;
    _terrainReadyCallback = null;
    cb();
  }
}

// Convert lat/lon to world coordinates using terrain geoBbox
export function geoToWorld(lat, lon) {
  const cfg = state.activeTerrainCfg;
  if (!cfg || !cfg.geoBbox) return { x: 0, z: 0 };
  const b = cfg.geoBbox;
  const u = (lon - b.west) / (b.east - b.west);     // 0=west, 1=east
  const v = (b.north - lat) / (b.north - b.south);   // 0=north (top of image), 1=south (bottom)
  const x = (u - 0.5) * cfg.worldW;
  const z = (v - 0.5) * cfg.worldD;                  // v=0 (north/top) → Z=-D/2, v=1 (south/bottom) → Z=+D/2
  console.log(`geoToWorld(${lat}, ${lon}) → u=${u.toFixed(4)} v=${v.toFixed(4)} → world(${x.toFixed(0)}, ${z.toFixed(0)})`);
  return { x, z };
}

// Find a good starting position in the water
export function findRiverStartPosition() {
  // Use explicit start position if configured
  if (state.activeTerrainCfg.startPos) return state.activeTerrainCfg.startPos;

  // Resolve from geoStart lat/lon if available
  if (state.activeTerrainCfg.geoStart && state.activeTerrainCfg.geoBbox) {
    const gs = state.activeTerrainCfg.geoStart;
    const pos = geoToWorld(gs.lat, gs.lon);
    const wY = state.activeTerrainCfg.waterY || 0;

    // If geo position lands on terrain, search nearby for water
    const h = getRealTerrainHeight(pos.x, pos.z);
    if (h === null || h > wY + 2) {
      for (let dz = -50; Math.abs(dz) <= 2000; dz = dz > 0 ? -(dz + 50) : -dz + 50) {
        const hTest = getRealTerrainHeight(pos.x, pos.z + dz);
        if (hTest !== null && hTest <= wY + 2) { pos.z += dz; break; }
      }
    }
    return { x: pos.x, z: pos.z, heading: Math.PI / 2 };
  }

  if (!state.realTerrainHeightData) return { x: 0, z: 0, heading: 0 };
  const d = state.realTerrainHeightData;
  const WATER_THRESH = state.activeTerrainCfg.waterThresh || 12;

  // If geoStart is configured, scan at the target column instead of 20%
  let startColPct = 0.20;
  if (state.activeTerrainCfg.geoStart && state.activeTerrainCfg.geoBbox) {
    const gs = state.activeTerrainCfg.geoStart;
    const b = state.activeTerrainCfg.geoBbox;
    startColPct = (gs.lon - b.west) / (b.east - b.west);
    console.log(`Auto-detect: scanning at column ${(startColPct*100).toFixed(1)}% for geoStart lon ${gs.lon}`);
  }
  const targetCol = Math.floor(d.width * startColPct);

  // Find all water pixels in this column
  let waterRows = [];
  for (let row = 0; row < d.height; row++) {
    const idx = (row * d.width + targetCol) * 4;
    if (d.pixels[idx] <= WATER_THRESH) {
      waterRows.push(row);
    }
  }

  // If no water found at 20%, scan progressively further east
  if (waterRows.length === 0) {
    for (let colPct = 0.25; colPct <= 0.5; colPct += 0.05) {
      const col = Math.floor(d.width * colPct);
      for (let row = 0; row < d.height; row++) {
        const idx = (row * d.width + col) * 4;
        if (d.pixels[idx] <= WATER_THRESH) {
          waterRows.push(row);
        }
      }
      if (waterRows.length > 0) {
        // Use the center of the water band
        const midRow = waterRows[Math.floor(waterRows.length / 2)];
        const u = col / (d.width - 1);
        const v = midRow / (d.height - 1);
        const worldX = (u - 0.5) * RT_WORLD_W();
        const worldZ = (v - 0.5) * RT_WORLD_D(); // v=0 (top/south) → Z=-D/2, v=1 (bottom/north) → Z=+D/2
        console.log(`River start found at col ${colPct*100}%: pixel(${col},${midRow}) -> world(${worldX.toFixed(0)}, ${worldZ.toFixed(0)})`);
        return { x: worldX, z: worldZ, heading: Math.PI/2 }; // heading PI/2 = east (+X, downriver)
      }
    }
    console.warn('No river water found, defaulting to center');
    return { x: 0, z: 0, heading: 0 };
  }

  // Use the center of the water band at the target column
  const midRow = waterRows[Math.floor(waterRows.length / 2)];
  const u = targetCol / (d.width - 1);
  const v = midRow / (d.height - 1);
  const worldX = (u - 0.5) * RT_WORLD_W();
  const worldZ = -(v - 0.5) * RT_WORLD_D(); // flip Z
  console.log(`River start: pixel(${targetCol},${midRow}) -> world(${worldX.toFixed(0)}, ${worldZ.toFixed(0)})`);
  return { x: worldX, z: worldZ, heading: Math.PI/2 }; // heading PI/2 = east (+X, downriver)
}

function removeRealTerrain() {
  if (state.realTerrainMesh) {
    state.scene.remove(state.realTerrainMesh);
    if (state.realTerrainMesh.geometry) state.realTerrainMesh.geometry.dispose();
    state.realTerrainMesh = null;
  }
  if (state.waterFillPlane) {
    state.scene.remove(state.waterFillPlane);
    if (state.waterFillPlane.geometry) state.waterFillPlane.geometry.dispose();
    if (state.waterFillPlane.material) state.waterFillPlane.material.dispose();
    state.waterFillPlane = null;
  }
}

// Query real terrain elevation at a world position
export function getRealTerrainHeight(worldX, worldZ) {
  if (!state.realTerrainHeightData || !state.realTerrainMesh) return null;
  const d = state.realTerrainHeightData;
  const localX = worldX - state.realTerrainMesh.position.x;
  const localZ = worldZ - state.realTerrainMesh.position.z;
  const u = (localX / RT_WORLD_W()) + 0.5;
  const v = (localZ / RT_WORLD_D()) + 0.5; // Z=-D/2 → v=0 (top of image), Z=+D/2 → v=1 (bottom)
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const px = Math.floor(u * (d.width - 1));
  const py = Math.floor(v * (d.height - 1));
  const idx = (py * d.width + px) * 4;
  return (d.pixels[idx] / 255) * RT_ELEV_RANGE();
}

/* ================================================================
   SHALLOW WATER COLLISION & RESTART
   ================================================================ */

export function restartLevel() {
  state.shallowTimer = 0;
  state.shallowStalled = false;
  const shallowWarningEl = document.getElementById('shallow-warning');
  const restartBtnEl = document.getElementById('restart-btn');
  if (shallowWarningEl) shallowWarningEl.classList.remove('show');
  if (restartBtnEl) restartBtnEl.style.display = 'none';
  const startPos = findRiverStartPosition();
  state.foil.x = startPos.x; state.foil.z = startPos.z; state.foil.heading = startPos.heading;
  state.foil.speed = 0; state.foil.rideH = 0; state.foil.pitch = 0; state.foil.roll = 0;
  state.foil.energy = 1;
}

/* ================================================================
   initTerrain — called once from main.js during startup
   ================================================================ */

export function initTerrain() {
  // Create silhouette material + mesh
  silhouetteMat = createSilhouetteMat();
  state.silhouetteMat = silhouetteMat;

  silhouetteMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(2500, 2500, 600, 128, 1, true),
    silhouetteMat
  );
  silhouetteMesh.position.y = -50; // sink base below water
  state.scene.add(silhouetteMesh);
  state.silhouetteMesh = silhouetteMesh;

  // Create cliff material
  cliffMat = createCliffMat();
  state.cliffMat = cliffMat;

  // Create terrain ring group
  const terrainGroup = new THREE.Group();
  state.scene.add(terrainGroup);
  state.terrainGroup = terrainGroup;

  // Set active terrain config
  state.activeTerrainCfg = terrainConfigs.gorge;

  // Create panoramic material
  panoMat = createPanoMat();
  state.panoMat = panoMat;

  // Create real terrain material
  realTerrainMat = createRealTerrainMat();
  state.realTerrainMat = realTerrainMat;

  // Load panoramic texture (Kauai)
  loadPanoTexture();

  // Store bgPresets in state so helpers.js can access it
  state.bgPresets = bgPresets;

  // Start with open ocean — no terrain data to load at startup
  rebuildTerrain('open-ocean');
}
