// ──────────────────────────────────────────────────────────────
//  tutorial.js  –  Tutorial level module
//
//  Self-registering module that injects tutorial presets into
//  the shared presets/bgPresets objects and exports a hook
//  for startRide() to call when the tutorial location is chosen.
// ──────────────────────────────────────────────────────────────

import { state } from './state.js';
import { presets, applyPreset } from './helpers.js';
import { bgPresets } from './terrain.js';

// Tutorial wave/physics preset — gentle conditions, sunset lighting
presets.tutorial = {
  sunAngle:12, sunDir:260, cloudCover:0.25,
  chopHeight:0.15, chopDir:180,
  swell1Height:0.8, swell1Period:14, swell1Dir:270,
  swell2Height:0.3, swell2Period:10, swell2Dir:250,
  swell3Height:0, swell3Period:16, swell3Dir:200,
  sbGlide:1.3, sbPumpPower:1.2, sbTurnSpeed:1.0, sbTopSpeed:22, sbStallSpeed:3,
  sbWindSpeed:8, sbWindDir:270,
  sbBatteryCap:1.5, sbBatteryDrain:0.7, sbWaveEnergy:1.2, sbStability:1.3, sbDrag:0.8
};

// Tutorial terrain — open water, no cliffs
bgPresets['tutorial'] = {
  label: 'Tutorial',
  maxHeight: 120,
  cliffs: []
};

// Called from startRide() when locationPreset === 'tutorial'
export function onTutorialStart() {
  applyPreset('tutorial');
}
