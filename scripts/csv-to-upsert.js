#!/usr/bin/env node
/**
 * csv-to-upsert.js — convert the fixed leaderboard CSV into SQL UPSERT statements.
 * Usage: node scripts/csv-to-upsert.js > misc/fixed_leaderboard.sql
 */
const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'misc', 'fixed leaderboard.csv');
const raw = fs.readFileSync(csvPath, 'utf8');

// Minimal CSV parser that handles quoted fields with embedded commas
function parseCSV(text) {
  const rows = [];
  let cur = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (field.length || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ''; }
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

const rows = parseCSV(raw);
const headers = rows.shift();

// Columns are treated as strings unless listed here
const numericCols = new Set(['id', 'score', 'distance', 'top_speed', 'pocket_time', 'session_time', 'avg_fps', 'ride_count']);
const timestampCols = new Set(['created_at']);

function sqlLit(col, val) {
  if (val === '' || val == null) return 'NULL';
  if (numericCols.has(col)) return val;
  // Strings: escape single quotes by doubling them
  return "'" + String(val).replace(/'/g, "''") + "'";
}

// Optionally skip the id column (--no-id) so Postgres auto-assigns new ids
const keepId = !process.argv.includes('--no-id');
const cols = keepId ? headers : headers.filter(h => h !== 'id');

console.log('-- Insert fixed leaderboard rows');
console.log('-- Generated from misc/fixed leaderboard.csv');
console.log('BEGIN;');
console.log();

const colList = cols.map(h => `"${h}"`).join(', ');
const override = keepId ? ' OVERRIDING SYSTEM VALUE' : '';
console.log(`INSERT INTO rufus_leaderboard (${colList})${override} VALUES`);

const valueRows = [];
for (const row of rows) {
  if (!row.length || !row[0]) continue;
  const obj = Object.fromEntries(headers.map((h, i) => [h, row[i]]));
  const vals = cols.map(h => sqlLit(h, obj[h])).join(', ');
  valueRows.push(`  (${vals})`);
}
console.log(valueRows.join(',\n') + ';');
console.log();

// If we kept the id column, bump the sequence past the max id so new inserts
// don't collide with the ones we just loaded.
if (keepId) {
  console.log("-- Reset the id sequence so the next new row gets a fresh id");
  console.log("SELECT setval(pg_get_serial_sequence('rufus_leaderboard', 'id'),");
  console.log("              (SELECT COALESCE(MAX(id), 0) FROM rufus_leaderboard));");
  console.log();
}

console.log('COMMIT;');
