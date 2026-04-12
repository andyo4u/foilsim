// Quick GLB inspector — reports texture and mesh sizes
const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('Usage: node glb-inspect.js <file.glb>'); process.exit(1); }

const buf = fs.readFileSync(path);
if (buf.readUInt32LE(0) !== 0x46546c67) { console.error('Not a GLB'); process.exit(1); }

const totalLen = buf.readUInt32LE(8);
// JSON chunk
const jsonLen = buf.readUInt32LE(12);
const jsonType = buf.readUInt32LE(16);
const jsonStart = 20;
const json = JSON.parse(buf.slice(jsonStart, jsonStart + jsonLen).toString('utf8'));

// BIN chunk
const binOffset = jsonStart + jsonLen;
const binLen = buf.readUInt32LE(binOffset);
const binStart = binOffset + 8;

console.log(`File: ${path}`);
console.log(`Total: ${(buf.length/1024/1024).toFixed(2)} MB`);
console.log(`JSON chunk: ${(jsonLen/1024).toFixed(1)} KB`);
console.log(`BIN chunk: ${(binLen/1024/1024).toFixed(2)} MB`);
console.log('');

// Images
if (json.images) {
  console.log(`Images: ${json.images.length}`);
  json.images.forEach((img, i) => {
    if (img.bufferView !== undefined) {
      const bv = json.bufferViews[img.bufferView];
      console.log(`  [${i}] ${img.name || '(unnamed)'} — ${(bv.byteLength/1024/1024).toFixed(2)} MB (${img.mimeType || '?'})`);
    } else {
      console.log(`  [${i}] ${img.name || '(unnamed)'} — external uri: ${img.uri}`);
    }
  });
  console.log('');
}

// Meshes / primitives summary
let totalVerts = 0, totalTris = 0;
if (json.meshes) {
  json.meshes.forEach(m => {
    m.primitives.forEach(p => {
      if (p.attributes && p.attributes.POSITION !== undefined) {
        const acc = json.accessors[p.attributes.POSITION];
        totalVerts += acc.count;
      }
      if (p.indices !== undefined) {
        totalTris += json.accessors[p.indices].count / 3;
      }
    });
  });
  console.log(`Meshes: ${json.meshes.length}`);
  console.log(`Vertices: ${totalVerts.toLocaleString()}`);
  console.log(`Triangles: ${Math.round(totalTris).toLocaleString()}`);
  console.log('');
}

// Total buffer view sizes grouped by target
const bvByUsage = {};
if (json.bufferViews) {
  json.bufferViews.forEach((bv, i) => {
    let usage = 'other';
    if (bv.target === 34962) usage = 'vertex attrs';
    else if (bv.target === 34963) usage = 'indices';
    // Check if referenced by an image
    if (json.images) {
      for (const img of json.images) {
        if (img.bufferView === i) { usage = 'image'; break; }
      }
    }
    bvByUsage[usage] = (bvByUsage[usage] || 0) + bv.byteLength;
  });
  console.log('Buffer views by usage:');
  for (const [k, v] of Object.entries(bvByUsage)) {
    console.log(`  ${k}: ${(v/1024/1024).toFixed(2)} MB`);
  }
}
