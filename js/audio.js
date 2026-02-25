// ==============================
// AUDIO -- Wave Energy Sound
// ==============================
// Self-contained Web Audio module.
// Exports initAudio() and updateAudio() for use by main.js.
// Event-listener wiring (click/keydown/touchstart -> initAudio)
// is left to the caller.

import { state } from './state.js';

let audioCtx = null;
let audioInited = false;
let noiseGain, toneOsc, toneGain, toneFilter, masterGain;
let musicAudio = null;
let musicWaitingForFoil = false;
let _autoMusicArmed = false;  // true once loadRandomTrackIfNeeded() has run this ride

export function initAudio() {
  if (audioInited) return;
  audioInited = true;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.5;
  masterGain.connect(audioCtx.destination);
  if (!state.audioSettings.ambientOn) masterGain.gain.value = 0;

  // -- Surf whoosh: filtered noise --
  const bufSize = audioCtx.sampleRate * 2;
  const noiseBuf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = noiseBuf;
  noiseNode.loop = true;

  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 400;
  noiseFilter.Q.value = 0.8;

  noiseGain = audioCtx.createGain();
  noiseGain.gain.value = 0;

  noiseNode.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseNode.start();

  // Store filter ref for frequency modulation
  noiseGain._filter = noiseFilter;

  // -- Tonal "pocket" chime: smooth sine --
  toneOsc = audioCtx.createOscillator();
  toneOsc.type = 'sine';
  toneOsc.frequency.value = 220;

  toneFilter = audioCtx.createBiquadFilter();
  toneFilter.type = 'lowpass';
  toneFilter.frequency.value = 600;
  toneFilter.Q.value = 1;

  toneGain = audioCtx.createGain();
  toneGain.gain.value = 0;

  toneOsc.connect(toneFilter);
  toneFilter.connect(toneGain);
  toneGain.connect(masterGain);
  toneOsc.start();

  // -- Secondary harmonic for richer tone --
  const toneOsc2 = audioCtx.createOscillator();
  toneOsc2.type = 'sine';
  toneOsc2.frequency.value = 330;
  const toneGain2 = audioCtx.createGain();
  toneGain2.gain.value = 0;
  toneOsc2.connect(toneGain2);
  toneGain2.connect(masterGain);
  toneOsc2.start();
  toneGain._g2 = toneGain2;
  toneOsc._o2 = toneOsc2;
}

export function updateAudio(slopeForce, normForce, speed) {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  const sm = 0.08; // smoothing time

  // Speed factor: sound only when moving
  const sf = Math.min(1, speed / 5);

  if (normForce > 0.05) {
    // -- Positive: riding the pocket --
    // Whoosh gets louder and higher-pitched
    const whooshVol = normForce * 0.25 * sf;
    const whooshFreq = 300 + normForce * 600;
    noiseGain.gain.linearRampToValueAtTime(whooshVol, now + sm);
    noiseGain._filter.frequency.linearRampToValueAtTime(whooshFreq, now + sm);

    // Tone: pleasant ascending pitch, louder in the pocket
    const toneVol = normForce * 0.12 * sf;
    const toneFreq = 200 + normForce * 180;
    toneGain.gain.linearRampToValueAtTime(toneVol, now + sm);
    toneOsc.frequency.linearRampToValueAtTime(toneFreq, now + sm);
    toneGain._g2.gain.linearRampToValueAtTime(toneVol * 0.4, now + sm);
    toneOsc._o2.frequency.linearRampToValueAtTime(toneFreq * 1.5, now + sm);
  } else if (normForce < -0.05) {
    // -- Negative: climbing uphill --
    const abN = Math.abs(normForce);
    // Lower, duller whoosh
    const whooshVol = abN * 0.12 * sf;
    const whooshFreq = 150 + abN * 150;
    noiseGain.gain.linearRampToValueAtTime(whooshVol, now + sm);
    noiseGain._filter.frequency.linearRampToValueAtTime(whooshFreq, now + sm);

    // Low droning tone
    const toneVol = abN * 0.06 * sf;
    toneGain.gain.linearRampToValueAtTime(toneVol, now + sm);
    toneOsc.frequency.linearRampToValueAtTime(120, now + sm);
    toneGain._g2.gain.linearRampToValueAtTime(0, now + sm);
  } else {
    // -- Neutral: quiet ambient --
    noiseGain.gain.linearRampToValueAtTime(0.01 * sf, now + sm * 2);
    noiseGain._filter.frequency.linearRampToValueAtTime(250, now + sm);
    toneGain.gain.linearRampToValueAtTime(0, now + sm * 2);
    toneGain._g2.gain.linearRampToValueAtTime(0, now + sm * 2);
  }
}

export function toggleAmbient(on) {
  state.audioSettings.ambientOn = on;
  if (!masterGain) return;
  masterGain.gain.setTargetAtTime(on ? 0.5 : 0.0, audioCtx.currentTime, 0.1);
}

// ── ID3v2 tag parser (covers v2.2, v2.3, v2.4) ──────────────────────────────
// Reads the first 64 KB of the file to extract artist and title without any
// external library.  Returns { artist, title } or null if no ID3 header found.
function _parseID3(buffer) {
  try {
    const b = new Uint8Array(buffer);
    if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return null; // no "ID3"
    const ver = b[3]; // major version: 2, 3 or 4
    const tagSize = ((b[6]&0x7f)<<21)|((b[7]&0x7f)<<14)|((b[8]&0x7f)<<7)|(b[9]&0x7f);
    const end = Math.min(10 + tagSize, buffer.byteLength);
    const result = {};
    let pos = 10;

    const decode = (enc, slice) => {
      if (enc === 1) return new TextDecoder('utf-16').decode(slice);
      if (enc === 2) return new TextDecoder('utf-16be').decode(slice);
      if (enc === 3) return new TextDecoder('utf-8').decode(slice);
      return new TextDecoder('iso-8859-1').decode(slice);
    };

    if (ver === 2) {
      // ID3v2.2: 3-char frame IDs, 3-byte sizes
      while (pos < end - 6) {
        const id = String.fromCharCode(b[pos], b[pos+1], b[pos+2]);
        if (id === '\x00\x00\x00') break;
        const size = (b[pos+3]<<16)|(b[pos+4]<<8)|b[pos+5];
        pos += 6;
        if (size <= 0 || pos + size > end) break;
        if (id === 'TT2' || id === 'TP1') {
          const text = decode(b[pos], b.slice(pos+1, pos+size)).replace(/\0/g,'').trim();
          if (id === 'TT2') result.title  = text;
          if (id === 'TP1') result.artist = text;
        }
        pos += size;
      }
    } else {
      // ID3v2.3/2.4: 4-char frame IDs, 4-byte sizes
      while (pos < end - 10) {
        const id = String.fromCharCode(b[pos], b[pos+1], b[pos+2], b[pos+3]);
        if (id === '\x00\x00\x00\x00') break;
        const size = ver === 4
          ? ((b[pos+4]&0x7f)<<21)|((b[pos+5]&0x7f)<<14)|((b[pos+6]&0x7f)<<7)|(b[pos+7]&0x7f)
          : (b[pos+4]<<24)|(b[pos+5]<<16)|(b[pos+6]<<8)|b[pos+7];
        pos += 10;
        if (size <= 0 || pos + size > end) break;
        if (id === 'TIT2' || id === 'TPE1') {
          const text = decode(b[pos], b.slice(pos+1, pos+size)).replace(/\0/g,'').trim();
          if (id === 'TIT2') result.title  = text;
          if (id === 'TPE1') result.artist = text;
        }
        pos += size;
      }
    }
    return (result.title || result.artist) ? result : null;
  } catch { return null; }
}

export function loadLocalMusic(file) {
  if (!file) return;
  if (musicAudio) { musicAudio.pause(); URL.revokeObjectURL(musicAudio._url); }
  const url = URL.createObjectURL(file);
  musicAudio = new Audio(url);
  musicAudio._url = url;
  musicAudio.loop = true;
  musicAudio.volume = 0.65;
  musicWaitingForFoil = true;  // play deferred until first foil liftoff
  state.audioSettings.musicPlaying = false;
  // Show filename immediately; ID3 read will update it asynchronously
  state.audioSettings.musicFileName = file.name.replace(/\.[^.]+$/, '');
  const el = document.getElementById('settings-music-status');
  if (el) el.textContent = 'Ready — plays when foiling';
  const btn = document.getElementById('settings-music-stop');
  if (btn) btn.style.display = 'inline-block';

  // Read first 64 KB to parse ID3 tags (they live at the very start of the file)
  const reader = new FileReader();
  reader.onload = e => {
    const tags = _parseID3(e.target.result);
    if (tags) {
      const parts = [tags.artist, tags.title].filter(Boolean);
      state.audioSettings.musicFileName = parts.join(' — ');
    }
    if (el) el.textContent = 'Ready · ' + state.audioSettings.musicFileName;
  };
  reader.readAsArrayBuffer(file.slice(0, 65536));
}

export function onFoilStart() {
  if (!musicWaitingForFoil || !musicAudio) return;
  musicWaitingForFoil = false;
  musicAudio.play().catch(() => {});
  state.audioSettings.musicPlaying = true;
  const el = document.getElementById('settings-music-status');
  if (el) el.textContent = 'Now playing · ' + state.audioSettings.musicFileName;
}

export function stopMusic() {
  if (!musicAudio) return;
  musicAudio.pause();
  if (musicAudio._url) URL.revokeObjectURL(musicAudio._url);  // null for server-loaded tracks
  musicAudio = null;
  musicWaitingForFoil = false;
  _autoMusicArmed = false;
  state.audioSettings.musicPlaying = false;
  const el = document.getElementById('settings-music-status');
  if (el) el.textContent = '';
  const btn = document.getElementById('settings-music-stop');
  if (btn) btn.style.display = 'none';
}

async function _loadRandomTrack() {
  try {
    const res = await fetch('music/playlist.json');
    if (!res.ok) return;
    const playlist = await res.json();
    if (!playlist.length) return;
    const file = playlist[Math.floor(Math.random() * playlist.length)];
    const url = 'music/' + file;

    musicAudio = new Audio(url);
    musicAudio._url = null;  // server URL — nothing to revoke
    musicAudio.loop = true;
    musicAudio.volume = 0.65;
    musicWaitingForFoil = true;
    state.audioSettings.musicFileName = file.replace(/\.[^.]+$/, '');
    state.audioSettings.musicPlaying = false;

    const el = document.getElementById('settings-music-status');
    if (el) el.textContent = 'Ready — plays when foiling';
    const btn = document.getElementById('settings-music-stop');
    if (btn) btn.style.display = 'inline-block';

    // Fetch first 64 KB to parse ID3 tags
    const hdrRes = await fetch(url, { headers: { Range: 'bytes=0-65535' } });
    if (hdrRes.ok) {
      const buf = await hdrRes.arrayBuffer();
      const tags = _parseID3(buf);
      if (tags) {
        const parts = [tags.artist, tags.title].filter(Boolean);
        state.audioSettings.musicFileName = parts.join(' — ');
      }
    }
    if (el) el.textContent = 'Ready · ' + state.audioSettings.musicFileName;
  } catch { /* network not available — silently skip */ }
}

export async function loadRandomTrackIfNeeded() {
  if (musicAudio || _autoMusicArmed) return;  // user already loaded a track, or already armed
  _autoMusicArmed = true;
  await _loadRandomTrack();
}
