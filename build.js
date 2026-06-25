#!/usr/bin/env node
/**
 * Build script for FoilSim.
 *
 * Usage:
 *   node build.js            — production build to dist/ (minified, console.log stripped)
 *   node build.js --dev      — dev build to dist/ (unminified, inline sourcemaps, logs kept)
 *   node build.js --watch    — dev build + rebuild on change + local server on :8080
 *   npm run build / npm run dev
 *
 * What it does:
 *   1. Bundles all TS modules (entry js/main.ts) into a single file via esbuild
 *   2. Minifies index.html (strips comments, collapses whitespace) — skipped in dev
 *   3. Rewrites the <script type="module"> tag to point to the bundle
 *   4. Copies static assets (terrain-data/, assets/, favicon, music)
 *
 * Production has no sourcemap on purpose: the post-bundle GLSL comment strip
 * below edits the minified bundle in place, which would invalidate any map.
 * Use `npm run dev` for a fully debuggable build.
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const DEV = process.argv.includes('--dev') || process.argv.includes('--watch');
const WATCH = process.argv.includes('--watch');

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

// ── Build steps ──

const bundleOptions = {
  entryPoints: [path.join(SRC, 'js/main.ts')],
  bundle: true,
  minify: !DEV,
  format: 'esm',
  outfile: path.join(DIST, 'js/app.min.js'),
  target: ['es2020'],
  drop: DEV ? [] : ['debugger'],
  // Strip console.log in production (keep warn/error)
  pure: DEV ? [] : ['console.log'],
  legalComments: 'none',
  sourcemap: DEV ? 'inline' : false,
};

function postProcessBundle() {
  if (DEV) return; // never edit a bundle that carries a sourcemap

  // Strip GLSL comments from shader strings inside the bundle.
  // esbuild can't touch these since they're inside template literals; after
  // minification the only real newlines left in the bundle are inside those
  // literals, which is what makes this regex pass safe.
  let bundle = fs.readFileSync(path.join(DIST, 'js/app.min.js'), 'utf8');
  const beforeStrip = bundle.length;
  // Strip // comments inside shader strings (lines that are mostly whitespace + //)
  bundle = bundle.replace(/\\n\s*\/\/[^\n\\]*/g, '\\n');
  // Strip standalone comment lines inside backtick strings
  bundle = bundle.replace(/\n\s*\/\/[^\n`]*/g, '\n');
  // Collapse multiple \\n sequences
  bundle = bundle.replace(/(\\n\s*){2,}/g, '\\n');
  fs.writeFileSync(path.join(DIST, 'js/app.min.js'), bundle);

  console.log(`  Shader comments stripped: ${((beforeStrip - bundle.length) / 1024).toFixed(1)}KB removed`);
}

function reportBundleSize() {
  const srcSize = fs.readdirSync(path.join(SRC, 'js'))
    .filter(f => f.endsWith('.js') || f.endsWith('.ts'))
    .reduce((sum, f) => sum + fs.statSync(path.join(SRC, 'js', f)).size, 0);
  const bundleSize = fs.statSync(path.join(DIST, 'js/app.min.js')).size;
  console.log(`  ${(srcSize / 1024).toFixed(0)}KB → ${(bundleSize / 1024).toFixed(0)}KB${DEV ? ' (dev, unminified)' : ` (${Math.round(100 - bundleSize / srcSize * 100)}% smaller)`}`);
}

function processHtml() {
  let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

  // Replace the module script tag with the bundle
  html = html.replace(
    '<script type="module" src="js/main.ts"></script>',
    '<script type="module" src="js/app.min.js"></script>'
  );

  if (!DEV) html = minifyHTML(html);
  fs.writeFileSync(path.join(DIST, 'index.html'), html);
  console.log(`  index.html: ${(fs.statSync(path.join(SRC, 'index.html')).size / 1024).toFixed(0)}KB → ${(Buffer.byteLength(html) / 1024).toFixed(0)}KB`);
}

function copyAssets() {
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
  // Remove source/duplicate/large dev files from dist assets
  for (const f of fs.readdirSync(path.join(DIST, 'assets'))) {
    const full = path.join(DIST, 'assets', f);
    if (f.endsWith('.zip') || f.endsWith('.fbx')
        || f.includes('cartoon character') || f.includes(' ')
        || f.includes('_original')) {
      if (fs.statSync(full).isFile()) fs.unlinkSync(full);
    }
  }
  // Drop dev subdirectories entirely
  for (const dir of ['work', 'screenshots']) {
    const p = path.join(DIST, 'assets', dir);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  }
  console.log('  assets/ copied (dev files excluded)');

  // Favicon
  if (fs.existsSync(path.join(SRC, 'favicon.ico'))) {
    copyFile(path.join(SRC, 'favicon.ico'), path.join(DIST, 'favicon.ico'));
    console.log('  favicon.ico copied');
  }

  // Standalone WotW gorge pressure-gradient page, served at /pres (self-contained,
  // not part of the Three.js bundle). Copied verbatim so its relative refs/ paths work.
  if (fs.existsSync(path.join(SRC, 'pres'))) {
    copyDir(path.join(SRC, 'pres'), path.join(DIST, 'pres'));
    console.log('  pres/ copied (gorge pressure page)');
  }

  // Music (exclude originals/)
  if (fs.existsSync(path.join(SRC, 'music'))) {
    mkdirp(path.join(DIST, 'music'));
    for (const f of fs.readdirSync(path.join(SRC, 'music'))) {
      const s = path.join(SRC, 'music', f);
      if (fs.statSync(s).isFile()) fs.copyFileSync(s, path.join(DIST, 'music', f));
    }
    console.log('  music/ copied (originals excluded)');
  }
}

function reportTotalSize() {
  let totalSize = 0;
  (function countDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) countDir(p);
      else totalSize += fs.statSync(p).size;
    }
  })(DIST);
  console.log(`\nBuild complete! dist/ = ${(totalSize / 1024 / 1024).toFixed(1)}MB${DEV ? ' (dev)' : ' (production)'}`);
}

// ── Main ──

async function main() {
  console.log('Cleaning dist/...');
  if (fs.existsSync(DIST)) {
    try {
      fs.rmSync(DIST, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
    } catch (e) {
      console.warn('Could not fully clean dist/, overwriting in place');
    }
  }
  mkdirp(DIST);

  console.log(`Bundling JS modules${DEV ? ' (dev mode)' : ''}...`);

  if (!WATCH) {
    const result = esbuild.buildSync(bundleOptions);
    if (result.errors.length > 0) {
      console.error('Build errors:', result.errors);
      process.exit(1);
    }
    postProcessBundle();
    reportBundleSize();
    processHtml();
    copyAssets();
    reportTotalSize();
    return;
  }

  // Watch mode: rebuild bundle on change, re-process index.html on change,
  // serve dist/ locally. Assets are copied once at startup.
  const ctx = await esbuild.context(bundleOptions);
  await ctx.rebuild();
  reportBundleSize();
  processHtml();
  copyAssets();
  reportTotalSize();

  await ctx.watch();
  fs.watch(path.join(SRC, 'index.html'), () => {
    try {
      processHtml();
      console.log('  index.html reprocessed');
    } catch (e) {
      console.warn('  index.html reprocess failed:', e.message);
    }
  });

  const { hosts, port } = await ctx.serve({ servedir: DIST, port: 8080 });
  console.log(`\nWatching js/ and index.html — serving http://${hosts[0] === '0.0.0.0' ? 'localhost' : hosts[0]}:${port}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
