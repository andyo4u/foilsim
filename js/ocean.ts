// ──────────────────────────────────────────────────────────────
//  ocean.js  –  Ocean shader, CPU wave functions, env map,
//               wave chart, and render mode
//
//  Extracted from the monolithic index.html.
//  Everything that was a bare global now lives on the shared
//  `state` object, or is module-local where appropriate.
// ──────────────────────────────────────────────────────────────
//
//  TODO: Distant water blending — dark seam / black band at far ocean
//        mesh edge where sky meets water.  Ten approaches tried in
//        v0.1.33–v0.1.42 and reverted in v0.1.49:
//          • Alpha fade at mesh edge → transparent pixels revealed
//            the dark Preetham sky behind the ocean plane
//          • Horizon fill plane (50k×50k, y=-0.5, renderOrder=1,
//            depthTest:true/write:false) → still dark; transparent-
//            pass ordering likely puts the fill behind the sky dome
//          • Various fog color / clear-color tweaks → cosmetic only
//        Fresh approaches to try:
//          • Make ocean material transparent:false (opaque pass) so it
//            writes depth during opaque pass; then horizon fill (opaque,
//            renderOrder=1) paints only pixels where depth=FAR (sky)
//          • Match renderer.setClearColor exactly to uFogColor each
//            frame — simplest option: background IS the fog color so
//            there is no gap to fill
//          • LOD rings that progressively flatten wave mesh toward
//            horizon — eliminates the hard boundary altogether
//          • Vertex displacement on a second larger low-res plane that
//            samples simplified wave functions at distance
//
//  TODO: Reduce wave tiling — the gerstner pattern repeats
//        visibly at distance. Options:
//        • Add domain warping (offset UV by low-freq noise)
//        • Randomize gerstner phase offsets per component
//        • Add more non-harmonic wave directions to break grid
//        • Use hash-based noise injection in the vertex shader
//
//  TODO: Adaptive LOD / ocean sizing — dynamically adjust to
//        maintain target FPS:
//        • SEGMENTS: 512 (ultra) → 256 (high) → 128 (mobile)
//        • OCEAN_SIZE: shrink from 800 to 400 if GPU-bound —
//          smaller sim area = fewer vertices = faster, and the
//          camera is usually looking at nearby water anyway
//        • Fragment shader: skip fbm detail octaves for pixels
//          beyond a distance threshold (cheap LOD in shader)
//        • Rebuild oceanGeo on-the-fly when quality changes
//        • Half-res render + upscale on low-end GPUs
//        • Could measure FPS over N frames and auto-step down

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { state } from './state.js';
import { getVal, degToDir, lerp, smoothstep, convertSpeedToMs } from './helpers.js';

/* ── Module-local helpers (terrain accessors) ──────────────── */
function RT_WORLD_W() { return state.activeTerrainCfg ? state.activeTerrainCfg.worldW : 14382; }
function RT_WORLD_D() { return state.activeTerrainCfg ? state.activeTerrainCfg.worldD : 11054; }

/* ── Wave chart (module-local) ─────────────────────────────── */
let waveChartCanvas: HTMLCanvasElement | null = null;
let waveChartCtx: CanvasRenderingContext2D | null = null;
const CHART_W = 800, CHART_H = 80;
const waveChartData: { h: number; s: number; e: number; p: number }[] = [];
const CHART_MAX_SAMPLES = CHART_W;

// ═══════════════════════════
// ENVIRONMENT MAP
// ═══════════════════════════

function updateEnvMap() {
  // Render just the sky (not clouds/ocean) into a cubemap for reflections
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(1000);
  const eu = envSky.material.uniforms;
  const su = state.skyUniforms!;
  eu['turbidity'].value = su['turbidity'].value;
  eu['rayleigh'].value = su['rayleigh'].value;
  eu['mieCoefficient'].value = su['mieCoefficient'].value;
  eu['mieDirectionalG'].value = su['mieDirectionalG'].value;
  eu['sunPosition'].value.copy(su['sunPosition'].value);
  envScene.add(envSky);
  if (state.envMap) state.envMap.dispose();
  state.envMap = state.pmremGenerator!.fromScene(envScene).texture;
  state.scene!.environment = state.envMap;
  envSky.material.dispose();
  envSky.geometry.dispose();
}

// ═══════════════════════════
// OCEAN SHADER
// ═══════════════════════════

function initOcean() {
  // ── PMREMGenerator ──────────────────────────────────────
  state.pmremGenerator = new THREE.PMREMGenerator(state.renderer!);
  state.pmremGenerator!.compileCubemapShader();

  // ── Geometry ────────────────────────────────────────────
  const oceanGeo = new THREE.PlaneGeometry(state.oceanSize, state.oceanSize, state.oceanSegments, state.oceanSegments);
  oceanGeo.rotateX(-Math.PI / 2);
  state.oceanGeo = oceanGeo;

  // ── ShaderMaterial ──────────────────────────────────────
  const oceanMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: true,
    uniforms: {
      uTime:{value:0},uSunDir:{value:new THREE.Vector3(0,.4,-1).normalize()},uCamPos:{value:new THREE.Vector3()},
      uChopHeight:{value:.4},uChopDir:{value:new THREE.Vector2(.707,.707)},
      uSwell1:{value:new THREE.Vector4(-1,0,12,2)},uSwell2:{value:new THREE.Vector4(-.707,.707,8,.8)},uSwell3:{value:new THREE.Vector4(.34,-.94,16,.3)},
      uDeepColor:{value:new THREE.Color(0,.04,.12)},uShallowColor:{value:new THREE.Color(0,.15,.3)},uFoamColor:{value:new THREE.Color(.85,.9,.95)},
      uFogColor:{value:new THREE.Color(.55,.7,.85)},uFogSunColor:{value:new THREE.Color(.8,.75,.6)},
      uRiverMask:{value:null},uUseRiverMask:{value:0},
      uRiverBounds:{value:new THREE.Vector4(-RT_WORLD_W()/2, -RT_WORLD_D()/2, RT_WORLD_W()/2, RT_WORLD_D()/2)},
      uShowPocket:{value:0},
      uRenderMode:{value:0},
      uSwellSpeed:{value:new THREE.Vector3(11.176,11.176,11.176)},
      uOceanHalf:{value:state.oceanSize/2},
      uPowerUpPos:{value:new THREE.Vector3(0,-1000,0)},
      uPowerUpColor:{value:new THREE.Vector3(1,0.12,0.08)},
      uPowerUpActive:{value:0},
      uEnergyBoostPos:{value:new THREE.Vector3(0,-1000,0)},
      uEnergyBoostColor:{value:new THREE.Vector3(1,0.85,0.05)},
      uEnergyBoostActive:{value:0},
      uFbmOctaves:{value:5},
      uDetailLevel:{value:2},
      uPerfMode:{value:0},
      uSurfaceDetail:{value:1.0},
    },
    vertexShader: `
    precision highp float;
    uniform float uTime;uniform float uChopHeight;uniform vec2 uChopDir;
    uniform vec4 uSwell1,uSwell2,uSwell3;uniform vec3 uSwellSpeed;
    uniform float uFbmOctaves;uniform float uDetailLevel;uniform float uOceanHalf;
    varying vec3 vWorldPos;varying vec3 vNormal;varying float vFoam;varying float vHeight;varying vec2 vLocalPos;
    vec2 hash2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453)*2.-1.;}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(dot(hash2(i),f),dot(hash2(i+vec2(1,0)),f-vec2(1,0)),u.x),mix(dot(hash2(i+vec2(0,1)),f-vec2(0,1)),dot(hash2(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);}
    float fbm(vec2 p){float v=0.,a=.5;mat2 r=mat2(.8,.6,-.6,.8);for(int i=0;i<6;i++){if(float(i)>=uFbmOctaves)break;v+=a*noise(p);p=r*p*2.03;a*=.48;}return v;}
    vec3 gw(vec2 pos,vec2 dir,float per,float ht,float t,float spdIn,out vec3 T,out vec3 B){
      float wl=1.56*per*per,k=6.28318/wl,spd=spdIn>0.01?spdIn:sqrt(9.81/k),st=min(ht*k/2.,.4);
      float ph=k*dot(dir,pos)-spd*t*k,s=sin(ph),c=cos(ph),a=ht*.5;
      T=vec3(1.-st*dir.x*dir.x*c,st*dir.x*s,-st*dir.x*dir.y*c);
      B=vec3(-st*dir.x*dir.y*c,st*dir.y*s,1.-st*dir.y*dir.y*c);
      return vec3(-dir.x*a*st*s,a*c,-dir.y*a*st*s);
    }
    void main(){
      vec3 pos=(modelMatrix*vec4(position,1.0)).xyz;
      // Edge fade: smoothly kill waves near mesh boundary
      float radialDist=length(position.xz);
      float edgeFade=1.0-smoothstep(uOceanHalf*0.6,uOceanHalf*0.95,radialDist);
      vec3 d=vec3(0),T=vec3(1,0,0),B_=vec3(0,0,1),t1,b1;
      if(uSwell1.w>.01){d+=gw(pos.xz,uSwell1.xy,uSwell1.z,uSwell1.w*edgeFade,uTime,uSwellSpeed.x,t1,b1);T+=t1-vec3(1,0,0);B_+=b1-vec3(0,0,1);
        d+=gw(pos.xz,uSwell1.xy*1.07,uSwell1.z*.7,uSwell1.w*.22*edgeFade,uTime*1.05+7.3,uSwellSpeed.x,t1,b1);T+=t1-vec3(1,0,0);B_+=b1-vec3(0,0,1);}
      if(uSwell2.w>.01){d+=gw(pos.xz,uSwell2.xy,uSwell2.z,uSwell2.w*edgeFade,uTime,uSwellSpeed.y,t1,b1);T+=t1-vec3(1,0,0);B_+=b1-vec3(0,0,1);
        d+=gw(pos.xz,uSwell2.xy*.95,uSwell2.z*.65,uSwell2.w*.2*edgeFade,uTime*.98+13.7,uSwellSpeed.y,t1,b1);T+=t1-vec3(1,0,0);B_+=b1-vec3(0,0,1);}
      if(uSwell3.w>.01){d+=gw(pos.xz,uSwell3.xy,uSwell3.z,uSwell3.w*edgeFade,uTime,uSwellSpeed.z,t1,b1);T+=t1-vec3(1,0,0);B_+=b1-vec3(0,0,1);}
      if(uChopHeight>.01){float ch=uChopHeight*edgeFade;vec2 cd=uChopDir;
        d+=gw(pos.xz,cd,3.,ch*.5,uTime,0.0,t1,b1);T+=t1-vec3(1,0,0);B_+=b1-vec3(0,0,1);
        d+=gw(pos.xz,vec2(cd.y,-cd.x)*.8+cd*.6,2.2,ch*.35,uTime*1.1+4.7,0.0,t1,b1);T+=t1-vec3(1,0,0);B_+=b1-vec3(0,0,1);
        d+=gw(pos.xz,cd*.7+vec2(-cd.y,cd.x)*.7,1.8,ch*.25,uTime*1.3+11.1,0.0,t1,b1);T+=t1-vec3(1,0,0);B_+=b1-vec3(0,0,1);
        d+=gw(pos.xz,cd*.9+vec2(cd.y,-cd.x)*.4,1.3,ch*.18,uTime*.9+8.3,0.0,t1,b1);T+=t1-vec3(1,0,0);B_+=b1-vec3(0,0,1);}
      if(uDetailLevel>0.5){
        float det=fbm(pos.xz*mix(.08,.02,smoothstep(50.,400.,length(pos.xz)))+uTime*.15)*.3+fbm(pos.xz*.03-uTime*.08)*.15;
        d.y+=det*(uChopHeight+.2)*edgeFade;
      }
      pos+=d;
      vNormal=normalize(cross(B_,T));if(vNormal.y<0.)vNormal=-vNormal;
      float jac=T.x*B_.z-T.z*B_.x;vFoam=smoothstep(.3,-.1,jac)*.8;
      if(uDetailLevel>0.5){vFoam+=smoothstep(.4,.8,fbm(pos.xz*.15+uTime*.2))*.2*uChopHeight;}
      vFoam=clamp(vFoam,0.,1.);
      vWorldPos=pos;vHeight=d.y;vLocalPos=position.xz;
      gl_Position=projectionMatrix*viewMatrix*vec4(pos,1.0);
    }`,
    fragmentShader: `
    precision highp float;
    uniform float uTime;uniform float uRenderMode;uniform float uShowPocket;uniform float uOceanHalf;
    uniform vec3 uSunDir,uCamPos,uDeepColor,uShallowColor,uFoamColor,uFogColor,uFogSunColor;
    uniform vec4 uSwell1;
    uniform sampler2D uRiverMask;uniform float uUseRiverMask;uniform vec4 uRiverBounds;
    uniform vec3 uPowerUpPos,uPowerUpColor;uniform float uPowerUpActive;
    uniform vec3 uEnergyBoostPos,uEnergyBoostColor;uniform float uEnergyBoostActive;
    uniform float uFbmOctaves;uniform float uDetailLevel;uniform float uPerfMode;uniform float uSurfaceDetail;
    varying vec3 vWorldPos,vNormal;varying float vFoam,vHeight;varying vec2 vLocalPos;
    vec2 hash2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453)*2.-1.;}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(dot(hash2(i),f),dot(hash2(i+vec2(1,0)),f-vec2(1,0)),u.x),mix(dot(hash2(i+vec2(0,1)),f-vec2(0,1)),dot(hash2(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);}
    float fbm(vec2 p){float v=0.,a=.5;mat2 r=mat2(.8,.6,-.6,.8);for(int i=0;i<6;i++){if(float(i)>=uFbmOctaves)break;v+=a*noise(p);p=r*p*2.03;a*=.48;}return v;}
    // 3D gradient noise for detail normals and sun glitter
    vec3 hash33(vec3 p) {
      p = vec3(dot(p,vec3(127.1,311.7,74.7)),
               dot(p,vec3(269.5,183.3,246.1)),
               dot(p,vec3(113.5,271.9,124.6)));
      return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
    }
    float noise3D(vec3 p) {
      vec3 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(dot(hash33(i+vec3(0,0,0)),f-vec3(0,0,0)),
                         dot(hash33(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                     mix(dot(hash33(i+vec3(0,1,0)),f-vec3(0,1,0)),
                         dot(hash33(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
                 mix(mix(dot(hash33(i+vec3(0,0,1)),f-vec3(0,0,1)),
                         dot(hash33(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                     mix(dot(hash33(i+vec3(0,1,1)),f-vec3(0,1,1)),
                         dot(hash33(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
    }
    // Detail normal perturbation — 2-octave 3D gradient noise, fades with distance
    vec3 detailNormal(vec3 worldPos, vec3 N, float dist) {
      if (uSurfaceDetail < 0.01) return N;
      float fade = 1.0 - smoothstep(20.0, 200.0, dist);
      if (fade < 0.01) return N;
      float e = 0.15;
      vec3 p = worldPos * 0.8 + vec3(uTime * 0.3, 0.0, uTime * 0.15);
      float n0 = noise3D(p);
      float nx = noise3D(p + vec3(e, 0, 0));
      float nz = noise3D(p + vec3(0, 0, e));
      // Second octave (gated by detail level)
      if (uDetailLevel > 1.5) {
        vec3 p2 = worldPos * 2.5 + vec3(uTime * 0.5, 0.0, uTime * 0.25);
        float n0b = noise3D(p2) * 0.3;
        float nxb = noise3D(p2 + vec3(e, 0, 0)) * 0.3;
        float nzb = noise3D(p2 + vec3(0, 0, e)) * 0.3;
        n0 += n0b; nx += nxb; nz += nzb;
      }
      vec3 perturbation = normalize(vec3(-(nx - n0) / e, 1.0, -(nz - n0) / e));
      return normalize(mix(N, perturbation, fade * 0.35 * uSurfaceDetail));
    }
    // Performance detail normal — 1 octave, 2D noise, tighter fade
    vec3 detailNormalPerf(vec3 worldPos, vec3 N, float dist) {
      if (uSurfaceDetail < 0.01) return N;
      float fade = 1.0 - smoothstep(15.0, 80.0, dist);
      if (fade < 0.01) return N;
      float e = 0.2;
      vec2 p = worldPos.xz * 0.8 + vec2(uTime * 0.3, uTime * 0.15);
      float n0 = noise(p);
      float nx = noise(p + vec2(e, 0.0));
      float nz = noise(p + vec2(0.0, e));
      vec3 perturbation = normalize(vec3(-(nx - n0) / e, 1.0, -(nz - n0) / e));
      return normalize(mix(N, perturbation, fade * 0.3 * uSurfaceDetail));
    }
    // Analytical atmospheric scattering (Rayleigh + Mie) for sky reflection & fog
    vec3 atmosphericScattering(vec3 dir, vec3 sunDir) {
      float sunDot = max(dot(dir, sunDir), 0.0);
      float y = max(dir.y, 0.001);
      // Rayleigh scattering
      vec3 rayleigh = vec3(0.22, 0.45, 0.75) * (1.0 + pow(sunDot, 2.0)) * 0.85;
      // Mie scattering (sun glow)
      float mie = pow(sunDot, 64.0) * 0.7 + pow(sunDot, 256.0) * 1.8;
      vec3 mieColor = vec3(1.0, 0.92, 0.75) * mie;
      // Horizon absorption — blue-teal tinted, warm near sun
      float horizon = exp(-y * 3.0);
      vec3 horizonColor = mix(vec3(0.55, 0.7, 0.85), vec3(1.0, 0.75, 0.45), pow(sunDot, 4.0));
      vec3 sky = rayleigh / (y * 1.2 + 0.12) * 0.18;
      sky += mieColor;
      sky = mix(sky, horizonColor, horizon * 0.75);
      // Sun disc
      float sunDisc = smoothstep(0.9997, 0.9999, sunDot);
      sky += vec3(3.0, 2.5, 1.8) * sunDisc;
      // Upper sky brightness
      sky *= mix(0.45, 1.0, smoothstep(0.0, 0.45, y));
      return sky;
    }
    void main(){
      // River mask: discard fragments outside the river
      if (uUseRiverMask > 0.5) {
        vec2 muv = vec2(
          (vWorldPos.x - uRiverBounds.x) / (uRiverBounds.z - uRiverBounds.x),
          1.0 - (vWorldPos.z - uRiverBounds.y) / (uRiverBounds.w - uRiverBounds.y)
        );
        if (muv.x < 0.0 || muv.x > 1.0 || muv.y < 0.0 || muv.y > 1.0) discard;
        float mask = texture2D(uRiverMask, muv).r;
        if (mask < 0.08) discard;
      }

      // Soft shoreline edge alpha (used by both paths)
      float alpha = 1.0;
      if (uUseRiverMask > 0.5) {
        vec2 muv = vec2(
          (vWorldPos.x - uRiverBounds.x) / (uRiverBounds.z - uRiverBounds.x),
          1.0 - (vWorldPos.z - uRiverBounds.y) / (uRiverBounds.w - uRiverBounds.y)
        );
        alpha = smoothstep(0.08, 0.35, texture2D(uRiverMask, muv).r);
      }

      if (uRenderMode > 11.5) {
        // ═══ POCKET HIGHLIGHTS PATH ═══
        // Normal PBR render with pocket zones always highlighted
        vec3 N=normalize(vNormal),V=normalize(uCamPos-vWorldPos),L=normalize(uSunDir);
        float e=.5;vec2 p=vWorldPos.xz;
        float cd=length(uCamPos-vWorldPos);
        float nFade=1.0-smoothstep(uOceanHalf*0.05,uOceanHalf*0.30,cd);
        N=normalize(N+vec3(noise(p*.8+uTime*.3+vec2(e,0))-noise(p*.8+uTime*.3-vec2(e,0)),0,noise(p*.8+uTime*.3+vec2(0,e))-noise(p*.8+uTime*.3-vec2(0,e)))*.12*nFade);
        if(cd<uOceanHalf*0.25){float d2=1.-smoothstep(0.,uOceanHalf*0.25,cd);
          N=normalize(N+vec3(noise(p*3.+uTime*.5+vec2(e,0))-noise(p*3.+uTime*.5-vec2(e,0)),0,noise(p*3.+uTime*.5+vec2(0,e))-noise(p*3.+uTime*.5-vec2(0,e)))*.06*d2);}
        N=normalize(mix(N,vec3(0.0,1.0,0.0),smoothstep(uOceanHalf*0.15,uOceanHalf*0.85,cd)*0.80));
        float fr=pow(1.-max(dot(N,V),0.),4.);fr=mix(.04,1.,fr);
        vec3 wc=mix(uDeepColor,uShallowColor,smoothstep(-1.,2.,vHeight)*.5+fr*.3);
        // TODO: re-enable crest SSS + sun glitter for locations that benefit (see v0.1.59)
        // - Wave crest turquoise shift (backlit thin water): crestF, wc mix
        // - Height-modulated SSS teal glow: sssMask, sssC with pow 2.5
        // - Broad sun glitter: pow(NdH,8)*.12 term
        // Reverted for FPS — revisit per-location
        vec3 sssC=vec3(0,.35,.3)*pow(max(dot(V,-L+N*.6),0.),3.)*.1;
        vec3 H=normalize(L+V);float NdH=max(dot(N,H),0.);
        vec3 sunS=vec3(1,.95,.8)*(pow(NdH,256.)*2.5+pow(NdH,64.)*.5);
        vec3 R=reflect(-V,N);vec3 skyR=mix(uFogColor,uFogColor*.3+vec3(.02,.05,.15),pow(max(R.y,0.),.5));
        float srDot=max(dot(R,L),0.);skyR+=uFogSunColor*pow(srDot,8.)*.3;skyR+=vec3(1,.9,.7)*pow(srDot,64.)*.5;
        vec3 col=mix(wc+sssC,skyR+sunS,fr);col+=uFogColor*(0.06+smoothstep(0.,0.25,uSunDir.y)*0.04);
        float fp=noise(vWorldPos.xz*1.5+uTime*.2)*.5+.5;fp*=noise(vWorldPos.xz*4.-uTime*.15)*.5+.5;
        col=mix(col,uFoamColor*(.8+.2*fp),smoothstep(.15,.6,vFoam*fp)*.85);
        // ── Pocket highlight (always on) ──
        // pocketLo: zero below mid-wave, full at upper face
        // pocketHi: full just below the lip, zero at the crest
        float pocketLo=smoothstep(uSwell1.w*0.30,uSwell1.w*0.65,vHeight);
        float pocketHi=1.0-smoothstep(uSwell1.w*0.80,uSwell1.w*1.0,vHeight);
        float faceFactor=smoothstep(0.08,0.35,-dot(N.xz,uSwell1.xy));
        float pocket=pocketLo*pocketHi*faceFactor;
        float pulse=0.75+0.25*sin(uTime*2.5);
        vec3 pocketCol=vec3(0.1,1.0,0.7);
        col=mix(col,pocketCol,pocket*pulse*0.75);
        float fog=1.-exp(-cd*.002);
        fog=mix(fog,1.0,smoothstep(uOceanHalf*0.40,uOceanHalf*0.95,cd));
        col=mix(col,max(mix(uFogColor,uFogSunColor,pow(max(dot(normalize(vWorldPos-uCamPos),L),0.),4.)),vec3(0.25,0.22,0.38)),fog);
        gl_FragColor=vec4(col, alpha);
      } else if (uRenderMode > 10.5) {
        // ═══ WATERCOLOR PATH ═══
        vec3 N = normalize(vNormal);
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 L = normalize(uSunDir);
        float cd = length(uCamPos - vWorldPos);

        // Paper texture
        // Cold-pressed watercolor paper has visible tooth/grain
        // Two frequencies: coarse grain structure + fine fiber texture
        float paperGrain = noise(vWorldPos.xz * 12.0) * 0.5 + 0.5;
        float paperFiber = noise(vWorldPos.xz * 45.0 + 7.3) * 0.5 + 0.5;
        float paperTex = paperGrain * 0.7 + paperFiber * 0.3;
        // Paper base: warm off-white like Arches rough
        vec3 paperColor = vec3(0.96, 0.94, 0.89) - vec3(0.03, 0.02, 0.01) * (1.0 - paperTex);

        // Wave topology mapping
        float hNorm = clamp((vHeight + 3.0) / 7.0, 0.0, 1.0);
        float steepness = clamp((1.0 - N.y) * 2.5, 0.0, 1.0);
        float NdotL = max(dot(N, L), 0.0);

        // Watercolor pigment palette
        // Real watercolor ocean pigments: cerulean blue, ultramarine, viridian,
        // with warm burnt sienna undertones in shadows
        vec3 cerulean    = vec3(0.12, 0.45, 0.72);
        vec3 ultramarine = vec3(0.15, 0.18, 0.58);
        vec3 viridian    = vec3(0.10, 0.50, 0.42);
        vec3 burntSienna = vec3(0.55, 0.28, 0.12);
        vec3 paynesGrey  = vec3(0.20, 0.22, 0.28);

        // Pigment selection varies with height and slow noise for organic variety
        float pigmentShift = fbm(vWorldPos.xz * 0.06 + uTime * 0.02) * 0.5 + 0.5;
        float depthShift = fbm(vWorldPos.xz * 0.12 - uTime * 0.015 + pigmentShift * 1.2);

        // Mix pigments: crests lean cerulean/viridian, troughs lean ultramarine/payne's grey
        vec3 pigment = mix(
          mix(ultramarine, paynesGrey, smoothstep(-0.2, 0.3, depthShift)),
          mix(cerulean, viridian, smoothstep(0.3, 0.7, pigmentShift)),
          hNorm
        );
        // Warm undertone in shadowed areas (burnt sienna granulates in valleys)
        pigment = mix(pigment, burntSienna, (1.0 - NdotL) * (1.0 - hNorm) * 0.15);

        // Wet-on-wet diffusion
        // Watercolor's signature: pigment bleeds organically when paper is wet
        // Use cascading fbm to simulate water migration on wet paper
        float wetness = smoothstep(0.2, 0.8, 1.0 - hNorm); // troughs are wetter
        float diffuse1 = fbm(vWorldPos.xz * 0.18 + uTime * 0.03);
        float diffuse2 = fbm(vWorldPos.xz * 0.35 + uTime * 0.05 + diffuse1 * 2.0);
        float diffuse3 = noise(vWorldPos.xz * 0.7 + diffuse2 * 1.5 + uTime * 0.02);
        // Diffusion warps the pigment concentration
        float diffusionAmount = wetness * (0.3 + 0.4 * smoothstep(-0.3, 0.4, diffuse1));
        // Pigment pools where diffusion converges
        float pigmentPool = smoothstep(0.1, 0.6, diffuse2) * diffusionAmount;

        // Pigment concentration / wash layering
        // Watercolor builds up in layers (washes). Thin wash = paper shows through.
        // Thick wash = saturated pigment. Height determines wash thickness.
        float washThickness = mix(0.15, 0.85, 1.0 - hNorm); // thin on crests, thick in troughs
        washThickness += pigmentPool * 0.3; // extra pigment where it pools
        washThickness += steepness * 0.15;  // steep faces catch more pigment running down
        washThickness = clamp(washThickness, 0.0, 1.0);

        // Pigment granulation
        // Some pigments (ultramarine, cerulean) granulate: they settle into
        // the paper's texture valleys, creating a speckled appearance
        float granulation = paperGrain * paperGrain; // stronger in paper valleys
        // Granulation is more visible in medium-thick washes
        float granulationStr = smoothstep(0.2, 0.5, washThickness) * smoothstep(0.9, 0.6, washThickness);
        float granulationEffect = granulation * granulationStr * 0.4;
        // Granulation darkens valleys, lightens peaks of paper texture
        washThickness += (granulation - 0.5) * granulationStr * 0.25;

        // Cauliflower / bloom effect
        // When wet paint meets a drying edge, pigment pushes outward creating
        // distinctive fractal "cauliflower" shapes with dark rims
        float bloomNoise = fbm(vWorldPos.xz * 0.4 + diffuse1 * 3.0 + uTime * 0.01);
        float bloomEdge = smoothstep(0.25, 0.35, bloomNoise) * smoothstep(0.65, 0.55, bloomNoise);
        // Bloom creates a dark pigment rim where wet meets dry
        float bloomRim = bloomEdge * wetness * 0.6;
        // Inside the bloom: lighter (pigment pushed away from center)
        float bloomCenter = smoothstep(0.35, 0.5, bloomNoise) * smoothstep(0.55, 0.5, bloomNoise);
        float bloomLighten = bloomCenter * wetness * 0.3;

        // Flow patterns (wet paint following gravity/tilt)
        // On steep wave faces, paint runs downhill creating directional streaks
        vec2 grad = vec2(N.x, N.z);
        float gradLen = length(grad);
        vec2 flowDir = gradLen > 0.001 ? grad / gradLen : vec2(1.0, 0.0);
        float flowProj = dot(vWorldPos.xz, flowDir);
        float flowStreak = noise(vec2(flowProj * 2.5, dot(vWorldPos.xz, vec2(-flowDir.y, flowDir.x)) * 0.4) + uTime * 0.02);
        float flowEffect = smoothstep(0.2, 0.6, flowStreak) * steepness * 0.3;

        // Composite: blend pigment onto paper
        // Final wash concentration combines all effects
        float finalConc = washThickness + bloomRim - bloomLighten + flowEffect;
        finalConc = clamp(finalConc, 0.0, 1.0);

        // Watercolor mixing: pigment over paper (not opaque paint—light passes through)
        // Thin washes: paper luminance shows through tinted by pigment
        // Thick washes: saturated pigment dominates
        vec3 thinWash = paperColor * (vec3(1.0) - pigment * 0.4); // paper tinted by pigment
        vec3 thickWash = pigment * (0.35 + 0.25 * paperTex);      // pigment with paper texture showing
        vec3 col = mix(thinWash, thickWash, finalConc);

        // Granulation darkening in thick areas
        col -= vec3(0.06, 0.04, 0.02) * granulationEffect * finalConc;

        // Dry brush on crests
        // Wave crests and foam: paper shows through in a broken, ragged way
        // Simulates dragging a nearly-dry brush across textured paper
        float dryBrush = smoothstep(0.55, 0.85, hNorm);
        // Dry brush skips over paper valleys (only catches the peaks)
        float dryBrushMask = smoothstep(0.45, 0.75, paperGrain);
        float dryBrushEffect = dryBrush * dryBrushMask;
        // Foam enhances the dry brush look
        float foamDry = smoothstep(0.15, 0.55, vFoam);
        dryBrushEffect = max(dryBrushEffect, foamDry * dryBrushMask * 0.8);
        // Dry brush reveals paper through the pigment
        col = mix(col, paperColor * 0.98, dryBrushEffect * 0.7);

        // Subtle sun warmth
        // Light hitting the paper/wash creates warm glow
        col += vec3(0.04, 0.03, 0.01) * NdotL * (1.0 - finalConc * 0.5);
        // Gentle specular: watercolor paper has a soft sheen when wet
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 16.0);
        col += vec3(0.96, 0.94, 0.90) * spec * 0.08 * wetness;

        // Edge darkening (pigment accumulates at wash boundaries)
        // The hallmark of watercolor: darker rims where a wash dried
        float edgeNoise = noise(vWorldPos.xz * 1.5 + uTime * 0.01);
        float edge = smoothstep(0.3, 0.5, steepness) * (0.5 + 0.5 * edgeNoise);
        col = mix(col, pigment * 0.4, edge * 0.25);

        // Atmospheric perspective (distant washes)
        // Watercolor landscapes fade to a pale, cool wash in the distance
        float fog = 1.0 - exp(-cd * 0.001);
        // Distant wash: very dilute cerulean/lavender on paper
        vec3 distantWash = mix(
          vec3(0.82, 0.86, 0.92),  // cool lavender-grey
          vec3(0.90, 0.87, 0.80),  // warm paper-toned towards sun
          pow(max(dot(normalize(vWorldPos - uCamPos), L), 0.0), 3.0)
        );
        col = mix(col, distantWash, fog);
        // Extra distance fade for the watercolor look (paintings fade fast at distance)
        col = mix(col, distantWash, smoothstep(200.0, 600.0, cd) * 0.45);

        gl_FragColor = vec4(col, alpha);
      } else if (uRenderMode > 9.5) {
        // ═══ FUR PATH ═══
        vec3 N = normalize(vNormal);
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 L = normalize(uSunDir);
        float cd = length(uCamPos - vWorldPos);

        // ── Fur base color (warm animal tones with height variation) ──
        float hNorm = clamp((vHeight + 3.0) / 7.0, 0.0, 1.0);
        vec3 undercoat = mix(vec3(0.18, 0.10, 0.05), vec3(0.35, 0.22, 0.10), hNorm);
        vec3 tipColor  = mix(vec3(0.45, 0.30, 0.15), vec3(0.70, 0.55, 0.30), hNorm);

        // ── Fur strand pattern ──
        // Strands follow the wave gradient (like fur combed by flow)
        vec2 grad = vec2(N.x, N.z);
        float gradLen = length(grad);
        vec2 furDir = gradLen > 0.001 ? grad / gradLen : vec2(1.0, 0.0);
        // Perpendicular to flow = across the strands
        vec2 furPerp = vec2(-furDir.y, furDir.x);

        // High-frequency strand lines across the fur direction
        float strandFreq = 15.0 / max(1.0, cd * 0.008);
        float strandProj = dot(vWorldPos.xz, furPerp);
        float strandRaw = fract(strandProj * strandFreq);
        // Noise perturbs each strand for organic irregularity
        float strandNoise = noise(vWorldPos.xz * 8.0 + uTime * 0.05) * 0.3;
        strandRaw = fract(strandRaw + strandNoise);
        // Strand shape: thin bright tips with darker gaps between
        float strand = smoothstep(0.0, 0.25, strandRaw) * smoothstep(1.0, 0.55, strandRaw);

        // ── Multiple fur layers (depth illusion) ──
        // Second layer at different frequency for density
        float strand2Proj = dot(vWorldPos.xz, furPerp * 1.3 + furDir * 0.4);
        float strand2Raw = fract(strand2Proj * strandFreq * 0.7 + noise(vWorldPos.xz * 5.0) * 0.4);
        float strand2 = smoothstep(0.0, 0.3, strand2Raw) * smoothstep(1.0, 0.5, strand2Raw);

        // Combine layers
        float furDensity = max(strand * 0.8, strand2 * 0.5);

        // ── Steepness affects fur lay direction ──
        // Steep faces = fur standing up (shows more undercoat/roots)
        float steepness = clamp((1.0 - N.y) * 2.5, 0.0, 1.0);
        // Flat = smooth fur tips; steep = ruffled showing roots
        float tipMix = mix(0.7, 0.2, steepness);

        // ── Color: blend undercoat ↔ tips based on strand + steepness ──
        vec3 furCol = mix(undercoat, tipColor, furDensity * tipMix);

        // ── Subtle color variation (natural fur has highlights/lowlights) ──
        float colorVar = noise(vWorldPos.xz * 1.2 + 42.0);
        furCol *= 0.85 + 0.3 * colorVar;

        // ── Anisotropic fur lighting ──
        // Kajiya-Kay style: light scattering along strand direction
        vec3 T = normalize(vec3(furDir.x, 0.0, furDir.y)); // tangent along fur
        float TdotH = dot(T, normalize(L + V));
        float anisoSpec = pow(sqrt(max(0.0, 1.0 - TdotH * TdotH)), 24.0);
        // Diffuse wraps softly for fluffy look
        float NdotL = max(dot(N, L), 0.0);
        float diffuse = 0.35 + 0.55 * NdotL;
        // Rim light catching the fur tips from behind
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);

        vec3 col = furCol * diffuse;
        col += tipColor * anisoSpec * 0.6;  // strand specular highlight
        col += tipColor * rim * 0.25;        // backlit fur rim

        // ── Wind ruffling (animate strand offset slowly) ──
        float windRuffle = noise(vWorldPos.xz * 0.3 + uTime * 0.4) * 0.15;
        col *= 1.0 + windRuffle;

        // ── Foam as white fluffy tufts ──
        float foamAmt = smoothstep(0.2, 0.6, vFoam);
        vec3 fluffWhite = vec3(0.90, 0.88, 0.82) * (0.5 + 0.5 * diffuse);
        col = mix(col, fluffWhite, foamAmt * 0.65);

        // ── Warm hazy fog ──
        float fog = 1.0 - exp(-cd * 0.0012);
        vec3 fogCol = mix(vec3(0.55, 0.45, 0.35), vec3(0.70, 0.55, 0.40), pow(max(dot(normalize(vWorldPos - uCamPos), L), 0.0), 3.0));
        col = mix(col, fogCol, fog);

        gl_FragColor = vec4(col, alpha);

      } else if (uRenderMode > 8.5) {
        // ═══ HOT LAVA PATH ═══
        vec3 N = normalize(vNormal);
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 L = normalize(uSunDir);
        float cd = length(uCamPos - vWorldPos);

        // ── Cooling crust vs molten core ──
        // Height maps to temperature: troughs = hottest molten, crests = cooling crust
        float hNorm = clamp((vHeight + 3.0) / 7.0, 0.0, 1.0);

        // ── Molten lava color ramp (black → red → orange → yellow → white-hot) ──
        float temp = 1.0 - hNorm; // invert: low = hot, high = cooled
        // Add animated convection currents
        float conv1 = fbm(vWorldPos.xz * 0.15 + uTime * 0.08);
        float conv2 = noise(vWorldPos.xz * 0.4 + uTime * 0.12 + conv1 * 1.5);
        temp += conv1 * 0.25 + conv2 * 0.1;
        temp = clamp(temp, 0.0, 1.0);

        vec3 lavaCol;
        if (temp < 0.25) {
          // Cooled black crust
          lavaCol = mix(vec3(0.05, 0.03, 0.02), vec3(0.15, 0.04, 0.02), temp / 0.25);
        } else if (temp < 0.5) {
          // Dark red, starting to glow
          lavaCol = mix(vec3(0.15, 0.04, 0.02), vec3(0.65, 0.10, 0.02), (temp - 0.25) / 0.25);
        } else if (temp < 0.75) {
          // Hot orange
          lavaCol = mix(vec3(0.65, 0.10, 0.02), vec3(1.0, 0.45, 0.05), (temp - 0.5) / 0.25);
        } else {
          // White-hot yellow
          lavaCol = mix(vec3(1.0, 0.45, 0.05), vec3(1.0, 0.85, 0.3), (temp - 0.75) / 0.25);
        }

        // ── Crust cracks (dark lines revealing molten underneath) ──
        // Use the wave gradient direction to orient cracks
        vec2 grad = vec2(N.x, N.z);
        float gradLen = length(grad);
        vec2 crackDir = gradLen > 0.001 ? grad / gradLen : vec2(1.0, 0.0);
        float crackProj = dot(vWorldPos.xz, crackDir);
        float crack1 = noise(vec2(crackProj * 3.0, dot(vWorldPos.xz, vec2(-crackDir.y, crackDir.x)) * 2.0) + uTime * 0.02);
        float crack2 = noise(vWorldPos.xz * 1.5 + uTime * 0.03);
        // Cracks appear where crust is cooler
        float crackMask = smoothstep(0.35, 0.55, crack1) * smoothstep(0.85, 0.65, crack1);
        crackMask += smoothstep(0.4, 0.5, crack2) * smoothstep(0.75, 0.65, crack2) * 0.5;
        crackMask *= (1.0 - temp) * 2.0; // more cracks on cooler crust
        crackMask = clamp(crackMask, 0.0, 1.0);
        // Cracks reveal the hot molten layer beneath
        vec3 crackGlow = mix(vec3(0.8, 0.20, 0.02), vec3(1.0, 0.6, 0.1), crackMask);
        lavaCol = mix(lavaCol, crackGlow, crackMask * 0.8);

        // ── Surface lighting (dim — lava is mostly emissive) ──
        float NdotL = max(dot(N, L), 0.0);
        // Cool crust gets some diffuse; hot areas are self-lit
        float diffuse = mix(0.3 + 0.5 * NdotL, 1.0, temp);
        vec3 col = lavaCol * diffuse;

        // ── Emissive glow (hot areas glow independently of light) ──
        float emissive = smoothstep(0.3, 0.8, temp) * 1.2;
        col += lavaCol * emissive;

        // ── Specular on crust (wet-look glassy surface) ──
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 64.0);
        col += vec3(1.0, 0.7, 0.3) * spec * 0.5 * (1.0 - temp); // only on cooled crust

        // ── Foam as bright ember sparks ──
        float foamAmt = smoothstep(0.2, 0.5, vFoam);
        col = mix(col, vec3(1.0, 0.8, 0.2), foamAmt * 0.6);
        col += vec3(1.0, 0.4, 0.0) * foamAmt * 0.3; // extra orange bloom

        // ── Heat shimmer (subtle color oscillation) ──
        col += vec3(0.1, 0.02, 0.0) * sin(vWorldPos.x * 1.5 + uTime * 4.0) * temp * 0.3;

        // ── Smoky dark fog ──
        float fog = 1.0 - exp(-cd * 0.0015);
        vec3 fogCol = mix(vec3(0.12, 0.06, 0.04), vec3(0.25, 0.10, 0.05), pow(max(dot(normalize(vWorldPos - uCamPos), L), 0.0), 3.0));
        col = mix(col, fogCol, fog);

        // HDR clamp
        col = min(col, vec3(1.5));

        gl_FragColor = vec4(col, alpha);

      } else if (uRenderMode > 7.5) {
        // ═══ PLASTIC PATH ═══
        vec3 N = normalize(vNormal);
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 L = normalize(uSunDir);
        float cd = length(uCamPos - vWorldPos);

        // ── Smooth plastic base color ──
        // Saturated blue-teal with height variation (like molded plastic)
        float hNorm = clamp((vHeight + 3.0) / 7.0, 0.0, 1.0);
        vec3 plasticBase = mix(
          vec3(0.04, 0.22, 0.55),  // deep blue in troughs
          vec3(0.10, 0.50, 0.65),  // teal on crests
          hNorm
        );

        // ── Lambertian diffuse (smooth, no texture noise) ──
        float NdotL = max(dot(N, L), 0.0);
        float diffuse = 0.35 + 0.65 * NdotL;
        vec3 col = plasticBase * diffuse;

        // ── Strong glossy specular (plastic hallmark) ──
        vec3 H = normalize(L + V);
        float spec1 = pow(max(dot(N, H), 0.0), 256.0); // tight highlight
        float spec2 = pow(max(dot(N, H), 0.0), 48.0);  // broad sheen
        vec3 specColor = vec3(1.0, 0.98, 0.95);         // slightly warm white
        col += specColor * (spec1 * 2.5 + spec2 * 0.35);

        // ── Plastic Fresnel rim ──
        // Hard, bright rim like light catching a plastic edge
        float fr = pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 rimColor = mix(vec3(0.6, 0.85, 1.0), vec3(1.0), fr);
        col += rimColor * fr * 0.4;

        // ── Environment reflection (simplified, plastic-like) ──
        // Plastic reflects a blurred, tinted version of the sky
        vec3 R = reflect(-V, N);
        float skyGrad = smoothstep(-0.1, 0.8, R.y);
        vec3 envRefl = mix(vec3(0.25, 0.35, 0.50), vec3(0.70, 0.80, 0.90), skyGrad);
        col = mix(col, envRefl, fr * 0.25);

        // ── Subsurface-like translucency ──
        // Thin plastic lets some light through from behind
        float sss = pow(max(dot(V, -L + N * 0.4), 0.0), 3.0) * 0.2;
        col += plasticBase * sss * 1.5;

        // ── Foam as white plastic bumps ──
        float foamAmt = smoothstep(0.2, 0.6, vFoam);
        vec3 foamPlastic = vec3(0.90, 0.92, 0.95) * (0.4 + 0.6 * NdotL);
        foamPlastic += specColor * spec1 * 1.5; // foam also catches specular
        col = mix(col, foamPlastic, foamAmt * 0.7);

        // ── Smooth, slightly hazy fog ──
        float fog = 1.0 - exp(-cd * 0.0012);
        vec3 fogCol = mix(vec3(0.55, 0.65, 0.78), vec3(0.75, 0.72, 0.68), pow(max(dot(normalize(vWorldPos - uCamPos), L), 0.0), 4.0));
        col = mix(col, fogCol, fog);

        gl_FragColor = vec4(col, alpha);

      } else if (uRenderMode > 6.5) {
        // ═══ X-RAY / WIREFRAME PATH ═══
        vec3 N = normalize(vNormal);
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 L = normalize(uSunDir);
        float cd = length(uCamPos - vWorldPos);

        // ── Grid lines from world-space position ──
        float gridSize = 1.5 * max(1.0, cd * 0.008);
        vec2 gUV = vWorldPos.xz / gridSize;
        vec2 gFrac = abs(fract(gUV - 0.5) - 0.5);
        float gLine = min(gFrac.x, gFrac.y);
        float gridAA = 0.02 * max(1.0, cd * 0.005);
        float grid = 1.0 - smoothstep(0.0, gridAA, gLine);

        // ── Height contour wireframe rings ──
        float contourSpace = 0.5 * max(1.0, cd * 0.01);
        float cFrac = fract(vHeight / contourSpace);
        float contour = 1.0 - smoothstep(0.0, gridAA, cFrac) * smoothstep(0.0, gridAA, 1.0 - cFrac);

        // Combine wireframes
        float wire = max(grid * 0.6, contour * 0.8);

        // ── Glow color based on height + normal ──
        float hNorm = clamp((vHeight + 3.0) / 7.0, 0.0, 1.0);
        vec3 wireColor = mix(vec3(0.1, 0.5, 1.0), vec3(0.3, 1.0, 0.5), hNorm);
        // Steeper faces glow brighter
        float steepGlow = (1.0 - N.y) * 2.0;
        wireColor += vec3(0.3, 0.1, 0.5) * clamp(steepGlow, 0.0, 1.0);

        // ── Transparent body with Fresnel edge glow ──
        float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 bodyColor = vec3(0.02, 0.04, 0.08); // near-black body
        vec3 edgeGlow = wireColor * 0.3;

        // Composite: dark body + wireframe + edge glow
        vec3 col = mix(bodyColor, bodyColor + edgeGlow, fr * 0.5);
        col += wireColor * wire * (0.8 + 0.2 * sin(uTime * 2.0 + vHeight * 3.0));

        // Foam as bright white wireframe flash
        col += vec3(1.0) * smoothstep(0.3, 0.7, vFoam) * 0.4;

        // ── Specular flash ──
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 128.0);
        col += wireColor * spec * 2.0;

        // ── Dark fog ──
        float fog = 1.0 - exp(-cd * 0.0015);
        col = mix(col, vec3(0.02, 0.03, 0.06), fog);

        // Semi-transparent: more opaque where wireframe, translucent between
        float bodyAlpha = mix(0.25, 0.9, wire) * alpha;
        gl_FragColor = vec4(col, bodyAlpha);

      } else if (uRenderMode > 5.5) {
        // ═══ PIXEL ART / RETRO PATH ═══
        vec3 N = normalize(vNormal);
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 L = normalize(uSunDir);
        float cd = length(uCamPos - vWorldPos);

        // ── Pixelate world coordinates ──
        // Snap world position to a grid to create chunky pixels
        float pixelSize = 0.8 * max(1.0, cd * 0.006);
        vec2 pixUV = floor(vWorldPos.xz / pixelSize) * pixelSize;

        // ── Limited color palette (16 colors) ──
        // Compute base color from height + slope
        float hNorm = clamp((vHeight + 3.0) / 7.0, 0.0, 1.0);
        float NdotL = max(dot(N, L), 0.0);
        float shade = 0.4 + 0.6 * NdotL;

        // Retro water palette: 4 blues + highlights
        vec3 col;
        float hQ = floor(hNorm * 5.0) / 5.0; // quantize height to 5 bands
        float sQ = floor(shade * 3.0) / 3.0;  // quantize shade to 3 levels
        if (hQ < 0.2) col = vec3(0.05, 0.10, 0.30);       // deep dark blue
        else if (hQ < 0.4) col = vec3(0.10, 0.22, 0.50);   // dark blue
        else if (hQ < 0.6) col = vec3(0.15, 0.35, 0.65);   // medium blue
        else if (hQ < 0.8) col = vec3(0.25, 0.55, 0.75);   // light blue
        else col = vec3(0.45, 0.75, 0.85);                   // pale blue crest

        // Apply quantized shading
        col *= sQ * 0.5 + 0.5;

        // ── Dithering pattern ──
        // 2x2 Bayer dither to simulate more colors with fewer
        vec2 ditherUV = floor(mod(vWorldPos.xz / (pixelSize * 0.5), 2.0));
        float dither = (ditherUV.x + ditherUV.y * 2.0) / 4.0;
        // Use dither to choose between adjacent color bands
        float hAdj = hNorm + (dither - 0.5) * 0.12;
        if (hAdj > 0.85) col = mix(col, vec3(0.65, 0.88, 0.95), 0.3);

        // ── Specular highlight (single bright pixel clusters) ──
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 32.0);
        float specQ = step(0.5, spec); // binary: on or off
        col += vec3(0.9, 0.95, 1.0) * specQ * 0.6;

        // ── Foam as white pixel blocks ──
        float foamQ = step(0.4, vFoam);
        col = mix(col, vec3(0.85, 0.90, 0.95), foamQ * 0.7);

        // ── Pixel grid outline (subtle) ──
        vec2 pFrac = abs(fract(vWorldPos.xz / pixelSize) - 0.5);
        float pEdge = step(0.45, max(pFrac.x, pFrac.y));
        col *= 1.0 - pEdge * 0.12;

        // ── Retro fog (banded) ──
        float fog = 1.0 - exp(-cd * 0.0012);
        float fogQ = floor(fog * 6.0) / 6.0; // quantize fog too
        vec3 fogCol = vec3(0.30, 0.35, 0.55);
        col = mix(col, fogCol, fogQ);

        gl_FragColor = vec4(col, alpha);

      } else if (uRenderMode > 4.5) {
        // ═══ INK WASH / SUMI-E PATH ═══
        vec3 N = normalize(vNormal);
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 L = normalize(uSunDir);
        float cd = length(uCamPos - vWorldPos);

        // ── Paper base ──
        vec3 paperColor = vec3(0.95, 0.93, 0.88); // warm rice paper
        vec3 inkColor = vec3(0.05, 0.05, 0.08);    // sumi ink

        // ── Ink concentration based on depth (troughs = dark pools) ──
        float hNorm = smoothstep(-2.5, 3.0, vHeight);
        float inkPool = 1.0 - hNorm; // low = more ink
        inkPool = pow(inkPool, 1.5); // concentrate in troughs

        // ── Wet ink bleeding effect ──
        // Organic noise creates the look of ink seeping into wet paper
        float bleed1 = fbm(vWorldPos.xz * 0.3 + uTime * 0.04);
        float bleed2 = noise(vWorldPos.xz * 0.8 + uTime * 0.06 + bleed1 * 1.5);
        float bleedAmount = smoothstep(-0.2, 0.4, bleed1) * 0.3;
        inkPool += bleedAmount * (1.0 - hNorm * 0.5);
        inkPool = clamp(inkPool, 0.0, 1.0);

        // ── Brush stroke texture ──
        // Directional strokes following wave flow
        vec2 grad = vec2(N.x, N.z);
        float gradLen = length(grad);
        vec2 flowDir = gradLen > 0.001 ? grad / gradLen : vec2(1.0, 0.0);
        float strokeProj = dot(vWorldPos.xz, flowDir);
        float strokeTex = noise(vec2(strokeProj * 3.0, dot(vWorldPos.xz, vec2(-flowDir.y, flowDir.x)) * 0.5) + uTime * 0.03);
        // Streak pattern: thin lines of ink along flow
        float streak = smoothstep(0.1, 0.4, strokeTex) * smoothstep(0.9, 0.6, strokeTex);
        float steepness = clamp((1.0 - N.y) * 3.0, 0.0, 1.0);
        float strokeInk = streak * steepness * 0.5;

        // ── Edge darkening (outlines where slope changes sharply) ──
        float edgeDark = clamp((1.0 - N.y) * 4.0 - 1.0, 0.0, 1.0);
        edgeDark *= 0.4;

        // Combine all ink sources
        float totalInk = clamp(inkPool * 0.6 + strokeInk + edgeDark, 0.0, 0.95);

        // ── Subtle warm/cool tone variation ──
        // Ink is not pure black — slight blue-grey tone shift
        vec3 inkTone = mix(inkColor, vec3(0.12, 0.10, 0.18), bleed2 * 0.5 + 0.2);

        vec3 col = mix(paperColor, inkTone, totalInk);

        // ── Foam as negative space (paper showing through) ──
        float foamReveal = smoothstep(0.2, 0.6, vFoam);
        col = mix(col, paperColor, foamReveal * 0.7);

        // ── Subtle sun warmth on paper ──
        float NdotL = max(dot(N, L), 0.0);
        col += vec3(0.03, 0.02, 0.0) * NdotL;

        // ── Paper-toned fog ──
        float fog = 1.0 - exp(-cd * 0.001);
        vec3 fogCol = vec3(0.92, 0.90, 0.85);
        col = mix(col, fogCol, fog);
        col = mix(col, fogCol, smoothstep(250.0, 600.0, cd) * 0.5);

        gl_FragColor = vec4(col, alpha);

      } else if (uRenderMode > 3.5) {
        // ═══ TRON / NEON GRID PATH ═══
        vec3 N = normalize(vNormal);
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 L = normalize(uSunDir);
        float cd = length(uCamPos - vWorldPos);

        // ── Neon grid lines ──
        float gridSize = 2.0 * max(1.0, cd * 0.006);
        vec2 gUV = vWorldPos.xz / gridSize;
        vec2 gFrac = abs(fract(gUV - 0.5) - 0.5);
        float gLine = min(gFrac.x, gFrac.y);
        float gridAA = 0.015 * max(1.0, cd * 0.004);
        float grid = 1.0 - smoothstep(0.0, gridAA, gLine);

        // Major grid lines every 5 cells (thicker, brighter)
        float majorSize = gridSize * 5.0;
        vec2 mUV = vWorldPos.xz / majorSize;
        vec2 mFrac = abs(fract(mUV - 0.5) - 0.5);
        float mLine = min(mFrac.x, mFrac.y);
        float majorGrid = 1.0 - smoothstep(0.0, gridAA * 1.5, mLine);

        // ── Height contour rings (neon) ──
        float contourSpace = 1.0 * max(1.0, cd * 0.008);
        float cFrac = fract(vHeight / contourSpace);
        float contour = 1.0 - smoothstep(0.0, gridAA, cFrac) * smoothstep(0.0, gridAA, 1.0 - cFrac);

        // ── Neon color cycling ──
        // Grid color pulses between cyan and magenta based on height + time
        float pulse = sin(vHeight * 2.0 + uTime * 1.5) * 0.5 + 0.5;
        vec3 neonCyan = vec3(0.0, 0.9, 1.0);
        vec3 neonMagenta = vec3(1.0, 0.0, 0.8);
        vec3 neonBlue = vec3(0.2, 0.3, 1.0);
        vec3 gridColor = mix(neonCyan, neonMagenta, pulse);
        vec3 majorColor = mix(neonBlue, vec3(1.0, 0.4, 0.0), pulse); // blue↔orange for major
        vec3 contourColor = mix(neonMagenta, neonCyan, 1.0 - pulse);

        // ── Dark arena floor ──
        vec3 floorColor = vec3(0.01, 0.015, 0.04);
        // Subtle height tint on floor
        float hNorm = clamp((vHeight + 3.0) / 7.0, 0.0, 1.0);
        floorColor += vec3(0.0, 0.02, 0.04) * hNorm;

        // ── Composite glow ──
        vec3 col = floorColor;
        // Grid glow (with bloom-like falloff)
        col += gridColor * grid * 0.7;
        col += majorColor * majorGrid * 1.2;
        col += contourColor * contour * 0.9;

        // ── Energy pulse along grid ──
        // Travelling wave of brightness along the grid
        float wavePulse = sin(vWorldPos.x * 0.3 + vWorldPos.z * 0.2 + uTime * 3.0) * 0.5 + 0.5;
        col += gridColor * grid * wavePulse * 0.4;

        // ── Fresnel edge glow ──
        float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        col += mix(neonCyan, neonMagenta, fr) * fr * 0.3;

        // ── Foam as white-cyan flash ──
        col += vec3(0.7, 0.95, 1.0) * smoothstep(0.3, 0.6, vFoam) * 0.5;

        // ── Specular — bright concentrated flash ──
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 256.0);
        col += vec3(1.0) * spec * 3.0;

        // ── Dark fog with distant glow ──
        float fog = 1.0 - exp(-cd * 0.0015);
        vec3 fogCol = vec3(0.02, 0.03, 0.08);
        col = mix(col, fogCol, fog);

        gl_FragColor = vec4(col, alpha);

      } else if (uRenderMode > 2.5) {
        // ═══ PAINTERLY / PSYCHEDELIC PATH ═══
        vec3 N = normalize(vNormal);
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 L = normalize(uSunDir);
        float cd = length(uCamPos - vWorldPos);

        // ── Swirling UV distortion (the "acid" effect) ──
        // Multiple layers of noise at different scales/speeds create organic swirls
        vec2 uv = vWorldPos.xz;
        float swirl1 = fbm(uv * 0.08 + uTime * 0.12);
        float swirl2 = fbm(uv * 0.15 - uTime * 0.08 + swirl1 * 2.0);
        float swirl3 = fbm(uv * 0.03 + vec2(swirl2, swirl1) * 1.5 + uTime * 0.05);
        // Distorted coordinates for color lookup
        vec2 distUV = uv + vec2(swirl1, swirl2) * 3.0;

        // ── Iridescent color palette ──
        // Phase shifts through hue based on height + swirl + time
        float phase = vHeight * 0.8 + swirl3 * 2.5 + uTime * 0.15;
        // Rainbow cycle with rich saturated colors
        vec3 col1 = vec3(
          0.5 + 0.5 * sin(phase * 3.0),
          0.5 + 0.5 * sin(phase * 3.0 + 2.094),
          0.5 + 0.5 * sin(phase * 3.0 + 4.189)
        );
        // Second shifted palette for depth
        vec3 col2 = vec3(
          0.5 + 0.5 * sin(phase * 2.0 + 1.0),
          0.5 + 0.5 * sin(phase * 2.0 + 3.094),
          0.5 + 0.5 * sin(phase * 2.0 + 5.189)
        );
        // Blend palettes based on swirl patterns
        float blend = smoothstep(-0.3, 0.3, swirl1);
        vec3 col = mix(col1, col2, blend);

        // ── Painterly brush strokes ──
        // Directional noise that mimics oil paint brush strokes
        vec2 grad = vec2(N.x, N.z);
        float gradLen = length(grad);
        vec2 brushDir = gradLen > 0.001 ? grad / gradLen : vec2(1.0, 0.0);
        float brushProj = dot(distUV, brushDir);
        float brushTex = noise(vec2(brushProj * 4.0, dot(distUV, vec2(-brushDir.y, brushDir.x)) * 0.8) + uTime * 0.1);
        // Thick paint texture variation
        col *= 0.85 + 0.15 * brushTex;

        // ── Dreamy reflections ──
        // Exaggerated Fresnel with color shift
        float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 reflColor = vec3(
          0.6 + 0.4 * sin(uTime * 0.3 + vWorldPos.x * 0.02),
          0.5 + 0.5 * sin(uTime * 0.25 + vWorldPos.z * 0.03 + 1.5),
          0.7 + 0.3 * sin(uTime * 0.35 + swirl2 * 3.0 + 3.0)
        );
        col = mix(col, reflColor, fr * 0.6);

        // ── Sun sparkle (oversaturated, prismatic) ──
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 64.0);
        // Prismatic sparkle — splits into rainbow near highlights
        vec3 sparkle = vec3(
          spec * (1.0 + 0.5 * sin(vWorldPos.x * 2.0 + uTime)),
          spec * (1.0 + 0.5 * sin(vWorldPos.z * 2.0 + uTime + 2.0)),
          spec * (1.0 + 0.5 * sin((vWorldPos.x + vWorldPos.z) * 1.5 + uTime + 4.0))
        );
        col += sparkle * 1.5;

        // ── Foam as glowing white/pink ──
        vec3 foamGlow = vec3(1.0, 0.9, 0.95);
        float foamAmt = smoothstep(0.2, 0.6, vFoam) * 0.7;
        col = mix(col, foamGlow, foamAmt);

        // ── Saturation boost ──
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(lum), col, 1.6); // oversaturate
        col = clamp(col, 0.0, 1.0);

        // ── Dreamy fog (purple/pink haze) ──
        float fog = 1.0 - exp(-cd * 0.001);
        float sunDot = max(dot(normalize(vWorldPos - uCamPos), L), 0.0);
        vec3 fogCol = mix(
          vec3(0.50, 0.35, 0.60),
          vec3(0.85, 0.60, 0.50),
          pow(sunDot, 3.0)
        );
        col = mix(col, fogCol, fog);

        gl_FragColor = vec4(col, alpha);

      } else if (uRenderMode > 1.5) {
        // ═══ DEM (Digital Elevation Model) PATH ═══
        vec3 N = normalize(vNormal);
        vec3 L = normalize(uSunDir);
        float cd = length(uCamPos - vWorldPos);

        // Normalize height to 0..1 range for color ramp
        // Typical wave range: -3m to +4m
        float hNorm = clamp((vHeight + 3.0) / 7.0, 0.0, 1.0);

        // Classic DEM hypsometric color ramp (deep blue → cyan → green → yellow → red → white)
        vec3 col;
        if (hNorm < 0.15) {
          col = mix(vec3(0.0, 0.05, 0.35), vec3(0.0, 0.25, 0.65), hNorm / 0.15);
        } else if (hNorm < 0.30) {
          col = mix(vec3(0.0, 0.25, 0.65), vec3(0.0, 0.65, 0.65), (hNorm - 0.15) / 0.15);
        } else if (hNorm < 0.45) {
          col = mix(vec3(0.0, 0.65, 0.65), vec3(0.15, 0.72, 0.20), (hNorm - 0.30) / 0.15);
        } else if (hNorm < 0.60) {
          col = mix(vec3(0.15, 0.72, 0.20), vec3(0.85, 0.85, 0.15), (hNorm - 0.45) / 0.15);
        } else if (hNorm < 0.80) {
          col = mix(vec3(0.85, 0.85, 0.15), vec3(0.90, 0.30, 0.10), (hNorm - 0.60) / 0.20);
        } else {
          col = mix(vec3(0.90, 0.30, 0.10), vec3(1.0, 0.95, 0.90), (hNorm - 0.80) / 0.20);
        }

        // Subtle hillshade from surface normal + sun direction
        float NdotL = max(dot(N, L), 0.0);
        float shade = 0.55 + 0.45 * NdotL;
        col *= shade;

        // Contour lines at 0.5m intervals
        float contourSpacing = 0.5 * max(1.0, cd * 0.01);
        float cFrac = fract(vHeight / contourSpacing);
        float cLine = 1.0 - smoothstep(0.0, 0.06, cFrac) * smoothstep(0.0, 0.06, 1.0 - cFrac);
        col = mix(col, col * 0.3, cLine * 0.6);

        // Foam as white highlights
        col = mix(col, vec3(1.0), smoothstep(0.3, 0.7, vFoam) * 0.5);

        // ── Pocket highlight (tutorial) ──
        if(uShowPocket>0.01){
          float pocketLo=smoothstep(uSwell1.w*0.30,uSwell1.w*0.65,vHeight);
          float pocketHi=1.0-smoothstep(uSwell1.w*0.80,uSwell1.w*1.0,vHeight);
          float faceFactor=smoothstep(-0.05,0.2,-dot(N.xz,uSwell1.xy));
          float pocket=pocketLo*pocketHi*faceFactor;
          float pulse=0.75+0.25*sin(uTime*2.5);
          vec3 pocketCol=vec3(0.1,1.0,0.5);
          col=mix(col,pocketCol,pocket*pulse*0.85*uShowPocket);
        }

        // Distance fog
        float fog = 1.0 - exp(-cd * 0.0012);
        vec3 fogCol = vec3(0.45, 0.55, 0.70);
        col = mix(col, fogCol, fog);
        col = mix(col, fogCol, smoothstep(200.0, 500.0, cd) * 0.4);

        gl_FragColor = vec4(col, alpha);

      } else if (uRenderMode > 0.5) {
        // ═══ WOODCUT / ENGRAVING PATH ═══
        vec3 N = normalize(vNormal);
        vec3 V = normalize(uCamPos - vWorldPos);
        vec3 L = normalize(uSunDir);
        float cd = length(uCamPos - vWorldPos);

        // Palette
        vec3 paperColor = vec3(0.96, 0.90, 0.82);
        vec3 inkColor   = vec3(0.10, 0.06, 0.03);

        // Steepness: 0=flat, 1=vertical  (N.y=1 is flat)
        float steepness = clamp((1.0 - N.y) * 2.5, 0.0, 1.0);

        // LOD: scale line spacing & AA with camera distance
        float lodScale = max(1.0, cd * 0.015);
        float lineAA   = 0.03 * lodScale;

        // ── 1) HEIGHT CONTOUR LINES ──
        float contourSpacing = 0.4 * lodScale;
        float hFrac = fract(vHeight / contourSpacing);
        float contourThick = mix(0.04, 0.15, steepness);
        float contourLine = 1.0 - smoothstep(0.0, contourThick + lineAA, hFrac)
                                * smoothstep(0.0, contourThick + lineAA, 1.0 - hFrac);

        // ── 2) FLOW-ALIGNED HATCHING ──
        vec2 grad = vec2(N.x, N.z);
        float gradLen = length(grad);
        vec2 gradDir = gradLen > 0.001 ? grad / gradLen : vec2(1.0, 0.0);

        // Project world pos onto gradient direction (primary) and perpendicular (secondary)
        float projPri = dot(vWorldPos.xz, gradDir) + uTime * 0.3;
        float projSec = dot(vWorldPos.xz, vec2(-gradDir.y, gradDir.x)) + uTime * 0.15;

        // Hatching frequency: steeper = denser
        float freqPri = mix(3.0, 10.0, steepness) / lodScale;
        float freqSec = mix(2.0, 6.0, steepness) / lodScale;

        // Primary hatching
        float h1Raw = fract(projPri * freqPri);
        float hatchW1 = mix(0.08, 0.30, steepness);
        float hatch1 = 1.0 - smoothstep(0.0, hatchW1 + lineAA, h1Raw)
                            * smoothstep(0.0, hatchW1 + lineAA, 1.0 - h1Raw);

        // Cross-hatching (steep faces only)
        float h2Raw = fract(projSec * freqSec);
        float hatchW2 = mix(0.05, 0.20, steepness);
        float hatch2 = 1.0 - smoothstep(0.0, hatchW2 + lineAA, h2Raw)
                            * smoothstep(0.0, hatchW2 + lineAA, 1.0 - h2Raw);
        hatch2 *= smoothstep(0.3, 0.6, steepness);

        // ── 3) ORGANIC EDGE ROUGHNESS ──
        float nPert = noise(vWorldPos.xz * 2.5 + uTime * 0.1) * 0.15;
        contourLine = clamp(contourLine + nPert * 0.3, 0.0, 1.0);
        hatch1 = clamp(hatch1 + nPert * 0.25, 0.0, 1.0);
        hatch2 = clamp(hatch2 + nPert * 0.2, 0.0, 1.0);

        // ── 4) HEIGHT-BASED TONE BANDING ──
        float hNorm = smoothstep(-2.0, 3.0, vHeight) + noise(vWorldPos.xz * 0.5) * 0.08;
        float bandSmooth = smoothstep(0.30, 0.36, hNorm) * 0.30
                         + smoothstep(0.63, 0.69, hNorm) * 0.35 + 0.15;
        vec3 baseTone = mix(inkColor, paperColor, bandSmooth);

        // ── 5) SUN-FACING HIGHLIGHT ──
        float NdotL = max(dot(N, L), 0.0);
        baseTone = mix(baseTone, paperColor, smoothstep(0.2, 0.8, NdotL) * 0.15);

        // ── 6) COMPOSITE INK ──
        float inkAmt = max(contourLine, max(hatch1, hatch2));
        // Foam crests lighten toward paper
        float foamLighten = smoothstep(0.2, 0.7, vFoam) * 0.6;
        inkAmt *= (1.0 - foamLighten);
        vec3 col = mix(baseTone, inkColor, inkAmt * 0.85);
        col = mix(col, paperColor * 0.95, foamLighten);

        // ── 7) SEPIA FOG + DISTANCE FADE ──
        float fog = 1.0 - exp(-cd * 0.0012);
        float sunDot = max(dot(normalize(vWorldPos - uCamPos), L), 0.0);
        vec3 fogCol = mix(vec3(0.85, 0.78, 0.68), vec3(0.95, 0.85, 0.65), pow(sunDot, 4.0));
        col = mix(col, fogCol, fog);
        col = mix(col, fogCol, smoothstep(200.0, 500.0, cd) * 0.5);

        gl_FragColor = vec4(col, alpha);

      } else if (uPerfMode > 0.5) {
        // ═══ PERFORMANCE PBR PATH — optimized for slow GPUs ═══
        vec3 N=normalize(vNormal),V=normalize(uCamPos-vWorldPos),L=normalize(uSunDir);
        float cd=length(uCamPos-vWorldPos);

        // Performance detail normals (1 octave, 2D noise, short fade)
        if (uDetailLevel > 0.5) {
          N = detailNormalPerf(vWorldPos, N, cd);
        }
        N=normalize(mix(N,vec3(0.0,1.0,0.0),smoothstep(uOceanHalf*0.15,uOceanHalf*0.85,cd)*0.80));

        vec3 H=normalize(L+V);
        vec3 R=reflect(-V,N);
        float NdotL=dot(N,L);
        float NdH=max(dot(N,H),0.);
        float cosTheta=max(dot(N,V),0.);

        float F0=0.02;
        float fresnel=F0+(1.0-F0)*pow(1.0-cosTheta,5.0);

        // 3-color height-based water body (same as full)
        float heightFactor=(vHeight+5.0)/10.0;
        vec3 wc=mix(uDeepColor,mix(uDeepColor,uShallowColor,0.5),clamp(heightFactor,0.0,1.0));
        wc=mix(wc,uShallowColor,clamp(heightFactor*1.5,0.0,1.0));
        float diffuse=max(NdotL*0.5+0.5,0.0);
        wc*=diffuse*0.5+0.5;

        // SSS — forward only (no back-scatter)
        float sss=pow(clamp(dot(V,-L),0.0,1.0),3.0)*max(N.y+0.3,0.0);
        vec3 sssC=vec3(0.02,0.3,0.35)*sss*0.5;

        // GGX specular
        float a2=0.0025;
        float denom=NdH*NdH*(a2-1.0)+1.0;
        float D=a2/(3.14159*denom*denom+0.0001);
        vec3 sunColor=vec3(1.4,1.2,0.9);
        vec3 sunS=sunColor*D*fresnel*max(NdotL,0.0)*2.0;

        // Glitter — single layer, 2D noise
        if (uDetailLevel > 0.5) {
          float glitterFade=(1.0-smoothstep(20.0,150.0,cd))*uSurfaceDetail;
          if (glitterFade>0.01) {
            vec2 gp=vWorldPos.xz*6.0+vec2(uTime*0.7,uTime*0.3);
            float gn=noise(gp);
            vec3 glitterN=normalize(N+vec3(gn*0.35,0.0,noise(gp*1.3+vec2(50.))*0.35));
            float gNdotH=max(dot(glitterN,H),0.0);
            float glitterSpec=pow(gNdotH,400.0)*3.0+pow(gNdotH,100.0)*0.8;
            sunS+=sunColor*glitterSpec*glitterFade*max(NdotL,0.0);
          }
        }

        vec3 skyR=atmosphericScattering(R,L);
        vec3 col=mix(wc+sssC,skyR+sunS,fresnel);

        // Foam — early exit, 1 octave 2D noise
        if (vFoam > 0.05 || heightFactor > 0.5) {
          float foamTex=noise(vWorldPos.xz*0.45+uTime*0.12)*0.6+0.5;
          float foam=smoothstep(0.1,0.5,vFoam)*foamTex;
          float peakFoam=smoothstep(0.6,1.0,heightFactor)*0.3*foamTex;
          foam=max(foam,peakFoam);
          col=mix(col,uFoamColor*(diffuse*0.4+0.6),clamp(foam,0.0,0.8));
        }

        // Pocket highlight (tutorial)
        if(uShowPocket>0.01){
          float pocketLo=smoothstep(uSwell1.w*0.30,uSwell1.w*0.65,vHeight);
          float pocketHi=1.0-smoothstep(uSwell1.w*0.80,uSwell1.w*1.0,vHeight);
          float faceFactor=smoothstep(-0.05,0.2,-dot(N.xz,uSwell1.xy));
          float pocket=pocketLo*pocketHi*faceFactor;
          float pulse=0.75+0.25*sin(uTime*2.5);
          col=mix(col,vec3(0.1,1.0,0.7),pocket*pulse*0.75*uShowPocket);
        }

        // Atmospheric distance fog
        float fogHalf=uOceanHalf*0.42;
        float fogFactor=smoothstep(0.0,fogHalf,cd);
        fogFactor=fogFactor*fogFactor;
        vec3 viewDir=normalize(vWorldPos-uCamPos);
        vec3 skyFog=atmosphericScattering(viewDir,L);
        vec3 fogColor=mix(skyFog,vec3(0.15,0.35,0.45),0.4)*1.2;
        col=mix(col,fogColor,clamp(fogFactor,0.0,1.0));
        gl_FragColor=vec4(col, alpha);

      } else {
        // ═══ NORMAL / REALISTIC PBR PATH (Full Quality) ═══
        vec3 N=normalize(vNormal),V=normalize(uCamPos-vWorldPos),L=normalize(uSunDir);
        float cd=length(uCamPos-vWorldPos);

        // Detail normal perturbation (3D gradient noise, distance-faded)
        if (uDetailLevel > 0.5) {
          N = detailNormal(vWorldPos, N, cd);
        }
        // Flatten normals at distance to avoid shimmer
        N=normalize(mix(N,vec3(0.0,1.0,0.0),smoothstep(uOceanHalf*0.15,uOceanHalf*0.85,cd)*0.80));

        vec3 H=normalize(L+V);
        vec3 R=reflect(-V,N);
        float NdotL=dot(N,L);
        float NdH=max(dot(N,H),0.);
        float cosTheta=max(dot(N,V),0.);

        // ── Schlick Fresnel (water IOR 1.33, F0 = 0.02) ──
        float F0=0.02;
        float fresnel=F0+(1.0-F0)*pow(1.0-cosTheta,5.0);

        // ── 3-color height-based water body ──
        float heightFactor=(vHeight+5.0)/10.0;
        vec3 deepColor=uDeepColor;
        vec3 midColor=mix(uDeepColor,uShallowColor,0.5);
        vec3 shallowColor=uShallowColor;
        vec3 wc=mix(deepColor,midColor,clamp(heightFactor,0.0,1.0));
        wc=mix(wc,shallowColor,clamp(heightFactor*1.5,0.0,1.0));
        // Wrapped diffuse modulation
        float diffuse=max(NdotL*0.5+0.5,0.0);
        wc*=diffuse*0.5+0.5;

        // ── Enhanced subsurface scattering ──
        float sssForward=pow(clamp(dot(V,-L),0.0,1.0),3.0)*max(N.y+0.3,0.0);
        float sssBack=pow(clamp(-NdotL,0.0,1.0),2.0)*(1.0-cosTheta);
        vec3 sssC=vec3(0.02,0.3,0.35)*(sssForward*0.5+sssBack*0.2);

        // ── GGX specular ──
        float roughness=0.05;
        float a2=roughness*roughness;
        float denom=NdH*NdH*(a2-1.0)+1.0;
        float D=a2/(3.14159*denom*denom+0.0001);
        float spec=D*fresnel*max(NdotL,0.0);
        vec3 sunColor=vec3(1.4,1.2,0.9);
        vec3 sunS=sunColor*spec*2.0;

        // ── Sun glitter (micro-facet sparkles, distance-faded) ──
        if (uDetailLevel > 0.5) {
          float glitterFade = (1.0 - smoothstep(30.0, 250.0, cd)) * uSurfaceDetail;
          if (glitterFade > 0.01) {
            vec2 gp1 = vWorldPos.xz * 4.0 + vec2(uTime * 0.7, uTime * 0.3);
            vec2 gp2 = vWorldPos.xz * 8.5 + vec2(-uTime * 0.5, uTime * 0.8);
            vec2 gp3 = vWorldPos.xz * 17.0 + vec2(uTime * 0.4, -uTime * 0.6);
            float gn1 = noise3D(vec3(gp1, uTime * 0.9));
            float gn2 = noise3D(vec3(gp2, uTime * 1.2));
            float gn3 = noise3D(vec3(gp3, uTime * 1.5));
            // Perturb normal with high-freq noise for micro-facets
            vec3 glitterN = normalize(N + vec3(gn1 * 0.3 + gn3 * 0.15, 0.0, gn2 * 0.3 + gn3 * 0.15));
            vec3 glitterH = normalize(L + V);
            float gNdotH = max(dot(glitterN, glitterH), 0.0);
            // Sharp threshold — only the brightest facets sparkle
            float glitterSpec = pow(gNdotH, 800.0) * 4.0;
            glitterSpec += pow(gNdotH, 200.0) * 1.2;
            // Fine pinpoint stars
            float gNdotH2 = max(dot(normalize(N + vec3(gn3 * 0.4, 0.0, gn1 * 0.4)), glitterH), 0.0);
            glitterSpec += pow(gNdotH2, 1500.0) * 6.0;
            sunS += sunColor * glitterSpec * glitterFade * max(dot(N, L), 0.0);
          }
        }

        // ── Sky reflection (analytical atmospheric scattering) ──
        vec3 skyR=atmosphericScattering(R,L);

        // ── Combine water + reflection via Fresnel ──
        vec3 col=mix(wc+sssC,skyR+sunS,fresnel);

        // ── Foam ──
        float fp=noise(vWorldPos.xz*1.5+uTime*.2)*.5+.5;
        fp*=noise(vWorldPos.xz*4.-uTime*.15)*.5+.5;
        col=mix(col,uFoamColor*(.8+.2*fp),smoothstep(.15,.6,vFoam*fp)*.85);

        // ── Pocket highlight (tutorial) ──
        if(uShowPocket>0.01){
          float pocketLo=smoothstep(uSwell1.w*0.30,uSwell1.w*0.65,vHeight);
          float pocketHi=1.0-smoothstep(uSwell1.w*0.80,uSwell1.w*1.0,vHeight);
          float faceFactor=smoothstep(-0.05,0.2,-dot(N.xz,uSwell1.xy));
          float pocket=pocketLo*pocketHi*faceFactor;
          float pulse=0.75+0.25*sin(uTime*2.5);
          vec3 pocketCol=vec3(0.1,1.0,0.7);
          col=mix(col,pocketCol,pocket*pulse*0.75*uShowPocket);
        }

        // ── Atmospheric distance fog ──
        float fogDist=cd;
        float fogHalf=uOceanHalf*0.42;
        float fogFactor=smoothstep(0.0,fogHalf,fogDist);
        fogFactor=fogFactor*fogFactor;
        vec3 viewDir=normalize(vWorldPos-uCamPos);
        vec3 skyFog=atmosphericScattering(viewDir,L);
        // Blend sky fog with ocean-tinted horizon color
        vec3 oceanHorizon=vec3(0.15,0.35,0.45);
        vec3 fogColor=mix(skyFog,oceanHorizon,0.4)*1.2;
        col=mix(col,fogColor,clamp(fogFactor,0.0,1.0));
        gl_FragColor=vec4(col, alpha);
      }

      // ── Rim cross-fade ──
      // Fade the outermost ~4% of the mesh to transparent. The distant-water
      // fill plane extends under this band (see systems/world.ts inset), so
      // the wave mesh dissolves into the fill over ~10-15m instead of
      // butting against it at a single pixel. Chebyshev distance in local
      // (pre-displacement) space follows the square mesh edge.
      float rimD = max(abs(vLocalPos.x), abs(vLocalPos.y));
      gl_FragColor.a *= 1.0 - smoothstep(uOceanHalf * 0.955, uOceanHalf * 0.995, rimD);

      // ── Power-up water glow (applied after all render modes) ──
      if (uPowerUpActive > 0.5) {
        float puDist = length(vWorldPos.xz - uPowerUpPos.xz);
        float puDisc = 1.0 - smoothstep(0.0, 6.0, puDist);
        puDisc *= puDisc; // sharper falloff
        vec3 puBlend = mix(gl_FragColor.rgb, uPowerUpColor, puDisc * 0.7);
        gl_FragColor.rgb = puBlend;
      }
      // ── Energy boost water glow ──
      if (uEnergyBoostActive > 0.5) {
        float ebDist = length(vWorldPos.xz - uEnergyBoostPos.xz);
        float ebDisc = 1.0 - smoothstep(0.0, 6.0, ebDist);
        ebDisc *= ebDisc;
        vec3 ebBlend = mix(gl_FragColor.rgb, uEnergyBoostColor, ebDisc * 0.7);
        gl_FragColor.rgb = ebBlend;
      }
    }`
  });
  state.oceanMat = oceanMat;

  // ── Mesh ────────────────────────────────────────────────
  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  state.scene!.add(oceanMesh);
  state.oceanMesh = oceanMesh;

  // ── Horizon fill plane ──────────────────────────────────
  // Fills the dark sky gap beyond the ocean mesh edge with fog colour.
  // renderOrder 1 → renders AFTER ocean (which writes depth at renderOrder 0),
  // so it only paints sky pixels (depth = FAR) and fails where ocean/terrain wrote.
  {
    const hGeo = new THREE.PlaneGeometry(50000, 50000, 1, 1);
    hGeo.rotateX(-Math.PI / 2);
    const hMat = new THREE.ShaderMaterial({
      uniforms: {
        uOceanMin: { value: new THREE.Vector2(-300, -300) },
        uOceanMax: { value: new THREE.Vector2(300, 300) },
        uFogColor: { value: new THREE.Color(0.55, 0.7, 0.85) },
        uSunDir: { value: new THREE.Vector3(0, 0.4, -1).normalize() },
        uUseAtmo: { value: 1.0 },
        uCamPos: { value: new THREE.Vector3() },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position,1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform vec2 uOceanMin, uOceanMax;
        uniform vec3 uFogColor, uSunDir, uCamPos;
        uniform float uUseAtmo;
        varying vec3 vWorldPos;
        // Identical to the ocean shader's atmosphericScattering — the fill must
        // converge to the exact color the ocean fades to at its mesh edge.
        vec3 atmosphericScattering(vec3 dir, vec3 sunDir) {
          float sunDot = max(dot(dir, sunDir), 0.0);
          float y = max(dir.y, 0.001);
          vec3 rayleigh = vec3(0.22, 0.45, 0.75) * (1.0 + pow(sunDot, 2.0)) * 0.85;
          float mie = pow(sunDot, 64.0) * 0.7 + pow(sunDot, 256.0) * 1.8;
          vec3 mieColor = vec3(1.0, 0.92, 0.75) * mie;
          float horizon = exp(-y * 3.0);
          vec3 horizonColor = mix(vec3(0.55, 0.7, 0.85), vec3(1.0, 0.75, 0.45), pow(sunDot, 4.0));
          vec3 sky = rayleigh / (y * 1.2 + 0.12) * 0.18;
          sky += mieColor;
          sky = mix(sky, horizonColor, horizon * 0.75);
          float sunDisc = smoothstep(0.9997, 0.9999, sunDot);
          sky += vec3(3.0, 2.5, 1.8) * sunDisc;
          sky *= mix(0.45, 1.0, smoothstep(0.0, 0.45, y));
          return sky;
        }
        void main() {
          if (vWorldPos.x > uOceanMin.x && vWorldPos.x < uOceanMax.x &&
              vWorldPos.z > uOceanMin.y && vWorldPos.z < uOceanMax.y) discard;
          // Match the ocean's edge-fog exactly (see waterFillPlane in terrain.ts)
          vec3 col;
          if (uUseAtmo > 0.5) {
            vec3 viewDir = normalize(vWorldPos - uCamPos);
            vec3 skyFog = atmosphericScattering(viewDir, normalize(uSunDir));
            col = mix(skyFog, vec3(0.15, 0.35, 0.45), 0.4) * 1.2;
          } else {
            col = uFogColor;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    const hMesh = new THREE.Mesh(hGeo, hMat);
    hMesh.position.y = -0.5;
    hMesh.renderOrder = 1;
    state.scene!.add(hMesh);
    state.horizonFill = hMesh;
  }

  // ── Wave chart DOM refs ─────────────────────────────────
  waveChartCanvas = document.getElementById('wave-chart') as HTMLCanvasElement | null;
  waveChartCtx    = waveChartCanvas ? waveChartCanvas.getContext('2d') : null;
}

// ═══════════════════════════
// CPU WAVE HEIGHT (mirrors GPU)
// ═══════════════════════════

function gerstnerY(px: number, pz: number, dx: number, dz: number, per: number, ht: number, t: number, spdIn?: number){
  if(ht<.01)return 0;
  const wl=1.56*per*per,k=6.28318/wl,spd=(spdIn ?? 0)>0.01?spdIn!:Math.sqrt(9.81/k);
  return ht*.5*Math.cos(k*(dx*px+dz*pz)-spd*t*k);
}

// CPU noise to match GPU fbm detail displacement
function cpuNoise2D(x: number, y: number){
  // Simple hash-based gradient noise matching the GPU hash2/noise functions
  function h2(px: number, py: number){
    const sx=Math.sin(px*127.1+py*311.7)*43758.5453;
    const sy=Math.sin(px*269.5+py*183.3)*43758.5453;
    return[(sx-Math.floor(sx))*2-1,(sy-Math.floor(sy))*2-1];
  }
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
  const a=h2(ix,iy),b=h2(ix+1,iy),c=h2(ix,iy+1),d=h2(ix+1,iy+1);
  const va=a[0]*fx+a[1]*fy, vb=b[0]*(fx-1)+b[1]*fy;
  const vc=c[0]*fx+c[1]*(fy-1), vd=d[0]*(fx-1)+d[1]*(fy-1);
  return va+(vb-va)*ux+(vc-va)*uy+(va-vb-vc+vd)*ux*uy;
}

function cpuFbm(x: number, y: number, octaves?: number){
  const n=octaves||state.fbmOctaves||6;
  let v=0,a=.5,px=x,py=y;
  for(let i=0;i<n;i++){
    v+=a*cpuNoise2D(px,py);
    // Rotation must match GPU mat2(.8,.6,-.6,.8) which is column-major:
    // col0=(0.8,0.6), col1=(-0.6,0.8) → r*p = (0.8px-0.6py, 0.6px+0.8py)
    const nx=.8*px-.6*py, ny=.6*px+.8*py;
    px=nx*2.03; py=ny*2.03; a*=.48;
  }
  return v;
}

function getWaveHeight(px: number, pz: number, t: number){
  let h=0;
  const s1d=degToDir(getVal('swell1Dir')),s1p=getVal('swell1Period'),s1h=getVal('swell1Height');
  const s2d=degToDir(getVal('swell2Dir')),s2p=getVal('swell2Period'),s2h=getVal('swell2Height');
  const s3d=degToDir(getVal('swell3Dir')),s3p=getVal('swell3Period'),s3h=getVal('swell3Height');
  const sp1=convertSpeedToMs(getVal('swell1Speed')),sp2=convertSpeedToMs(getVal('swell2Speed')),sp3=convertSpeedToMs(getVal('swell3Speed'));
  const ch=getVal('chopHeight'),cd_=degToDir(getVal('chopDir'));
  h+=gerstnerY(px,pz,s1d.x,s1d.y,s1p,s1h,t,sp1);
  h+=gerstnerY(px,pz,s1d.x*1.07,s1d.y*1.07,s1p*.7,s1h*.22,t*1.05+7.3,sp1);
  h+=gerstnerY(px,pz,s2d.x,s2d.y,s2p,s2h,t,sp2);
  h+=gerstnerY(px,pz,s2d.x*.95,s2d.y*.95,s2p*.65,s2h*.2,t*.98+13.7,sp2);
  h+=gerstnerY(px,pz,s3d.x,s3d.y,s3p,s3h,t,sp3);
  h+=gerstnerY(px,pz,cd_.x,cd_.y,3,ch*.5,t);
  const cx=cd_.y*.8+cd_.x*.6,cz=-cd_.x*.8+cd_.y*.6;
  h+=gerstnerY(px,pz,cx,cz,2.2,ch*.35,t*1.1+4.7);
  // Extra chop components matching GPU vertex shader
  const cx2=cd_.x*.7+(-cd_.y)*.7, cz2=cd_.y*.7+cd_.x*.7;
  h+=gerstnerY(px,pz,cx2,cz2,1.8,ch*.25,t*1.3+11.1);
  const cx3=cd_.x*.9+cd_.y*.4, cz3=cd_.y*.9+(-cd_.x)*.4;
  h+=gerstnerY(px,pz,cx3,cz3,1.3,ch*.18,t*.9+8.3);
  // Detail fbm displacement matching GPU (line 1645-1646)
  const detScale=.08; // GPU uses mix(.08,.02,...) — close range uses .08
  const det=cpuFbm(px*detScale+t*.15,pz*detScale+t*.15)*.3
           +cpuFbm(px*.03-t*.08,pz*.03-t*.08)*.15;
  h+=det*(ch+.2);
  return h;
}

function getWaveSlope(px: number, pz: number, t: number){
  const e=.5;
  return{
    dhdx:(getWaveHeight(px+e,pz,t)-getWaveHeight(px-e,pz,t))/(2*e),
    dhdz:(getWaveHeight(px,pz+e,t)-getWaveHeight(px,pz-e,t))/(2*e)
  };
}

// Swell-only height (no chop, no fbm noise) — used for wave energy calculation
function getSwellHeight(px: number, pz: number, t: number){
  let h=0;
  const s1d=degToDir(getVal('swell1Dir')),s1p=getVal('swell1Period'),s1h=getVal('swell1Height');
  const s2d=degToDir(getVal('swell2Dir')),s2p=getVal('swell2Period'),s2h=getVal('swell2Height');
  const s3d=degToDir(getVal('swell3Dir')),s3p=getVal('swell3Period'),s3h=getVal('swell3Height');
  const sp1=convertSpeedToMs(getVal('swell1Speed')),sp2=convertSpeedToMs(getVal('swell2Speed')),sp3=convertSpeedToMs(getVal('swell3Speed'));
  h+=gerstnerY(px,pz,s1d.x,s1d.y,s1p,s1h,t,sp1);
  h+=gerstnerY(px,pz,s1d.x*1.07,s1d.y*1.07,s1p*.7,s1h*.22,t*1.05+7.3,sp1);
  h+=gerstnerY(px,pz,s2d.x,s2d.y,s2p,s2h,t,sp2);
  h+=gerstnerY(px,pz,s2d.x*.95,s2d.y*.95,s2p*.65,s2h*.2,t*.98+13.7,sp2);
  h+=gerstnerY(px,pz,s3d.x,s3d.y,s3p,s3h,t,sp3);
  return h;
}

function getSwellSlope(px: number, pz: number, t: number){
  const e=.5;
  return{
    dhdx:(getSwellHeight(px+e,pz,t)-getSwellHeight(px-e,pz,t))/(2*e),
    dhdz:(getSwellHeight(px,pz+e,t)-getSwellHeight(px,pz-e,t))/(2*e)
  };
}

// ═══════════════════════════
// RENDER MODE
// ═══════════════════════════

function setRenderMode(val: string | number) {
  state.oceanMat!.uniforms.uRenderMode.value = parseFloat(String(val));
}

// ═══════════════════════════
// WAVE CHART — scrolling height & slope strip
// ═══════════════════════════

function updateWaveChart(waveH: number, slopeVal: number, energyVal: number, pocketVal: number) {
  waveChartData.push({ h: waveH, s: slopeVal, e: energyVal, p: pocketVal || 0 });
  if (waveChartData.length > CHART_MAX_SAMPLES) waveChartData.shift();

  // Resize canvas to screen width if needed
  if (!waveChartCanvas || !waveChartCtx) return;
  const w = window.innerWidth;
  if (waveChartCanvas.width !== w) { waveChartCanvas.width = w; }

  const ctx = waveChartCtx;
  const cw = waveChartCanvas.width, ch = CHART_H;
  ctx.clearRect(0, 0, cw, ch);

  // Auto-scale: find range of recent data
  let hMin = Infinity, hMax = -Infinity, sMin = Infinity, sMax = -Infinity;
  let eAbsMax = 0;
  for (const d of waveChartData) {
    if (d.h < hMin) hMin = d.h; if (d.h > hMax) hMax = d.h;
    if (d.s < sMin) sMin = d.s; if (d.s > sMax) sMax = d.s;
    const ae = Math.abs(d.e); if (ae > eAbsMax) eAbsMax = ae;
  }
  const hRange = Math.max(hMax - hMin, 0.5);
  const sRange = Math.max(sMax - sMin, 0.1);
  const neutralThresh = 0.12; // fixed threshold for normalized [-1,1] energy signal
  const pocketThresh = 0.4; // pocket strength threshold for yellow highlight

  const n = waveChartData.length;
  const xStep = cw / CHART_MAX_SAMPLES;

  // Draw pocket zones as subtle yellow background fill
  for (let i = 1; i < n; i++) {
    const pv = waveChartData[i].p;
    if (pv > pocketThresh) {
      const x0 = (CHART_MAX_SAMPLES - n + i - 1) * xStep;
      const x1 = (CHART_MAX_SAMPLES - n + i) * xStep;
      const alpha = Math.min(0.25, (pv - pocketThresh) / (1 - pocketThresh) * 0.25);
      ctx.fillStyle = `rgba(255,220,40,${alpha})`;
      ctx.fillRect(x0, 0, x1 - x0 + 1, ch);
    }
  }

  // Draw wave height — color encodes energy:
  //   yellow = in the pocket (max lift), green = accel, red = decel, cyan = neutral
  ctx.lineWidth = 2;
  for (let i = 1; i < n; i++) {
    const x0 = (CHART_MAX_SAMPLES - n + i - 1) * xStep;
    const x1 = (CHART_MAX_SAMPLES - n + i) * xStep;
    const y0 = ch - 8 - ((waveChartData[i-1].h - hMin) / hRange) * (ch - 16);
    const y1 = ch - 8 - ((waveChartData[i].h - hMin) / hRange) * (ch - 16);
    const ev = waveChartData[i].e;
    const pv = waveChartData[i].p;
    let color;
    if (pv > pocketThresh && ev > neutralThresh) {
      color = '#ffdd22'; // yellow — in the pocket with positive energy
    } else if (ev > neutralThresh) {
      color = '#44ff88'; // green — accelerating
    } else if (ev < -neutralThresh) {
      color = '#ff3333'; // red — decelerating
    } else {
      color = '#00e5ff'; // cyan — neutral
    }
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }

  // Draw slope (orange)
  ctx.strokeStyle = '#ffaa00';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (CHART_MAX_SAMPLES - n + i) * xStep;
    const y = ch/2 - ((waveChartData[i].s - (sMin+sMax)/2) / sRange) * (ch * 0.35);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Labels
  ctx.font = '10px DM Sans, sans-serif';
  ctx.fillStyle = '#ffdd22';
  ctx.fillText('Pocket', 6, 12);
  ctx.fillStyle = '#44ff88';
  ctx.fillText('Accel', 44, 12);
  ctx.fillStyle = '#00e5ff';
  ctx.fillText('Neutral', 76, 12);
  ctx.fillStyle = '#ff3333';
  ctx.fillText('Decel', 118, 12);
  ctx.fillStyle = '#ffaa00';
  ctx.fillText('Slope', 6, 24);
}

// ═══════════════════════════
// QUALITY / LOD — REBUILD OCEAN GEOMETRY
// ═══════════════════════════

function rebuildOceanGeometry() {
  if (state.oceanGeo) state.oceanGeo.dispose();
  const geo = new THREE.PlaneGeometry(
    state.oceanSize, state.oceanSize,
    state.oceanSegments, state.oceanSegments
  );
  geo.rotateX(-Math.PI / 2);
  state.oceanMesh!.geometry = geo;
  state.oceanGeo = geo;
  // Keep uniform in sync so shader fades scale with mesh size
  if (state.oceanMat) state.oceanMat!.uniforms.uOceanHalf.value = state.oceanSize / 2;
}

// ═══════════════════════════
// EXPORTS
// ═══════════════════════════

export {
  initOcean,
  updateEnvMap,
  getWaveHeight,
  getWaveSlope,
  getSwellHeight,
  getSwellSlope,
  setRenderMode,
  updateWaveChart,
  rebuildOceanGeometry,
};
