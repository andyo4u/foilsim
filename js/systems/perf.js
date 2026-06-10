// ──────────────────────────────────────────────────────────────
//  systems/perf.js  –  FPS measurement, FPS graphs, auto-quality
//
//  Owns the 500ms FPS tick, the rolling FPS history/graphs, and the
//  auto-quality stepper. setQuality lives in main.js (it touches the
//  renderer and ocean rebuild); it's injected once via initPerf() to
//  keep the module graph acyclic.
// ──────────────────────────────────────────────────────────────

import { state } from '../state.js';

// FPS counter
let fpsFrames = 0, fpsLastTime = performance.now();
const fpsLabel = document.getElementById('fps-label');
const hudFps = document.getElementById('hud-fps');
let fpsAvgSum = 0, fpsAvgCount = 0; // running average

// FPS graph history (120 samples × 500ms = 60 seconds)
const fpsHistory = [];
const FPS_HISTORY_MAX = 120;
const fpsGraphCanvas = document.getElementById('fps-graph');
const fpsGraphCtx = fpsGraphCanvas ? fpsGraphCanvas.getContext('2d') : null;
const hudFpsGraphCanvas = document.getElementById('hud-fps-graph');
const hudFpsGraphCtx = hudFpsGraphCanvas ? hudFpsGraphCanvas.getContext('2d') : null;

function drawFpsGraph(ctx, w, h) {
  if (!ctx || fpsHistory.length < 2) return;
  ctx.clearRect(0, 0, w, h);

  const maxFps = Math.max(65, ...fpsHistory);
  const minFps = Math.min(...fpsHistory);
  const count = fpsHistory.length;
  const stepX = w / (FPS_HISTORY_MAX - 1);

  // Fill area under curve
  ctx.beginPath();
  const startX = w - (count - 1) * stepX;
  ctx.moveTo(startX, h);
  for (let i = 0; i < count; i++) {
    const x = startX + i * stepX;
    const y = h - ((fpsHistory[i] - 0) / maxFps) * (h - 2);
    if (i === 0) ctx.lineTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(startX + (count - 1) * stepX, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(74, 232, 138, 0.15)';
  ctx.fill();

  // Draw line
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x = startX + i * stepX;
    const y = h - ((fpsHistory[i] - 0) / maxFps) * (h - 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  const lastFps = fpsHistory[count - 1];
  ctx.strokeStyle = lastFps < 30 ? '#ff4444' : lastFps < 50 ? '#ffaa33' : '#4ae88a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 60 fps reference line
  const y60 = h - (60 / maxFps) * (h - 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(0, y60);
  ctx.lineTo(w, y60);
  ctx.stroke();
  ctx.setLineDash([]);

  // Min/max labels
  ctx.font = '7px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(Math.round(minFps), 2, h - 2);
  ctx.fillText(Math.round(maxFps), 2, 7);
}

// Auto-quality FPS tracking
let autoQFrames = [];
const AUTO_Q_WINDOW    = 8;    // 500ms samples → 4 seconds of data
const AUTO_Q_DOWN_FPS  = 35;   // step down if avg below this (was 45 — less trigger-happy)
const AUTO_Q_UP_FPS    = 52;   // step up if avg comfortably above this
const AUTO_Q_UP_HOLD   = 8;    // consecutive above-thresh samples before stepping up (~4s)
const AUTO_Q_INTERVAL  = 5000; // minimum ms between quality changes (was 8s — faster settling)
let autoQUpCount = 0;
let autoQLastChange = performance.now() - AUTO_Q_INTERVAL; // allow first check immediately

const QUALITY_LEVELS = ['low', 'med', 'high', 'ultra', 'max'];

// Injected from main.js (setQuality touches renderer + ocean rebuild)
let setQuality = null;

function initPerf(deps) {
  setQuality = deps.setQuality;
}

function updateFpsStats() {
  // FPS measurement
  fpsFrames++;
  const fpsNow = performance.now();
  if (fpsNow - fpsLastTime >= 500) {
    const fps = Math.round(fpsFrames / ((fpsNow - fpsLastTime) / 1000));
    fpsLabel.textContent = fps + ' fps';
    fpsAvgSum += fps; fpsAvgCount++;
    state._fpsAvgSum = fpsAvgSum; state._fpsAvgCount = fpsAvgCount;
    const avgFps = Math.round(fpsAvgSum / fpsAvgCount);
    hudFps.textContent = fps + ' fps (avg ' + avgFps + ')';
    fpsFrames = 0; fpsLastTime = fpsNow;

    // Record history and draw graphs
    fpsHistory.push(fps);
    if (fpsHistory.length > FPS_HISTORY_MAX) fpsHistory.shift();
    if (fpsGraphCanvas) drawFpsGraph(fpsGraphCtx, fpsGraphCanvas.width, fpsGraphCanvas.height);
    if (hudFpsGraphCanvas) drawFpsGraph(hudFpsGraphCtx, hudFpsGraphCanvas.width, hudFpsGraphCanvas.height);

    // Auto-quality adjustment
    if (state.autoQuality) {
      autoQFrames.push(fps);
      if (autoQFrames.length > AUTO_Q_WINDOW) autoQFrames.shift();

      if (autoQFrames.length >= AUTO_Q_WINDOW) {
        const avgFps = autoQFrames.reduce((a, b) => a + b, 0) / autoQFrames.length;
        const curIdx = QUALITY_LEVELS.indexOf(state.quality);
        const nowQ = performance.now();

        if (nowQ - autoQLastChange >= AUTO_Q_INTERVAL) {
          if (avgFps < AUTO_Q_DOWN_FPS && curIdx > 0) {
            setQuality(QUALITY_LEVELS[curIdx - 1]);
            state.autoQuality = true;  // re-enable (setQuality disables it)
            autoQFrames.length = 0;
            autoQUpCount = 0;
            autoQLastChange = nowQ;
          } else if (avgFps > AUTO_Q_UP_FPS && curIdx < QUALITY_LEVELS.length - 1) {
            autoQUpCount++;
            if (autoQUpCount >= AUTO_Q_UP_HOLD) {
              setQuality(QUALITY_LEVELS[curIdx + 1]);
              state.autoQuality = true;  // re-enable
              autoQFrames.length = 0;
              autoQUpCount = 0;
              autoQLastChange = nowQ;
            }
          } else {
            autoQUpCount = 0;
          }
        }
      }
    }
  }
}

export { initPerf, updateFpsStats };
