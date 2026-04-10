#!/usr/bin/env node
/**
 * Build script for FoilSim — bundles + minifies for production deploy.
 *
 * Usage:
 *   node build.js          — build to dist/
 *   npm run build          — same via package.json
 *
 * What it does:
 *   1. Bundles all JS modules (js/*.js) into a single minified file via esbuild
 *   2. Minifies index.html (strips comments, collapses whitespace)
 *   3. Rewrites the <script type="module"> tag to point to the bundle
 *   4. Copies static assets (terrain-data/, assets/, favicon, panoramas)
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const SRC = __dirname;

// ── Helpers ──

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  mkdirp(destDir);
  for (const entry of entries) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function minifyHTML(html) {
  return html
    // Remove HTML comments (but keep IE conditionals)
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    // Collapse multiple whitespace between tags
    .replace(/>\s{2,}</g, '> <')
    // Collapse multiple newlines
    .replace(/\n{2,}/g, '\n')
    // Trim lines
    .split('\n').map(l => l.trim()).filter(l => l).join('\n');
}

// ── Clean ──

console.log('Cleaning dist/...');
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
mkdirp(DIST);

// ── 1. Bundle JS with esbuild ──

console.log('Bundling JS modules...');
const result = esbuild.buildSync({
  entryPoints: [path.join(SRC, 'js/main.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  // THREE is loaded globally via CDN <script> tag — treat as external
  // But our modules use `import { state } from './state.js'` etc. which should be bundled
  // The modules reference `THREE` and `window.THREE` as globals — esbuild handles this
  // since they're not imported via `import ... from 'three'`
  outfile: path.join(DIST, 'js/app.min.js'),
  target: ['es2020'],
  // Drop console.log in production (keep warn/error)
  drop: ['debugger'],
  legalComments: 'none',
  sourcemap: false,
});

if (result.errors.length > 0) {
  console.error('Build errors:', result.errors);
  process.exit(1);
}

const srcSize = fs.readdirSync(path.join(SRC, 'js'))
  .filter(f => f.endsWith('.js'))
  .reduce((sum, f) => sum + fs.statSync(path.join(SRC, 'js', f)).size, 0);
const bundleSize = fs.statSync(path.join(DIST, 'js/app.min.js')).size;
console.log(`  ${(srcSize/1024).toFixed(0)}KB → ${(bundleSize/1024).toFixed(0)}KB (${Math.round(100 - bundleSize/srcSize*100)}% smaller)`);

// ── 2. Minify and rewrite index.html ──

console.log('Minifying index.html...');
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

// Replace the module script tag with the bundle
html = html.replace(
  '<script type="module" src="js/main.js"></script>',
  '<script type="module" src="js/app.min.js"></script>'
);

html = minifyHTML(html);
fs.writeFileSync(path.join(DIST, 'index.html'), html);
console.log(`  ${(fs.statSync(path.join(SRC, 'index.html')).size/1024).toFixed(0)}KB → ${(Buffer.byteLength(html)/1024).toFixed(0)}KB`);

// ── 3. Copy static assets ──

console.log('Copying assets...');

// Terrain data (heightmaps, satellite images, river masks)
copyDir(path.join(SRC, 'terrain-data'), path.join(DIST, 'terrain-data'));
// Exclude dev files and duplicates from dist
for (const f of fs.readdirSync(path.join(DIST, 'terrain-data'))) {
  if (f.endsWith('.py') || f.endsWith('.tif') || f.endsWith('.json')
      || f.includes('Copy') || f.includes('_raw')) {
    fs.unlinkSync(path.join(DIST, 'terrain-data', f));
  }
}
console.log('  terrain-data/ copied');

// 3D models
copyDir(path.join(SRC, 'assets'), path.join(DIST, 'assets'));
// Remove source/duplicate files from dist assets (keep only production files)
for (const f of fs.readdirSync(path.join(DIST, 'assets'))) {
  if (f.endsWith('.zip') || f.includes('cartoon character') || f.includes(' ')) {
    fs.unlinkSync(path.join(DIST, 'assets', f));
  }
}
console.log('  assets/ copied');

// Favicon
if (fs.existsSync(path.join(SRC, 'favicon.ico'))) {
  copyFile(path.join(SRC, 'favicon.ico'), path.join(DIST, 'favicon.ico'));
  console.log('  favicon.ico copied');
}

// Kauai panorama
if (fs.existsSync(path.join(SRC, 'kauai.jpg'))) {
  copyFile(path.join(SRC, 'kauai.jpg'), path.join(DIST, 'kauai.jpg'));
  console.log('  kauai.jpg copied');
}

// ── Done ──

// Total size
let totalSize = 0;
function countDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) countDir(p);
    else totalSize += fs.statSync(p).size;
  }
}
countDir(DIST);

console.log(`\nBuild complete! dist/ = ${(totalSize/1024/1024).toFixed(1)}MB`);
console.log('Deploy with: Cloudflare Pages (output dir: dist)');
