// ──────────────────────────────────────────────────────────────
//  leaderboard.js — Supabase leaderboard for FoilSim
// ──────────────────────────────────────────────────────────────

import { state } from './state.js';

const SUPABASE_URL = 'https://trbafghbzxluxbeqqsed.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VkwvfoYz5euu5gchEvgUTg_orWb2Kl3';
const TABLE = 'rufus_leaderboard';

function supabaseHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };
}

// Get user's IP + geo location (best effort, fails silently)
async function getGeoInfo() {
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    return {
      ip: data.ip || null,
      country: data.country_name || null,
      region: data.region || null,
      city: data.city || null,
    };
  } catch { return { ip: null, country: null, region: null, city: null }; }
}

// Get or prompt for username (cached in localStorage)
export function getUsername() {
  return sanitizeUsername(localStorage.getItem('foilbrain_username'));
}

// Sanitize username: block dangerous chars, keep spaces and most printable text
export function sanitizeUsername(name: string | null | undefined) {
  if (!name) return 'Anonymous';
  let s = String(name);
  // Strip HTML tags (< and > removed entirely to kill any markup)
  s = s.replace(/[<>]/g, '');
  // Strip control chars (0x00-0x1F, 0x7F) and zero-width / direction-override chars
  s = s.replace(/[\x00-\x1F\x7F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '');
  // Collapse runs of whitespace (tabs, newlines) to single space — preserves internal spaces
  s = s.replace(/[\t\n\r\f\v]+/g, ' ').replace(/  +/g, ' ');
  // Length cap, then trim leading/trailing whitespace
  s = s.substring(0, 24).replace(/^\s+|\s+$/g, '');
  return s || 'Anonymous';
}

export function setUsername(name: string) {
  const clean = sanitizeUsername(name);
  localStorage.setItem('foilbrain_username', clean);
  return clean;
}

// Ride counter — tracks how many rides this user/device has played.
// Incremented at the start of each ride; persists across sessions via localStorage.
export function getRideCount() {
  const n = parseInt(localStorage.getItem('foilbrain_ride_count') || '0', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function incrementRideCount() {
  const n = getRideCount() + 1;
  localStorage.setItem('foilbrain_ride_count', String(n));
  return n;
}

// Submit a score to the leaderboard
import type { ScoreState } from './state.js';

export async function submitScore(scoreData: ScoreState) {
  const geo = await getGeoInfo();
  const username = getUsername();

  // Anti-cheat: hash score + session time + secret salt
  const sessionTime = Math.round((scoreData.rideTimer || 0) * 10) / 10;
  const total = Math.round(scoreData.total);
  const checkPayload = `${total}:${sessionTime}:foilbrain2026`;
  const checkBytes = new TextEncoder().encode(checkPayload);
  const hashBuf = await crypto.subtle.digest('SHA-256', checkBytes);
  const checksum = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);

  const musicName = (state.audioSettings.musicFileName || '').substring(0, 20);

  const row = {
    username: username,
    score: total,
    distance: Math.round(scoreData.distance / 1609.34 * 1000) / 1000,  // miles, 3 decimals
    top_speed: Math.round(scoreData.topSpeedMs * 2.23694 * 100) / 100, // mph, 2 decimals
    pocket_time: Math.round(scoreData.pocketTime * 10) / 10,
    session_time: sessionTime,
    music_track: musicName || null,
    location: state.activeBgPreset || 'unknown',
    ip_address: geo.ip,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    avg_fps: (state._fpsAvgCount ?? 0) > 0 ? Math.round((state._fpsAvgSum ?? 0) / state._fpsAvgCount!) : null,
    user_agent: navigator.userAgent.substring(0, 200),
    ride_count: getRideCount(),
    checksum: checksum,
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify(row),
    });
    if (!res.ok) console.warn('Leaderboard submit failed:', res.status);
    return res.ok;
  } catch (e) {
    console.warn('Leaderboard submit error:', e);
    return false;
  }
}

// Fetch top 10 scores
export async function fetchTopScores(limit = 10) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?select=username,score,distance,pocket_time,city,created_at&order=score.desc&limit=${limit}`,
      { headers: supabaseHeaders() }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// Render leaderboard HTML into an element
// highlightName/highlightScore: if provided, the matching row gets a sparkle animation
export function renderLeaderboard(scores: any[], container: HTMLElement, highlightName?: string, highlightScore?: number) {
  if (!scores.length) {
    container.innerHTML = '<div style="color:#5ea8d8;font-size:13px;text-align:center;padding:20px;">No scores yet — be the first!</div>';
    return;
  }

  // Find which row to highlight (first match by name + score)
  let highlightIdx = -1;
  if (highlightName && highlightScore) {
    highlightIdx = scores.findIndex(s => s.username === highlightName && s.score === highlightScore);
  }

  // Inject sparkle keyframes if not already present
  if (!document.getElementById('sparkle-style')) {
    const style = document.createElement('style');
    style.id = 'sparkle-style';
    style.textContent = `
      @keyframes sparkle-glow {
        0%   { box-shadow: 0 0 4px rgba(255,215,0,0.3), inset 0 0 4px rgba(255,215,0,0.1); }
        50%  { box-shadow: 0 0 16px rgba(255,215,0,0.6), inset 0 0 8px rgba(255,215,0,0.2); }
        100% { box-shadow: 0 0 4px rgba(255,215,0,0.3), inset 0 0 4px rgba(255,215,0,0.1); }
      }
      .sparkle-row { animation: sparkle-glow 1.5s ease-in-out 3; border-radius: 4px; }
    `;
    document.head.appendChild(style);
  }

  let html = '<table style="width:100%;border-collapse:separate;border-spacing:0 2px;font-size:12px;">';
  html += '<tr style="color:#5ea8d8;">';
  html += '<th style="padding:6px 4px;text-align:left;">#</th>';
  html += '<th style="padding:6px 4px;text-align:left;">Name</th>';
  html += '<th style="padding:6px 4px;text-align:right;">Score</th>';
  html += '<th style="padding:6px 4px;text-align:right;">Distance</th>';
  html += '<th style="padding:6px 4px;text-align:right;cursor:help;" title="Time in pocket">TIP</th>';
  html += '<th style="padding:6px 4px;text-align:left;">City</th>';
  html += '</tr>';

  // Distance conversion from stored miles to user units
  const distUnit = state.units === 'kph' ? 'km' : state.units === 'kts' ? 'nm' : 'mi';
  const distFactor = state.units === 'kph' ? 1.60934 : state.units === 'kts' ? 0.868976 : 1;

  scores.forEach((s, i) => {
    const isGold = i === 0, isSilver = i === 1, isBronze = i === 2;
    const medal = isGold ? '🥇' : isSilver ? '🥈' : isBronze ? '🥉' : (i + 1);
    const rowColor = isGold ? 'rgba(255,215,0,0.12)' : isSilver ? 'rgba(192,192,192,0.08)' : isBronze ? 'rgba(205,127,50,0.08)' : 'transparent';
    const nameColor = isGold ? '#ffd700' : isSilver ? '#c0c0c0' : isBronze ? '#cd7f32' : '#c8d6e5';
    const isHighlight = i === highlightIdx;
    const sparkleClass = isHighlight ? ' class="sparkle-row"' : '';
    const hlBg = isHighlight ? 'rgba(255,215,0,0.18)' : rowColor;
    const dist = (s.distance * distFactor).toFixed(3);

    html += `<tr${sparkleClass} style="background:${hlBg};">`;
    html += `<td style="padding:5px 4px;">${medal}</td>`;
    html += `<td style="padding:5px 4px;color:${nameColor};font-weight:${i < 3 || isHighlight ? '600' : '400'};">${escHtml(s.username)}${isHighlight ? ' ✨' : ''}</td>`;
    html += `<td style="padding:5px 4px;text-align:right;color:#fff;font-weight:600;">${s.score.toLocaleString()}</td>`;
    html += `<td style="padding:5px 4px;text-align:right;color:#90b8e0;">${dist} ${distUnit}</td>`;
    html += `<td style="padding:5px 4px;text-align:right;color:#90b8e0;" title="Time in pocket">${(s.pocket_time || 0).toFixed(1)}s</td>`;
    html += `<td style="padding:5px 4px;color:#90b8e0;">${escHtml(s.city || '')}</td>`;
    html += '</tr>';
  });

  html += '</table>';
  container.innerHTML = html;
}

function escHtml(str: string) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
