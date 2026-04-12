#!/usr/bin/env node
/**
 * wipe-leaderboard.js — delete all rows from rufus_leaderboard
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<your-service-role-key> node scripts/wipe-leaderboard.js
 *
 * Optional flags:
 *   --dry-run    Fetch + count rows, don't delete
 *   --yes        Skip the confirmation prompt (for scripting)
 *
 * The service role key bypasses RLS. NEVER commit it or paste it in chat —
 * pass it only via the environment variable above. If you accidentally leak it,
 * rotate it in Supabase dashboard → Project Settings → API → Reset service_role key.
 */

const SUPABASE_URL = 'https://trbafghbzxluxbeqqsed.supabase.co';
const TABLE = 'rufus_leaderboard';

const key = process.env.SUPABASE_SERVICE_KEY;
if (!key) {
  console.error('ERROR: SUPABASE_SERVICE_KEY env var not set.');
  console.error('Usage: SUPABASE_SERVICE_KEY=<key> node scripts/wipe-leaderboard.js');
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipConfirm = args.includes('--yes');

const headers = {
  'apikey': key,
  'Authorization': 'Bearer ' + key,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function countRows() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=id`, {
    headers: { ...headers, 'Prefer': 'count=exact' },
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Count failed:', res.status, data);
    process.exit(1);
  }
  return Array.isArray(data) ? data.length : 0;
}

async function wipe() {
  // PostgREST requires a filter for DELETE — match on created_at which every row has
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?created_at=gte.1970-01-01`;
  const res = await fetch(url, { method: 'DELETE', headers });
  if (!res.ok) {
    const err = await res.text();
    console.error('DELETE failed:', res.status, err);
    process.exit(1);
  }
  const deleted = await res.json().catch(() => []);
  return Array.isArray(deleted) ? deleted.length : 0;
}

async function confirm(prompt) {
  if (skipConfirm) return true;
  process.stdout.write(prompt);
  return new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once('data', d => {
      process.stdin.pause();
      resolve(d.toString().trim().toLowerCase() === 'y');
    });
  });
}

(async () => {
  console.log(`Table: ${TABLE}`);
  const count = await countRows();
  console.log(`Current rows: ${count}`);

  if (dryRun) {
    console.log('Dry run — no changes made.');
    return;
  }
  if (count === 0) {
    console.log('Already empty. Nothing to do.');
    return;
  }

  const ok = await confirm(`Delete all ${count} rows? [y/N] `);
  if (!ok) {
    console.log('Cancelled.');
    return;
  }

  const deleted = await wipe();
  console.log(`Deleted ${deleted} rows.`);
})();
