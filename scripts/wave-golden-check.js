#!/usr/bin/env node
/**
 * Golden-value regression check for the CPU wave math in js/ocean.js
 * (getWaveHeight / getWaveSlope). These functions are the physics foundation;
 * the v0.3.x refactor must never change their output.
 *
 * Usage:
 *   node scripts/wave-golden-check.js            — compare against wave-golden.json
 *   node scripts/wave-golden-check.js --capture  — (re)write wave-golden.json
 *
 * Samples 5 presets x 8 (x,z) points x 3 times x {h, dhdx, dhdz} = 360 values.
 * Comparison is bit-identical (exact JSON number equality), which works because
 * the math is deterministic and we pin the inputs (cachedParams, fbmOctaves,
 * units) instead of reading the DOM.
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GOLDEN = path.join(__dirname, 'wave-golden.json');
const CAPTURE = process.argv.includes('--capture');

// Bundle the wave math + presets out of the ES modules so plain node can run it.
const built = esbuild.buildSync({
  stdin: {
    contents: `
      export { getWaveHeight, getWaveSlope } from './js/ocean.js';
      export { presets } from './js/helpers.js';
      export { state } from './js/state.js';
    `,
    resolveDir: ROOT,
    sourcefile: 'golden-entry.js',
  },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
});
const mod = { exports: {} };
new Function('module', 'exports', 'require', built.outputFiles[0].text)(mod, mod.exports, require);
const { getWaveHeight, getWaveSlope, presets, state } = mod.exports;

// Slider defaults from index.html — the base the cache would hold before any
// preset is applied. Presets overlay these (some omit speeds/chop).
const SLIDER_DEFAULTS = {
  chopHeight: 0.4, chopDir: 45,
  swell1Height: 2.0, swell1Period: 12, swell1Dir: 270, swell1Speed: 25,
  swell2Height: 0.8, swell2Period: 8, swell2Dir: 315, swell2Speed: 25,
  swell3Height: 0.3, swell3Period: 16, swell3Dir: 200, swell3Speed: 25,
};

const POINTS = [
  [0, 0], [10, 0], [0, 10], [-25, 40],
  [100, -60], [-3.7, 12.9], [55.5, 55.5], [-120, -80],
];
const TIMES = [0, 7.3, 61.42];
const PRESET_NAMES = ['clean', 'river', 'messy', 'gorge', 'rufus'];

state.units = 'mph';
state.fbmOctaves = 4;

const samples = {};
for (const name of PRESET_NAMES) {
  state.cachedParams = Object.assign({}, SLIDER_DEFAULTS, presets[name]);
  const rows = [];
  for (const [x, z] of POINTS) {
    for (const t of TIMES) {
      const h = getWaveHeight(x, z, t);
      const { dhdx, dhdz } = getWaveSlope(x, z, t);
      rows.push([x, z, t, h, dhdx, dhdz]);
    }
  }
  samples[name] = rows;
}

if (CAPTURE) {
  fs.writeFileSync(GOLDEN, JSON.stringify(samples, null, 1));
  const n = PRESET_NAMES.length * POINTS.length * TIMES.length * 3;
  console.log(`Captured ${n} golden values to ${path.relative(ROOT, GOLDEN)}`);
  process.exit(0);
}

if (!fs.existsSync(GOLDEN)) {
  console.error('No wave-golden.json — run with --capture first.');
  process.exit(1);
}
const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
let checked = 0, bad = 0;
for (const name of PRESET_NAMES) {
  const exp = golden[name] || [];
  const got = samples[name];
  for (let i = 0; i < exp.length; i++) {
    for (let v = 3; v < 6; v++) {
      checked++;
      if (exp[i][v] !== got[i][v]) {
        bad++;
        if (bad <= 10) {
          console.error(`MISMATCH ${name} (x=${exp[i][0]}, z=${exp[i][1]}, t=${exp[i][2]}) ` +
            `[${['h', 'dhdx', 'dhdz'][v - 3]}]: expected ${exp[i][v]}, got ${got[i][v]}`);
        }
      }
    }
  }
}
if (bad) {
  console.error(`FAIL: ${bad}/${checked} values differ from golden.`);
  process.exit(1);
}
console.log(`OK: ${checked} values bit-identical to golden.`);
